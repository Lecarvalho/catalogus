-- Phase 4 schema: HANDOFF.md §4's entities, mapped onto the manifest JSON
-- Schema's own enums (packages/schema/schema/catalogus.v1.json) so keeping
-- the two in sync is a copy, not a translation. See
-- docs/plan/phase-4-backend.md, "Design, 2026-09-07", for the design this
-- migration implements.
--
-- This migration creates only tables, columns, constraints and indexes.
-- RLS policies, views and seed data are separate migrations
-- (0002_rls.sql, 0003_views.sql) and supabase/seed.sql -- none of that is
-- here. It also never creates `auth`, `auth.users` or the request roles:
-- Supabase provides those on the hosted project, and
-- packages/db/src/test-support/local-auth-stub.sql stands in for them in
-- tests, applied before this file runs.

-- A slug is the manifest schema's `$defs/slug` pattern: lowercase letters
-- and digits, with single internal `-` or `_` separators. Repeated as an
-- inline check on every slug-shaped column below rather than a domain type,
-- so each column's constraint has its own name and shows up in a
-- constraint-violation error naming that column.

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  repo_url text,
  description text,
  created_at timestamptz not null default now(),
  constraint projects_slug_format check (slug ~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'),
  constraint projects_name_not_empty check (length(name) > 0),
  unique (owner_id, slug)
);

create index idx_projects_owner_id on projects (owner_id);

create table services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon_ref text,
  pricing_model text,
  vendor_url text,
  status text not null default 'active',
  sunset_date date,
  successor_service_id uuid references services (id),
  constraint services_slug_format check (slug ~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'),
  constraint services_name_not_empty check (length(name) > 0),
  constraint services_pricing_model_check
    check (pricing_model is null or pricing_model in ('free', 'freemium', 'subscription', 'usage', 'one_time')),
  constraint services_status_check check (status in ('active', 'deprecated', 'sunset')),
  constraint services_no_self_replace check (successor_service_id is distinct from id)
);

create index idx_services_successor_service_id on services (successor_service_id);

comment on table services is
  'No category column, deliberately: a vendor has no one true category (Supabase is a database '
  'and auth and storage) -- see packages/core/src/catalog.ts and decision 15 in docs/plan/decisions.md. '
  'Category-shaped grouping lives on project_services.role instead, which is per-project.';

comment on column services.pricing_model is
  'Nullable: the CLI never guesses a pricing model it cannot find stated anywhere (CLAUDE.md''s '
  '"ask, never guess" rule) -- a service seeded without one is missing information, not free.';

create table project_services (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  service_id uuid not null references services (id),
  local_id text not null,
  role text not null,
  kind text not null default 'service',
  version text,
  icon_path text,
  added_at date not null,
  status text not null default 'active',
  replaced_by_project_service_id uuid,
  provenance text not null,
  notes text,
  constraint project_services_local_id_format check (local_id ~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'),
  constraint project_services_role_format check (role ~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'),
  constraint project_services_kind_check check (kind in ('service', 'component', 'stack')),
  constraint project_services_status_check check (status in ('active', 'deprecated', 'phasing_out', 'removed')),
  constraint project_services_provenance_check check (provenance in ('detected', 'manual')),
  constraint project_services_version_not_empty check (version is null or length(version) > 0),
  -- Mirrors the manifest schema's stack-entry `icon` pattern
  -- (packages/schema/schema/catalogus.v1.json, `$defs`) as two checks
  -- instead of one: the manifest expresses "no .. anywhere" as a
  -- `(?!.*\.\.)` lookahead inline in the pattern; here it is its own check
  -- so a violation names the actual problem (traversal, not just "bad
  -- format") in the error.
  constraint project_services_icon_path_format
    check (icon_path is null or icon_path ~ '^\.catalogus/icons/[a-z0-9][a-z0-9_.-]*\.svg$'),
  constraint project_services_icon_path_no_traversal
    check (icon_path is null or position('..' in icon_path) = 0),
  constraint project_services_no_self_replace
    check (replaced_by_project_service_id is distinct from id),
  unique (project_id, local_id),
  -- Referenced by service_dependencies' and this table's own composite FKs
  -- below, so an edge's/replacement's project_id can never disagree with
  -- the row it actually points to -- id alone is already unique (the
  -- primary key), so this adds no new uniqueness, only a target composite
  -- FKs can pin to.
  unique (id, project_id),
  constraint project_services_replaced_by_fk
    foreign key (replaced_by_project_service_id, project_id)
    references project_services (id, project_id)
    -- Column-list form (Postgres 15+): without it, ON DELETE SET NULL on a
    -- composite FK nulls every referencing column, including this row's own
    -- project_id -- not just the pointer.
    on delete set null (replaced_by_project_service_id)
);

create index idx_project_services_project_id on project_services (project_id);
create index idx_project_services_service_id on project_services (service_id);
create index idx_project_services_replaced_by_project_service_id
  on project_services (replaced_by_project_service_id);

comment on column project_services.provenance is
  'detected: written by `catalogus detect` from stack analysis (Layer 1). manual: added by '
  '`catalogus add`/`set` or hand-authored (Layer 2). Both live in the same table -- provenance '
  'is metadata about how a row got here, not a different shape of row.';

create table service_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  from_project_service_id uuid not null,
  to_project_service_id uuid not null,
  added_at date,
  status text not null default 'active',
  replaced_by_edge_id uuid,
  notes text,
  constraint service_dependencies_status_check check (status in ('active', 'deprecated', 'phasing_out', 'removed')),
  constraint service_dependencies_no_self_loop check (from_project_service_id <> to_project_service_id),
  constraint service_dependencies_no_self_replace check (replaced_by_edge_id is distinct from id),
  unique (project_id, from_project_service_id, to_project_service_id),
  -- Referenced by this table's own replaced_by_edge_id composite FK below.
  unique (id, project_id),
  -- Composite, not the plain `references project_services (id)` this used
  -- to be: ties the edge's own project_id to the actual project of each
  -- endpoint, so an edge can never claim a project_id its endpoints
  -- disagree with (docs/plan/phase-4-backend.md's acyclicity note is
  -- unaffected -- that stays a CLI-side check; this is about project
  -- membership, not cycles).
  constraint service_dependencies_from_fk
    foreign key (from_project_service_id, project_id)
    references project_services (id, project_id)
    on delete cascade,
  constraint service_dependencies_to_fk
    foreign key (to_project_service_id, project_id)
    references project_services (id, project_id)
    on delete cascade,
  constraint service_dependencies_replaced_by_fk
    foreign key (replaced_by_edge_id, project_id)
    references service_dependencies (id, project_id)
    -- Column-list form (Postgres 15+): see project_services_replaced_by_fk
    -- above -- same pitfall, same fix.
    on delete set null (replaced_by_edge_id)
);

create index idx_service_dependencies_project_id on service_dependencies (project_id);
create index idx_service_dependencies_from_project_service_id on service_dependencies (from_project_service_id);
create index idx_service_dependencies_to_project_service_id on service_dependencies (to_project_service_id);
create index idx_service_dependencies_replaced_by_edge_id on service_dependencies (replaced_by_edge_id);

comment on table service_dependencies is
  'Edges of the per-project service DAG (HANDOFF §4). Acyclicity is enforced by the CLI '
  '(HANDOFF §9.2), not by a database trigger -- see docs/plan/phase-4-backend.md, "Not in this '
  'phase".';

create table user_service_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  service_id uuid not null references services (id),
  project_id uuid references projects (id) on delete cascade,
  account_ref text,
  plan_tier text,
  -- Unconstrained, not numeric(12,2): a fixed-scale numeric column rounds
  -- silently on write (1.005 stored as 1.01, 1.004 as 1.00, no error) -- a
  -- store must never change a value it was given without saying so.
  -- Unconstrained numeric keeps whatever scale was actually written, and
  -- user_service_accounts_cost_amount_scale below refuses (rather than
  -- rounds) anything finer than cents or absurdly large.
  cost_amount numeric,
  -- text, not char(3): char(n) silently space-pads a shorter value instead
  -- of rejecting it, which would let 'US' through as 'US ' -- the format
  -- check below needs the column to actually hold what was written.
  cost_currency text,
  billing_cycle text,
  renewal_date date,
  started_at date,
  notes_private text,
  constraint user_service_accounts_billing_cycle_check
    check (billing_cycle is null or billing_cycle in ('monthly', 'yearly', 'usage')),
  -- A cost with no billing_cycle has no way to become a total: every view
  -- that sums cost_amount groups by billing_cycle (or must assume one), so
  -- an amount recorded without a cycle would silently vanish from every
  -- rollup rather than error loudly.
  constraint user_service_accounts_cost_amount_requires_billing_cycle
    check (cost_amount is null or billing_cycle is not null),
  -- Same failure shape as the billing_cycle check above: every view that
  -- sums cost_amount groups by cost_currency too (summing across
  -- currencies is meaningless), so an amount recorded with no currency
  -- would silently land in a null-currency group rather than error loudly.
  constraint user_service_accounts_cost_amount_requires_currency
    check (cost_amount is null or cost_currency is not null),
  constraint user_service_accounts_cost_amount_non_negative
    check (cost_amount is null or cost_amount >= 0),
  -- cost_amount is unconstrained numeric (see the column comment above);
  -- this is what actually bounds it -- at most cents precision, and capped
  -- well under any real bill, so a value that can't be stored as given is
  -- refused outright rather than rounded or truncated.
  constraint user_service_accounts_cost_amount_scale
    check (cost_amount is null or (scale(cost_amount) <= 2 and cost_amount < 1e10)),
  constraint user_service_accounts_cost_currency_format
    check (cost_currency is null or cost_currency ~ '^[A-Z]{3}$')
);

create index idx_user_service_accounts_user_id on user_service_accounts (user_id);
create index idx_user_service_accounts_service_id on user_service_accounts (service_id);
create index idx_user_service_accounts_project_id on user_service_accounts (project_id);

comment on table user_service_accounts is
  'The private overlay (Layer 3): cost, account references and billing detail, none of which '
  'catalogus.yaml is allowed to hold (CLAUDE.md''s no-secrets rule). project_id nullable: an '
  'account can span every project the owner has (e.g. one GitHub org). RLS restricts this table '
  'to its own user_id -- see supabase/migrations/0002_rls.sql.';

create table project_meta (
  project_id uuid primary key references projects (id) on delete cascade,
  architecture_style text,
  vcs_visibility text,
  extra jsonb not null default '{}'::jsonb,
  constraint project_meta_vcs_visibility_check
    check (vcs_visibility is null or vcs_visibility in ('public', 'private', 'internal'))
);

comment on table project_meta is
  'Layer 2 project-level metadata mirrored from catalogus.yaml''s `project` object. PM '
  'methodology, the VCS provider and coding agents are project_services rows now (2026-08-24 '
  'amendment, HANDOFF §4), not columns here.';

create table project_service_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_service_id uuid not null references project_services (id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, project_service_id)
);

create index idx_project_service_pages_user_id on project_service_pages (user_id);
create index idx_project_service_pages_project_service_id on project_service_pages (project_service_id);

comment on table project_service_pages is
  'Free-text notes page per (user, project_service) -- Layer 3 content added by the 2026-08-25 '
  'amendment. Minimal on purpose: the two-writer versioning story is recorded open in HANDOFF.md '
  'and is not solved by this table.';
