// `dagstree set <field> <value> [<field> <value> ...]` -- writes the handful
// of Layer 2 project fields that no other command owns.
//
// Why it exists: writing the agent skill surfaced five fields (architecture,
// pm, vcs.provider, vcs.visibility, coding_agents) with no command behind
// them, so an agent had to hand-edit the YAML and then validate.
// Hand-editing is how a manifest ends up with a field the schema rejects, or
// with a cost figure in an architecture note. With this, the CLI is the only
// writer -- which is the property the whole design wants.
//
// Why it takes more than one pair: the schema requires `project.vcs` to
// carry *both* provider and visibility. Setting either one alone on a
// manifest that has neither produces a half-built object the validator
// rejects, in both orders, so a strictly one-field-per-call setter could
// never write vcs at all. Trailing pairs are applied as a single edit, and
// the manifest is validated once at the end.
//
// Why the target directory is `--path` here rather than a positional
// `[path]` like every other command: the pair list is variadic, so a
// trailing directory would be swallowed into it as a field name -- the exact
// mistake `add` hit with `--depends-on` (see docs/PLAN.md, Phase 3.5).
import { commitManifestEdit, openManifestForEdit } from "../manifest-edit.js";
import { hasBlockingPrivateFreeText, privateFlagRefusalMessage } from "../private-guard.js";
import { isValidSlug } from "../slug.js";
import type { CommandResult } from "../types.js";

/**
 * How a settable field is written. `text` is free prose; `slug` must satisfy
 * the schema's slug pattern; `slug-list` is a comma-separated list of them.
 *
 * Only fields no other command owns are listed. `project.name` and
 * `project.slug` belong to `init`, service entries to `add`, edges to
 * `link`, lifecycle to `deprecate` -- a second writer for any of those would
 * be a second place for the rules to drift.
 */
type FieldKind = "text" | "slug" | "slug-list";

interface SettableField {
  /** Path into the document, e.g. ["project", "vcs", "provider"]. */
  path: string[];
  kind: FieldKind;
  /** What the schema will accept. Shown when a value is rejected. */
  hint?: string;
}

const FIELDS: Record<string, SettableField> = {
  "project.architecture": { path: ["project", "architecture"], kind: "text" },
  "project.pm": { path: ["project", "pm"], kind: "text" },
  "project.vcs.provider": {
    path: ["project", "vcs", "provider"],
    kind: "slug",
    hint: "e.g. github, gitlab, bitbucket",
  },
  "project.vcs.visibility": {
    path: ["project", "vcs", "visibility"],
    kind: "slug",
    hint: "public | private | internal",
  },
  "project.coding_agents": {
    path: ["project", "coding_agents"],
    kind: "slug-list",
    hint: "comma-separated, e.g. claude-code,codex",
  },
};

export const SETTABLE_FIELDS = Object.keys(FIELDS).sort();

function usageError(lines: string[]): CommandResult {
  return { exitCode: 2, stdout: [], stderr: lines };
}

type PreparedValue = { ok: true; node: unknown; shown: string } | { ok: false; error: CommandResult };

function prepareValue(field: string, spec: SettableField, value: string): PreparedValue {
  if (value.trim() === "") {
    return { ok: false, error: usageError([`"${field}" cannot be set to an empty value.`]) };
  }

  // Layer 3 data must never reach a committed file. The same guard runs
  // again over the whole document before the write (commitManifestEdit), but
  // refusing here names the value the user actually typed rather than
  // reporting a path inside the manifest.
  if (hasBlockingPrivateFreeText(value)) {
    return { ok: false, error: usageError([privateFlagRefusalMessage(`the value given for ${field}`)]) };
  }

  if (spec.kind === "text") {
    return { ok: true, node: value, shown: value };
  }

  if (spec.kind === "slug") {
    if (!isValidSlug(value)) {
      return {
        ok: false,
        error: usageError([
          `"${value}" is not a valid slug for ${field} (lowercase letters, digits, single - or _ separators).` +
            (spec.hint ? ` ${spec.hint}` : ""),
        ]),
      };
    }
    return { ok: true, node: value, shown: value };
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length === 0) {
    return {
      ok: false,
      error: usageError([`"${field}" needs at least one value${spec.hint ? ` (${spec.hint})` : ""}.`]),
    };
  }
  const invalid = items.filter((item) => !isValidSlug(item));
  if (invalid.length > 0) {
    return {
      ok: false,
      error: usageError([
        `${field} takes slugs; these are not: ${invalid.map((item) => `"${item}"`).join(", ")}.` +
          (spec.hint ? ` ${spec.hint}` : ""),
      ]),
    };
  }
  return { ok: true, node: items, shown: items.join(", ") };
}

/**
 * `tokens` is the flat positional list: field, value, field, value, ...
 * Every value is checked before the manifest is opened, so a typo in the
 * second pair never leaves the first one half-written.
 */
export async function runSet(pathArg: string | undefined, tokens: string[]): Promise<CommandResult> {
  if (tokens.length === 0 || tokens.length % 2 !== 0) {
    return usageError([
      "set takes <field> <value> pairs, e.g. " +
        'dagstree set project.vcs.provider github project.vcs.visibility private',
      `  settable fields: ${SETTABLE_FIELDS.join(", ")}`,
    ]);
  }

  const edits: Array<{ field: string; spec: SettableField; node: unknown; shown: string }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < tokens.length; i += 2) {
    const field = tokens[i] as string;
    const value = tokens[i + 1] as string;

    const spec = FIELDS[field];
    if (!spec) {
      return usageError([`Unknown field "${field}".`, `  settable fields: ${SETTABLE_FIELDS.join(", ")}`]);
    }
    // Two values for one field in one call is a typo, not an intent -- and
    // silently keeping the last one hides it.
    if (seen.has(field)) {
      return usageError([`"${field}" was given twice in one call; set it once.`]);
    }
    seen.add(field);

    const prepared = prepareValue(field, spec, value);
    if (!prepared.ok) {
      return prepared.error;
    }
    edits.push({ field, spec, node: prepared.node, shown: prepared.shown });
  }

  const opened = await openManifestForEdit(pathArg);
  if (!opened.ok) {
    return opened.error;
  }
  const { location, doc } = opened.value;

  for (const edit of edits) {
    // setIn creates any missing intermediate map (project.vcs on a manifest
    // that has never named a provider), which is what makes this work on a
    // freshly scaffolded file rather than only on one that already has the
    // shape.
    doc.setIn(edit.spec.path, doc.createNode(edit.node));
  }

  const described = edits.map((edit) => `${edit.field} = ${edit.shown}`);
  return commitManifestEdit(doc, location, {
    failurePrefix: `Setting ${edits.map((edit) => edit.field).join(", ")} would make`,
    successLines: (filePath) => [`Updated ${filePath}`, ...described.map((line) => `  ${line}`)],
  });
}
