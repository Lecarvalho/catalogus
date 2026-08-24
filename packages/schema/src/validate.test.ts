import { describe, expect, it } from "vitest";
import { validateManifest, parseManifest, edgeEndpoints, edgePairs } from "./validate.js";
import { listFixtures, readFixture } from "./test-utils.js";
import type { CatalogusManifestError } from "./validate.js";

function invalidErrors(filename: string): CatalogusManifestError[] {
  const result = parseManifest(readFixture("invalid", filename));
  if (result.valid) throw new Error(`expected ${filename} to be invalid`);
  return result.errors;
}

describe("private-key redirect errors", () => {
  it.each([
    ["private-key-cost-root.yaml", "monthly-cost"],
    ["private-key-account-project.yaml", "account_id"],
    ["private-key-credential-service-entry.yaml", "apiKey"],
    ["private-key-billing-vcs.yaml", "BILLING"],
    ["private-key-payment-dependency.yaml", "plan_tier"],
  ])("flags %s with the private-overlay redirect for %s", (filename, property) => {
    const errors = invalidErrors(filename);
    const hit = errors.find((e) => e.kind === "private-key" && e.property === property);
    expect(hit, `expected a private-key error for "${property}" in ${errors.map((e) => e.property).join(",")}`).toBeDefined();
    expect(hit?.message).toMatch(/private overlay/i);
    expect(hit?.message).toMatch(/catalogus push --private/);
  });

  it("reports the private key nested inside a service entry with an instancePath under /services", () => {
    const errors = invalidErrors("private-key-credential-service-entry.yaml");
    const hit = errors.find((e) => e.kind === "private-key");
    expect(hit?.instancePath).toBe("/services/0/apiKey");
  });

  it("does not also emit a generic 'additional property' error for the same key", () => {
    const errors = invalidErrors("private-key-cost-root.yaml");
    const generic = errors.filter(
      (e) => e.kind === "schema" && e.message.includes("additional properties"),
    );
    expect(generic).toHaveLength(0);
  });

  it("reports exactly one private-key error, not one per Ajv keyword that fired", () => {
    const errors = invalidErrors("private-key-account-project.yaml");
    expect(errors.filter((e) => e.kind === "private-key")).toHaveLength(1);
  });
});

describe("a private key inside an object-form dependency edge", () => {
  it("reports only the private-key redirect, not a contradictory 'must be array'", () => {
    const result = validateManifest({
      catalogus: 1,
      project: { name: "x", slug: "x" },
      services: [
        { id: "a", service: "b", role: "c", added: "2025-01-01" },
        { id: "b", service: "b", role: "c", added: "2025-01-01" },
      ],
      dependencies: [{ from: "a", to: "b", monthlyCost: 5 }],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      expect.objectContaining({
        kind: "private-key",
        property: "monthlyCost",
        instancePath: "/dependencies/0/monthlyCost",
      }),
    ]);
    // The object form is legal; the tuple branch's own "must be array" is
    // pure oneOf noise and would tell the user to rewrite a valid edge.
    expect(result.errors.some((e) => e.kind === "schema")).toBe(false);
  });

  it("still reports a genuinely missing required field alongside the private-key redirect", () => {
    const result = validateManifest({
      catalogus: 1,
      project: { name: "x", slug: "x" },
      services: [{ id: "b", service: "b", role: "c", added: "2025-01-01" }],
      // Missing "from" *and* carrying a private key -- both are real
      // problems and allErrors promises both come back, not just one.
      dependencies: [{ to: "b", monthlyCost: 5 }],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((e) => e.kind === "private-key" && e.property === "monthlyCost")).toBe(
      true,
    );
    expect(
      result.errors.some((e) => e.kind === "schema" && /required property 'from'/.test(e.message)),
    ).toBe(true);
  });
});

describe("an unknown key that isn't private-shaped", () => {
  it("still gets rejected, but as an ordinary schema error, not a private-key redirect", () => {
    const result = validateManifest({
      catalogus: 1,
      project: { name: "x", slug: "x" },
      services: [],
      dependencies: [],
      favoriteColor: "teal",
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      expect.objectContaining({ kind: "schema", instancePath: "" }),
    ]);
    expect(result.errors.some((e) => e.kind === "private-key")).toBe(false);
  });
});

describe("referential integrity (beyond what JSON Schema can express)", () => {
  it("flags a duplicate local service id", () => {
    const errors = invalidErrors("duplicate-service-id.yaml");
    expect(errors).toEqual([
      expect.objectContaining({
        kind: "reference",
        instancePath: "/services/1/id",
      }),
    ]);
    expect(errors[0]?.message).toMatch(/duplicate service id "fly"/i);
  });

  it("flags a dependency edge naming an id no service has", () => {
    const errors = invalidErrors("unknown-dependency-target.yaml");
    expect(errors).toEqual([
      expect.objectContaining({
        kind: "reference",
        instancePath: "/dependencies/0/to",
      }),
    ]);
    expect(errors[0]?.message).toMatch(/unknown service id "vertex"/i);
  });

  it("flags a replaced_by that names no services[] entry", () => {
    const errors = invalidErrors("unknown-replaced-by.yaml");
    expect(errors).toEqual([
      expect.objectContaining({
        kind: "reference",
        instancePath: "/services/0/replaced_by",
      }),
    ]);
    expect(errors[0]?.message).toMatch(/replaced_by "anthropic-apy"/i);
  });

  it("flags a replaced_by that names its own entry", () => {
    const errors = invalidErrors("self-replaced-by.yaml");
    expect(errors).toEqual([
      expect.objectContaining({
        kind: "reference",
        instancePath: "/services/0/replaced_by",
      }),
    ]);
    expect(errors[0]?.message).toMatch(/names itself in replaced_by/i);
  });

  it("accepts a replaced_by that correctly names another entry's id", () => {
    const result = validateManifest({
      catalogus: 1,
      project: { name: "x", slug: "x" },
      services: [
        {
          id: "vertex",
          service: "vertex-ai",
          role: "llm",
          added: "2025-11-02",
          status: "phasing_out",
          replaced_by: "anthropic-api",
        },
        { id: "anthropic-api", service: "anthropic", role: "llm", added: "2025-11-02" },
      ],
      dependencies: [],
    });
    expect(result.valid).toBe(true);
  });
});

describe("ordinary schema errors", () => {
  it("flags an invalid date", () => {
    const errors = invalidErrors("bad-date.yaml");
    expect(errors.some((e) => e.kind === "schema" && e.instancePath === "/services/0/added")).toBe(
      true,
    );
  });

  it("flags a status value outside the enum", () => {
    const errors = invalidErrors("bad-status-enum.yaml");
    expect(
      errors.some((e) => e.kind === "schema" && e.instancePath === "/services/0/status"),
    ).toBe(true);
  });

  it("flags a missing required field", () => {
    const errors = invalidErrors("missing-required-field.yaml");
    expect(errors.some((e) => e.kind === "schema" && /added/.test(e.message))).toBe(true);
  });

  it("reports every problem at once (allErrors), not just the first", () => {
    const result = validateManifest({
      catalogus: 1,
      project: { name: "x", slug: "x" },
      services: [
        { id: "a", service: "b", role: "c", added: "nope", status: "bogus" },
      ],
      dependencies: [],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    // Both the bad date and the bad status enum should show up in one pass.
    expect(result.errors.some((e) => e.instancePath === "/services/0/added")).toBe(true);
    expect(result.errors.some((e) => e.instancePath === "/services/0/status")).toBe(true);
  });
});

describe("parseManifest", () => {
  it("turns a YAML syntax error into an invalid result instead of throwing", () => {
    const result = parseManifest("catalogus: 1\nproject: [not, closed\n");
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0]?.message).toMatch(/yaml/i);
  });

  it("never throws for structurally-wrong-but-parseable input", () => {
    expect(() => parseManifest("just: a string\n")).not.toThrow();
    expect(() => validateManifest("not even an object")).not.toThrow();
    expect(() => validateManifest(null)).not.toThrow();
  });
});

describe("free-text private-value guard, wired into validateManifest", () => {
  function withNotes(notes: string) {
    return {
      catalogus: 1,
      project: { name: "x", slug: "x" },
      services: [{ id: "a", service: "b", role: "c", added: "2025-01-01", notes }],
      dependencies: [],
    };
  }

  it("a HARD hit (email) makes the manifest invalid, as a 'private-value' error, redacted", () => {
    const result = validateManifest(withNotes("billing contact dsnk@example.com"));
    expect(result.valid).toBe(false);
    if (result.valid) return;
    const hit = result.errors.find((e) => e.kind === "private-value");
    expect(hit).toBeDefined();
    expect(hit?.instancePath).toBe("/services/0/notes");
    expect(hit?.category).toBe("email");
    expect(hit?.message).not.toContain("dsnk@example.com");
    expect(hit?.message).toMatch(/push --private/);
  });

  it("a SOFT hit (bare keyword) does NOT invalidate the manifest -- it only appears in warnings", () => {
    const result = validateManifest(withNotes("renewal is handled automatically"));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ instancePath: "/services/0/notes", category: "renewal" });
  });

  it("warnings is always present, even with nothing to warn about", () => {
    const result = validateManifest(withNotes("primary datastore for the checkout flow"));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings).toEqual([]);
  });

  it("a HARD hit still carries an (empty) warnings array on the invalid result", () => {
    const result = validateManifest(withNotes("card ending in 4111 1111 1111 1111"));
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("HARD and SOFT hits in the same document are reported on their own channels simultaneously", () => {
    const manifest = {
      catalogus: 1,
      project: { name: "x", slug: "x" },
      services: [
        { id: "a", service: "b", role: "c", added: "2025-01-01", notes: "contact dsnk@example.com" },
        { id: "b", service: "b", role: "c", added: "2025-01-01", notes: "billing runs monthly" },
      ],
      dependencies: [],
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((e) => e.kind === "private-value" && e.instancePath === "/services/0/notes")).toBe(true);
    expect(result.warnings.some((w) => w.instancePath === "/services/1/notes" && w.category === "billing")).toBe(true);
  });

  it("catches a hard hit nested inside a dependency-edge object, not only at the top level", () => {
    const result = validateManifest({
      catalogus: 1,
      project: { name: "x", slug: "x" },
      services: [
        { id: "a", service: "b", role: "c", added: "2025-01-01" },
        { id: "b", service: "b", role: "c", added: "2025-01-01" },
      ],
      dependencies: [{ from: "a", to: "b", notes: "renewal fee card 4111 1111 1111 1111" }],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((e) => e.kind === "private-value" && e.instancePath === "/dependencies/0/notes")).toBe(
      true,
    );
  });

  // project.coding_agents (a raw string array) was removed in the
  // 2026-08-24 amendment -- it was the only free-text array field the
  // schema had, so there is no longer a schema-shaped array of raw strings
  // to nest a private-value hit inside end to end through validateManifest.
  // The sibling test above already covers array-of-*objects* nesting via
  // dependencies[], and free-text-guard.test.ts's own "scanManifestForPrivate
  // Values -- generic recursive walk" tests the walker's array recursion
  // directly, unconstrained by any particular schema shape. What replaces
  // this case is the amendment's own new behavior: an old-shape manifest
  // still naming pm/coding_agents/vcs.provider should be told what moved,
  // not given a bare "additional property" error -- see the test below.
  it("names what moved, not a bare additional-property error, for a manifest still in the old (pre-2026-08-24) shape", () => {
    const result = validateManifest({
      catalogus: 1,
      project: {
        name: "x",
        slug: "x",
        pm: "Trello kanban",
        coding_agents: ["claude-code"],
        vcs: { provider: "github", visibility: "private" },
      },
      services: [],
      dependencies: [],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    const moved = result.errors.filter((e) => e.kind === "moved-field");
    expect(moved.map((e) => e.property).sort()).toEqual(["coding_agents", "pm", "provider"]);
    for (const error of moved) {
      expect(error.message).not.toMatch(/additional propert/i);
    }
    expect(moved.find((e) => e.property === "pm")?.message).toContain("--role pm");
    expect(moved.find((e) => e.property === "coding_agents")?.message).toContain("--role coding-agent");
    expect(moved.find((e) => e.property === "provider")?.message).toContain("--role vcs");
  });

  it.each([
    "modular monolith (.NET 10, vertical slices)",
    "vertical slices + MediatR",
    "Trello kanban (PAUTA agent sync)",
    "upgraded to Next.js 15.4 in March",
    "costs are tracked in the private overlay, not here",
    "migrated off Vertex on 2026-06-01",
    "see RFC 7519 and issue 12345",
  ])("false-positive text stays completely clean end to end: %s", (notes) => {
    const result = validateManifest(withNotes(notes));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings).toEqual([]);
  });

  it("a service id/slug containing a hyphen and digits is not mistaken for a card number", () => {
    const manifest = {
      catalogus: 1,
      project: { name: "x", slug: "x" },
      services: [{ id: "s3-bucket-2", service: "aws-s3", role: "storage", added: "2025-01-01" }],
      dependencies: [],
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings).toEqual([]);
  });

  it("every fixture in test/fixtures/valid produces zero warnings, not just zero errors", () => {
    for (const filename of listFixtures("valid")) {
      const result = parseManifest(readFixture("valid", filename));
      expect(result.valid, `expected ${filename} to be valid`).toBe(true);
      if (!result.valid) continue;
      expect(result.warnings, `expected ${filename} to have no warnings`).toEqual([]);
    }
  });
});

describe("edgeEndpoints / edgePairs", () => {
  it("normalizes the tuple form", () => {
    expect(edgeEndpoints(["a", "b"])).toEqual({ from: "a", to: "b" });
  });

  it("normalizes the object form", () => {
    expect(edgeEndpoints({ from: "a", to: "b", notes: "why" })).toEqual({ from: "a", to: "b" });
  });

  it("gives edgePairs ready-to-toposort {from,to} pairs without re-parsing the manifest", () => {
    const manifest = {
      dependencies: [
        ["a", "b"],
        { from: "b", to: "c", notes: "because" },
      ],
    };
    expect(edgePairs(manifest)).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "c", notes: "because" },
    ]);
  });
});
