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

// Added 2026-09-04 (docs/custom-icon-brief.md) alongside serviceEntry.icon.
// Single-quoted YAML scalars, not double-quoted: a double-quoted YAML string
// processes backslash escapes, and the Windows-path rejection case below
// (`C:\x.svg`) would otherwise have YAML itself choke on `\x` before the
// value ever reached the schema. Single-quoted has no such processing.
describe("serviceEntry.icon: only .catalogus/icons/<name>.svg is representable", () => {
  function manifestWithIcon(icon: string): string {
    return [
      "catalogus: 1",
      "project:",
      "  name: Example App",
      "  slug: example-app",
      "services:",
      "  - id: loki",
      "    service: grafana-loki",
      "    role: logs",
      "    added: 2026-09-04",
      `    icon: '${icon}'`,
      "dependencies: []",
      "",
    ].join("\n");
  }

  it("accepts .catalogus/icons/loki.svg -- the one shape the CLI ever writes", () => {
    const result = parseManifest(manifestWithIcon(".catalogus/icons/loki.svg"));
    expect(result.valid).toBe(true);
  });

  it.each([
    ["a leading ./", "./.catalogus/icons/x.svg"],
    ["a .. traversal segment", ".catalogus/icons/../x.svg"],
    ["an absolute POSIX path", "/abs/x.svg"],
    ["an absolute Windows path", "C:\\x.svg"],
    ["a URL -- the exact variant this pattern exists to refuse", "https://x/y.svg"],
    ["a thesvg: catalog ref, a different field's shape entirely", "thesvg:aws"],
    ["the wrong extension", ".catalogus/icons/x.png"],
    ["an empty name before .svg", ".catalogus/icons/.svg"],
    ["an empty string", ""],
  ])("rejects %s (%j)", (_label, icon) => {
    const result = parseManifest(manifestWithIcon(icon));
    expect(result.valid, `expected ${JSON.stringify(icon)} to be rejected`).toBe(false);
  });
});
