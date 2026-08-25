// Drift check between `packages/schema` and the two artifacts that show a
// human or an agent what a valid catalogus.yaml looks like:
//
//   - skills/catalogus/SKILL.md — a shipped product artifact, installed into
//     client repos, that teaches a coding agent the manifest format via
//     fenced ```yaml blocks. As of this writing the skill is CLI-mandatory
//     (`catalogus add` etc.) and deliberately does NOT embed a full worked
//     manifest, to avoid inviting hand-authoring. It does embed one
//     ```yaml FRAGMENT — the shape of the handful of Layer 2 fields that
//     have no CLI command and still get hand-edited (project.architecture,
//     project.vcs, status/replaced_by).
//     That fragment is marked with an `<!-- catalogus:fragment -->` HTML
//     comment immediately above its fence.
//   - examples/*.catalogus.yaml — reference manifests the skill's output is
//     judged against. Deliberately synthetic: an example derived from a real
//     project would publish that project's whole service inventory and
//     topology in a public repo, which is a different thing from publishing
//     a schema example. `reference.catalogus.yaml` is the only one today.
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
//   - A block marked `<!-- catalogus:fragment -->` is intentionally partial
//     (missing top-level `catalogus`/`dependencies`, and its `services[]`
//     entry is missing `service`/`role`/`added`) and can never pass
//     `parseManifest` as a whole document. Running it through the full
//     validator would only ever report "missing required property", which
//     tells nobody anything about real drift. Instead it's checked the way
//     the coordinator asked: walk the actual field names and values the
//     fragment uses against `catalogusSchemaV1`'s own definitions
//     (`checkFragmentAgainstSchemaFields` below) — every property the
//     fragment names must still exist in the schema at that path, and every
//     value must still be one the schema accepts there: a legal member of
//     an `enum`, and a string that satisfies whatever `pattern`, `format`
//     or length bound the schema declares. A renamed field, a dropped enum
//     value, or a value parseManifest would reject fails this exactly as
//     it would fail full validation on a complete manifest.
//
//     The value half was added after `pattern` and `format` were found to
//     be walked straight past: the check confirmed a field still existed
//     and stopped, so `id: Board` or `added: 24/08/2026` in the fragment
//     would ship green. Both are now proven red against the real file (see
//     "the fragment walk itself catches drift" below for the synthetic
//     cases that keep it that way).
//
// What this file does NOT cover, deliberately, so nobody reads it as
// wider than it is: SKILL.md's fenced *shell* blocks — the `catalogus ...`
// lines an agent copies verbatim. Those name commands, flags and settable
// fields, which are @catalogus/cli's surface, not this package's, and this
// package cannot import the CLI (the dependency runs the other way).
// packages/cli/src/skill-commands-drift.test.ts is where they are checked.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { parseManifest } from "./validate.js";
import type { CatalogusManifestError } from "./validate.js";
import { catalogusSchemaV1 } from "./schema.js";
import { findRepoRoot } from "./test-utils.js";

const repoRoot = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
const skillPath = join(repoRoot, "skills", "catalogus", "SKILL.md");
const examplesDir = join(repoRoot, "examples");

interface YamlBlock {
  /** 1-based position among all ```yaml blocks found in the file, for error messages. */
  index: number;
  /** True when the fence is immediately preceded by <!-- catalogus:fragment -->. */
  isFragment: boolean;
  content: string;
}

// Matches ```yaml\n<content>\n``` blocks, optionally preceded on the line
// directly above by the <!-- catalogus:fragment --> marker comment. The
// shell-command blocks elsewhere in SKILL.md are fenced with no language
// tag and are ignored by this pattern.
const YAML_FENCE_RE = /(<!--\s*catalogus:fragment\s*-->\s*\r?\n)?```yaml\r?\n([\s\S]*?)\r?\n```/g;

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

function formatErrors(errors: CatalogusManifestError[]): string {
  return errors.map((e) => `  [${e.kind}] ${e.instancePath || "(root)"}: ${e.message}`).join("\n");
}

// --- schema-field-and-enum walk, for fragments -----------------------------
//
// A deliberately loose structural view of catalogusSchemaV1 -- just enough
// JSON Schema vocabulary to answer "does this property still exist here,
// and if it's an enum, is this value still a member" for an arbitrary
// (possibly incomplete) document. `catalogusSchemaV1` is authored as a
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
  // Value-level constraints. These used to be absent from this view, and
  // their absence was the hole: the walk confirmed a field still *exists*
  // and stopped there, so a fragment could name every field correctly and
  // still be rejected by parseManifest on the value -- `id: Board` against
  // the slug pattern, `added: 24/08/2026` against format: date -- with this
  // test green. Checking existence but not legality is the weaker half of
  // what "agrees with the schema" has to mean for a document an agent
  // reads as a template.
  pattern?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
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

  // A plain scalar leaf. The caller already confirmed the field still
  // exists by finding it in the parent's `properties`; what is left is
  // whether the fragment's *value* is one the schema would accept there.
  checkScalarConstraints(node, value, path, problems);
}

/**
 * The value-level constraints `parseManifest` enforces and a
 * field-existence walk would otherwise skip straight past. Only the
 * vocabulary `catalogusSchemaV1` actually uses is handled -- adding a
 * constraint keyword to the schema that is not handled here silently
 * widens what this test accepts, which is why `schema-sync.test.ts` and
 * `schema.test.ts` cover the schema's own shape and this covers the
 * fragment against it.
 */
function checkScalarConstraints(node: SchemaNode, value: unknown, path: string, problems: string[]): void {
  if (typeof value !== "string") return;

  if (node.pattern !== undefined && !new RegExp(node.pattern, "u").test(value)) {
    problems.push(
      `${path}: ${JSON.stringify(value)} does not match the schema's pattern for this field ` +
        `(${node.pattern}) -- the fragment names the right field but shows a value parseManifest ` +
        "would reject",
    );
  }

  if (node.minLength !== undefined && value.length < node.minLength) {
    problems.push(`${path}: ${JSON.stringify(value)} is shorter than the schema's minLength of ${node.minLength}`);
  }

  if (node.maxLength !== undefined && value.length > node.maxLength) {
    problems.push(`${path}: ${JSON.stringify(value)} is longer than the schema's maxLength of ${node.maxLength}`);
  }

  // `format: "date"` is the only format the schema uses (serviceEntry.added).
  // ajv is the authority at validation time; this mirrors its full-date rule
  // -- YYYY-MM-DD, and a real calendar day, so 2026-02-30 fails here exactly
  // as it does there.
  if (node.format === "date" && !isIsoCalendarDate(value)) {
    problems.push(
      `${path}: ${JSON.stringify(value)} is not an ISO 8601 date (YYYY-MM-DD) -- the schema declares ` +
        'format: "date" on this field',
    );
  }
}

function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
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

const schemaRoot = catalogusSchemaV1 as unknown as SchemaNode;

describe("skills/catalogus/SKILL.md's ```yaml examples vs. packages/schema", () => {
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
        `skills/catalogus/SKILL.md's embedded example manifest (yaml block #${block.index} of ` +
          `${allBlocks.length}) has drifted from packages/schema and no longer validates. The skill is a ` +
          "shipped artifact installed into client repos — as written, it now teaches an agent to write a " +
          "catalogus.yaml the validator rejects, which makes the agent look broken to the client. Update " +
          "skills/catalogus/SKILL.md and packages/schema together so they agree again (see " +
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
    "SKILL.md yaml block #$index (marked <!-- catalogus:fragment -->) uses only field names and enum values the schema still recognizes",
    (block) => {
      let parsed: unknown;
      try {
        parsed = parseYaml(block.content);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `skills/catalogus/SKILL.md's yaml block #${block.index}, marked as a fragment, does not even ` +
            `parse as YAML: ${message}`,
        );
      }
      const problems = checkFragmentAgainstSchemaFields(schemaRoot, parsed);
      expect(
        problems,
        `skills/catalogus/SKILL.md's fragment example (yaml block #${block.index} of ${allBlocks.length}) ` +
          "uses field names or enum values that packages/schema no longer recognizes. The " +
          "<!-- catalogus:fragment --> marker means this snippet is deliberately not a full manifest, but " +
          "its field names and enum values still have to match the schema — update " +
          `skills/catalogus/SKILL.md and packages/schema together so they agree again.\n` +
          problems.map((p) => `  - ${p}`).join("\n"),
      ).toEqual([]);
    },
  );
});

// The walk above is the only thing standing between a fragment and a
// client-repo agent copying a shape parseManifest rejects, and until this
// block existed nothing proved it could fail. That is the failure mode
// docs/PLAN.md's Phase 3.7 recorded twice over (an ICON_OVERLAY key typo
// that no assertion noticed; a rewritten SKILL.md that kept 645 tests
// green): a tripwire that has never been observed red is a tripwire nobody
// has tested. Each case here is a real drift shape -- a renamed field, a
// dropped enum member, a value the schema's own constraints reject -- fed
// through the same function the SKILL.md check calls.
describe("the fragment walk itself catches drift", () => {
  it("passes a fragment that agrees with the schema", () => {
    expect(
      checkFragmentAgainstSchemaFields(schemaRoot, {
        project: { architecture: "modular monolith", vcs: { visibility: "private" } },
        services: [{ id: "supabase-db", service: "supabase", role: "database", added: "2026-08-24" }],
      }),
    ).toEqual([]);
  });

  it("catches a field the schema no longer has", () => {
    // project.pm, removed by HANDOFF.md's 2026-08-24 amendment. This is
    // the check that already worked; pinned here so a refactor of the walk
    // cannot quietly lose it while the new value checks distract.
    const problems = checkFragmentAgainstSchemaFields(schemaRoot, { project: { pm: "trello" } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("/project/pm");
  });

  it("catches an enum value the schema no longer accepts", () => {
    const problems = checkFragmentAgainstSchemaFields(schemaRoot, { services: [{ status: "retired" }] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("phasing_out");
  });

  // The three below are what the walk used to miss entirely: every field
  // name is correct, so the old existence-only walk returned no problems
  // while parseManifest would reject the same document outright.
  it("catches a value the slug pattern rejects", () => {
    const problems = checkFragmentAgainstSchemaFields(schemaRoot, { services: [{ id: "Board" }] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("pattern");
  });

  it("catches a date that is not ISO 8601", () => {
    const problems = checkFragmentAgainstSchemaFields(schemaRoot, { services: [{ added: "24/08/2026" }] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("YYYY-MM-DD");
  });

  it("catches a well-formed date that is not a real calendar day", () => {
    // Shape-only date checking would pass this; ajv's format: "date" does
    // not, so neither does this walk.
    const problems = checkFragmentAgainstSchemaFields(schemaRoot, { services: [{ added: "2026-02-30" }] });
    expect(problems).toHaveLength(1);
  });

  // The walk's own claims about the schema are checked against the real
  // validator rather than asserted: if the slug pattern is relaxed or
  // `added` stops being a date, these stop describing drift and the pair
  // disagrees loudly instead of silently.
  it("agrees with parseManifest about what the schema rejects", () => {
    const badSlug = parseManifest(
      ["catalogus: 1", "project:", "  name: X", "  slug: x", "services:", "  - id: Board", "    service: supabase", "    role: database", "    added: 2026-08-24", "dependencies: []"].join("\n"),
    );
    expect(badSlug.valid, "the slug pattern this walk enforces must be one parseManifest enforces too").toBe(false);

    const badDate = parseManifest(
      ["catalogus: 1", "project:", "  name: X", "  slug: x", "services:", "  - id: board", "    service: supabase", "    role: database", "    added: 24/08/2026", "dependencies: []"].join("\n"),
    );
    expect(badDate.valid, 'format: "date" on `added` must be enforced by parseManifest too').toBe(false);
  });
});

describe("examples/*.catalogus.yaml vs. packages/schema", () => {
  const files = readdirSync(examplesDir)
    .filter((name) => name.endsWith(".catalogus.yaml"))
    .sort();

  it("finds at least one examples/*.catalogus.yaml file to check", () => {
    expect(
      files.length,
      `found no *.catalogus.yaml files directly under ${examplesDir} — expected at least ` +
        "examples/reference.catalogus.yaml. Either it was moved/renamed, or findRepoRoot() resolved the " +
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
