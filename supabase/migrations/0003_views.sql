-- Phase 4 views: the three read models HANDOFF §4.2 names as acceptance
-- queries (2, 3, 4). See docs/plan/phase-4-backend.md, "Design, 2026-09-07",
-- the **Views** paragraph, for the design this migration implements.
--
-- Every view is created `with (security_invoker = true)`. Without it, a
-- view runs with the privileges *and* RLS context of its owner -- here the
-- admin/migration role, a superuser locally and (per 0002_rls.sql's own
-- comment) a role that isn't service_role on the hosted project either, but
-- still the role that created these views and so still their owner. A
-- definer-rights view would be the one hole in user_service_accounts' RLS
-- boundary: querying it as an ordinary authenticated user would see every
-- user's cost rows, not just the caller's. `security_invoker = true` makes
-- each view re-run the underlying tables' RLS policies as the querying
-- role, exactly as if the view's SQL had been written inline by the caller.
--
-- No grants here beyond what 0001_schema.sql's own migration role already
-- gets from local-auth-stub.sql's `alter default privileges ... on tables`
-- (views count as tables for that purpose) -- anon and authenticated can
-- select from these views, same as they can from a base table, and RLS on
-- the underlying tables (0002_rls.sql) is what actually restricts what
-- rows come back.

-- ---------------------------------------------------------------------
-- v_project_costs / v_service_costs -- HANDOFF §4.2 query 3: "Total
-- monthly cost across all projects; cost per project; cost per service."
--
-- No currency conversion (not in this phase) -- both views key on
-- cost_currency, so a user with costs in two currencies gets two rows
-- rather than one wrong sum. An account whose project_id is null (it can
-- span every project the owner has, per user_service_accounts' own
-- comment in 0001_schema.sql) is never allocated across the owner's other
-- projects: it groups under project_id = null, a group of its own.
--
-- monthly_equivalent = round(monthly_total + yearly_total / 12, 2). Rounded
-- to 2 decimals because yearly_total / 12 is a division that almost never
-- terminates cleanly (e.g. a $50/year account is $4.1666...7/month) and an
-- unrounded figure is not a number any dashboard should render. usage_total
-- is deliberately excluded from it: a usage-billed account's monthly figure
-- depends on consumption the schema doesn't record, so folding it into a
-- number that looks like a fixed monthly cost would be inventing precision
-- CLAUDE.md's "ask, never guess" rule doesn't allow. It is exposed as its
-- own column instead.
--
-- account_count counts rows with a cost_amount (count(cost_amount), which
-- skips nulls), not every row in the group -- a user_service_accounts row
-- can exist with no cost_amount at all (an account tracked for its
-- plan_tier or account_ref with no cost entered yet), and such a row
-- contributes 0 to every sum here already; it must not inflate the count
-- alongside them.
--
-- Source rows are filtered to `cost_amount is not null` before grouping,
-- in both views below -- a group made up entirely of such rows has
-- nothing to total, and without the filter it still produced one row:
-- every sum coalesced to 0, account_count to 0, and (for the currency
-- column, which is nullable) sometimes a null-currency row for a
-- plan_tier-only account with no cost_currency set either. That is not a
-- cost-less account's total, it is an account that was never billed
-- masquerading as one that costs nothing; the filter drops the group
-- entirely instead. The zero-cost literals in the coalesce fallbacks are
-- cast `0::numeric(12,2)` rather than left as the bare integer 0, so a
-- group that legitimately zeroes out one cycle (e.g. an all-yearly group
-- has no monthly rows at all) still renders that column as "0.00" like
-- every other value, not "0".
-- ---------------------------------------------------------------------

create view v_project_costs with (security_invoker = true) as
with totals as (
  select
    user_id,
    project_id,
    cost_currency,
    coalesce(sum(cost_amount) filter (where billing_cycle = 'monthly'), 0::numeric(12, 2)) as monthly_total,
    coalesce(sum(cost_amount) filter (where billing_cycle = 'yearly'), 0::numeric(12, 2)) as yearly_total,
    coalesce(sum(cost_amount) filter (where billing_cycle = 'usage'), 0::numeric(12, 2)) as usage_total,
    count(cost_amount) as account_count
  from user_service_accounts
  where cost_amount is not null
  group by user_id, project_id, cost_currency
)
select
  user_id,
  project_id,
  cost_currency,
  monthly_total,
  yearly_total,
  usage_total,
  round(monthly_total + yearly_total / 12, 2) as monthly_equivalent,
  account_count
from totals;

comment on view v_project_costs is
  'HANDOFF §4.2 query 3 ("cost per project"): one row per (user_id, project_id, '
  'cost_currency) from user_service_accounts, source-filtered to cost_amount is not '
  'null -- a group made up entirely of cost-less rows produces no row at all, rather '
  'than an all-zero one. project_id is null for an account that spans every project '
  'the owner has -- that stays its own group, never allocated across the owner''s '
  'other projects. monthly_equivalent = round(monthly_total + yearly_total / 12, 2); '
  'usage_total is excluded from it (own column only) -- see '
  'docs/plan/phase-4-backend.md, "Design, 2026-09-07", the Views paragraph. '
  'account_count = count(cost_amount): rows with no cost_amount entered are not counted.';

create view v_service_costs with (security_invoker = true) as
with totals as (
  select
    user_id,
    service_id,
    cost_currency,
    coalesce(sum(cost_amount) filter (where billing_cycle = 'monthly'), 0::numeric(12, 2)) as monthly_total,
    coalesce(sum(cost_amount) filter (where billing_cycle = 'yearly'), 0::numeric(12, 2)) as yearly_total,
    coalesce(sum(cost_amount) filter (where billing_cycle = 'usage'), 0::numeric(12, 2)) as usage_total,
    count(cost_amount) as account_count
  from user_service_accounts
  where cost_amount is not null
  group by user_id, service_id, cost_currency
)
select
  user_id,
  service_id,
  cost_currency,
  monthly_total,
  yearly_total,
  usage_total,
  round(monthly_total + yearly_total / 12, 2) as monthly_equivalent,
  account_count
from totals;

comment on view v_service_costs is
  'HANDOFF §4.2 query 3 ("cost per service"): v_project_costs'' companion, keyed '
  '(user_id, service_id, cost_currency) instead of by project -- an account whose '
  'project_id is null still counts here, since this view does not group by project '
  'at all. Same source filter (cost_amount is not null), monthly_equivalent '
  '(rounded) and account_count (count(cost_amount)) definitions as v_project_costs.';

-- ---------------------------------------------------------------------
-- v_service_blast_radius -- HANDOFF §4.2 query 2: "All projects depending
-- on service Y (direct or transitive)."
--
-- service_dependencies edges point from_project_service_id (the depender)
-- to to_project_service_id (the dependency): "from depends on to". The
-- blast radius of a node is everything that would be affected if *it*
-- changed or disappeared -- every node that reaches it by depending on it,
-- directly or through a chain of other dependents. So this walks
-- *backwards* from each node: starting at a node playing the "dependency"
-- (to) role, find every edge whose "to" is the current frontier, collect
-- its "from" as one hop further out, and repeat.
--
-- This is computed for every node in the graph at once (a view can't take
-- a parameter) -- HANDOFF §4.2 query 2 becomes a `where` on
-- dependency_service_slug, per this view's own comment below.
--
-- Bounded polynomially, not by tracking the path. An earlier version of
-- this view carried a `path uuid[]` column and dropped a row from the
-- recursion once a node reappeared in *that row's own path* -- which
-- sounds like cycle safety but actually enumerates every distinct path
-- to every node, and the number of paths through a DAG of shared
-- sub-paths (e.g. a chain of diamonds, each doubling the path count into
-- the next) is exponential in the chain length: measured at 61 nodes / 80
-- edges (20 chained diamonds), 16.7 million rows and 106 seconds; a chain
-- of 166 diamonds did not finish inside a 20-second statement_timeout
-- (2^166 paths). The `path` column was the cause -- every path was a
-- distinct row -- not the recursion depth or the node count.
--
-- This version recurses on the row shape (project_id,
-- dependency_project_service_id, dependent_project_service_id, depth)
-- alone, with `union` (not `union all`) so two recursion branches that
-- land on the identical row -- e.g. two different paths of the same
-- length between the same pair of nodes, which is exactly what a diamond
-- produces -- dedupe into one, rather than surviving as two rows that
-- differ only in a path array nothing downstream reads. That bounds the
-- row set by the number of *reachable pairs* (polynomial in node count),
-- not by the number of paths between them (exponential). `depth` is
-- capped at 1024 in the recursive step's `where` purely to guarantee
-- termination on a cycle: acyclicity is the CLI's to enforce (HANDOFF
-- §9.2), not this database's, so a cycle the CLI never got a chance to
-- reject is a real possibility here, and `union`'s row-level dedup alone
-- does not stop a cycle from recursing forever -- each trip around a
-- cycle adds 1 to `depth`, so the row is never identical to an earlier
-- one and `union` never catches it. The depth cap is what does. The cap
-- bounds only that -- a cycle the CLI failed to forbid -- not real
-- dependency depth: no manifest the CLI ever wrote is anywhere near this
-- deep, so 1024 is chosen large enough that a legitimate DAG never hits
-- it (an earlier cap of 64 silently truncated a chain of 70 real nodes to
-- 64 dependents for its deepest node, with no marker that anything had
-- been cut -- see docs/plan/phase-4-backend.md).
--
-- One consequence of dropping the path check: inside the recursion a node
-- that is part of a cycle reaches itself (at a depth equal to the cycle's
-- length), because tracing "who depends on this node, and who depends on
-- those, ..." around a cycle comes back to where it started. The outer
-- select drops that row: a node is not in its own blast radius, whatever
-- the graph looks like. This can only arise when the CLI's acyclicity rule
-- has been bypassed (a direct database write), so for a project written
-- the supported way the filter never removes anything.
--
-- The outer select groups by (project_id, dependency_project_service_id,
-- dependent_project_service_id) and exposes min(depth) as depth: a pair
-- can still be reached at more than one length (a diamond reaches the
-- node after it at the same depth via both branches, but a longer chain
-- can also reach an ancestor several different ways when it has more than
-- one route in), and `depth = 1` must keep meaning "direct dependent"
-- whichever route produced the smallest depth.
--
-- Edges with status = 'removed' are excluded from both the base case and
-- the recursive step -- a removed edge no longer describes a real
-- dependency, so it contributes nothing to anyone's blast radius. Edges
-- with status = 'phasing_out' are *not* excluded: the dependency has not
-- actually been removed yet.
-- ---------------------------------------------------------------------

create view v_service_blast_radius with (security_invoker = true) as
with recursive blast (
  project_id,
  dependency_project_service_id,
  dependent_project_service_id,
  depth
) as (
  select
    sd.project_id,
    sd.to_project_service_id,
    sd.from_project_service_id,
    1
  from service_dependencies sd
  where sd.status <> 'removed'

  union

  select
    b.project_id,
    b.dependency_project_service_id,
    sd.from_project_service_id,
    b.depth + 1
  from blast b
  join service_dependencies sd
    on sd.project_id = b.project_id
   and sd.to_project_service_id = b.dependent_project_service_id
  where sd.status <> 'removed'
    and b.depth < 1024
),
reachable as (
  select
    project_id,
    dependency_project_service_id,
    dependent_project_service_id,
    min(depth) as depth
  from blast
  group by project_id, dependency_project_service_id, dependent_project_service_id
)
select
  r.project_id,
  r.dependency_project_service_id,
  dep_ps.local_id as dependency_local_id,
  dep_svc.slug as dependency_service_slug,
  r.dependent_project_service_id,
  dpt_ps.local_id as dependent_local_id,
  dpt_svc.slug as dependent_service_slug,
  r.depth
from reachable r
join project_services dep_ps on dep_ps.id = r.dependency_project_service_id
join services dep_svc on dep_svc.id = dep_ps.service_id
join project_services dpt_ps on dpt_ps.id = r.dependent_project_service_id
join services dpt_svc on dpt_svc.id = dpt_ps.service_id
where r.dependency_project_service_id <> r.dependent_project_service_id;

comment on view v_service_blast_radius is
  'HANDOFF §4.2 query 2: recursive CTE over service_dependencies, walking backwards '
  '(from each node to every transitive dependent) so "all projects depending on '
  'service Y, direct or transitive" is `select distinct project_id from '
  'v_service_blast_radius where dependency_service_slug = ''y''`. depth 1 = direct, '
  'and is min(depth) across every route to that pair when there is more than one. '
  'Bounded polynomially: recursion is on (project_id, dependency, dependent, depth) '
  'with `union` (not `union all`) so identical rows dedupe -- no `path` column, so no '
  'per-path row explosion (see docs/plan/phase-4-backend.md, "Design, 2026-09-07"). '
  'depth is capped at 1024 in the recursive step to terminate a cycle the CLI failed '
  'to reject (HANDOFF §9.2) -- it bounds only that, not real dependency depth, so no '
  'real manifest comes close; excludes status = ''removed'' edges (phasing_out edges '
  'still count).';

-- ---------------------------------------------------------------------
-- v_phaseouts -- HANDOFF §4.2 query 4: "All edges/nodes marked
-- phasing_out, with their replaced_by targets -> migration dashboard."
--
-- A node's replacement is another project_services row, which has its own
-- service, so replaced_by_service_slug resolves through it directly. An
-- edge has no single service of its own (it connects two nodes, each with
-- its own service) -- service_slug is null for an edge row. Its
-- replacement is another service_dependencies row; replaced_by_service_slug
-- for an edge resolves through *that* replacement edge's own "to" (the
-- dependency side), i.e. the service the phased-out edge is being replaced
-- *with* -- and stays null when replaced_by_edge_id is unset.
-- ---------------------------------------------------------------------

create view v_phaseouts with (security_invoker = true) as
select
  ps.project_id,
  'node'::text as item_kind,
  ps.id as item_id,
  ps.local_id as local_id,
  svc.slug as service_slug,
  ps.replaced_by_project_service_id as replaced_by_id,
  rep_ps.local_id as replaced_by_local_id,
  rep_svc.slug as replaced_by_service_slug
from project_services ps
join services svc on svc.id = ps.service_id
left join project_services rep_ps on rep_ps.id = ps.replaced_by_project_service_id
left join services rep_svc on rep_svc.id = rep_ps.service_id
where ps.status = 'phasing_out'

union all

select
  sd.project_id,
  'edge'::text as item_kind,
  sd.id as item_id,
  from_ps.local_id || ' -> ' || to_ps.local_id as local_id,
  null::text as service_slug,
  sd.replaced_by_edge_id as replaced_by_id,
  case
    when rep_sd.id is null then null
    else rep_from_ps.local_id || ' -> ' || rep_to_ps.local_id
  end as replaced_by_local_id,
  rep_to_svc.slug as replaced_by_service_slug
from service_dependencies sd
join project_services from_ps on from_ps.id = sd.from_project_service_id
join project_services to_ps on to_ps.id = sd.to_project_service_id
left join service_dependencies rep_sd on rep_sd.id = sd.replaced_by_edge_id
left join project_services rep_from_ps on rep_from_ps.id = rep_sd.from_project_service_id
left join project_services rep_to_ps on rep_to_ps.id = rep_sd.to_project_service_id
left join services rep_to_svc on rep_to_svc.id = rep_to_ps.service_id
where sd.status = 'phasing_out';

comment on view v_phaseouts is
  'HANDOFF §4.2 query 4: union of project_services and service_dependencies rows in '
  'status = ''phasing_out'', each with its replaced_by target resolved to local ids '
  'and slugs. local_id is the node''s own for a node row, or "from_local_id -> '
  'to_local_id" text for an edge row; service_slug is the node''s own, null for an '
  'edge (an edge has no single service). replaced_by_service_slug resolves through '
  'the replacement node''s service, or through the replacement edge''s own '
  'dependency (to) side for an edge -- null when replaced_by is unset.';
