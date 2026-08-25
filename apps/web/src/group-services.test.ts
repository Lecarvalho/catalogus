import { describe, expect, it } from "vitest";

import { duplicateNames, groupByRollup } from "./group-services.js";
import { makeViewService as service } from "./test-support/fixtures.js";

describe("groupByRollup", () => {
  it("groups services sharing a rollup together", () => {
    const groups = groupByRollup([
      service({ id: "host-api", role: "hosting-api", rollup: "hosting" }),
      service({ id: "host-web", role: "hosting-web", rollup: "hosting" }),
      service({ id: "supabase-db", role: "database", rollup: "database" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.rollup)).toEqual(["database", "hosting"]);
    expect(groups.find((g) => g.rollup === "hosting")?.services.map((s) => s.id)).toEqual(["host-api", "host-web"]);
  });

  it("ordinal-sorts groups by rollup name", () => {
    const groups = groupByRollup([
      service({ id: "z", role: "zeta" }),
      service({ id: "a", role: "alpha" }),
      service({ id: "m", role: "monitoring-dashboard", rollup: "monitoring" }),
    ]);
    expect(groups.map((g) => g.rollup)).toEqual(["alpha", "monitoring", "zeta"]);
  });

  it("ordinal-sorts entries within a group by id, independent of input order", () => {
    const groups = groupByRollup([
      service({ id: "supabase-db", role: "database" }),
      service({ id: "another-db", role: "database" }),
    ]);
    expect(groups[0]!.services.map((s) => s.id)).toEqual(["another-db", "supabase-db"]);
  });

  it("rolls a role with no '-' up to itself, as its own single-entry group", () => {
    const groups = groupByRollup([service({ id: "svc", role: "hosting", rollup: "hosting" })]);
    expect(groups).toEqual([{ rollup: "hosting", services: [expect.objectContaining({ id: "svc" })] }]);
  });

  it("returns an empty array for no services", () => {
    expect(groupByRollup([])).toEqual([]);
  });
});

describe("duplicateNames", () => {
  it("names a display name carried by two entries -- the case a compact node cannot show apart", () => {
    const duplicates = duplicateNames([
      service({ id: "supabase-db", role: "database", name: "Supabase" }),
      service({ id: "supabase-auth", role: "database", name: "Supabase" }),
    ]);
    expect([...duplicates]).toEqual(["Supabase"]);
  });

  it("leaves a name carried by exactly one entry out, so the id only appears where it is needed", () => {
    const duplicates = duplicateNames([
      service({ id: "supabase-db", role: "database", name: "Supabase" }),
      service({ id: "fly-api", role: "hosting", name: "Fly.io" }),
    ]);
    expect([...duplicates]).toEqual([]);
  });

  it("names every colliding name when there is more than one collision", () => {
    const duplicates = duplicateNames([
      service({ id: "a1", role: "database", name: "Supabase" }),
      service({ id: "a2", role: "database", name: "Supabase" }),
      service({ id: "b1", role: "hosting", name: "Fly.io" }),
      service({ id: "b2", role: "hosting", name: "Fly.io" }),
      service({ id: "c1", role: "payments", name: "Stripe" }),
    ]);
    expect([...duplicates].sort()).toEqual(["Fly.io", "Supabase"]);
  });

  it("reports a name three entries share exactly once", () => {
    const duplicates = duplicateNames([
      service({ id: "a", role: "database", name: "Supabase" }),
      service({ id: "b", role: "database", name: "Supabase" }),
      service({ id: "c", role: "database", name: "Supabase" }),
    ]);
    expect([...duplicates]).toEqual(["Supabase"]);
  });

  // The keyed-lookup defect class this repo keeps producing (docs/PLAN.md):
  // a display name is manifest-derived text, and `constructor` resolves
  // through Object.prototype in a plain object literal. A Set does not,
  // which is why this is a Set -- with the test that says so.
  it("handles a display name of 'constructor' as ordinary text", () => {
    expect([...duplicateNames([service({ id: "a", role: "x", name: "constructor" })])]).toEqual([]);
    expect([
      ...duplicateNames([service({ id: "a", role: "x", name: "constructor" }), service({ id: "b", role: "x", name: "constructor" })]),
    ]).toEqual(["constructor"]);
  });

  it("returns an empty set for no services", () => {
    expect(duplicateNames([]).size).toBe(0);
  });
});
