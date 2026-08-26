// bands.ts groups services into the seven architecture bands (plus
// `unplaced`), collapses a band's entries into one tile per vendor, picks
// the most consequential status for a collapsed tile, and ranks services by
// inbound edge count. See bands.ts's own header for the reasoning; this file
// asserts the invariants that comment promises.
import { describe, expect, it } from "vitest";

import {
  BANDS,
  bandOf,
  collapseByService,
  dependentCounts,
  groupIntoBands,
  groupStatus,
  mostDependedOn,
} from "./bands.js";
import { makeViewService as service } from "./test-support/fixtures.js";

describe("bandOf", () => {
  it("resolves a rollup from every category in SKILL.md's base-word list", () => {
    expect(bandOf("hosting")).toBe("production");
    expect(bandOf("database")).toBe("holds");
    expect(bandOf("ai")).toBe("calls");
    expect(bandOf("runtime")).toBe("runs");
    expect(bandOf("monitoring")).toBe("watched");
    expect(bandOf("ci")).toBe("shipped");
    expect(bandOf("dns")).toBe("registered");
  });

  // The core claim of bands.ts: a rollup that is not one of SKILL.md's base
  // words is not a guess at the nearest band, it is `unplaced`.
  it("falls to 'unplaced' for a rollup outside the base-word list, rather than guessing the nearest band", () => {
    expect(bandOf("some-rollup-nobody-has-used")).toBe("unplaced");
  });

  // The defect this repo has produced five times: a plain object literal
  // resolves `["constructor"]` through Object.prototype to the `Object`
  // function, which is truthy, so a naive `?? "unplaced"` fallback never
  // fires. `role: constructor` is schema-legal, so `rollup` can be
  // "constructor" too.
  it("resolves 'constructor' to 'unplaced' rather than inheriting Object.prototype's constructor function", () => {
    expect(bandOf("constructor")).toBe("unplaced");
  });

  it("resolves other Object.prototype member names the same way", () => {
    expect(bandOf("toString")).toBe("unplaced");
    expect(bandOf("hasOwnProperty")).toBe("unplaced");
  });
});

describe("groupIntoBands", () => {
  it("returns no bands for no services", () => {
    expect(groupIntoBands([])).toEqual([]);
  });

  it("groups services sharing a rollup's band together", () => {
    const groups = groupIntoBands([
      service({ id: "fly-api", role: "hosting-api", rollup: "hosting" }),
      service({ id: "fly-web", role: "hosting-web", rollup: "hosting" }),
      service({ id: "supabase-db", role: "database", rollup: "database" }),
    ]);

    expect(groups).toHaveLength(2);
    const production = groups.find((g) => g.band.id === "production");
    expect(production?.services.map((s) => s.id)).toEqual(["fly-api", "fly-web"]);
  });

  // Reading order is the argument of the page: it must follow BANDS, not the
  // order services happen to arrive in.
  it("orders bands by BANDS's reading order regardless of input order", () => {
    const groups = groupIntoBands([
      service({ id: "namecheap", role: "registrar", rollup: "registrar" }),
      service({ id: "supabase-db", role: "database", rollup: "database" }),
      service({ id: "fly-api", role: "hosting-api", rollup: "hosting" }),
    ]);
    expect(groups.map((g) => g.band.id)).toEqual(["production", "holds", "registered"]);
    // And that is genuinely BANDS's order, not a coincidence of this input.
    const bandOrder = BANDS.map((b) => b.id);
    const resultOrder = groups.map((g) => g.band.id);
    expect(resultOrder).toEqual(bandOrder.filter((id) => resultOrder.includes(id)));
  });

  // A project with no queue should show no hole where a queue would go.
  it("drops a band nothing lands in, rather than rendering it empty", () => {
    const groups = groupIntoBands([service({ id: "fly-api", role: "hosting-api", rollup: "hosting" })]);
    expect(groups.map((g) => g.band.id)).toEqual(["production"]);
    expect(groups.some((g) => g.services.length === 0)).toBe(false);
  });

  it("renders the unplaced band, labelled, for a rollup outside the base-word list -- it does not vanish like an empty band", () => {
    const groups = groupIntoBands([service({ id: "mystery", role: "widget-thing", rollup: "widget" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.band.id).toBe("unplaced");
    expect(groups[0]!.band.label).toBe("Unplaced");
  });

  it("sorts entries within a band by id, independent of input order", () => {
    const groups = groupIntoBands([
      service({ id: "z-fly", role: "hosting-api", rollup: "hosting" }),
      service({ id: "a-fly", role: "hosting-web", rollup: "hosting" }),
    ]);
    expect(groups[0]!.services.map((s) => s.id)).toEqual(["a-fly", "z-fly"]);
  });
});

describe("collapseByService", () => {
  it("collapses entries sharing a catalog slug into one vendor group", () => {
    const groups = collapseByService([
      service({ id: "fly-api", role: "hosting-api", service: "flyio" }),
      service({ id: "fly-web", role: "hosting-web", service: "flyio" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["fly-api", "fly-web"]);
  });

  it("keeps two different slugs apart even when they share a display name", () => {
    const groups = collapseByService([
      service({ id: "a", role: "hosting-api", service: "vendor-a", name: "Vendor" }),
      service({ id: "b", role: "hosting-api", service: "vendor-b", name: "Vendor" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("sorts entries inside a group by id, not by input order", () => {
    const groups = collapseByService([
      service({ id: "z", role: "hosting-api", service: "flyio" }),
      service({ id: "a", role: "hosting-web", service: "flyio" }),
    ]);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["a", "z"]);
  });

  it("takes name, icon, iconHex and rollup from the first entry in id order, not from input order", () => {
    const groups = collapseByService([
      service({ id: "z", role: "hosting-api", service: "flyio", name: "Second", icon: "z-icon", iconHex: "#000000" }),
      service({ id: "a", role: "hosting-web", service: "flyio", name: "First", icon: "a-icon", iconHex: "#ffffff" }),
    ]);
    expect(groups[0]!.name).toBe("First");
    expect(groups[0]!.icon).toBe("a-icon");
    expect(groups[0]!.iconHex).toBe("#ffffff");
  });

  it("sorts the groups themselves by slug", () => {
    const groups = collapseByService([
      service({ id: "z", role: "hosting-api", service: "zeta" }),
      service({ id: "a", role: "hosting-api", service: "alpha" }),
    ]);
    expect(groups.map((g) => g.service)).toEqual(["alpha", "zeta"]);
  });

  it("returns no groups for no services", () => {
    expect(collapseByService([])).toEqual([]);
  });

  // Collapsing must never merge across a caller's own slicing -- this file's
  // function has no notion of "band" at all, and that absence is what lets
  // BandModule.tsx and ProjectBoard.test.tsx enforce the per-band rule by
  // calling this once per band's slice rather than once for the manifest.
  it("has no notion of band: two entries with different rollups but the same slug still collapse into one group here", () => {
    const groups = collapseByService([
      service({ id: "supabase-auth", role: "auth", rollup: "auth", service: "supabase" }),
      service({ id: "supabase-db", role: "database", rollup: "database", service: "supabase" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entries).toHaveLength(2);
  });
});

describe("groupStatus", () => {
  it("returns the single entry's own status for a one-entry group", () => {
    const [group] = collapseByService([service({ id: "a", role: "hosting", service: "x", status: "deprecated" })]);
    expect(groupStatus(group!)).toBe("deprecated");
  });

  // The rule that matters: most consequential wins, not first and not
  // majority.
  it("picks the most consequential status regardless of which entry is first", () => {
    const deprecatedFirst = collapseByService([
      service({ id: "a", role: "hosting", service: "x", status: "deprecated" }),
      service({ id: "b", role: "hosting", service: "x", status: "active" }),
    ])[0]!;
    const activeFirst = collapseByService([
      service({ id: "a", role: "hosting", service: "x", status: "active" }),
      service({ id: "b", role: "hosting", service: "x", status: "deprecated" }),
    ])[0]!;
    expect(groupStatus(deprecatedFirst)).toBe("deprecated");
    expect(groupStatus(activeFirst)).toBe("deprecated");
  });

  it("is not a majority vote: three active entries and one deprecated one still read as deprecated", () => {
    const group = collapseByService([
      service({ id: "a", role: "hosting", service: "x", status: "active" }),
      service({ id: "b", role: "hosting", service: "x", status: "active" }),
      service({ id: "c", role: "hosting", service: "x", status: "active" }),
      service({ id: "d", role: "hosting", service: "x", status: "deprecated" }),
    ])[0]!;
    expect(groupStatus(group)).toBe("deprecated");
  });

  // Locks the severity order the header comment states: active < removed <
  // phasing_out < deprecated. `removed` ranking below `phasing_out` is the
  // surprising part and is worth pinning down explicitly.
  it("ranks phasing_out above removed, and removed above active", () => {
    const removedVsPhasingOut = collapseByService([
      service({ id: "a", role: "hosting", service: "x", status: "removed" }),
      service({ id: "b", role: "hosting", service: "x", status: "phasing_out" }),
    ])[0]!;
    expect(groupStatus(removedVsPhasingOut)).toBe("phasing_out");

    const activeVsRemoved = collapseByService([
      service({ id: "a", role: "hosting", service: "x", status: "active" }),
      service({ id: "b", role: "hosting", service: "x", status: "removed" }),
    ])[0]!;
    expect(groupStatus(activeVsRemoved)).toBe("removed");
  });
});

describe("dependentCounts", () => {
  it("counts inbound edges per target id, ignoring the source", () => {
    const counts = dependentCounts([
      { from: "a", to: "z" },
      { from: "b", to: "z" },
      { from: "c", to: "y" },
    ]);
    expect(counts.get("z")).toBe(2);
    expect(counts.get("y")).toBe(1);
    expect(counts.get("a")).toBeUndefined();
  });

  it("returns an empty map for no edges", () => {
    expect(dependentCounts([]).size).toBe(0);
  });
});

describe("mostDependedOn", () => {
  const services = [
    service({ id: "a", role: "hosting" }),
    service({ id: "b", role: "hosting" }),
    service({ id: "c", role: "hosting" }),
  ];

  it("excludes an entry with no dependents at all", () => {
    const rows = mostDependedOn(services, [{ from: "x", to: "a" }], 10);
    expect(rows.map((r) => r.service.id)).toEqual(["a"]);
  });

  it("orders descending by dependent count", () => {
    const rows = mostDependedOn(
      services,
      [
        { from: "x", to: "a" },
        { from: "y", to: "b" },
        { from: "z", to: "b" },
      ],
      10
    );
    expect(rows.map((r) => r.service.id)).toEqual(["b", "a"]);
  });

  // Without the id tiebreak, two equal-count entries would keep whatever
  // order the Map's iteration (== edge order) happened to produce.
  it("breaks a tie in dependent count on id, ascending", () => {
    const rows = mostDependedOn(
      services,
      [
        { from: "x", to: "b" },
        { from: "y", to: "a" },
      ],
      10
    );
    expect(rows.map((r) => r.service.id)).toEqual(["a", "b"]);
  });

  it("respects the limit", () => {
    const rows = mostDependedOn(
      services,
      [
        { from: "x", to: "a" },
        { from: "y", to: "b" },
        { from: "z", to: "c" },
      ],
      2
    );
    expect(rows).toHaveLength(2);
  });

  it("returns nothing when no service has a dependent", () => {
    expect(mostDependedOn(services, [], 10)).toEqual([]);
  });
});
