// `catalogus set <field> <value> [<field> <value> ...]` -- writes manifest
// fields whose first value is a guess only a human can correct, wherever
// that guess got written down.
//
// Why it exists: writing the agent skill surfaced fields (architecture,
// pm, vcs.provider, vcs.visibility, coding_agents -- the first three of
// which have since moved to service entries, see FIELDS below) with no
// command behind them, so an agent had to hand-edit the YAML and then
// validate. Hand-editing is how a manifest ends up with a field the schema
// rejects, or with a cost figure in an architecture note. With this, the
// CLI is the only writer -- which is the property the whole design wants.
//
// project.name and project.slug used to be excluded here on the theory that
// `init` owns them: it writes both, once, when the manifest is scaffolded.
// That reasoning only held if init's guess was always right, and it is not
// -- `init --yes` derives both from the directory name, init runs exactly
// once, and nothing could revise them afterward. The first cold run of the
// skill against a real repo hit exactly this: a wrong project.name, no
// command able to fix it, and hand-editing forbidden by the skill, so the
// agent correctly stopped rather than take the one move left to it. The
// principle that survives is narrower than "init owns what it writes
// first": a field belongs here when its first value was a guess that only a
// human can correct, whichever command happened to write that guess down.
// `init` writing project.name and project.slug first does not make them
// init's forever, any more than `add` writing a role would make role add's
// forever -- see services.<id>.role below, and docs/PLAN.md's remove
// section, for the second field this same principle reaches. What still
// belongs to one command alone is the field whose every value that command
// will ever write is created new, not first guessed and then possibly
// wrong: a service entry beyond its role stays `add`'s, an edge stays
// `link`'s, lifecycle stays `deprecate`'s.
//
// Why it takes more than one pair: originally because the schema required
// `project.vcs` to carry *both* provider and visibility, so a strictly
// one-field-per-call setter could never write it at all in either order.
// `project.vcs` carries only `visibility` now (2026-08-24 -- the provider is
// a service entry, see FIELDS's comment above), so that specific coupling is
// gone, but the capability stays: unrelated fields still benefit from one
// validation pass instead of several (project.name and project.slug
// together, or several services.<id>.* edits in one call). Trailing pairs
// are applied as a single edit, and the manifest is validated once at the
// end.
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
 * the schema's slug pattern.
 *
 * There used to be a third kind here, `slug-list` (a comma-separated list of
 * slugs), for project.coding_agents -- the only field that ever needed it.
 * Removed along with that field on 2026-08-24 (coding agents are service
 * entries now, one `add` call each, not a list written in one `set`); no
 * other field has needed a list shape since, so it stays gone rather than
 * kept as an untested, unreachable branch of prepareValue below.
 */
type FieldKind = "text" | "slug";

interface SettableField {
  /** Path into the document, e.g. ["project", "vcs", "visibility"]. */
  path: string[];
  kind: FieldKind;
  /** What the schema will accept. Shown when a value is rejected. */
  hint?: string;
}

// Null-prototype, not a plain object literal, and this one is not
// precautionary: `FIELDS[field]` below reads a key that comes straight off
// the command line. On a literal, `catalogus set constructor boom` resolved
// through Object.prototype to the `Object` function -- truthy, so the
// known-field branch ran, `staticSpec.path` was undefined, and the caller
// got `[schema] / must be object` at exit 1 instead of the
// `Unknown field "constructor"` list at exit 2. Same for toString, valueOf
// and __proto__. Nothing was ever written (manifest-edit.ts validates before
// it writes, and that guard held), so this was a wrong-diagnostic bug rather
// than a corruption one -- but the message it produced pointed at the
// manifest, which is the one place the problem was not.
//
// Fourth instance of this defect class in this repo (getCatalogEntry,
// GLYPHS, ROLLUP_LABELS, StatusPill), and the first found on the CLI side
// rather than the viewer. See CLAUDE.md's standing rule: any keyed lookup
// gets Object.create(null) and a test naming "constructor".
const FIELDS: Record<string, SettableField> = Object.assign(
  Object.create(null) as Record<string, SettableField>,
  {
    "project.name": { path: ["project", "name"], kind: "text" },
    // Changing project.slug is safe today and will not stay safe. Nothing
    // inside a manifest references it -- service ids are local to the file,
    // so a slug rename cannot dangle an edge or a replaced_by the way a
    // service id rename would. But Phase 4/5 (docs/PLAN.md) makes the slug
    // the key the backend's project row is keyed on, and `catalogus push`
    // does not exist yet to have an opinion about what a rename after that
    // should do -- migrate the row, refuse the rename, something else.
    // Whoever adds `push` has to decide that then; this command only knows
    // the schema's rule, which is that project.slug is a slug.
    "project.slug": { path: ["project", "slug"], kind: "slug" },
    "project.architecture": { path: ["project", "architecture"], kind: "text" },
    // project.pm, project.vcs.provider and project.coding_agents were removed
    // from the schema on 2026-08-24 (see HANDOFF.md's amendment log): a
    // project-level field can never be an edge target, and each of these three
    // names something with an identity and an icon -- a PM tool, a VCS host, a
    // coding agent product -- exactly the shape a service entry already
    // covers. They are `catalogus add <slug> --role pm|vcs|coding-agent` now,
    // not `set` targets. `project.vcs` keeps only `visibility` below.
    "project.vcs.visibility": {
      path: ["project", "vcs", "visibility"],
      kind: "slug",
      hint: "public | private | internal",
    },
  },
);

/**
 * The per-entry settable fields are the ones whose name is not static:
 * `<id>` is a local id chosen when that entry was added, not a fixed
 * vocabulary FIELDS can enumerate. Each value's shape is known up front and
 * checked the same way every other value is, before the manifest is even
 * opened. Whether `<id>` actually names an entry in *this* manifest can only
 * be known once the manifest is open, so that half of the check waits for
 * the resolution pass in runSet below, the same way `link`, `deprecate` and
 * `remove` can only check a known id after opening.
 */
const SERVICE_FIELD = /^services\.([^.]+)\.(role|kind|version)$/;

// Null-prototype for the same reason as FIELDS, though the exposure here is
// narrower: this is read with SERVICE_FIELD's second capture group, which
// the pattern already constrains to role|kind|version. Built the same way
// anyway rather than left as the one table that has to be argued safe --
// the argument is what has failed three times.
const SERVICE_FIELD_SPECS: Record<string, SettableField> = Object.assign(
  Object.create(null) as Record<string, SettableField>,
  {
    // `path` is never read on any of these: a per-entry field has no fixed
    // path until <id> resolves to a real index, which only happens once the
    // manifest is open. Kept so prepareValue can be reused unchanged for both
    // the static and the dynamic fields.
    role: { path: [], kind: "slug", hint: "e.g. database, hosting-api, auth" },
    kind: { path: [], kind: "slug", hint: "service | component | stack" },
    // Free text, not a slug: "13.1.3" and "19.2" both have dots in them, and
    // a version is a label to display rather than an identifier to resolve.
    version: { path: [], kind: "text", hint: 'e.g. 10, 19.2, 13.1.3' },
  },
);

/** Shown in place of a literal field name in usage/error text -- see SETTABLE_FIELDS. */
const SERVICE_FIELD_PLACEHOLDERS = Object.keys(SERVICE_FIELD_SPECS).map((name) => `services.<id>.${name}`);

// The three fields the 2026-08-24 amendment moved to service entries (see
// FIELDS's own comment above). A caller still typing the old field name gets
// a message naming exactly what replaced it, the same way @catalogus/schema's
// validate.ts does for a manifest still holding the old shape -- not the
// generic "Unknown field" list below, which would leave them to guess.
// Null-prototype: also read with a raw command-line key, one branch below
// FIELDS, so it carried the same bug for the same reason.
const MOVED_FIELD_HINTS: Record<string, string> = Object.assign(
  Object.create(null) as Record<string, string>,
  {
    "project.pm": 'PM tooling is a service entry now -- use, e.g., "catalogus add trello --role pm".',
    "project.vcs.provider":
      'the VCS provider is a service entry now -- use, e.g., "catalogus add github --role vcs".',
    "project.coding_agents":
      'coding agents are service entries now, one per agent -- use, e.g., "catalogus add claude-code --role coding-agent".',
  },
);

// The static field names, sorted, with the patterns appended rather than
// interleaved. Sorting them in alphabetically would bury them among the
// project.* names, where a scanning eye reads them as literals and tries to
// type "services.<id>.role" verbatim as a field name instead of as a shape
// to fill in.
export const SETTABLE_FIELDS = [...Object.keys(FIELDS).sort(), ...SERVICE_FIELD_PLACEHOLDERS];

// Mirrors the schema's serviceEntry.kind enum. Checked here rather than left
// to the post-write validate so the message names the three words the caller
// can actually type.
const VALID_KINDS = new Set(["service", "component", "stack"]);

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

interface PreparedEdit {
  field: string;
  node: unknown;
  shown: string;
  /**
   * Path into the document. For a static field this is fixed from FIELDS.
   * For services.<id>.role it starts as a placeholder and is overwritten
   * once the manifest is open and <id> is confirmed to name a real entry
   * -- see the resolution pass in runSet.
   */
  path: Array<string | number>;
  /** Set only for a per-entry services.<id>.* edit; undefined for every static field. */
  serviceId?: string;
  /** Which per-entry field: "role", "kind" or "version". Set with serviceId. */
  serviceField?: string;
}

/**
 * `tokens` is the flat positional list: field, value, field, value, ...
 * Every value's shape is checked before the manifest is opened, so a typo
 * in the second pair never leaves the first one half-written. What cannot
 * be checked this early is whether a services.<id>.* edit names a real
 * id -- that needs the manifest open -- so runSet checks all of those
 * before writing any of them too, in a second pass below.
 */
export async function runSet(pathArg: string | undefined, tokens: string[]): Promise<CommandResult> {
  if (tokens.length === 0 || tokens.length % 2 !== 0) {
    return usageError([
      "set takes <field> <value> pairs, e.g. " +
        'catalogus set project.architecture "modular monolith" project.vcs.visibility private',
      `  settable fields: ${SETTABLE_FIELDS.join(", ")}`,
    ]);
  }

  const edits: PreparedEdit[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < tokens.length; i += 2) {
    const field = tokens[i] as string;
    const value = tokens[i + 1] as string;

    const staticSpec = FIELDS[field];
    if (staticSpec) {
      // Two values for one field in one call is a typo, not an intent --
      // and silently keeping the last one hides it.
      if (seen.has(field)) {
        return usageError([`"${field}" was given twice in one call; set it once.`]);
      }
      seen.add(field);

      const prepared = prepareValue(field, staticSpec, value);
      if (!prepared.ok) {
        return prepared.error;
      }
      edits.push({ field, node: prepared.node, shown: prepared.shown, path: staticSpec.path });
      continue;
    }

    const movedHint = MOVED_FIELD_HINTS[field];
    if (movedHint) {
      return usageError([`"${field}" is no longer a settable field -- ${movedHint}`]);
    }

    const serviceFieldMatch = SERVICE_FIELD.exec(field);
    if (!serviceFieldMatch) {
      return usageError([`Unknown field "${field}".`, `  settable fields: ${SETTABLE_FIELDS.join(", ")}`]);
    }
    if (seen.has(field)) {
      return usageError([`"${field}" was given twice in one call; set it once.`]);
    }
    seen.add(field);

    const serviceId = serviceFieldMatch[1] as string;
    const serviceField = serviceFieldMatch[2] as string;
    if (!isValidSlug(serviceId)) {
      return usageError([
        `"${serviceId}" is not a valid local id in "${field}" (lowercase letters, digits, single - or _ separators).`,
      ]);
    }

    if (serviceField === "kind" && !VALID_KINDS.has(value)) {
      return usageError([`"${field}" must be one of: ${[...VALID_KINDS].join(", ")}`]);
    }

    const prepared = prepareValue(field, SERVICE_FIELD_SPECS[serviceField] as SettableField, value);
    if (!prepared.ok) {
      return prepared.error;
    }
    edits.push({ field, node: prepared.node, shown: prepared.shown, path: [], serviceId, serviceField });
  }

  const opened = await openManifestForEdit(pathArg);
  if (!opened.ok) {
    return opened.error;
  }
  const { location, manifest, doc } = opened.value;

  // Per-entry services.<id>.* edits could not be checked against real ids
  // until the manifest was open. Resolve and check every one of them now, before
  // any doc.setIn runs, so an unknown id in a later pair still leaves an
  // earlier, valid pair unwritten -- the same property the field-shape
  // checks above already give every other kind of mistake.
  const serviceIndexById = new Map(manifest.services.map((service, index) => [service.id, index]));
  for (const edit of edits) {
    if (edit.serviceId === undefined) {
      continue;
    }
    const index = serviceIndexById.get(edit.serviceId);
    if (index === undefined) {
      const known = [...serviceIndexById.keys()].sort().join(", ") || "(none yet)";
      return {
        exitCode: 1,
        stdout: [],
        stderr: [`no service with id "${edit.serviceId}" exists in ${location.filePath}.`, `  known ids: ${known}`],
      };
    }
    edit.path = ["services", index, edit.serviceField as string];
  }

  for (const edit of edits) {
    // setIn creates any missing intermediate map (project.vcs on a manifest
    // that has never named a provider), which is what makes this work on a
    // freshly scaffolded file rather than only on one that already has the
    // shape.
    doc.setIn(edit.path, doc.createNode(edit.node));
  }

  const described = edits.map((edit) => `${edit.field} = ${edit.shown}`);
  return commitManifestEdit(opened.value, {
    failurePrefix: `Setting ${edits.map((edit) => edit.field).join(", ")} would make`,
    successLines: (filePath) => [`Updated ${filePath}`, ...described.map((line) => `  ${line}`)],
  });
}
