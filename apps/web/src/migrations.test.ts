import { describe, expect, it } from "vitest";

import { buildMigrationDashboard } from "./migrations.js";
import { makeViewService as service } from "./test-support/fixtures.js";

describe("buildMigrationDashboard", () => {
  it("puts a phasing_out service in flight, with its replacement's label resolved", () => {
    const { inFlight, overdue } = buildMigrationDashboard([
      service({ id: "old-db", role: "database", status: "phasing_out", replaced_by: "new-db" }),
      service({ id: "new-db", role: "database", name: "New DB" }),
    ]);
    expect(overdue).toEqual([]);
    expect(inFlight).toHaveLength(1);
    expect(inFlight[0]!.service.id).toBe("old-db");
    expect(inFlight[0]!.replacementLabel).toBe("new-db (New DB)");
  });

  it("puts a deprecated service under overdue, with its replacement's label resolved", () => {
    const { inFlight, overdue } = buildMigrationDashboard([
      service({ id: "old-auth", role: "auth", status: "deprecated", replaced_by: "new-auth" }),
      service({ id: "new-auth", role: "auth", name: "New Auth" }),
    ]);
    expect(inFlight).toEqual([]);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.service.id).toBe("old-auth");
    expect(overdue[0]!.replacementLabel).toBe("new-auth (New Auth)");
  });

  // The most important row on the board: a migration with no destination.
  // Not an error and not filtered out (CLAUDE.md: "an absent field reads as
  // 'not answered yet'").
  it("marks a row with no replaced_by as having no replacement, rather than dropping it or erroring", () => {
    const { inFlight } = buildMigrationDashboard([service({ id: "orphan", role: "hosting", status: "phasing_out" })]);
    expect(inFlight).toHaveLength(1);
    expect(inFlight[0]!.replacementLabel).toBeNull();
  });

  // A rendering bug must degrade to the id rather than crash -- the same
  // rule App.tsx's deriveEdgeMaps follows for a dangling edge endpoint.
  it("degrades to the bare id when replaced_by names a service absent from the manifest", () => {
    const { inFlight } = buildMigrationDashboard([
      service({ id: "old-cache", role: "cache", status: "phasing_out", replaced_by: "does-not-exist" }),
    ]);
    expect(inFlight[0]!.replacementLabel).toBe("does-not-exist");
  });

  it("leaves a removed service off both sections -- that migration is finished", () => {
    const { inFlight, overdue } = buildMigrationDashboard([service({ id: "gone", role: "hosting", status: "removed" })]);
    expect(inFlight).toEqual([]);
    expect(overdue).toEqual([]);
  });

  it("leaves an active service off both sections -- it never enters a migration conversation", () => {
    const { inFlight, overdue } = buildMigrationDashboard([service({ id: "fine", role: "hosting", status: "active" })]);
    expect(inFlight).toEqual([]);
    expect(overdue).toEqual([]);
  });

  it("returns both sections empty for no services", () => {
    expect(buildMigrationDashboard([])).toEqual({ inFlight: [], overdue: [] });
  });

  it("ordinal-sorts each section by id, independent of input order", () => {
    const { inFlight } = buildMigrationDashboard([
      service({ id: "z-svc", role: "hosting", status: "phasing_out" }),
      service({ id: "a-svc", role: "hosting", status: "phasing_out" }),
      service({ id: "m-svc", role: "hosting", status: "phasing_out" }),
    ]);
    expect(inFlight.map((row) => row.service.id)).toEqual(["a-svc", "m-svc", "z-svc"]);
  });

  it("sorts phasing_out and deprecated services independently of each other", () => {
    const { inFlight, overdue } = buildMigrationDashboard([
      service({ id: "z-flight", role: "hosting", status: "phasing_out" }),
      service({ id: "a-flight", role: "hosting", status: "phasing_out" }),
      service({ id: "z-overdue", role: "hosting", status: "deprecated" }),
      service({ id: "a-overdue", role: "hosting", status: "deprecated" }),
    ]);
    expect(inFlight.map((row) => row.service.id)).toEqual(["a-flight", "z-flight"]);
    expect(overdue.map((row) => row.service.id)).toEqual(["a-overdue", "z-overdue"]);
  });

  // The keyed-lookup defect class this repo keeps producing (docs/PLAN.md).
  //
  // The distinction StatusPill.tsx's header draws is the whole point here:
  // an *absent* key and an *inherited* one are different things, and only
  // one of them is a bug. The first version of this test seeded a service
  // whose id actually was `constructor`, which makes the key an *own*
  // property -- an object literal shadows Object.prototype in that case, so
  // the test passed against a keyed literal too and proved nothing. The
  // validation pass caught it by swapping the Map for a literal and watching
  // all 991 tests stay green.
  //
  // So the target below is deliberately absent from the manifest. Against a
  // literal this returns "constructor (function Object() { [native code] })";
  // against the Map it returns the bare id, which is the same dangling-
  // reference degradation any unknown target gets.
  //
  // `constructor` is not an arbitrary choice of reserved word: the schema's
  // id pattern (^[a-z0-9]+(?:[_-][a-z0-9]+)*$) rejects `__proto__`, so it is
  // the only Object.prototype key a manifest can actually express.
  it("resolves an absent replaced_by target of 'constructor' as a dangling id, not Object.prototype", () => {
    const { inFlight } = buildMigrationDashboard([service({ id: "old-thing", role: "hosting", status: "phasing_out", replaced_by: "constructor" })]);
    expect(inFlight[0]!.replacementLabel).toBe("constructor");
  });

  // The own-property case is still worth holding, just not as the guard
  // above -- a service really named `constructor` must render like any other.
  it("renders a replacement whose id is 'constructor' as an ordinary service", () => {
    const { inFlight } = buildMigrationDashboard([
      service({ id: "old-thing", role: "hosting", status: "phasing_out", replaced_by: "constructor" }),
      service({ id: "constructor", role: "hosting", name: "Constructor Co" }),
    ]);
    expect(inFlight[0]!.replacementLabel).toBe("constructor (Constructor Co)");
  });

  it("mixes in-flight and overdue services from one manifest without either leaking into the other", () => {
    const { inFlight, overdue } = buildMigrationDashboard([
      service({ id: "old-db", role: "database", status: "phasing_out", replaced_by: "new-db" }),
      service({ id: "old-cache", role: "cache", status: "deprecated" }),
      service({ id: "fine", role: "hosting", status: "active" }),
      service({ id: "gone", role: "hosting", status: "removed" }),
    ]);
    expect(inFlight.map((row) => row.service.id)).toEqual(["old-db"]);
    expect(overdue.map((row) => row.service.id)).toEqual(["old-cache"]);
  });
});
