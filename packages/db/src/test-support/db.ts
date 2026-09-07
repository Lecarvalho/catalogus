// The test harness for @catalogus/db: a fresh database per test file (vitest
// runs test files in parallel, so tests must not share one), the local auth
// stub applied first, then every supabase/migrations/*.sql in filename
// order, then supabase/seed.sql if it exists (it does not yet -- a later
// brief adds the seed generator; this harness picks it up automatically
// once it does, nothing here should need to change).
//
// Everything here needs CATALOGUS_TEST_DATABASE_URL pointing at an admin
// connection (a local Postgres 17 container in dev -- see
// docs/plan/phase-4-backend.md). `pnpm test` without it stays green: use
// `describeDb` (or `hasTestDatabase`) to skip rather than fail.
import { randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { describe } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
// This file lives at packages/db/src/test-support/ -- four levels up is the
// repo root, where supabase/ sits alongside packages/ (see CLAUDE.md's
// package layout section).
const SUPABASE_DIR = join(here, "..", "..", "..", "..", "supabase");
const MIGRATIONS_DIR = join(SUPABASE_DIR, "migrations");
const SEED_PATH = join(SUPABASE_DIR, "seed.sql");
const AUTH_STUB_PATH = join(here, "local-auth-stub.sql");

const SKIP_REASON =
  "set CATALOGUS_TEST_DATABASE_URL (see docs/plan/phase-4-backend.md) to run against a local Postgres container";

/** Whether a test database is reachable at all -- checks only that the env var is set. */
export function hasTestDatabase(): boolean {
  return Boolean(process.env.CATALOGUS_TEST_DATABASE_URL);
}

/**
 * `describe` that runs its block normally when CATALOGUS_TEST_DATABASE_URL
 * is set, and skips it -- naming the variable in the reason, not just
 * "skipped" -- when it isn't. Keeps `pnpm test` green with no database and
 * still surfaces, in the vitest output, exactly what would make it run.
 */
export function describeDb(name: string, fn: () => void): void {
  if (hasTestDatabase()) {
    describe(name, fn);
  } else {
    describe.skip(`${name} (skipped: ${SKIP_REASON})`, fn);
  }
}

export interface TestDatabase {
  /** Connected as the admin role (the one CATALOGUS_TEST_DATABASE_URL authenticates as) -- a Postgres superuser locally. */
  client: Client;
  /** Connection string for this test's own database (same credentials, different database name). */
  url: string;
  /** Disconnects `client` and drops the database. Always call this, even on test failure. */
  close: () => Promise<void>;
}

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function applySqlFile(client: Client, path: string): Promise<void> {
  const sql = await readFile(path, "utf8");
  await client.query(sql);
}

/**
 * Creates a fresh, randomly-named database, applies the local auth stub and
 * every migration (then the seed, once one exists), and returns a client
 * already connected to it. Requires CATALOGUS_TEST_DATABASE_URL -- callers
 * should be inside a block guarded by `describeDb`/`hasTestDatabase()`.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env.CATALOGUS_TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      `createTestDatabase: CATALOGUS_TEST_DATABASE_URL is not set. ${SKIP_REASON}. Guard callers with describeDb()/hasTestDatabase() instead of calling this unconditionally.`,
    );
  }

  // vitest runs test files in parallel worker processes, so the database
  // name has to be collision-proof across concurrent runs, not just unique
  // within one.
  const databaseName = `catalogus_test_${randomUUID().replace(/-/g, "")}`;

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`create database "${databaseName}"`);
  } finally {
    await admin.end();
  }

  const url = withDatabaseName(adminUrl, databaseName);
  const client = new Client({ connectionString: url });
  await client.connect();

  let ready = false;
  try {
    await applySqlFile(client, AUTH_STUB_PATH);

    const migrationFiles = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    for (const file of migrationFiles) {
      await applySqlFile(client, join(MIGRATIONS_DIR, file));
    }

    if (await fileExists(SEED_PATH)) {
      await applySqlFile(client, SEED_PATH);
    }
    ready = true;
  } finally {
    if (!ready) {
      // Setup failed partway through -- don't leak the database or the
      // connection past this function; the caller never gets far enough to
      // call close().
      await client.end().catch(() => undefined);
      await dropDatabase(adminUrl, databaseName).catch(() => undefined);
    }
  }

  const close = async (): Promise<void> => {
    await client.end();
    await dropDatabase(adminUrl, databaseName);
  };

  return { client, url, close };
}

async function dropDatabase(adminUrl: string, databaseName: string): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    // `with (force)` disconnects any other session still attached (there
    // shouldn't be one -- the caller's own client is already closed by the
    // time this runs -- but a leftover connection must never make cleanup
    // itself the thing that fails a test run).
    await admin.query(`drop database if exists "${databaseName}" with (force)`);
  } finally {
    await admin.end();
  }
}

/** Inserts a row into auth.users as the connection's own role (a superuser locally) and returns its id. */
export async function createUser(client: Client, email?: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [email ?? null],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("createUser: insert into auth.users returned no row");
  }
  return row.id;
}

type RequestRole = "anon" | "authenticated" | "service_role";

async function runAsRole<T>(
  client: Client,
  role: RequestRole,
  claims: Record<string, string> | null,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    // `set local role` and `set_config(..., true)`'s third argument are
    // both transaction-scoped: they revert on their own at commit or
    // rollback, which is what "resets role after" means here -- the
    // `reset role` in `finally` below is belt-and-suspenders on top of
    // that, not the only thing doing the resetting.
    await client.query(`set local role ${role}`);
    // Always set the claims, to '' when there are none: a caller's `fn`
    // that ran `set_config(..., false)` or committed early leaves a
    // *session*-scoped value behind, and the next `asAnon` would then see
    // the previous user's `auth.uid()` (found by a validator, 2026-09-07).
    // '' is what Supabase's `auth.uid()` reads as null.
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', '', true)", [
      claims ? JSON.stringify(claims) : "",
    ]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    await client
      // `reset session authorization` too: `reset role` cannot undo a
      // `set session authorization` a fn ran, and the session user here is
      // a superuser, so the statement is allowed even as `authenticated`.
      .query("reset session authorization; reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)")
      .catch(() => undefined);
  }
}

/** Runs `fn` as `role: authenticated` with `auth.uid()` resolving to `userId`, in its own transaction. */
export async function asUser<T>(client: Client, userId: string, fn: (client: Client) => Promise<T>): Promise<T> {
  return runAsRole(client, "authenticated", { sub: userId, role: "authenticated" }, fn);
}

/** Runs `fn` as `role: anon`, with no JWT claims set -- `auth.uid()` resolves to null. */
export async function asAnon<T>(client: Client, fn: (client: Client) => Promise<T>): Promise<T> {
  return runAsRole(client, "anon", null, fn);
}

/** Runs `fn` as `role: service_role` (bypasses RLS, same as Supabase's backend role). */
export async function asServiceRole<T>(client: Client, fn: (client: Client) => Promise<T>): Promise<T> {
  return runAsRole(client, "service_role", null, fn);
}
