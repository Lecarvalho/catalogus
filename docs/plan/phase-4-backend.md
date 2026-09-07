# Phase 4 — Backend

> Split out of `docs/PLAN.md` on 2026-09-05, content verbatim. `docs/PLAN.md` is the index and the
> only place status is summarised; this file is the record. Section headings are unchanged so a
> code comment that names one still finds it by grep.

## Phase 4 — Backend ✅ built on a local Postgres, 2026-09-07; hosted project pending

Deferred deliberately. Phases 0–3 are fully offline, so this choice is better made with real query
shapes in hand than guessed at up front.

**The decision:** Supabase was the original assumption. Alternatives under consideration, chosen for
free-tier viability:

| Option | RLS equivalent | Auth included | Dialect |
|---|---|---|---|
| Neon | native Postgres RLS | separate (Neon Auth / Better Auth / Clerk) | Postgres |
| Cloudflare D1 | app-layer only | no | SQLite |
| PocketBase (self-hosted) | per-record rules | yes | SQLite |
| Supabase | native RLS | yes | Postgres |

Neon is the least friction — HANDOFF §4's schema transfers unchanged and RLS stays enforced by the
database. D1 wins if the whole product consolidates on one Cloudflare account, at the cost of moving
the security boundary into application code, which for a table holding cost data is a real tradeoff.

Dialect matters concretely: HANDOFF §4 uses `jsonb` and a `coding_agents[]` array, and the blast-radius
query is a recursive CTE. SQLite has `WITH RECURSIVE` but neither `jsonb` nor array types, so a SQLite
target is a rewrite of the storage layer, not a port.

- [x] Pick the backend — **Supabase**, owner, 2026-09-07 (`decisions.md` 15)
- [x] Migrations for the HANDOFF §4 schema (2026-09-07, below)
- [x] Row-level ownership policies (2026-09-07, below), with a test proving a second user cannot read the first user's
      `user_service_accounts` — this table holds the cost data, so the policy review deserves a
      frontier model rather than a quick pass
- [x] Views (2026-09-07, below): `v_project_costs`, `v_service_blast_radius` (recursive CTE over edges), `v_phaseouts`
- [x] Seed the global service catalog (2026-09-07, below; pricing model left to the owner) — roughly 40 services actually in use, with `simple-icons`
      slugs, category and pricing model


### Design, 2026-09-07 — the prototype before the host

Written by the main session once the owner picked Supabase (decision 15). The phase's four
remaining boxes are built against a local Postgres 17 container first and validated there; the
hosted project comes after, and the migrations are written so that step is `supabase db push`
rather than a rewrite.

**Local container.** `docker run -d --name catalogus-pg -e POSTGRES_PASSWORD=catalogus -e
POSTGRES_DB=catalogus -p 55432:5432 postgres:17`. The tests read
`CATALOGUS_TEST_DATABASE_URL` (for that container:
`postgres://postgres:catalogus@localhost:55432/postgres`) and skip, with the variable named in the
skip reason, when it is unset — so `pnpm test` on a machine without the container stays green and
a box in this file is ticked only after a run *with* it set. The password is a throwaway for a
local container that holds nothing; it is not a secret and it is not in any file the CLI writes.

**Layout.**

- `supabase/migrations/NNNN_<name>.sql` — the Supabase CLI's convention, so the hosted step is
  `supabase db push`. `supabase init` adds `config.toml` later; nothing here needs it yet.
  `0001_schema.sql` (tables), `0002_rls.sql` (policies), `0003_views.sql` (the three views).
- `supabase/seed.sql` — generated, never hand-edited, from `CATALOGUS_CATALOG` in
  `@catalogus/core` by `packages/db/scripts/generate-seed.mjs` at build, with a sync test in the
  style of `packages/schema/src/schema-sync.test.ts`.
- `packages/db` (`@catalogus/db`) — test-only for now: the harness that creates a fresh database
  per test file (vitest parallelises files), applies the local auth stub, then the migrations in
  filename order, then the seed; and the tests. `pg` is its one dependency. No runtime code lives
  here yet; Phase 5's `push` is the first consumer.
- `packages/db/src/test-support/local-auth-stub.sql` — what Supabase provides and a plain
  Postgres does not: the `auth` schema, `auth.users(id uuid primary key, email text)`,
  `auth.uid()` reading `request.jwt.claims` exactly as Supabase's does, and the `anon`,
  `authenticated` and `service_role` roles. The migrations never create any of these.

**Tables**, HANDOFF §4 mapped onto the manifest schema's own enums so a sync is a copy, not a
translation. `projects(id, owner_id → auth.users, name, slug, repo_url, description, created_at)`
unique on `(owner_id, slug)`. `services(id, slug unique, name, icon_ref, pricing_model,
vendor_url, status, sunset_date, successor_service_id)`; no `category` (decision 15).
`project_services(id, project_id, service_id, local_id, role, kind, version, icon_path, added_at,
status, replaced_by_project_service_id, provenance, notes)` unique on `(project_id, local_id)`;
`kind`, `status` and the slug pattern are checks copied from the manifest schema, `provenance`
is `detected | manual`. `service_dependencies(id, project_id, from_project_service_id,
to_project_service_id, added_at, status, replaced_by_edge_id, notes)` unique on the triple, `from
<> to`; acyclicity stays in the CLI (HANDOFF §9.2). `user_service_accounts` exactly as §4 lists
it, `project_id` nullable. `project_meta(project_id, architecture_style, vcs_visibility, extra
jsonb)`. Plus `project_service_pages(id, user_id, project_service_id, body, updated_at)` for the
2026-08-25 amendment's page content — minimal on purpose; the two-writer versioning story is
recorded open in the HANDOFF and is not solved here.

**Policies.** RLS enabled *and forced* on every table. Owner-scoped tables resolve ownership
through `projects.owner_id = auth.uid()`; `user_service_accounts` and `project_service_pages`
through their own `user_id`. `services` is readable by `anon` and `authenticated` and has no
write policy at all, so only `service_role` (which bypasses RLS) writes it — the seed and an
admin path, and nothing else, until moderated contributions exist. Every view is created
`with (security_invoker = true)`, because a view that ran as its owner would be the one hole in
the cost table's boundary.

**Views.** `v_project_costs` sums per `(user_id, project_id, cost_currency)` — no currency
conversion, no allocation of an account whose `project_id` is null across projects (it appears
under a null project), and `usage` billing exposed as its own column rather than folded into a
monthly figure whose meaning the repo does not define. `v_service_blast_radius` is the recursive
CTE walking edges backwards from each node to every transitive dependent, cycle-safe by path,
with the catalog slug on both ends so §4.2 query 2 is a `where`. `v_phaseouts` lists every node
and edge in `phasing_out` with its `replaced_by` target resolved to local ids and slugs.

**Not in this phase**, so it is not re-proposed: an acyclicity trigger; `updated_at` triggers;
currency conversion; the page versioning story; the Supabase project itself and its credentials.

### Built and validated, 2026-09-07

- [x] Migrations for the HANDOFF §4 schema — `supabase/migrations/0001_schema.sql`; 46 tests in
      `packages/db/src/schema.test.ts`.
- [x] Row-level ownership policies, with the two-user test — `0002_rls.sql`, 25 policies plus the
      grant revokes; 45 tests in `rls.test.ts`, the `user_service_accounts` case its own `it`;
      three validator rounds on the strongest model.
- [x] Views — `0003_views.sql`: `v_project_costs`, `v_service_costs`, `v_service_blast_radius`,
      `v_phaseouts`, all `security_invoker`; 26 tests in `views.test.ts`, including a timed
      40-diamond fixture and a 70-node chain.
- [x] Seed — `supabase/seed.sql`, 172 rows generated from `CATALOGUS_CATALOG` at build; 5 tests in
      `seed-sync.test.ts`; `pricing_model` and `vendor_url` null by design (decision 15).

Verified: **1905 tests / 97 files** with `CATALOGUS_TEST_DATABASE_URL` set, three consecutive
runs; 1780 passed + 125 skipped without it; build and typecheck exit 0; zero `catalogus_test_*`
databases left behind. The rounds, what each found and what was left unfixed are in the
2026-09-07 handoff in `handoffs-2026-09.md`.

Left in this phase: nothing for development — the local Supabase stack below replaces the
hosted project until launch. At launch: `supabase link`, `supabase db push`, the seed applied
as `service_role`.

### The local Supabase stack, 2026-09-07 (evening)

The owner asked why development needed a remote database. It does not. The Supabase CLI runs
the whole platform as local containers — Postgres 17, GoTrue (Auth), PostgREST, Kong, Realtime,
Storage, Studio, Inbucket for auth mail — so Phases 5 and 7 can be built and demoed offline and
the hosted project matters only at launch. Set up the same evening, CLI 2.117.0:

```
supabase init          # wrote supabase/config.toml, major_version = 17; no secrets in it
supabase start         # pulls images on first run; prints local keys (well-known defaults)
supabase db reset      # replays supabase/migrations/*.sql then supabase/seed.sql
```

`supabase start` applied `0001`, `0002`, `0003` and the seed on Supabase's own image on the first
run: 172 services, RLS forced, `MAINTAIN` revoked (the PG17 guard ran for real). Studio is
`http://localhost:54323`; the API is `54321`; the database is
`postgresql://postgres:postgres@localhost:54322/postgres`, which is also what
`CATALOGUS_TEST_DATABASE_URL` should point at from now on — the suite ran green there,
**1905 tests / 97 files**, and again on the plain `catalogus-pg` container. One test was adjusted:
on Supabase's image `postgres` is not a superuser, so `set session authorization` inside a
harness `fn` is refused rather than leaking; `harness.test.ts` accepts either outcome and asserts
the state after the call.

What the harness does on this stack: each test file still creates its own scratch database and
applies `local-auth-stub.sql` there, because Supabase's `auth` schema lives only in the
`postgres` database; the stub is not applied to, and never touches, the stack's real database.

Visual validation: Studio's Table Editor shows the seven tables and the seeded `services`;
Auth → Users creates real users; the SQL editor runs the two-user walk (set the JWT claims
with `set_config` as the tests do, or sign in through the API and let PostgREST set them).

Still needed at launch, and only then: the hosted project, `supabase link`, `supabase db push`,
the seed applied as `service_role`. The migration filenames are `0001_...` rather than the
CLI's timestamp convention; the CLI accepts any leading integer as the version, and a later
`supabase migration new` will sort after them.
