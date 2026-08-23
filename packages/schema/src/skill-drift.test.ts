// Drift check between `packages/schema` and the two artifacts that show a
// human or an agent what a valid dagstree.yaml looks like:
//
//   - skills/dagstree/SKILL.md — a shipped product artifact, installed into
//     client repos, that teaches a coding agent the manifest format via
//     fenced ```yaml blocks. As of this writing the skill is CLI-mandatory
//     (`dagstree add` etc.) and deliberately does NOT embed a full worked
//     manifest, to avoid inviting hand-authoring. It does embed one
//     ```yaml FRAGMENT — the shape of the handful of Layer 2 fields that
//     have no CLI command and still get hand-edited (project.architecture,
//     project.pm, project.vcs, project.coding_agents, status/replaced_by).
//     That fragment is marked with an `<!-- dagstree:fragment -->` HTML
//     comment immediately above its fence.
//   - examples/*.dagstree.yaml — reference manifests derived from real
//     projects, used to judge the skill's output. `clapline.dagstree.yaml`
//     is the only one today.
//
// Nothing else connects the schema to either artifact. If the schema
// changes and one of these doesn't, the artifact starts teaching (or
// showcasing) a shape the validator rejects — and because the skill runs
// inside a client's repository, the agent looks broken to the client. This
// test is the tripwire.
//
// Two different checks, because a fragment and a full manifest drift
// differently:
//
//   - An UNMARKED ```yaml block is assumed to be a complete manifest
//     example. It is parsed and validated end to end with this package's
//     own `parseManifest`, exactly as a client-repo agent would validate
//     the file it just wrote. None exist right now (see above), but if one
//     is added later it must validate fully — see the `manifestBlocks`
//     loop below.
//   - A block marked `<!-- dagstree:fragment -->` is intentionally partial
//     (missing top-level `dagstree`/`dependencies`, and its `services[]`
//     entry is missing `service`/`role`/`added`) and can never pass
//     `parseManifest` as a whole document. Running it through the full
//     validator would only ever report "missing required property", which
//     tells nobody anything about real drift. Instead it's checked the way
//     the coordinator asked: walk the actual field names and enum values
//     the fragment uses against `dagstreeSchemaV1`'s own definitions
//     (`checkFragmentAgainstSchemaFields` below) — every property the
//     fragment names must still exist in the schema at that path, and every
//     value at an `enum` field must still be a legal member of that enum.
//     A renamed field or a dropped enum value fails this exactly as it
//     would fail full validation on a complete manifest.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { parseManifest } from "./validate.js";
import type { DagstreeManifestError } from "./validate.js";
import { dagstreeSchemaV1 } from "./schema.js";
import { findRepoRoot } from "./test-utils.js";

const repoRoot = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
const skillPath = join(repoRoot, "skills", "dagstree", "SKILL.md");
const examplesDir = join(repoRoot, "examples");

interface YamlBlock {
  /** 1-based position among all ```yaml blocks found in the file, for error messages. */
  index: number;
  /** True when the fence is immediately preceded by <!-- dagstree:fragment -->. */
  isFragment: boolean;
  content: string;
}

// Matches ```yaml\n<content>\n``` blocks, optionally preceded on the line
// directly above by the <!-- dagstree:fragment --> marker comment. The
// shell-command blocks elsewhere in SKILL.md are fenced with no language
// tag and are ignored by this pattern.
const YAML_FENCE_RE = /(<!--\s*dagstree:fragment\s*-->\s*\r?\n)?```yaml\r?\n([\s\S]*?)\r?\n```/g;

function extractYamlBlocks(markdown: string): YamlBlock[] {
  const blocks: YamlBlock[] = [];
  let match: RegExpExecArray | null;
  let index = 0;
  YAML_FENCE_RE.lastIndex = 0;
  while ((match = YAML_FENCE_RE.exec(markdown)) !== null) {
    index += 1;
    blocks.push({ index, isFragment: match[1] !== undefined, content: match[2] ?? "" });
  }
  return blocks;
}

function formatErrors(errors: DagstreeManifestError[]): string {
  return errors.map((e) => `  [${e.kind}] ${e.instancePath || "(root)"}: ${e.message}`).join("\n");
}

// --- schema-field-and-enum walk, for fragments -----------------------------
//
// A deliberately loose structural view of dagstreeSchemaV1 -- just enough
// JSON Schema vocabulary to answer "does this property still exist here,
// and if it's an enum, is this value still a member" for an arbitrary
// (possibly incomplete) document. `dagstreeSchemaV1` is authored as a
// TypeScript `as const` literal (see schema.ts's module comment) whose
// precise structural type doesn't line up with an index-signature-bearing
// interface, so the entry point casts once; schema.test.ts and
// schema-sync.test.ts already cover the schema's own shape, so this cast
// isn't hiding a real type risk.
interface SchemaNode {
  $ref?: string;
  $defs?: Record<string, SchemaNode>;
  oneOf?: SchemaNode[];
  enum?: readonly unknown[];
  const?: unknown;
  type?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
}

function resolveRef(schema: SchemaNode, node: SchemaNode): SchemaNode {
  if (!node.$ref) return node;
  const key = node.$ref.replace("#/$defs/", "");
  const resolved = schema.$defs?.[key];
  if (!resolved) {
    throw new Error(`skill-drift.test.ts: unresolvable $ref "${node.$ref}" while walking the schema`);
  }
  return resolved;
}

function checkFragmentNode(
  schema: SchemaNode,
  rawNode: SchemaNode,
  value: unknown,
  path: string,
  problems: string[],
): void {
  const node = resolveRef(schema, rawNode);

  if (node.oneOf) {
    for (const branch of node.oneOf) {
      const branchProblems: string[] = [];
      checkFragmentNode(schema, branch, value, path, branchProblems);
      if (branchProblems.length === 0) return;
    }
    problems.push(`${path}: does not match any of the schema's accepted shapes for this field`);
    return;
  }

  if (node.enum) {
    if (!node.enum.includes(value)) {
      const legal = node.enum.map((v) => JSON.stringify(v)).join(", ");
      problems.push(
        `${path}: ${JSON.stringify(value)} is not one of the schema's legal values (${legal}) -- ` +
          "an enum value the skill shows may have been renamed or dropped",
      );
    }
    return;
  }

  if (node.const !== undefined) {
    if (value !== node.const) {
      problems.push(`${path}: schema requires the constant ${JSON.stringify(node.const)}, fragment has ${JSON.stringify(value)}`);
    }
    return;
  }

  if (node.type === "object" || node.properties) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      problems.push(`${path}: schema expects an object here, fragment has ${typeof value}`);
      return;
    }
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      const propSchema = node.properties?.[key];
      if (!propSchema) {
        problems.push(`${path}/${key}: no longer a field in the schema (renamed or removed)`);
        continue;
      }
      checkFragmentNode(schema, propSchema, entryValue, `${path}/${key}`, problems);
    }
    return;
  }

  if (node.type === "array" || node.items) {
    if (!Array.isArray(value)) {
      problems.push(`${path}: schema expects an array here, fragment has ${typeof value}`);
      return;
    }
    if (node.items) {
      const itemSchema = node.items;
      value.forEach((item, i) => checkFragmentNode(schema, itemSchema, item, `${path}/${i}`, problems));
    }
    return;
  }

  // A plain scalar leaf (string, etc.): the caller already confirmed this
  // field still exists in the schema by finding it in the parent's
  // `properties`, which is the whole contract for a non-enum field.
}

/** Every field name and enum value a (possibly partial) fragment document uses, checked against the live schema. */
function checkFragmentAgainstSchemaFields(schema: SchemaNode, fragment: unknown): string[] {
  const problems: string[] = [];
  if (typeof fragment !== "object" || fragment === null || Array.isArray(fragment)) {
    return [`(root): expected a YAML mapping, got ${typeof fragment}`];
  }
  for (const [key, value] of Object.entries(fragment as Record<string, unknown>)) {
    const propSchema = schema.properties?.[key];
    if (!propSchema) {
      problems.push(`/${key}: no longer a top-level field in the schema (renamed or removed)`);
      continue;
    }
    checkFragmentNode(schema, propSchema, value, `/${key}`, problems);
  }
  return problems;
}

const schemaRoot = dagstreeSchemaV1 as unknown as SchemaNode;

describe("skills/dagstree/SKILL.md's ```yaml examples vs. packages/schema", () => {
  const skillMarkdown = readFileSync(skillPath, "utf8");
  const allBlocks = extractYamlBlocks(skillMarkdown);
  const manifestBlocks = allBlocks.filter((b) => !b.isFragment);
  const fragmentBlocks = allBlocks.filter((b) => b.isFragment);

  it("has at least one ```yaml block to check", () => {
    expect(
      allBlocks.length,
      `found no \`\`\`yaml blocks at all in ${skillPath}. Either the skill dropped its manifest-format ` +
        "documentation entirely, or the extraction in skill-drift.test.ts (YAML_FENCE_RE) no longer " +
        "matches how the file fences its examples -- check both before assuming this is fine.",
    ).toBeGreaterThan(0);
  });

  // An unmarked block claims to be a complete, copy-pasteable manifest, so
  // it has to survive the same parseManifest() call a client-repo agent
  // would run on the file it just wrote. None exist as of this writing —
  // this loop exists so the day one is added back, it's held to the same
  // standard rather than trusted on sight.
  it.each(manifestBlocks)(
    "SKILL.md yaml block #$index (unmarked, i.e. a full manifest) parses and validates against the schema",
    (block) => {
      const result = parseManifest(block.content);
      const detail = result.valid ? "" : `\n${formatErrors(result.errors)}`;
      expect(
        result.valid,
        `skills/dagstree/SKILL.md's embedded example manifest (yaml block #${block.index} of ` +
          `${allBlocks.length}) has drifted from packages/schema and no longer validates. The skill is a ` +
          "shipped artifact installed into client repos — as written, it now teaches an agent to write a " +
          "dagstree.yaml the validator rejects, which makes the agent look broken to the client. Update " +
          "skills/dagstree/SKILL.md and packages/schema together so they agree again (see " +
          `skills/README.md, "Keeping it honest").${detail}`,
      ).toBe(true);
      if (!result.valid) return;
      expect(
        result.warnings,
        `SKILL.md yaml block #${block.index} validates but produced private-value warnings; the shipped ` +
          "example should read as unambiguously clean, ordinary prose with zero warnings.",
      ).toEqual([]);
    },
  );

  // A fragment can never pass full-schema validation by design (it's
  // missing required top-level keys on purpose), so instead of parsing it
  // as a whole manifest, every field name and enum value it actually uses
  // is checked against the schema's own definitions. This is what catches
  // a field getting renamed (e.g. `vcs.provider` -> `vcs.host`) or an enum
  // value getting dropped (e.g. `phasing_out` removed from the status
  // enum) without demanding the fragment pretend to be a full document.
  it.each(fragmentBlocks)(
    "SKILL.md yaml block #$index (marked <!-- dagstree:fragment -->) uses only field names and enum values the schema still recognizes",
    (block) => {
      let parsed: unknown;
      try {
        parsed = parseYaml(block.content);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `skills/dagstree/SKILL.md's yaml block #${block.index}, marked as a fragment, does not even ` +
            `parse as YAML: ${message}`,
        );
      }
      const problems = checkFragmentAgainstSchemaFields(schemaRoot, parsed);
      expect(
        problems,
        `skills/dagstree/SKILL.md's fragment example (yaml block #${block.index} of ${allBlocks.length}) ` +
          "uses field names or enum values that packages/schema no longer recognizes. The " +
          "<!-- dagstree:fragment --> marker means this snippet is deliberately not a full manifest, but " +
          "its field names and enum values still have to match the schema — update " +
          `skills/dagstree/SKILL.md and packages/schema together so they agree again.\n` +
          problems.map((p) => `  - ${p}`).join("\n"),
      ).toEqual([]);
    },
  );
});

describe("examples/*.dagstree.yaml vs. packages/schema", () => {
  const files = readdirSync(examplesDir)
    .filter((name) => name.endsWith(".dagstree.yaml"))
    .sort();

  it("finds at least one examples/*.dagstree.yaml file to check", () => {
    expect(
      files.length,
      `found no *.dagstree.yaml files directly under ${examplesDir} — expected at least ` +
        "examples/clapline.dagstree.yaml. Either it was moved/renamed, or findRepoRoot() resolved the " +
        "wrong directory.",
    ).toBeGreaterThan(0);
  });

  it.each(files)("examples/%s validates against the schema", (filename) => {
    const yamlText = readFileSync(join(examplesDir, filename), "utf8");
    const result = parseManifest(yamlText);
    const detail = result.valid ? "" : `\n${formatErrors(result.errors)}`;
    expect(
      result.valid,
      `examples/${filename} no longer validates against packages/schema. This is a reference manifest ` +
        "that the skill's output gets compared against (see docs/PLAN.md's Phase 3.6 cold test), so it " +
        `has to stay valid on its own — fix examples/${filename} (or, if the schema is what's wrong, fix ` +
        `packages/schema and this file together).${detail}`,
    ).toBe(true);
    if (!result.valid) return;
    expect(
      result.warnings,
      `examples/${filename} validates but produced private-value warnings — a reference manifest should ` +
        "be unambiguously clean.",
    ).toEqual([]);
  });
});
