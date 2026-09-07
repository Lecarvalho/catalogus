-- Row-level security policies for the tables created in 0001_schema.sql.
-- See docs/plan/phase-4-backend.md, "Design, 2026-09-07", the **Policies**
-- paragraph, for the design this migration implements.
--
-- RLS is enabled *and forced* on every table -- `force row level security`
-- matters because the tables are owned by the same admin/superuser role
-- that the migrations themselves run as; without FORCE, a table owner
-- bypasses RLS entirely (same as service_role does via BYPASSRLS), which
-- would make every policy below a no-op against that role. On the hosted
-- Supabase project the tables are owned by a role that isn't service_role
-- either, so this is not a local-only concern.
--
-- Every policy name follows `<table>_<operation>_own`.

-- ---------------------------------------------------------------------
-- projects: owner-scoped directly on owner_id.
-- ---------------------------------------------------------------------

alter table projects enable row level security;
alter table projects force row level security;

create policy projects_select_own on projects
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy projects_insert_own on projects
  for insert
  to authenticated
  with check (owner_id = auth.uid());

-- `using` and `with check` both present so a row already owned by the
-- caller can neither be read-and-rewritten to belong to someone else
-- (with check) nor have another user's row updated into being theirs in
-- the first place (using) -- the two clauses guard opposite ends of the
-- same handoff.
create policy projects_update_own on projects
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy projects_delete_own on projects
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- project_services: ownership resolved through the parent project.
-- ---------------------------------------------------------------------

alter table project_services enable row level security;
alter table project_services force row level security;

create policy project_services_select_own on project_services
  for select
  to authenticated
  using (exists (select 1 from projects p where p.id = project_services.project_id and p.owner_id = auth.uid()));

create policy project_services_insert_own on project_services
  for insert
  to authenticated
  with check (exists (select 1 from projects p where p.id = project_services.project_id and p.owner_id = auth.uid()));

create policy project_services_update_own on project_services
  for update
  to authenticated
  using (exists (select 1 from projects p where p.id = project_services.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_services.project_id and p.owner_id = auth.uid()));

create policy project_services_delete_own on project_services
  for delete
  to authenticated
  using (exists (select 1 from projects p where p.id = project_services.project_id and p.owner_id = auth.uid()));

-- ---------------------------------------------------------------------
-- service_dependencies: ownership through the parent project, *and* both
-- endpoints must themselves belong to a project the caller owns -- project_id
-- alone would let a caller point from_/to_project_service_id at another
-- user's project_services row as long as the edge's own project_id said
-- theirs, since nothing else on this table's shape ties the edge's project
-- to the nodes it names.
-- ---------------------------------------------------------------------

alter table service_dependencies enable row level security;
alter table service_dependencies force row level security;

create policy service_dependencies_select_own on service_dependencies
  for select
  to authenticated
  using (exists (select 1 from projects p where p.id = service_dependencies.project_id and p.owner_id = auth.uid()));

create policy service_dependencies_insert_own on service_dependencies
  for insert
  to authenticated
  with check (
    exists (select 1 from projects p where p.id = service_dependencies.project_id and p.owner_id = auth.uid())
    and exists (
      select 1 from project_services ps
      join projects p on p.id = ps.project_id
      where ps.id = service_dependencies.from_project_service_id and p.owner_id = auth.uid()
    )
    and exists (
      select 1 from project_services ps
      join projects p on p.id = ps.project_id
      where ps.id = service_dependencies.to_project_service_id and p.owner_id = auth.uid()
    )
  );

create policy service_dependencies_update_own on service_dependencies
  for update
  to authenticated
  using (exists (select 1 from projects p where p.id = service_dependencies.project_id and p.owner_id = auth.uid()))
  with check (
    exists (select 1 from projects p where p.id = service_dependencies.project_id and p.owner_id = auth.uid())
    and exists (
      select 1 from project_services ps
      join projects p on p.id = ps.project_id
      where ps.id = service_dependencies.from_project_service_id and p.owner_id = auth.uid()
    )
    and exists (
      select 1 from project_services ps
      join projects p on p.id = ps.project_id
      where ps.id = service_dependencies.to_project_service_id and p.owner_id = auth.uid()
    )
  );

create policy service_dependencies_delete_own on service_dependencies
  for delete
  to authenticated
  using (exists (select 1 from projects p where p.id = service_dependencies.project_id and p.owner_id = auth.uid()));

-- ---------------------------------------------------------------------
-- project_meta: ownership through the parent project (project_id is this
-- table's own primary key, not just a foreign key).
-- ---------------------------------------------------------------------

alter table project_meta enable row level security;
alter table project_meta force row level security;

create policy project_meta_select_own on project_meta
  for select
  to authenticated
  using (exists (select 1 from projects p where p.id = project_meta.project_id and p.owner_id = auth.uid()));

create policy project_meta_insert_own on project_meta
  for insert
  to authenticated
  with check (exists (select 1 from projects p where p.id = project_meta.project_id and p.owner_id = auth.uid()));

create policy project_meta_update_own on project_meta
  for update
  to authenticated
  using (exists (select 1 from projects p where p.id = project_meta.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_meta.project_id and p.owner_id = auth.uid()));

create policy project_meta_delete_own on project_meta
  for delete
  to authenticated
  using (exists (select 1 from projects p where p.id = project_meta.project_id and p.owner_id = auth.uid()));

-- ---------------------------------------------------------------------
-- user_service_accounts: the private overlay -- ownership via user_id
-- directly, not through any project (project_id is nullable: an account
-- can span every project the owner has). This is the table HANDOFF §4
-- names as the one a second user must never read a row of.
-- ---------------------------------------------------------------------

alter table user_service_accounts enable row level security;
alter table user_service_accounts force row level security;

create policy user_service_accounts_select_own on user_service_accounts
  for select
  to authenticated
  using (user_id = auth.uid());

-- `with check` also requires project_id, when set, to name a project the
-- caller owns -- project_id alone (any uuid, unchecked) would let a caller
-- park a row on another user's project; that project's owner then
-- deleting it (on delete cascade, 0001_schema.sql) would silently destroy
-- the first caller's cost row along with it. `project_id is null` is
-- still allowed on its own: an account can span every project its owner
-- has (see 0001_schema.sql's comment on this table).
create policy user_service_accounts_insert_own on user_service_accounts
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (project_id is null or exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()))
  );

create policy user_service_accounts_update_own on user_service_accounts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (project_id is null or exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()))
  );

create policy user_service_accounts_delete_own on user_service_accounts
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- project_service_pages: ownership via user_id directly, *and* the page's
-- project_service_id must belong to a project the caller owns -- otherwise
-- a caller could write a page against another user's project_service row
-- (the page's own user_id would still say theirs, which is not the same
-- claim as "this project_service is mine to annotate").
-- ---------------------------------------------------------------------

alter table project_service_pages enable row level security;
alter table project_service_pages force row level security;

create policy project_service_pages_select_own on project_service_pages
  for select
  to authenticated
  using (user_id = auth.uid());

create policy project_service_pages_insert_own on project_service_pages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from project_services ps
      join projects p on p.id = ps.project_id
      where ps.id = project_service_pages.project_service_id and p.owner_id = auth.uid()
    )
  );

create policy project_service_pages_update_own on project_service_pages
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from project_services ps
      join projects p on p.id = ps.project_id
      where ps.id = project_service_pages.project_service_id and p.owner_id = auth.uid()
    )
  );

create policy project_service_pages_delete_own on project_service_pages
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- services: the global catalog. Readable by anon and authenticated; no
-- insert/update/delete policy at all, for anyone -- see decision 15 /
-- "Design, 2026-09-07" in docs/plan/phase-4-backend.md. Only service_role
-- (which carries BYPASSRLS, see local-auth-stub.sql) can write this table:
-- the seed and an admin path, until moderated contributions exist. Adding
-- a write policy here, even one scoped tightly, would be exactly the kind
-- of provider-shaped guess CLAUDE.md's "ask, never guess" rule warns
-- against -- there is no ownership concept for a global catalog row, so
-- any policy would have to invent one.
-- ---------------------------------------------------------------------

alter table services enable row level security;
alter table services force row level security;

create policy services_select_own on services
  for select
  to anon, authenticated
  using (true);

-- anon gets nothing beyond the services_select_own policy above: no
-- policy on any other table means anon can select, insert, update or
-- delete nothing on them (RLS defaults closed), which is the intended
-- shape -- unauthenticated access is read-only to the catalog and
-- invisible to everything the product considers private.

-- ---------------------------------------------------------------------
-- TRUNCATE, TRIGGER and REFERENCES are table-level privileges, not rows
-- -- row level security (enabled and forced above on every table) does
-- not govern them at all. Supabase's own default grants hand `anon` and
-- `authenticated` all four privilege classes (see
-- packages/db/src/test-support/local-auth-stub.sql's `grant all`, which
-- mirrors what Supabase does on a hosted project); PostgREST itself never
-- issues TRUNCATE, CREATE TRIGGER or a REFERENCES-only grant, but a raw
-- connection, or an RPC running dynamic SQL, could. Left ungoverned, an
-- `authenticated` caller could TRUNCATE any table here -- every tenant's
-- rows in one statement, RLS notwithstanding -- or CREATE TRIGGER on
-- user_service_accounts (even backed by a function defined in the
-- caller's own session-local pg_temp schema) and observe every other
-- user's cost writes as they happen. Revoked host-independently, here,
-- rather than relied on as a hosted-Supabase default: this migration is
-- also applied against the local container (see
-- docs/plan/phase-4-backend.md), where nothing has set it any
-- differently.
--
-- Explicit revoke for the tables this migration's policies already cover;
-- ALTER DEFAULT PRIVILEGES besides it so a table created by a later
-- migration (run over the same admin connection) inherits the
-- restriction without a repeat of this statement.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- MAINTAIN is a Postgres 17 table-level privilege (VACUUM, ANALYZE, CLUSTER,
-- REFRESH MATERIALIZED VIEW, LOCK TABLE, REINDEX) with the same shape of gap
-- as TRUNCATE/TRIGGER/REFERENCES above: `grant all` (both
-- local-auth-stub.sql's stub and Supabase's own hosted default) includes it,
-- and row level security does not govern it at all. Unlike those three
-- privileges, though, information_schema.role_table_grants does not list
-- MAINTAIN, so an audit through that view reports nothing wrong -- found by
-- execution, not by that audit -- while `authenticated`/`anon` can still run
-- VACUUM FULL, CLUSTER, REINDEX or ANALYZE on every table here. VACUUM FULL
-- and CLUSTER both take an exclusive lock, so an unprivileged caller running
-- either against user_service_accounts is a lock-everyone-out
-- denial-of-service, not merely a privacy leak.
--
-- What this does NOT close: `lock table ... in access exclusive mode` needs
-- only the UPDATE privilege, which the RLS model relies on, and RLS does not
-- govern LOCK either -- so any authenticated caller can still stall every
-- other session on a table for as long as its transaction lasts (a
-- validator held one for 6 s, 2026-09-07). PostgREST's per-request
-- transaction and statement timeout bound it on the hosted platform; a raw
-- connection is not bounded. Recorded, not fixable by grants.
--
-- The keyword doesn't exist before Postgres 17 (parsing `revoke maintain`
-- against an older server raises a syntax error, not a no-op), and Supabase
-- also hosts Postgres 15 projects -- so both statements run only behind a
-- runtime version check, via EXECUTE inside a DO block rather than as plain
-- SQL, so this migration still applies cleanly there.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from anon, authenticated';
    execute 'alter default privileges in schema public revoke maintain on tables from anon, authenticated';
  end if;
end
$$;
