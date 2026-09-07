-- What Supabase provides that a plain Postgres 17 container does not: the
-- `auth` schema, `auth.users`, `auth.uid()` / `auth.role()` reading the JWT
-- claims GUCs that PostgREST (Supabase's request layer) sets per request,
-- and the `anon` / `authenticated` / `service_role` roles the RLS policies
-- in supabase/migrations/*.sql are written against.
--
-- Applied once per test database, before any migration under
-- supabase/migrations/ runs (see createTestDatabase in db.ts). The
-- migrations never create any of this themselves -- on the hosted project
-- Supabase already provides it, so a migration that (re)created it would
-- work here and fail (or silently diverge) there.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- Supabase's own implementation (auth-helpers / PostgREST convention):
-- PostgREST sets `request.jwt.claim.<name>` for each top-level claim and
-- `request.jwt.claims` for the whole JSON blob; auth.uid() prefers the
-- per-claim GUC and falls back to picking `sub` out of the blob. `true` as
-- the second argument to current_setting means "missing_ok" -- unset reads
-- as null rather than raising, which is the anon (no JWT at all) case.
--
-- `nullif(..., '')` guards each raw current_setting call *before* any
-- `::jsonb` cast, not after -- reproduced directly against this stub: a
-- custom (placeholder) GUC like `request.jwt.claims`, once set inside a
-- transaction via set_config(..., true), reverts to an empty string (not
-- NULL) once that transaction ends, for the rest of the session. A version
-- that cast first and nullif'd the combined result last (a form that reads
-- equally plausible) throws "invalid input syntax for type json" on
-- exactly that next transaction -- e.g. an asAnon() call in the same test
-- file after an asUser() call. This is the actual, current Supabase source
-- for both functions, not a paraphrase of it.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    )::text
$$;

-- The three Supabase request roles. `nologin`: nothing ever connects to
-- Postgres directly as these -- PostgREST (on the hosted project) and the
-- test harness's `asUser`/`asAnon`/`asServiceRole` (here) reach them via
-- `set local role`, which does not require login privilege. Guarded so
-- re-running this stub (or a future test run against a database where it
-- was already applied) does not fail on "role already exists".
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- bypassrls: Supabase's service_role is the admin/backend role and is
    -- meant to see past every RLS policy, same as a table owner would.
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- A newly created schema grants no privileges to PUBLIC (unlike `public`
-- itself, which initdb seeds with USAGE for PUBLIC) -- so calling
-- `auth.uid()`/`auth.role()` by their schema-qualified name as anon or
-- authenticated needs this explicitly.
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase grants `all` on every table in `public` to anon, authenticated
-- and service_role itself (RLS -- enabled and forced per table by a later
-- migration -- is what actually restricts access, not these table grants).
-- Table privileges, so they only make sense once the tables exist; this
-- stub runs before supabase/migrations/*.sql creates them. ALTER DEFAULT
-- PRIVILEGES (rather than GRANT ... ON ALL TABLES IN SCHEMA public) records
-- the grant for every table the same role creates afterward -- the
-- migrations run over the same connection (the admin role), so this covers
-- them without a second pass once they exist.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
