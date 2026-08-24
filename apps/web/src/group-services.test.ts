import { describe, expect, it } from "vitest";

import { groupByRollup } from "./group-services.js";
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
