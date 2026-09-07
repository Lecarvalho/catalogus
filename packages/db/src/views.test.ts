// Tests supabase/migrations/0003_views.sql: v_project_costs, v_service_costs,
// v_service_blast_radius and v_phaseouts, through the harness in
// ./test-support/db.ts. See docs/plan/phase-4-backend.md, "Design,
// 2026-09-07", the **Views** paragraph, for the design this migration -- and
// so this test -- implements.
//
// Fixture (built once in beforeAll): one user owns one project holding a
// diamond plus a chain (web -> api -> db, worker -> db, api -> cache), one
// edge marked `removed` (extra-src -> db, which would otherwise inflate
// db's blast radius), one `phasing_out` node with a `replaced_by` target,
// one `phasing_out` edge with its own replacement edge (so
// replaced_by_service_slug has something concrete to resolve through), a
// deliberately cyclic pair of nodes (a -> b, b -> a) and a deliberately
// cyclic triple (c1 -> c2 -> c3 -> c1) -- the database does not forbid
// either, only the CLI does -- and seven user_service_accounts rows across
// three currencies and all three billing cycles: one with a null
// project_id, one with a yearly amount that doesn't divide cleanly by 12
// (proves monthly_equivalent is rounded), and one with cost_amount null
// (proves account_count doesn't count it).
//
// A separate, much larger fixture (40 chained "diamonds", built directly
// through the admin client rather than through insertOwned) lives inside
// its own `it`, in its own project -- see the "v_service_blast_radius
// performance" describe block below.
//
// This file is meant to prove the views work under the RLS that a sibling
// brief is adding concurrently (supabase/migrations/0002_rls.sql), but must
// not *depend* on that file existing -- the harness applies every
// migration under supabase/migrations/*.sql in filename order, and vitest
// may run this file before or after that one lands. So every owned-table
// insert first tries asUser (the real path once RLS policies exist); if
// that throws (no policy yet => RLS-forced-with-no-policy rejects it), it
// falls back to the plain admin client and every later owned-table insert
// in this file does the same, without retrying asUser. Whichever path ran
// is recorded and asserted at the end so a test run says which one it
// used, in the vitest output. The `services` catalog has no write policy
// for anyone but service_role even once 0002_rls.sql exists (see that
// migration's own comment), so services here always insert through
// asServiceRole, independent of this fallback. Every slug is randomised so
// this file never collides with supabase/seed.sql's rows or another test
// file's data.
import { randomUUID } from "node:crypto";
import { Client } from "pg";
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

describeDb("supabase/migrations/0003_views.sql", () => {
  let db: TestDatabase;
  let client: Client;

  let userId: string;
  let projectId: string;

  // services (global catalog)
  let svcWeb: { id: string; slug: string };
  let svcApi: { id: string; slug: string };
  let svcDb: { id: string; slug: string };
  let svcWorker: { id: string; slug: string };
  let svcCache: { id: string; slug: string };
  let svcCacheV2: { id: string; slug: string };
  let svcExtra: { id: string; slug: string };
  let svcOld: { id: string; slug: string };
  let svcNew: { id: string; slug: string };
  let svcA: { id: string; slug: string };
  let svcB: { id: string; slug: string };
  let svcC1: { id: string; slug: string };
  let svcC2: { id: string; slug: string };
  let svcC3: { id: string; slug: string };
  let svcCostA: { id: string; slug: string };
  let svcCostB: { id: string; slug: string };
  let svcCostC: { id: string; slug: string };
  let svcCostRound: { id: string; slug: string };
  let svcCostNull: { id: string; slug: string };
  let svcCostlessMonthly: { id: string; slug: string };
  let svcCostlessPlanOnly: { id: string; slug: string };

  // project_services (nodes)
  let psWeb: string;
  let psApi: string;
  let psDb: string;
  let psWorker: string;
  let psCache: string;
  let psCacheV2: string;
  let psExtra: string;
  let psOld: string;
  let psNew: string;
  let psA: string;
  let psB: string;
  let psC1: string;
  let psC2: string;
  let psC3: string;

  // service_dependencies (edges)
  let edgePhasingOut: string; // api -> cache, phasing_out, replaced by edgeReplacement
  let edgeReplacement: string; // api -> cache-v2, active

  const insertState = { useAsUser: true, usedAsUserFallback: false };

  function randomSlug(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

  async function insertService(prefix: string): Promise<{ id: string; slug: string }> {
    const slug = randomSlug(prefix);
    const result = await asServiceRole(client, (c) =>
      c.query<{ id: string }>("insert into services (slug, name) values ($1, $2) returning id", [slug, prefix]),
    );
    const row = result.rows[0];
    if (!row) throw new Error(`insertService(${prefix}): no row returned`);
    return { id: row.id, slug };
  }

  /**
   * Inserts an owned-table row (one whose RLS policy resolves through
   * auth.uid(), directly or via the parent project) as the fixture's own
   * user, via asUser. Falls back to the plain admin client -- and switches
   * every later call to do the same without retrying asUser -- the first
   * time asUser rejects an insert that should be perfectly legitimate for
   * its owner, which only happens when 0002_rls.sql has not landed yet
   * (RLS forced with no policy at all rejects every insert).
   */
  async function insertOwned(sql: string, params: unknown[]): Promise<{ id: string }> {
    if (insertState.useAsUser) {
      try {
        const result = await asUser(client, userId, (c) => c.query<{ id: string }>(sql, params));
        const row = result.rows[0];
        if (!row) throw new Error("insertOwned: asUser insert returned no row");
        return row;
      } catch {
        insertState.useAsUser = false;
        insertState.usedAsUserFallback = true;
      }
    }
    const result = await client.query<{ id: string }>(sql, params);
    const row = result.rows[0];
    if (!row) throw new Error("insertOwned: fallback insert returned no row");
    return row;
  }

  async function insertProjectService(
    serviceId: string,
    localId: string,
    opts: { role?: string; status?: string; replacedById?: string } = {},
  ): Promise<string> {
    const role = opts.role ?? "misc";
    const status = opts.status ?? "active";
    const row = await insertOwned(
      `insert into project_services
         (project_id, service_id, local_id, role, added_at, provenance, status, replaced_by_project_service_id)
       values ($1, $2, $3, $4, current_date, 'manual', $5, $6)
       returning id`,
      [projectId, serviceId, localId, role, status, opts.replacedById ?? null],
    );
    return row.id;
  }

  async function insertEdge(
    fromId: string,
    toId: string,
    opts: { status?: string; replacedByEdgeId?: string } = {},
  ): Promise<string> {
    const status = opts.status ?? "active";
    const row = await insertOwned(
      `insert into service_dependencies
         (project_id, from_project_service_id, to_project_service_id, status, replaced_by_edge_id)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [projectId, fromId, toId, status, opts.replacedByEdgeId ?? null],
    );
    return row.id;
  }

  /** The cyclic pair is inserted directly through the admin client on purpose -- see the top-of-file comment. */
  async function insertEdgeAsSuperuser(fromId: string, toId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id)
       values ($1, $2, $3) returning id`,
      [projectId, fromId, toId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("insertEdgeAsSuperuser: no row returned");
    return row.id;
  }

  async function insertAccount(opts: {
    serviceId: string;
    projectId: string | null;
    costAmount: number;
    costCurrency: string;
    billingCycle: "monthly" | "yearly" | "usage";
  }): Promise<string> {
    const row = await insertOwned(
      `insert into user_service_accounts (user_id, service_id, project_id, cost_amount, cost_currency, billing_cycle)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [userId, opts.serviceId, opts.projectId, opts.costAmount, opts.costCurrency, opts.billingCycle],
    );
    return row.id;
  }

  /**
   * An account row with no cost_amount at all (e.g. a plan_tier noted with
   * no cost entered yet) -- proves account_count doesn't count it. Separate
   * from insertAccount because that helper's opts require a cost amount,
   * currency and billing cycle; this one has none of those.
   */
  async function insertAccountWithoutCost(opts: {
    serviceId: string;
    projectId: string;
    planTier: string;
    costCurrency: string;
  }): Promise<string> {
    const row = await insertOwned(
      `insert into user_service_accounts (user_id, service_id, project_id, plan_tier, cost_currency)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [userId, opts.serviceId, opts.projectId, opts.planTier, opts.costCurrency],
    );
    return row.id;
  }

  /**
   * A user_service_accounts row with no cost_amount at all, for defect 2:
   * before the views filtered their source rows to `cost_amount is not
   * null`, a group made up entirely of such rows still emitted one
   * all-zero row (currency-keyed, or with a null cost_currency for a
   * plan_tier-only row with no currency set either). cost_amount is
   * always null here, so this never trips the
   * user_service_accounts_cost_amount_requires_billing_cycle check (which
   * only fires when cost_amount is set) or a sibling brief's forthcoming
   * "cost_amount requires cost_currency" check on 0001_schema.sql (same
   * reason).
   */
  async function insertAccountCostless(opts: {
    serviceId: string;
    projectId: string | null;
    costCurrency: string | null;
    billingCycle?: "monthly" | "yearly" | "usage" | null;
    planTier?: string | null;
  }): Promise<string> {
    const row = await insertOwned(
      `insert into user_service_accounts (user_id, service_id, project_id, cost_currency, billing_cycle, plan_tier)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [userId, opts.serviceId, opts.projectId, opts.costCurrency, opts.billingCycle ?? null, opts.planTier ?? null],
    );
    return row.id;
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    client = db.client;

    userId = await createUser(client, `${randomUUID()}@views-test.example`);

    const projectRow = await insertOwned("insert into projects (owner_id, name, slug) values ($1, $2, $3) returning id", [
      userId,
      "Views Fixture",
      randomSlug("project"),
    ]);
    projectId = projectRow.id;

    [
      svcWeb,
      svcApi,
      svcDb,
      svcWorker,
      svcCache,
      svcCacheV2,
      svcExtra,
      svcOld,
      svcNew,
      svcA,
      svcB,
      svcC1,
      svcC2,
      svcC3,
      svcCostA,
      svcCostB,
      svcCostC,
      svcCostRound,
      svcCostNull,
      svcCostlessMonthly,
      svcCostlessPlanOnly,
    ] = await Promise.all([
      insertService("web"),
      insertService("api"),
      insertService("db"),
      insertService("worker"),
      insertService("cache"),
      insertService("cache-v2"),
      insertService("extra"),
      insertService("old"),
      insertService("new"),
      insertService("node-a"),
      insertService("node-b"),
      insertService("node-c1"),
      insertService("node-c2"),
      insertService("node-c3"),
      insertService("cost-a"),
      insertService("cost-b"),
      insertService("cost-c"),
      insertService("cost-round"),
      insertService("cost-null"),
      insertService("costless-monthly"),
      insertService("costless-plan-only"),
    ]);

    psWeb = await insertProjectService(svcWeb.id, "web", { role: "frontend" });
    psApi = await insertProjectService(svcApi.id, "api", { role: "backend" });
    psDb = await insertProjectService(svcDb.id, "db", { role: "database" });
    psWorker = await insertProjectService(svcWorker.id, "worker", { role: "worker" });
    psCache = await insertProjectService(svcCache.id, "cache", { role: "cache" });
    psCacheV2 = await insertProjectService(svcCacheV2.id, "cache-v2", { role: "cache" });
    psExtra = await insertProjectService(svcExtra.id, "extra-src", { role: "misc" });
    psA = await insertProjectService(svcA.id, "node-a", { role: "misc" });
    psB = await insertProjectService(svcB.id, "node-b", { role: "misc" });
    psC1 = await insertProjectService(svcC1.id, "cycle3-a", { role: "misc" });
    psC2 = await insertProjectService(svcC2.id, "cycle3-b", { role: "misc" });
    psC3 = await insertProjectService(svcC3.id, "cycle3-c", { role: "misc" });

    // The replacement node must exist before the phasing-out node can point
    // replaced_by_project_service_id at it.
    psNew = await insertProjectService(svcNew.id, "new-node", { role: "legacy" });
    psOld = await insertProjectService(svcOld.id, "old-node", {
      role: "legacy",
      status: "phasing_out",
      replacedById: psNew,
    });

    // Diamond plus chain: web -> api -> db, worker -> db, api -> cache.
    await insertEdge(psWeb, psApi);
    await insertEdge(psApi, psDb);
    await insertEdge(psWorker, psDb);

    // A removed edge into db's blast radius -- must contribute nothing.
    await insertEdge(psExtra, psDb, { status: "removed" });

    // The replacement edge must exist before the phasing-out edge can point
    // replaced_by_edge_id at it.
    edgeReplacement = await insertEdge(psApi, psCacheV2);
    edgePhasingOut = await insertEdge(psApi, psCache, { status: "phasing_out", replacedByEdgeId: edgeReplacement });

    // Deliberately cyclic pair -- the database does not forbid this.
    await insertEdgeAsSuperuser(psA, psB);
    await insertEdgeAsSuperuser(psB, psA);

    // Deliberately cyclic triple: c1 -> c2 -> c3 -> c1.
    await insertEdgeAsSuperuser(psC1, psC2);
    await insertEdgeAsSuperuser(psC2, psC3);
    await insertEdgeAsSuperuser(psC3, psC1);

    // Cost accounts: two currencies, all three billing cycles, one account
    // spanning every project (project_id null).
    await insertAccount({ serviceId: svcCostA.id, projectId, costAmount: 10, costCurrency: "USD", billingCycle: "monthly" });
    await insertAccount({ serviceId: svcCostA.id, projectId, costAmount: 120, costCurrency: "USD", billingCycle: "yearly" });
    await insertAccount({ serviceId: svcCostA.id, projectId, costAmount: 5, costCurrency: "USD", billingCycle: "usage" });
    await insertAccount({ serviceId: svcCostB.id, projectId, costAmount: 20, costCurrency: "EUR", billingCycle: "monthly" });
    await insertAccount({ serviceId: svcCostC.id, projectId: null, costAmount: 50, costCurrency: "USD", billingCycle: "monthly" });

    // A yearly amount that does not divide cleanly by 12 -- proves
    // monthly_equivalent is rounded to 2 decimals rather than carried at
    // whatever precision the division produces.
    await insertAccount({ serviceId: svcCostRound.id, projectId, costAmount: 100, costCurrency: "GBP", billingCycle: "yearly" });

    // No cost_amount at all (just a plan_tier) -- proves account_count
    // counts rows with a cost_amount, not every row in the group. Same
    // project/currency group as the three svcCostA USD rows above, so this
    // would inflate their account_count from 3 to 4 if the view still used
    // count(*).
    await insertAccountWithoutCost({ serviceId: svcCostNull.id, projectId, planTier: "free", costCurrency: "USD" });

    // Defect 2 fixtures: groups made up entirely of cost_amount-null rows.
    // Before the views filtered their source to `cost_amount is not null`,
    // each of these produced a lone all-zero row. svcCostlessMonthly's own
    // currency ('JPY', unused elsewhere in this project) keeps it from
    // folding into any other group's totals; svcCostlessPlanOnly has no
    // cost_currency at all, so its group key is a null currency.
    await insertAccountCostless({
      serviceId: svcCostlessMonthly.id,
      projectId,
      costCurrency: "JPY",
      billingCycle: "monthly",
    });
    await insertAccountCostless({
      serviceId: svcCostlessPlanOnly.id,
      projectId,
      costCurrency: null,
      planTier: "free",
    });
  });

  afterAll(async () => {
    await db.close();
  });

  it("records which insert strategy the fixture used (asUser, or the admin-client fallback)", () => {
    // Not a behavioural assertion -- just surfaces, in the vitest output,
    // which path this run actually took. See the top-of-file comment.
    // eslint-disable-next-line no-console
    console.log(
      insertState.usedAsUserFallback
        ? "views.test.ts fixture: asUser insert failed at least once (0002_rls.sql not present yet) -- fell back to the admin client."
        : "views.test.ts fixture: every owned-table insert went through asUser (0002_rls.sql's policies accepted them).",
    );
    expect(true).toBe(true);
  });

  describe("v_service_blast_radius", () => {
    it("db's blast radius is {api:1, worker:1, web:2} -- the removed edge (extra-src) contributes nothing", async () => {
      const result = await client.query<{ dependent_local_id: string; depth: number }>(
        `select dependent_local_id, depth from v_service_blast_radius
         where dependency_project_service_id = $1
         order by dependent_local_id`,
        [psDb],
      );
      expect(result.rows).toEqual([
        { dependent_local_id: "api", depth: 1 },
        { dependent_local_id: "web", depth: 2 },
        { dependent_local_id: "worker", depth: 1 },
      ]);
    });

    it("the phasing_out edge (api -> cache) still counts towards cache's blast radius", async () => {
      // cache's blast radius includes web too, transitively (web -> api -> cache),
      // not just api's direct dependency on it.
      const result = await client.query<{ dependent_local_id: string; depth: number }>(
        `select dependent_local_id, depth from v_service_blast_radius
         where dependency_project_service_id = $1
         order by dependent_local_id`,
        [psCache],
      );
      expect(result.rows).toEqual([
        { dependent_local_id: "api", depth: 1 },
        { dependent_local_id: "web", depth: 2 },
      ]);
    });

    it("HANDOFF §4.2 query 2's exact form: all projects depending on service db, direct or transitive", async () => {
      const result = await client.query<{ project_id: string }>(
        `select distinct project_id from v_service_blast_radius where dependency_service_slug = $1`,
        [svcDb.slug],
      );
      expect(result.rows).toEqual([{ project_id: projectId }]);
    });

    it("a deliberately cyclic pair (a -> b, b -> a) terminates: each pair appears exactly once, and a node is never its own dependent", async () => {
      // Walking backwards from a -> b -> a -> b -> ... never stops on its
      // own (nothing here is "further out" than anything else), so without
      // the depth cap this would recurse forever. Tracing "who depends on
      // a" around the cycle also reaches a itself; the view's outer select
      // drops that row, because a node is not in its own blast radius --
      // see 0003_views.sql's comment.
      const fromA = await client.query<{ dependent_local_id: string; depth: number }>(
        `select dependent_local_id, depth from v_service_blast_radius where dependency_project_service_id = $1 order by dependent_local_id`,
        [psA],
      );
      expect(fromA.rows).toEqual([{ dependent_local_id: "node-b", depth: 1 }]);

      const fromB = await client.query<{ dependent_local_id: string; depth: number }>(
        `select dependent_local_id, depth from v_service_blast_radius where dependency_project_service_id = $1 order by dependent_local_id`,
        [psB],
      );
      expect(fromB.rows).toEqual([{ dependent_local_id: "node-a", depth: 1 }]);
    });

    it("a deliberately cyclic triple (c1 -> c2 -> c3 -> c1) terminates: the other two nodes are c1's dependents and c1 is not its own", async () => {
      const fromC1 = await client.query<{ dependent_local_id: string; depth: number }>(
        `select dependent_local_id, depth from v_service_blast_radius where dependency_project_service_id = $1 order by dependent_local_id`,
        [psC1],
      );
      expect(fromC1.rows).toEqual([
        { dependent_local_id: "cycle3-b", depth: 2 },
        { dependent_local_id: "cycle3-c", depth: 1 },
      ]);
    });
  });

  describe("v_service_blast_radius performance", () => {
    // Reproduces the shape that made the old `path`-tracking implementation
    // exponential: 41 layers of two nodes each (82 nodes), every node in
    // layer i depending on *both* nodes in layer i + 1 (a complete
    // bipartite mesh per layer transition -- 4 edges * 40 transitions = 160
    // edges). The number of distinct *paths* from the bottom layer to the
    // top doubles every layer (2^40 here), which is exactly what overflowed
    // the old view; the number of *reachable pairs* only grows
    // quadratically, which is what the fixed view must actually return.
    //
    // Built directly through the admin client in a loop, as superuser --
    // same as the cyclic fixtures above -- in its own project, so it can't
    // collide with (or be slowed down by) the rest of this file's fixture.
    const DIAMOND_LAYERS = 40;
    const NODES_PER_LAYER = 2;

    it(
      `a fixture of ${DIAMOND_LAYERS} chained diamonds (${(DIAMOND_LAYERS + 1) * NODES_PER_LAYER} nodes, ${
        DIAMOND_LAYERS * NODES_PER_LAYER * NODES_PER_LAYER
      } edges) resolves in under 5s, with one row per reachable pair rather than per path`,
      async () => {
        const perfProjectRow = await client.query<{ id: string }>(
          "insert into projects (owner_id, name, slug) values ($1, $2, $3) returning id",
          [userId, "Blast Radius Perf Fixture", randomSlug("perf-project")],
        );
        const perfProjectId = perfProjectRow.rows[0]!.id;

        const perfServiceRow = await asServiceRole(client, (c) =>
          c.query<{ id: string }>("insert into services (slug, name) values ($1, $2) returning id", [
            randomSlug("perf-svc"),
            "perf",
          ]),
        );
        const perfServiceId = perfServiceRow.rows[0]!.id;

        // layers[i] = [nodeIdA, nodeIdB] for layer i. Layer 0 is the
        // top-most depender; layer DIAMOND_LAYERS is the bottom-most,
        // ultimate dependency.
        const layers: string[][] = [];
        for (let i = 0; i <= DIAMOND_LAYERS; i++) {
          const row = await client.query<{ id: string }>(
            `insert into project_services (project_id, service_id, local_id, role, added_at, provenance)
             values ($1, $2, $3, 'misc', current_date, 'manual'), ($1, $2, $4, 'misc', current_date, 'manual')
             returning id`,
            [perfProjectId, perfServiceId, `layer${i}a`, `layer${i}b`],
          );
          layers.push(row.rows.map((r) => r.id));
        }

        let edgeCount = 0;
        for (let i = 0; i < DIAMOND_LAYERS; i++) {
          const fromNodes = layers[i]!;
          const toNodes = layers[i + 1]!;
          for (const fromId of fromNodes) {
            for (const toId of toNodes) {
              await client.query(
                `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id) values ($1, $2, $3)`,
                [perfProjectId, fromId, toId],
              );
              edgeCount++;
            }
          }
        }
        expect(edgeCount).toBe(DIAMOND_LAYERS * NODES_PER_LAYER * NODES_PER_LAYER);

        // Expected reachable pairs and max depth, computed from the
        // fixture's own shape -- not a hard-coded guess. A node at layer j
        // is a dependency of every node in layers 0..j-1 (the mesh between
        // any two adjacent layers is complete, so this holds transitively
        // too); nothing depends on layer 0, so j starts at 1.
        let expectedPairs = 0;
        for (let j = 1; j <= DIAMOND_LAYERS; j++) {
          const dependentsAboveLayerJ = j * NODES_PER_LAYER;
          expectedPairs += NODES_PER_LAYER * dependentsAboveLayerJ;
        }
        const expectedMaxDepth = DIAMOND_LAYERS;

        // A dedicated connection bounded by its own statement_timeout, so a
        // regression back to exponential behaviour fails this test quickly
        // instead of hanging the suite.
        const timedClient = new Client({ connectionString: db.url });
        await timedClient.connect();
        try {
          await timedClient.query("set statement_timeout = '20000'");
          const start = performance.now();
          const result = await timedClient.query<{
            dependency_project_service_id: string;
            dependent_project_service_id: string;
            depth: number;
          }>(
            `select dependency_project_service_id, dependent_project_service_id, depth
             from v_service_blast_radius
             where project_id = $1`,
            [perfProjectId],
          );
          const elapsedMs = performance.now() - start;

          expect(elapsedMs).toBeLessThan(5000);
          expect(result.rows).toHaveLength(expectedPairs);

          const maxDepth = Math.max(...result.rows.map((row) => row.depth));
          expect(maxDepth).toBe(expectedMaxDepth);

          // The deepest rows are exactly the bottom layer as dependency and
          // the top layer as dependent -- confirms depth is measured
          // correctly, not merely present.
          const deepest = result.rows.filter((row) => row.depth === expectedMaxDepth);
          expect(deepest).toHaveLength(NODES_PER_LAYER * NODES_PER_LAYER);
          for (const row of deepest) {
            expect(layers[DIAMOND_LAYERS]).toContain(row.dependency_project_service_id);
            expect(layers[0]).toContain(row.dependent_project_service_id);
          }
        } finally {
          await timedClient.end();
        }
      },
      30_000,
    );
  });

  describe("v_service_blast_radius depth cap (defect 1)", () => {
    // A chain longer than the old cap of 64 truncated silently: the
    // deepest node's blast radius lost every dependent past depth 64, with
    // no marker that anything was cut. Built directly through the admin
    // client, same as the performance fixture above, in its own project.
    const CHAIN_LENGTH = 70;

    it(`a chain of ${CHAIN_LENGTH} nodes returns ${CHAIN_LENGTH - 1} dependents for the deepest node, with max depth ${CHAIN_LENGTH - 1} (not truncated by the depth cap)`, async () => {
      const chainProjectRow = await client.query<{ id: string }>(
        "insert into projects (owner_id, name, slug) values ($1, $2, $3) returning id",
        [userId, "Depth Cap Chain Fixture", randomSlug("chain-project")],
      );
      const chainProjectId = chainProjectRow.rows[0]!.id;

      const chainServiceRow = await asServiceRole(client, (c) =>
        c.query<{ id: string }>("insert into services (slug, name) values ($1, $2) returning id", [
          randomSlug("chain-svc"),
          "chain",
        ]),
      );
      const chainServiceId = chainServiceRow.rows[0]!.id;

      const nodeIds: string[] = [];
      for (let i = 0; i < CHAIN_LENGTH; i++) {
        const row = await client.query<{ id: string }>(
          `insert into project_services (project_id, service_id, local_id, role, added_at, provenance)
           values ($1, $2, $3, 'misc', current_date, 'manual')
           returning id`,
          [chainProjectId, chainServiceId, `node${i}`],
        );
        nodeIds.push(row.rows[0]!.id);
      }

      // node[i] -> node[i+1]: node[i] depends on node[i+1], so node[0] is
      // the deepest dependent of the tail node[CHAIN_LENGTH - 1].
      for (let i = 0; i < CHAIN_LENGTH - 1; i++) {
        await client.query(
          `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id) values ($1, $2, $3)`,
          [chainProjectId, nodeIds[i], nodeIds[i + 1]],
        );
      }

      const result = await client.query<{ depth: number }>(
        `select depth from v_service_blast_radius where dependency_project_service_id = $1`,
        [nodeIds[CHAIN_LENGTH - 1]],
      );

      expect(result.rows).toHaveLength(CHAIN_LENGTH - 1);
      const maxDepth = Math.max(...result.rows.map((row) => row.depth));
      expect(maxDepth).toBe(CHAIN_LENGTH - 1);
    });

    it("the view definition's depth cap is at least 1024 (regression guard against silently lowering it)", async () => {
      const result = await client.query<{ viewdef: string }>(
        `select pg_get_viewdef('v_service_blast_radius'::regclass, true) as viewdef`,
      );
      const viewdef = result.rows[0]!.viewdef;
      const match = viewdef.match(/depth\s*<\s*(\d+)/);
      expect(match, `expected a "depth < N" cap in the view definition, got:\n${viewdef}`).not.toBeNull();
      const cap = Number(match![1]);
      expect(cap).toBeGreaterThanOrEqual(1024);
    });
  });

  describe("v_service_blast_radius project_id integrity (defect 3)", () => {
    it("rejects an edge whose project_id disagrees with its endpoints' own project_id, once the composite FK exists", async (ctx) => {
      const fk = await client.query(
        `select 1 from pg_constraint
         where conrelid = 'service_dependencies'::regclass
           and contype = 'f'
           and confrelid = 'project_services'::regclass
           and cardinality(conkey) > 1`,
      );
      if (fk.rowCount === 0) {
        // supabase/migrations/0001_schema.sql does not yet define a
        // composite foreign key from service_dependencies (project_id,
        // from_/to_project_service_id) onto project_services (id,
        // project_id). Until it does, nothing in this database rejects an
        // edge whose project_id disagrees with its endpoints' actual
        // project_id -- v_service_blast_radius's `sd.project_id =
        // b.project_id` join just trusts the column. This is a sibling
        // agent's file (CLAUDE.md's file-partition rule) -- not edited
        // here.
        // eslint-disable-next-line no-console
        console.log(
          "skipped: composite FK service_dependencies -> project_services (id, project_id) not present -- see supabase/migrations/0001_schema.sql",
        );
        ctx.skip();
        return;
      }

      const otherProjectRow = await insertOwned(
        "insert into projects (owner_id, name, slug) values ($1, $2, $3) returning id",
        [userId, "Blast Radius FK Fixture", randomSlug("fk-project")],
      );
      const otherProjectId = otherProjectRow.id;

      const foreignSvc = await insertService("fk-foreign");
      const foreignNode = await insertOwned(
        `insert into project_services (project_id, service_id, local_id, role, added_at, provenance)
         values ($1, $2, 'foreign-node', 'misc', current_date, 'manual')
         returning id`,
        [otherProjectId, foreignSvc.id],
      );

      // Claims project_id = projectId (this file's fixture project) while
      // to_project_service_id points at a node that actually belongs to
      // otherProjectId -- exactly the mismatch the composite FK exists to
      // reject. Deliberately bypasses insertOwned's shared fallback
      // tracking (this insert is *expected* to fail, and insertOwned would
      // otherwise misread that failure as "RLS policies aren't present
      // yet" and flip every later insert in this file onto the admin-client
      // fallback).
      const attempt = insertState.useAsUser
        ? asUser(client, userId, (c) =>
            c.query(
              `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id)
               values ($1, $2, $3)`,
              [projectId, psWeb, foreignNode.id],
            ),
          )
        : client.query(
            `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id)
             values ($1, $2, $3)`,
            [projectId, psWeb, foreignNode.id],
          );
      await expect(attempt).rejects.toThrow();
    });
  });

  describe("v_project_costs", () => {
    it("USD row for the fixture project: monthly, yearly, usage and the excluded-from-equivalent usage total", async () => {
      const result = await client.query<{
        monthly_total: string;
        yearly_total: string;
        usage_total: string;
        monthly_equivalent: string;
        account_count: string;
      }>(
        `select
           round(monthly_total, 2) as monthly_total,
           round(yearly_total, 2) as yearly_total,
           round(usage_total, 2) as usage_total,
           round(monthly_equivalent, 2) as monthly_equivalent,
           account_count
         from v_project_costs
         where user_id = $1 and project_id = $2 and cost_currency = 'USD'`,
        [userId, projectId],
      );
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0]!;
      expect(row.monthly_total).toBe("10.00");
      expect(row.yearly_total).toBe("120.00");
      expect(row.usage_total).toBe("5.00");
      // 10 (monthly) + 120 / 12 (yearly/12) = 20 -- usage_total (5) excluded.
      expect(row.monthly_equivalent).toBe("20.00");
      expect(Number(row.account_count)).toBe(3);
    });

    it("EUR row for the fixture project is separate from the USD row", async () => {
      const result = await client.query<{ monthly_total: string; monthly_equivalent: string; account_count: string }>(
        `select round(monthly_total, 2) as monthly_total, round(monthly_equivalent, 2) as monthly_equivalent, account_count
         from v_project_costs
         where user_id = $1 and project_id = $2 and cost_currency = 'EUR'`,
        [userId, projectId],
      );
      expect(result.rows).toEqual([{ monthly_total: "20.00", monthly_equivalent: "20.00", account_count: "1" }]);
    });

    it("the null-project account is present as its own group, not folded into the fixture project's USD row", async () => {
      const result = await client.query<{ monthly_total: string; account_count: string }>(
        `select round(monthly_total, 2) as monthly_total, account_count
         from v_project_costs
         where user_id = $1 and project_id is null and cost_currency = 'USD'`,
        [userId],
      );
      expect(result.rows).toEqual([{ monthly_total: "50.00", account_count: "1" }]);
    });

    it("monthly_equivalent is rounded to at most 2 decimals (100/year does not divide cleanly by 12)", async () => {
      // Deliberately reads monthly_equivalent with no round() of its own --
      // unlike the tests above, which defensively round in the query -- so
      // this actually exercises whether the view itself rounds the column.
      // Unrounded, 100 / 12 is 8.3333333333333333.
      const result = await client.query<{ monthly_equivalent: string }>(
        `select monthly_equivalent from v_project_costs where user_id = $1 and project_id = $2 and cost_currency = 'GBP'`,
        [userId, projectId],
      );
      expect(result.rows).toEqual([{ monthly_equivalent: "8.33" }]);
    });

    it("a row with cost_amount null and a plan_tier set does not count in account_count", async () => {
      // The fixture's USD group for this project has exactly three rows
      // with a cost_amount (svcCostA's monthly/yearly/usage rows) plus one
      // more with plan_tier set and no cost_amount at all -- account_count
      // must stay 3, not become 4.
      const result = await client.query<{ account_count: string }>(
        `select account_count from v_project_costs where user_id = $1 and project_id = $2 and cost_currency = 'USD'`,
        [userId, projectId],
      );
      expect(result.rows).toEqual([{ account_count: "3" }]);
    });
  });

  describe("v_project_costs cost-less groups (defect 2)", () => {
    it("a monthly account with no cost_amount produces no group at all", async () => {
      const result = await client.query(
        `select 1 from v_project_costs where user_id = $1 and project_id = $2 and cost_currency = 'JPY'`,
        [userId, projectId],
      );
      expect(result.rows).toHaveLength(0);
    });

    it("a plan_tier-only account (no cost_amount, no cost_currency) produces no null-currency group", async () => {
      const result = await client.query(
        `select 1 from v_project_costs where user_id = $1 and project_id = $2 and cost_currency is null`,
        [userId, projectId],
      );
      expect(result.rows).toHaveLength(0);
    });

    it("a group with only a yearly account renders monthly_total as '0.00', not '0'", async () => {
      // Deliberately reads monthly_total with no round() of its own, like
      // the monthly_equivalent test above -- the GBP group has only
      // svcCostRound's yearly row, so monthly_total's own sum is the
      // coalesce fallback, not a real sum.
      const result = await client.query<{ monthly_total: string }>(
        `select monthly_total from v_project_costs where user_id = $1 and project_id = $2 and cost_currency = 'GBP'`,
        [userId, projectId],
      );
      expect(result.rows).toEqual([{ monthly_total: "0.00" }]);
    });
  });

  describe("v_service_costs", () => {
    it("sums per (user, service, currency), independent of project_id", async () => {
      const costA = await client.query<{ monthly_total: string; yearly_total: string; usage_total: string; monthly_equivalent: string; account_count: string }>(
        `select
           round(monthly_total, 2) as monthly_total,
           round(yearly_total, 2) as yearly_total,
           round(usage_total, 2) as usage_total,
           round(monthly_equivalent, 2) as monthly_equivalent,
           account_count
         from v_service_costs
         where user_id = $1 and service_id = $2 and cost_currency = 'USD'`,
        [userId, svcCostA.id],
      );
      expect(costA.rows).toEqual([
        { monthly_total: "10.00", yearly_total: "120.00", usage_total: "5.00", monthly_equivalent: "20.00", account_count: "3" },
      ]);

      const costB = await client.query<{ monthly_total: string; account_count: string }>(
        `select round(monthly_total, 2) as monthly_total, account_count
         from v_service_costs
         where user_id = $1 and service_id = $2 and cost_currency = 'EUR'`,
        [userId, svcCostB.id],
      );
      expect(costB.rows).toEqual([{ monthly_total: "20.00", account_count: "1" }]);

      // svcCostC is only used by the null-project account -- proves this
      // view is keyed by service, not by project, so a null project_id
      // still lands in its service's row here.
      const costC = await client.query<{ monthly_total: string; account_count: string }>(
        `select round(monthly_total, 2) as monthly_total, account_count
         from v_service_costs
         where user_id = $1 and service_id = $2 and cost_currency = 'USD'`,
        [userId, svcCostC.id],
      );
      expect(costC.rows).toEqual([{ monthly_total: "50.00", account_count: "1" }]);
    });
  });

  describe("v_service_costs cost-less groups (defect 2)", () => {
    it("a monthly account with no cost_amount produces no group at all", async () => {
      const result = await client.query(`select 1 from v_service_costs where user_id = $1 and service_id = $2`, [
        userId,
        svcCostlessMonthly.id,
      ]);
      expect(result.rows).toHaveLength(0);
    });

    it("a plan_tier-only account (no cost_amount, no cost_currency) produces no group at all", async () => {
      const result = await client.query(`select 1 from v_service_costs where user_id = $1 and service_id = $2`, [
        userId,
        svcCostlessPlanOnly.id,
      ]);
      expect(result.rows).toHaveLength(0);
    });
  });

  describe("v_phaseouts", () => {
    it("resolves the phasing_out node's replacement", async () => {
      const result = await client.query<{
        local_id: string;
        service_slug: string;
        replaced_by_local_id: string;
        replaced_by_service_slug: string;
      }>(
        `select local_id, service_slug, replaced_by_local_id, replaced_by_service_slug
         from v_phaseouts
         where project_id = $1 and item_kind = 'node' and item_id = $2`,
        [projectId, psOld],
      );
      expect(result.rows).toEqual([
        {
          local_id: "old-node",
          service_slug: svcOld.slug,
          replaced_by_local_id: "new-node",
          replaced_by_service_slug: svcNew.slug,
        },
      ]);
    });

    it("resolves the phasing_out edge's replacement", async () => {
      const result = await client.query<{
        local_id: string;
        service_slug: string | null;
        replaced_by_local_id: string;
        replaced_by_service_slug: string;
      }>(
        `select local_id, service_slug, replaced_by_local_id, replaced_by_service_slug
         from v_phaseouts
         where project_id = $1 and item_kind = 'edge' and item_id = $2`,
        [projectId, edgePhasingOut],
      );
      expect(result.rows).toEqual([
        {
          local_id: "api -> cache",
          service_slug: null,
          replaced_by_local_id: "api -> cache-v2",
          replaced_by_service_slug: svcCacheV2.slug,
        },
      ]);
    });

    it("contains exactly the two phasing_out rows for this project -- active and removed items are excluded", async () => {
      const result = await client.query<{ item_kind: string }>(`select item_kind from v_phaseouts where project_id = $1`, [
        projectId,
      ]);
      expect(result.rows.map((row) => row.item_kind).sort()).toEqual(["edge", "node"]);
    });
  });

  describe("security_invoker", () => {
    it("is set on every view", async () => {
      const result = await client.query<{ relname: string; reloptions: string[] | null }>(
        `select relname, reloptions from pg_class
         where relkind = 'v' and relname in ('v_project_costs', 'v_service_costs', 'v_service_blast_radius', 'v_phaseouts')`,
      );
      expect(result.rows).toHaveLength(4);
      for (const row of result.rows) {
        expect(row.reloptions, `${row.relname} should have security_invoker=true in reloptions`).toEqual(
          expect.arrayContaining(["security_invoker=true"]),
        );
      }
    });
  });

  describe("anon", () => {
    it("sees zero rows from every view", async () => {
      for (const view of ["v_project_costs", "v_service_costs", "v_service_blast_radius", "v_phaseouts"]) {
        const result = await asAnon(client, (c) => c.query(`select 1 from ${view} limit 1`));
        expect(result.rowCount, `asAnon should see no rows from ${view}`).toBe(0);
      }
    });
  });
});
