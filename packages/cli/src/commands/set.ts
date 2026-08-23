// `dagstree set <field> <value> [<field> <value> ...]` -- writes manifest
// fields whose first value is a guess only a human can correct, wherever
// that guess got written down.
//
// Why it exists: writing the agent skill surfaced five fields (architecture,
// pm, vcs.provider, vcs.visibility, coding_agents) with no command behind
// them, so an agent had to hand-edit the YAML and then validate.
// Hand-editing is how a manifest ends up with a field the schema rejects, or
// with a cost figure in an architecture note. With this, the CLI is the only
// writer -- which is the property the whole design wants.
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
  "project.name": { path: ["project", "name"], kind: "text" },
  // Changing project.slug is safe today and will not stay safe. Nothing
  // inside a manifest references it -- service ids are local to the file,
  // so a slug rename cannot dangle an edge or a replaced_by the way a
  // service id rename would. But Phase 4/5 (docs/PLAN.md) makes the slug
  // the key the backend's project row is keyed on, and `dagstree push`
  // does not exist yet to have an opinion about what a rename after that
  // should do -- migrate the row, refuse the rename, something else.
  // Whoever adds `push` has to decide that then; this command only knows
  // the schema's rule, which is that project.slug is a slug.
  "project.slug": { path: ["project", "slug"], kind: "slug" },
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

/**
 * `services.<id>.role` is the one settable field whose name is not static:
 * `<id>` is a local id chosen when that entry was added, not a fixed
 * vocabulary FIELDS can enumerate. Its value's shape -- a slug, same as the
 * schema's `role` -- is known up front and checked the same way every other
 * value is, before the manifest is even opened. Whether `<id>` actually
 * names an entry in *this* manifest can only be known once the manifest is
 * open, so that half of the check waits for the resolution pass in runSet
 * below, the same way `link`, `deprecate` and `remove` can only check a
 * known id after opening.
 */
const SERVICE_ROLE_FIELD = /^services\.([^.]+)\.role$/;

/** Shown in place of a literal field name in usage/error text -- see SETTABLE_FIELDS. */
const SERVICE_ROLE_PLACEHOLDER = "services.<id>.role";

const SERVICE_ROLE_SPEC: SettableField = {
  // Never read: services.<id>.role has no fixed path until <id> resolves to
  // a real index, which only happens once the manifest is open. Kept here
  // only so prepareValue can be reused unchanged for both the static and
  // the dynamic field.
  path: [],
  kind: "slug",
  hint: "e.g. database, hosting-api, auth",
};

// The static field names, sorted, with the one pattern appended rather than
// interleaved. Sorting it in alphabetically would bury it among the
// project.* names, where a scanning eye reads it as one more literal and
// tries to type "services.<id>.role" verbatim as a field name instead of a
// shape to fill in.
export const SETTABLE_FIELDS = [...Object.keys(FIELDS).sort(), SERVICE_ROLE_PLACEHOLDER];

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
  /** Set only for a services.<id>.role edit; undefined for every static field. */
  serviceId?: string;
}

/**
 * `tokens` is the flat positional list: field, value, field, value, ...
 * Every value's shape is checked before the manifest is opened, so a typo
 * in the second pair never leaves the first one half-written. What cannot
 * be checked this early is whether a services.<id>.role edit names a real
 * id -- that needs the manifest open -- so runSet checks all of those
 * before writing any of them too, in a second pass below.
 */
export async function runSet(pathArg: string | undefined, tokens: string[]): Promise<CommandResult> {
  if (tokens.length === 0 || tokens.length % 2 !== 0) {
    return usageError([
      "set takes <field> <value> pairs, e.g. " +
        'dagstree set project.vcs.provider github project.vcs.visibility private',
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

    const serviceRoleMatch = SERVICE_ROLE_FIELD.exec(field);
    if (!serviceRoleMatch) {
      return usageError([`Unknown field "${field}".`, `  settable fields: ${SETTABLE_FIELDS.join(", ")}`]);
    }
    if (seen.has(field)) {
      return usageError([`"${field}" was given twice in one call; set it once.`]);
    }
    seen.add(field);

    const serviceId = serviceRoleMatch[1] as string;
    if (!isValidSlug(serviceId)) {
      return usageError([
        `"${serviceId}" is not a valid local id in "${field}" (lowercase letters, digits, single - or _ separators).`,
      ]);
    }

    const prepared = prepareValue(field, SERVICE_ROLE_SPEC, value);
    if (!prepared.ok) {
      return prepared.error;
    }
    edits.push({ field, node: prepared.node, shown: prepared.shown, path: [], serviceId });
  }

  const opened = await openManifestForEdit(pathArg);
  if (!opened.ok) {
    return opened.error;
  }
  const { location, manifest, doc } = opened.value;

  // services.<id>.role edits could not be checked against real ids until
  // the manifest was open. Resolve and check every one of them now, before
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
    edit.path = ["services", index, "role"];
  }

  for (const edit of edits) {
    // setIn creates any missing intermediate map (project.vcs on a manifest
    // that has never named a provider), which is what makes this work on a
    // freshly scaffolded file rather than only on one that already has the
    // shape.
    doc.setIn(edit.path, doc.createNode(edit.node));
  }

  const described = edits.map((edit) => `${edit.field} = ${edit.shown}`);
  return commitManifestEdit(doc, location, {
    failurePrefix: `Setting ${edits.map((edit) => edit.field).join(", ")} would make`,
    successLines: (filePath) => [`Updated ${filePath}`, ...described.map((line) => `  ${line}`)],
  });
}
