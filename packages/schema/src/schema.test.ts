import { Ajv2020 } from "ajv/dist/2020.js";
// See validate.ts's import comment for why this isn't a normal `import`.
import ajvFormatsNs = require("ajv-formats");
import { describe, expect, it } from "vitest";
import { catalogusSchemaV1 } from "./schema.js";
import { parseManifest } from "./validate.js";
import { fixturePath, listFixtures, readFixture } from "./test-utils.js";

const addFormats = ajvFormatsNs.default;

describe("catalogusSchemaV1", () => {
  it("compiles under Ajv strict mode for the 2020-12 dialect", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    expect(() => ajv.compile(catalogusSchemaV1)).not.toThrow();
  });
});

describe("every fixture in test/fixtures/valid parses and validates", () => {
  for (const filename of listFixtures("valid")) {
    it(filename, () => {
      const result = parseManifest(readFixture("valid", filename));
      if (!result.valid) {
        throw new Error(
          `expected ${filename} to be valid, got errors: ${JSON.stringify(result.errors, null, 2)}`,
        );
      }
      expect(result.manifest.catalogus).toBe(1);
    });
  }

  it("covers the exact section 5 example from HANDOFF.md", () => {
    const result = parseManifest(readFixture("valid", "handoff-example.yaml"));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    // Deliberately still the spec's own project name. This fixture is a
    // verbatim copy of HANDOFF.md section 5, and its whole value is being
    // verbatim -- renaming it here would leave the copy silently diverged
    // from the document it exists to track. Every other fixture and inline
    // manifest in the suite uses a synthetic name instead.
    expect(result.manifest.project.name).toBe("Clapline");
    expect(result.manifest.services).toHaveLength(6);
    expect(result.manifest.dependencies).toHaveLength(3);
  });

  it("accepts the same catalog service twice under different local ids", () => {
    const result = parseManifest(readFixture("valid", "two-roles-one-service.yaml"));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    const catalogServices = result.manifest.services.map((s) => s.service);
    expect(catalogServices).toEqual(["supabase", "supabase"]);
    const localIds = result.manifest.services.map((s) => s.id);
    expect(new Set(localIds).size).toBe(localIds.length);
  });

  it("accepts both the tuple and object forms of a dependency edge in the same file", () => {
    const result = parseManifest(readFixture("valid", "dependency-object-form.yaml"));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(Array.isArray(result.manifest.dependencies[0])).toBe(true);
    expect(result.manifest.dependencies[1]).toMatchObject({ from: "fly", to: "sentry" });
  });
});

describe("every fixture in test/fixtures/invalid fails validation", () => {
  for (const filename of listFixtures("invalid")) {
    it(filename, () => {
      const result = parseManifest(readFixture("invalid", filename));
      expect(result.valid, `expected ${fixturePath("invalid", filename)} to be invalid`).toBe(
        false,
      );
    });
  }
});

describe("private-key rejection targets property names, not free-text content", () => {
  it("allows a notes string that happens to mention cost", () => {
    const yamlText = [
      "catalogus: 1",
      "project:",
      "  name: Example App",
      "  slug: example-app",
      "services:",
      "  - id: fly",
      "    service: fly-io",
      "    role: hosting",
      "    added: 2025-11-02",
      '    notes: "we picked this over the cheaper option because the cost of switching later was too high"',
      "dependencies: []",
      "",
    ].join("\n");

    const result = parseManifest(yamlText);
    expect(result.valid).toBe(true);
  });
});
