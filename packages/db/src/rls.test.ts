// Tests supabase/migrations/0002_rls.sql: the two-user isolation story for
// every table it covers, through the harness's asUser/asAnon/asServiceRole.
// See docs/plan/phase-4-backend.md, "Design, 2026-09-07", the **Policies**
// paragraph, for the design this migration -- and so this test -- implements.
//
// Fixtures (built once in beforeAll, as they would be by a real client):
// user A owns `projectA` (with two project_services, an edge between them,
// project_meta, a user_service_accounts row carrying cost_amount, and a
// page on one of the project_services) and a second, otherwise-empty
// `projectA2` used only as an insert target for the "B cannot reference
// A's project" cases so those don't collide with projectA's existing
// project_meta row (project_id is project_meta's primary key). User B owns
// `projectB` with one project_service, used as the "another user's node"
// target for the edge-injection cases. Both services are inserted by
// service_role, the only role that can write `services`.
//
// seed.sql may already have rows in `services` by the time this runs (a
// sibling brief adds it) -- every slug and local_id here is randomised so
// this file never collides with seeded or another test file's data.
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asAnon,
  asServiceRole,
  asUser,
  createTestDatabase,
  createUser,
  describeDb,
  type TestDatabase,
} from "./test-support/db.js";

describeDb("supabase/migrations/0002_rls.sql", () => {
  let db: TestDatabase;
  let client: Client;

  let userA: string;
  let userB: string;

  let serviceOne: string;
  let serviceTwo: string;

  let projectA: string;
  let projectA2: string;
  let projectB: string;

  let projectServiceA1: string;
  let projectServiceA2: string;
  let projectServiceB1: string;

  let edgeA: string;
  let accountA: string;
  let pageA: string;
  let accountBNoProject: string;
  let serverVersionNum: number;

  function randomSlug(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

  async function insertId(
    role: "A" | "B" | "service_role",
    sql: string,
    params: unknown[],
  ): Promise<string> {
    const run =
      role === "A"
        ? (c: (client: Client) => Promise<unknown>) => asUser(client, userA, c)
        : role === "B"
          ? (c: (client: Client) => Promise<unknown>) => asUser(client, userB, c)
          : (c: (client: Client) => Promise<unknown>) => asServiceRole(client, c);
    const result = (await run((c) => c.query<{ id: string }>(sql, params))) as { rows: Array<{ id: string }> };
    const row = result.rows[0];
    if (!row) throw new Error(`insertId: no row returned for ${sql}`);
    return row.id;
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    client = db.client;

    // Determines whether MAINTAIN exists on this server at all (it's a
    // Postgres 17 privilege; Supabase also hosts Postgres 15 projects) --
    // read once here so the tests below can skip themselves with a reason
    // rather than fail against an older server.
    const versionResult = await client.query<{ server_version_num: string }>(
      "select current_setting('server_version_num') as server_version_num",
    );
    serverVersionNum = Number(versionResult.rows[0]?.server_version_num);

    userA = await createUser(client);
    userB = await createUser(client);

    serviceOne = await insertId(
      "service_role",
      "insert into services (slug, name) values ($1, 'RLS Test Service One') returning id",
      [randomSlug("rls-svc")],
    );
    serviceTwo = await insertId(
      "service_role",
      "insert into services (slug, name) values ($1, 'RLS Test Service Two') returning id",
      [randomSlug("rls-svc")],
    );

    projectA = await insertId(
      "A",
      "insert into projects (owner_id, name, slug) values ($1, 'Project A', $2) returning id",
      [userA, randomSlug("project-a")],
    );
    projectA2 = await insertId(
      "A",
      "insert into projects (owner_id, name, slug) values ($1, 'Project A2', $2) returning id",
      [userA, randomSlug("project-a2")],
    );
    projectB = await insertId(
      "B",
      "insert into projects (owner_id, name, slug) values ($1, 'Project B', $2) returning id",
      [userB, randomSlug("project-b")],
    );

    projectServiceA1 = await insertId(
      "A",
      `insert into project_services (project_id, service_id, local_id, role, added_at, provenance)
       values ($1, $2, $3, 'database', current_date, 'manual') returning id`,
      [projectA, serviceOne, randomSlug("svc-a1")],
    );
    projectServiceA2 = await insertId(
      "A",
      `insert into project_services (project_id, service_id, local_id, role, added_at, provenance)
       values ($1, $2, $3, 'cache', current_date, 'manual') returning id`,
      [projectA, serviceTwo, randomSlug("svc-a2")],
    );
    projectServiceB1 = await insertId(
      "B",
      `insert into project_services (project_id, service_id, local_id, role, added_at, provenance)
       values ($1, $2, $3, 'database', current_date, 'manual') returning id`,
      [projectB, serviceOne, randomSlug("svc-b1")],
    );

    edgeA = await insertId(
      "A",
      `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id)
       values ($1, $2, $3) returning id`,
      [projectA, projectServiceA1, projectServiceA2],
    );

    await asUser(client, userA, (c) =>
      c.query("insert into project_meta (project_id, architecture_style) values ($1, 'modular monolith')", [projectA]),
    );

    accountA = await insertId(
      "A",
      `insert into user_service_accounts (user_id, service_id, project_id, cost_amount, cost_currency, billing_cycle)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [userA, serviceOne, projectA, "9.99", "USD", "monthly"],
    );

    pageA = await insertId(
      "A",
      `insert into project_service_pages (user_id, project_service_id, body) values ($1, $2, $3) returning id`,
      [userA, projectServiceA1, "notes"],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  describe("B cannot select A's rows", () => {
    it("projects", async () => {
      const result = await asUser(client, userB, (c) => c.query("select * from projects where id = $1", [projectA]));
      expect(result.rowCount).toBe(0);
    });

    it("project_services", async () => {
      const result = await asUser(client, userB, (c) =>
        c.query("select * from project_services where id = $1", [projectServiceA1]),
      );
      expect(result.rowCount).toBe(0);
    });

    it("service_dependencies", async () => {
      const result = await asUser(client, userB, (c) =>
        c.query("select * from service_dependencies where id = $1", [edgeA]),
      );
      expect(result.rowCount).toBe(0);
    });

    it("project_meta", async () => {
      const result = await asUser(client, userB, (c) =>
        c.query("select * from project_meta where project_id = $1", [projectA]),
      );
      expect(result.rowCount).toBe(0);
    });

    it("project_service_pages", async () => {
      const result = await asUser(client, userB, (c) =>
        c.query("select * from project_service_pages where id = $1", [pageA]),
      );
      expect(result.rowCount).toBe(0);
    });

    // The case HANDOFF §4 names explicitly: this table holds cost data, so
    // it gets its own test rather than sharing one with the others above.
    it("user_service_accounts", async () => {
      const result = await asUser(client, userB, (c) =>
        c.query("select * from user_service_accounts where id = $1", [accountA]),
      );
      expect(result.rowCount).toBe(0);
    });
  });

  describe("B's writes against A's rows affect zero rows", () => {
    it("projects: update and delete", async () => {
      const updateResult = await asUser(client, userB, (c) =>
        c.query("update projects set name = 'hacked' where id = $1", [projectA]),
      );
      expect(updateResult.rowCount).toBe(0);
      const deleteResult = await asUser(client, userB, (c) => c.query("delete from projects where id = $1", [projectA]));
      expect(deleteResult.rowCount).toBe(0);
    });

    it("project_services: update and delete", async () => {
      const updateResult = await asUser(client, userB, (c) =>
        c.query("update project_services set notes = 'hacked' where id = $1", [projectServiceA1]),
      );
      expect(updateResult.rowCount).toBe(0);
      const deleteResult = await asUser(client, userB, (c) =>
        c.query("delete from project_services where id = $1", [projectServiceA1]),
      );
      expect(deleteResult.rowCount).toBe(0);
    });

    it("service_dependencies: update and delete", async () => {
      const updateResult = await asUser(client, userB, (c) =>
        c.query("update service_dependencies set notes = 'hacked' where id = $1", [edgeA]),
      );
      expect(updateResult.rowCount).toBe(0);
      const deleteResult = await asUser(client, userB, (c) =>
        c.query("delete from service_dependencies where id = $1", [edgeA]),
      );
      expect(deleteResult.rowCount).toBe(0);
    });

    it("project_meta: update and delete", async () => {
      const updateResult = await asUser(client, userB, (c) =>
        c.query("update project_meta set architecture_style = 'hacked' where project_id = $1", [projectA]),
      );
      expect(updateResult.rowCount).toBe(0);
      const deleteResult = await asUser(client, userB, (c) =>
        c.query("delete from project_meta where project_id = $1", [projectA]),
      );
      expect(deleteResult.rowCount).toBe(0);
    });

    it("user_service_accounts: update and delete", async () => {
      const updateResult = await asUser(client, userB, (c) =>
        c.query("update user_service_accounts set cost_amount = 0 where id = $1", [accountA]),
      );
      expect(updateResult.rowCount).toBe(0);
      const deleteResult = await asUser(client, userB, (c) =>
        c.query("delete from user_service_accounts where id = $1", [accountA]),
      );
      expect(deleteResult.rowCount).toBe(0);
    });

    it("project_service_pages: update and delete", async () => {
      const updateResult = await asUser(client, userB, (c) =>
        c.query("update project_service_pages set body = 'hacked' where id = $1", [pageA]),
      );
      expect(updateResult.rowCount).toBe(0);
      const deleteResult = await asUser(client, userB, (c) =>
        c.query("delete from project_service_pages where id = $1", [pageA]),
      );
      expect(deleteResult.rowCount).toBe(0);
    });
  });

  describe("B cannot insert rows referencing A", () => {
    it("project_services referencing A's project", async () => {
      await expect(
        asUser(client, userB, (c) =>
          c.query(
            `insert into project_services (project_id, service_id, local_id, role, added_at, provenance)
             values ($1, $2, $3, 'database', current_date, 'manual')`,
            [projectA, serviceOne, randomSlug("intrude")],
          ),
        ),
      ).rejects.toThrow(/violates row-level security policy/);
    });

    it("service_dependencies referencing A's project and nodes", async () => {
      // The reverse pair of edgeA (A2 -> A1) so this fails on RLS rather
      // than colliding with edgeA's own (project_id, from, to) uniqueness.
      await expect(
        asUser(client, userB, (c) =>
          c.query(
            `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id)
             values ($1, $2, $3)`,
            [projectA, projectServiceA2, projectServiceA1],
          ),
        ),
      ).rejects.toThrow(/violates row-level security policy/);
    });

    it("project_meta referencing A's project", async () => {
      // projectA2 has no project_meta row yet -- projectA already does,
      // and project_id is project_meta's primary key, so reusing it here
      // would raise a duplicate-key error and mask the RLS one.
      await expect(
        asUser(client, userB, (c) =>
          c.query("insert into project_meta (project_id, architecture_style) values ($1, 'hacked')", [projectA2]),
        ),
      ).rejects.toThrow(/violates row-level security policy/);
    });

    it("user_service_accounts naming A as the user", async () => {
      // user_service_accounts has no project-ownership check (only
      // user_id = auth.uid(), design section) -- so "referencing A" here
      // means B trying to write a row under A's identity, the one thing
      // this table's policy does guard.
      await expect(
        asUser(client, userB, (c) =>
          c.query("insert into user_service_accounts (user_id, service_id) values ($1, $2)", [userA, serviceOne]),
        ),
      ).rejects.toThrow(/violates row-level security policy/);
    });

    it("project_service_pages referencing A's node", async () => {
      // user_id = B (B's own identity) but project_service_id points at
      // A's node -- isolates the pages-specific "node belongs to a project
      // you own" check from the plain user_id check.
      await expect(
        asUser(client, userB, (c) =>
          c.query("insert into project_service_pages (user_id, project_service_id, body) values ($1, $2, 'hacked')", [
            userB,
            projectServiceA1,
          ]),
        ),
      ).rejects.toThrow(/violates row-level security policy/);
    });
  });

  describe("A cannot escape their own ownership boundary", () => {
    it("cannot reassign a project's owner_id to B", async () => {
      await expect(
        asUser(client, userA, (c) => c.query("update projects set owner_id = $1 where id = $2", [userB, projectA])),
      ).rejects.toThrow(/violates row-level security policy/);
    });

    it("cannot insert an edge whose to-node is B's", async () => {
      await expect(
        asUser(client, userA, (c) =>
          c.query(
            `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id)
             values ($1, $2, $3)`,
            [projectA, projectServiceA1, projectServiceB1],
          ),
        ),
      ).rejects.toThrow(/violates row-level security policy/);
    });
  });

  describe("anon", () => {
    it("can select services", async () => {
      const result = await asAnon(client, (c) => c.query("select * from services where id = any($1)", [[serviceOne, serviceTwo]]));
      expect(result.rowCount).toBe(2);
    });

    it("selects zero rows from projects", async () => {
      const result = await asAnon(client, (c) => c.query("select * from projects"));
      expect(result.rowCount).toBe(0);
    });

    it("selects zero rows from project_services", async () => {
      const result = await asAnon(client, (c) => c.query("select * from project_services"));
      expect(result.rowCount).toBe(0);
    });

    it("selects zero rows from service_dependencies", async () => {
      const result = await asAnon(client, (c) => c.query("select * from service_dependencies"));
      expect(result.rowCount).toBe(0);
    });

    it("selects zero rows from project_meta", async () => {
      const result = await asAnon(client, (c) => c.query("select * from project_meta"));
      expect(result.rowCount).toBe(0);
    });

    it("selects zero rows from user_service_accounts", async () => {
      const result = await asAnon(client, (c) => c.query("select * from user_service_accounts"));
      expect(result.rowCount).toBe(0);
    });

    it("selects zero rows from project_service_pages", async () => {
      const result = await asAnon(client, (c) => c.query("select * from project_service_pages"));
      expect(result.rowCount).toBe(0);
    });
  });

  describe("services has no write policy for authenticated", () => {
    it("insert is rejected", async () => {
      await expect(
        asUser(client, userA, (c) =>
          c.query("insert into services (slug, name) values ($1, 'Nope')", [randomSlug("nope")]),
        ),
      ).rejects.toThrow(/violates row-level security policy/);
    });

    it("update affects zero rows", async () => {
      const result = await asUser(client, userA, (c) =>
        c.query("update services set name = 'Nope' where id = $1", [serviceOne]),
      );
      expect(result.rowCount).toBe(0);
    });

    it("delete affects zero rows", async () => {
      const result = await asUser(client, userA, (c) => c.query("delete from services where id = $1", [serviceOne]));
      expect(result.rowCount).toBe(0);
    });
  });

  describe("service_role bypasses RLS", () => {
    it("reads both A's and B's projects", async () => {
      const result = await asServiceRole(client, (c) =>
        c.query("select id from projects where id = any($1) order by id", [[projectA, projectB]]),
      );
      expect(result.rows.map((row: { id: string }) => row.id).sort()).toEqual([projectA, projectB].sort());
    });

    it("reads A's user_service_accounts row", async () => {
      const result = await asServiceRole(client, (c) =>
        c.query("select id from user_service_accounts where id = $1", [accountA]),
      );
      expect(result.rowCount).toBe(1);
    });
  });

  describe("A sees exactly their own rows", () => {
    it("projects returns projectA and projectA2, not projectB", async () => {
      const result = await asUser(client, userA, (c) => c.query<{ id: string }>("select id from projects"));
      expect(result.rows.map((row) => row.id).sort()).toEqual([projectA, projectA2].sort());
    });
  });

  // Defect: a user_service_accounts row's project_id was checked for
  // nothing but its own presence -- B could point one at A's project. A's
  // own project delete (on delete cascade, 0001_schema.sql) would then
  // cascade into B's row: a second user's cost data destroyed by the
  // first user's ordinary housekeeping. Fixed by tightening
  // user_service_accounts_insert_own/_update_own's `with check` to require
  // project_id is null or owned by the caller.
  describe("user_service_accounts cannot be parked on another user's project", () => {
    it("B cannot insert an account on A's project", async () => {
      await expect(
        asUser(client, userB, (c) =>
          c.query(
            "insert into user_service_accounts (user_id, service_id, project_id) values ($1, $2, $3)",
            [userB, serviceOne, projectA],
          ),
        ),
      ).rejects.toThrow(/violates row-level security policy/);
    });

    it("B cannot update their own account's project_id to A's project", async () => {
      const accountB = await insertId(
        "B",
        "insert into user_service_accounts (user_id, service_id) values ($1, $2) returning id",
        [userB, serviceOne],
      );

      try {
        await asUser(client, userB, (c) =>
          c.query("update user_service_accounts set project_id = $1 where id = $2", [projectA, accountB]),
        );
      } catch (err) {
        expect(String(err)).toMatch(/violates row-level security policy/);
      }

      // Either it threw (with check rejected the new row) or it silently
      // affected zero rows -- either way the row must be unchanged.
      const check = await asUser(client, userB, (c) =>
        c.query<{ project_id: string | null }>("select project_id from user_service_accounts where id = $1", [
          accountB,
        ]),
      );
      expect(check.rows[0]?.project_id ?? null).toBeNull();
    });

    it("B inserting an account with project_id null still works", async () => {
      accountBNoProject = await insertId(
        "B",
        "insert into user_service_accounts (user_id, service_id) values ($1, $2) returning id",
        [userB, serviceOne],
      );
      expect(accountBNoProject).toBeTruthy();
    });

    it("A's project delete leaves B's rows untouched", async () => {
      const projectA3 = await insertId(
        "A",
        "insert into projects (owner_id, name, slug) values ($1, 'Project A3', $2) returning id",
        [userA, randomSlug("project-a3")],
      );

      await asUser(client, userA, (c) => c.query("delete from projects where id = $1", [projectA3]));

      const result = await asUser(client, userB, (c) =>
        c.query<{ id: string; project_id: string | null }>(
          "select id, project_id from user_service_accounts where id = $1",
          [accountBNoProject],
        ),
      );
      expect(result.rowCount).toBe(1);
      expect(result.rows[0]?.project_id ?? null).toBeNull();
    });
  });

  // Defect: TRUNCATE, TRIGGER and REFERENCES are table-level privileges,
  // not covered by row-level security at all -- Supabase's own default
  // grants (mirrored by the local stub's `grant all`) hand these to
  // `anon`/`authenticated` regardless of any policy above. PostgREST never
  // issues them, but a raw connection (or an RPC running dynamic SQL)
  // could: TRUNCATE wipes every tenant's rows in one statement, and
  // TRIGGER lets a caller install a function (even one defined in their
  // own session-local pg_temp schema) that fires on every other user's
  // writes. Fixed by revoking both explicitly after the tables exist, and
  // via ALTER DEFAULT PRIVILEGES so a table added later inherits the same
  // restriction.
  describe("authenticated cannot bypass RLS via table-level privileges", () => {
    const RLS_TABLES = [
      "projects",
      "services",
      "project_services",
      "service_dependencies",
      "user_service_accounts",
      "project_meta",
      "project_service_pages",
    ];

    it("B cannot truncate user_service_accounts", async () => {
      await expect(asUser(client, userB, (c) => c.query("truncate user_service_accounts"))).rejects.toThrow(
        /permission denied/,
      );
    });

    it("B cannot truncate projects cascade", async () => {
      await expect(asUser(client, userB, (c) => c.query("truncate projects cascade"))).rejects.toThrow(
        /permission denied/,
      );
    });

    it("B cannot create a trigger on user_service_accounts, even via a pg_temp spy function", async () => {
      await expect(
        asUser(client, userB, (c) =>
          c.query(
            `create function pg_temp.rls_test_spy() returns trigger language plpgsql as $trig$
               begin return new; end;
             $trig$;
             create trigger rls_test_spy_trigger after insert on user_service_accounts
               for each row execute function pg_temp.rls_test_spy();`,
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it("has_table_privilege: TRUNCATE and TRIGGER false, SELECT still true, for all seven tables", async () => {
      const result = await client.query<{
        table_name: string;
        can_truncate: boolean;
        can_trigger: boolean;
        can_select: boolean;
      }>(
        `select
           t as table_name,
           has_table_privilege('authenticated', t, 'TRUNCATE') as can_truncate,
           has_table_privilege('authenticated', t, 'TRIGGER') as can_trigger,
           has_table_privilege('authenticated', t, 'SELECT') as can_select
         from unnest($1::text[]) as t`,
        [RLS_TABLES],
      );
      expect(result.rows).toHaveLength(RLS_TABLES.length);
      for (const row of result.rows) {
        expect(row.can_truncate, `${row.table_name} TRUNCATE`).toBe(false);
        expect(row.can_trigger, `${row.table_name} TRIGGER`).toBe(false);
        expect(row.can_select, `${row.table_name} SELECT`).toBe(true);
      }
    });
  });

  // Defect (round 2, found by execution): MAINTAIN is a Postgres 17
  // table-level privilege (VACUUM, ANALYZE, CLUSTER, REFRESH MATERIALIZED
  // VIEW, LOCK TABLE, REINDEX) -- `grant all` (both local-auth-stub.sql's
  // stub and Supabase's own hosted default) includes it, same as
  // TRUNCATE/TRIGGER/REFERENCES above. Unlike those three,
  // information_schema.role_table_grants does not list MAINTAIN at all, so
  // an audit through that view reports nothing wrong while
  // `authenticated`/`anon` can still run VACUUM FULL, CLUSTER, REINDEX or
  // ANALYZE on every table here -- both VACUUM FULL and CLUSTER take an
  // exclusive lock, so this is a lock-everyone-out denial-of-service on
  // user_service_accounts, not merely a privacy leak. Fixed by revoking
  // MAINTAIN the same way as the other three, wrapped in a version guard:
  // the keyword doesn't exist before Postgres 17, and Supabase also hosts
  // Postgres 15 projects that must not see a migration fail on it.
  describe("authenticated cannot bypass RLS via the MAINTAIN privilege (PG17+)", () => {
    const MAINTAIN_TABLES = [
      "projects",
      "services",
      "project_services",
      "service_dependencies",
      "user_service_accounts",
      "project_meta",
      "project_service_pages",
    ];

    it("has_table_privilege: MAINTAIN false for all seven tables", async (ctx) => {
      if (serverVersionNum < 170000) {
        // MAINTAIN doesn't exist before Postgres 17 -- nothing to assert
        // against this server (see the migration's version-guard comment).
        ctx.skip();
        return;
      }
      const result = await client.query<{ table_name: string; can_maintain: boolean }>(
        `select t as table_name, has_table_privilege('authenticated', t, 'MAINTAIN') as can_maintain
         from unnest($1::text[]) as t`,
        [MAINTAIN_TABLES],
      );
      expect(result.rows).toHaveLength(MAINTAIN_TABLES.length);
      for (const row of result.rows) {
        expect(row.can_maintain, `${row.table_name} MAINTAIN`).toBe(false);
      }
    });

    // VACUUM cannot run inside a transaction block, and asUser (db.ts)
    // wraps every call in begin/commit -- so this probe sets role directly
    // on the plain admin client, outside any transaction, and resets it in
    // `finally` so later tests in this file still run as the admin role.
    //
    // Confirmed directly against this Postgres 17 server: VACUUM on an
    // explicitly-named table does *not* raise a catchable error for a
    // missing MAINTAIN privilege -- it emits a WARNING-severity notice
    // ("permission denied to vacuum ..., skipping it", vacuum.c's
    // vacuum_is_permitted_for_relation) and the command still returns
    // success. This is deliberate upstream behaviour, not specific to this
    // migration: VACUUM is designed to run over a list of tables without
    // aborting the whole run because the caller doesn't own one of them.
    // So the assertion here is on the notice pg's Client surfaces, not on
    // a rejected query -- CLUSTER below, a single-table command, does
    // reject.
    it("authenticated cannot vacuum user_service_accounts", async () => {
      const notices: string[] = [];
      const onNotice = (notice: { message?: string }): void => {
        if (notice.message) notices.push(notice.message);
      };
      client.on("notice", onNotice);
      await client.query("set role authenticated");
      try {
        const result = await client.query("vacuum user_service_accounts");
        expect(result.command).toBe("VACUUM");
        expect(notices.some((message) => /permission denied to vacuum/.test(message))).toBe(true);
      } finally {
        client.off("notice", onNotice);
        await client.query("reset role");
      }
    });

    // Same reasoning as the vacuum probe above: run outside a transaction,
    // directly on the plain client, rather than through asUser.
    it("authenticated cannot cluster user_service_accounts", async () => {
      await client.query("set role authenticated");
      try {
        await expect(
          client.query("cluster user_service_accounts using user_service_accounts_pkey"),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await client.query("reset role");
      }
    });

    it("a table created after the migration does not carry MAINTAIN for authenticated", async (ctx) => {
      if (serverVersionNum < 170000) {
        ctx.skip();
        return;
      }
      await client.query(
        "create table rls_test_post_migration_maintain (id uuid primary key default gen_random_uuid())",
      );
      try {
        const result = await client.query<{ can_maintain: boolean }>(
          "select has_table_privilege('authenticated', 'rls_test_post_migration_maintain', 'MAINTAIN') as can_maintain",
        );
        expect(result.rows[0]?.can_maintain).toBe(false);
      } finally {
        await client.query("drop table rls_test_post_migration_maintain");
      }
    });
  });

  it("relrowsecurity and relforcerowsecurity are true for all seven tables", async () => {
    const tables = [
      "projects",
      "services",
      "project_services",
      "service_dependencies",
      "user_service_accounts",
      "project_meta",
      "project_service_pages",
    ];
    const result = await client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
       where relnamespace = 'public'::regnamespace and relname = any($1::text[])`,
      [tables],
    );
    expect(result.rows).toHaveLength(tables.length);
    for (const row of result.rows) {
      expect(row.relrowsecurity, `${row.relname}.relrowsecurity`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname}.relforcerowsecurity`).toBe(true);
    }
  });
});
