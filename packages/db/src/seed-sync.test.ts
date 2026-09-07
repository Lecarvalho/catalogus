// Two things this file checks, in the style of
// packages/schema/src/schema-sync.test.ts:
//
// 1. supabase/seed.sql (the file the harness actually applies) stays in sync
//    with CATALOGUS_CATALOG. If someone edits packages/core/src/catalog.ts
//    and forgets to rerun the generator (packages/db/scripts/generate-seed.mjs,
//    wired into this package's `build` script), this fails immediately
//    instead of silently seeding a stale catalog. No database needed for
//    this half -- it's a string comparison against the same buildSeedSql
//    the generator calls.
// 2. Applied through the real harness (createTestDatabase, which runs
//    supabase/seed.sql after the migrations -- see ./test-support/db.ts),
//    the seed does what docs/plan/decisions.md's decision 15 promises:
//    every catalog row lands, pricing_model and vendor_url stay null
//    because neither fact is in this repo, and a reseed is idempotent
//    without clobbering a value the owner set by hand.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CATALOGUS_CATALOG } from "@catalogus/core";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildSeedSql } from "../scripts/seed-sql.mjs";
import { createTestDatabase, describeDb, type TestDatabase } from "./test-support/db.js";

const seedPath = fileURLToPath(new URL("../../../supabase/seed.sql", import.meta.url));
const seedSqlOnDisk = readFileSync(seedPath, "utf8");
const catalogSize = Object.keys(CATALOGUS_CATALOG).length;

describe("supabase/seed.sql stays in sync with CATALOGUS_CATALOG", () => {
  it("is byte-for-byte what generate-seed.mjs would write now", () => {
    expect(seedSqlOnDisk).toBe(buildSeedSql(CATALOGUS_CATALOG));
  });
});

describeDb("supabase/seed.sql, applied through the harness", () => {
  let db: TestDatabase;
  let client: Client;

  beforeAll(async () => {
    db = await createTestDatabase();
    client = db.client;
  });

  afterAll(async () => {
    await db.close();
  });

  it(`seeds exactly one row per catalog entry (${catalogSize})`, async () => {
    const result = await client.query<{ count: number }>("select count(*)::int as count from services");
    expect(result.rows[0]?.count).toBe(catalogSize);
  });

  it("seeds fly-io with its catalog name and icon_ref", async () => {
    const result = await client.query<{ name: string; icon_ref: string | null }>(
      "select name, icon_ref from services where slug = 'fly-io'",
    );
    expect(result.rows[0]).toEqual({ name: "Fly.io", icon_ref: "flydotio" });
  });

  it("leaves pricing_model and vendor_url null on every seeded row", async () => {
    const result = await client.query<{ count: number }>(
      "select count(*)::int as count from services where pricing_model is not null or vendor_url is not null",
    );
    expect(result.rows[0]?.count).toBe(0);
  });

  it("re-applying the seed keeps a hand-set pricing_model and leaves the row count unchanged", async () => {
    await client.query("update services set pricing_model = 'usage' where slug = 'fly-io'");

    await client.query(seedSqlOnDisk);

    const countResult = await client.query<{ count: number }>("select count(*)::int as count from services");
    expect(countResult.rows[0]?.count).toBe(catalogSize);

    const pricingResult = await client.query<{ pricing_model: string | null }>(
      "select pricing_model from services where slug = 'fly-io'",
    );
    expect(pricingResult.rows[0]?.pricing_model).toBe("usage");
  });
});
