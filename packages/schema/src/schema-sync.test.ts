import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dagstreeSchemaV1 } from "./schema.js";
import { PRIVATE_KEY_PATTERN } from "./private-key-pattern.js";

const publishedSchemaPath = fileURLToPath(
  new URL("../schema/dagstree.v1.json", import.meta.url),
);

// Two things this package promises can never quietly drift apart:
//
// 1. schema/dagstree.v1.json (the standalone artifact other tools read,
//    e.g. via a `$schema:` line) vs. src/schema.ts (the TypeScript source
//    of truth FromSchema derives the manifest types from). If someone
//    edits schema.ts and forgets `pnpm build` — which regenerates the
//    .json file — this fails immediately instead of silently shipping a
//    stale schema.
// 2. The private-key deny pattern, which is duplicated five times as a
//    literal string inside schema.ts (Ajv strict mode needs it written as
//    real JSON, and composing it via allOf/$ref breaks type derivation —
//    see schema.ts's comment) and once more, generated, in
//    private-key-pattern.ts.
describe("schema/dagstree.v1.json stays in sync with src/schema.ts", () => {
  it("is byte-for-byte the generated JSON of the TypeScript schema", () => {
    const onDisk = JSON.parse(readFileSync(publishedSchemaPath, "utf8"));
    expect(onDisk).toStrictEqual(JSON.parse(JSON.stringify(dagstreeSchemaV1)));
  });
});

function collectPatternPropertiesPatterns(
  node: unknown,
  found: string[] = [],
): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectPatternPropertiesPatterns(item, found);
    return found;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "patternProperties" && value !== null && typeof value === "object") {
        found.push(...Object.keys(value));
      } else {
        collectPatternPropertiesPatterns(value, found);
      }
    }
  }
  return found;
}

describe("the private-key deny pattern is identical everywhere it's written", () => {
  it("appears on every object schema (root, project, vcs, serviceEntry, dependencyEdgeObject)", () => {
    const patterns = collectPatternPropertiesPatterns(dagstreeSchemaV1);
    expect(patterns).toHaveLength(5);
    for (const pattern of patterns) {
      expect(pattern).toBe(PRIVATE_KEY_PATTERN);
    }
  });
});
