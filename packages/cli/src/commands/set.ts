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
//
// services.<id>.icon (added 2026-09-04, docs/custom-icon-brief.md) is the
// one field here whose value isn't just written -- it names something this
// command fetches or copies and vendors under .catalogus/icons/ before the
// manifest is touched at all; see classifyIconValue and the icon-fetch.ts
// import below for that pipeline.
//
// There is still no `unset` for any field, icon included -- clearing a
// value back to "not answered" (the whole point of CLAUDE.md's "an absent
// field reads as not answered yet") is not a capability this command has.
// A vendored icon file left behind by a value that was later cleared some
// other way is exactly the kind of dangling state that decision would need
// to account for. Open item; nobody has needed it enough yet to design it.
import { isScalar } from "yaml";

import type { IconSourceShape, PreparedIconVendor } from "../icon-fetch.js";
import { commitIconVendor, discardIconVendor, prepareIconVendor } from "../icon-fetch.js";
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
const SERVICE_FIELD = /^services\.([^.]+)\.(role|kind|version|icon)$/;

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
    // `kind`/`hint` here are never actually read -- runSet special-cases
    // `serviceField === "icon"` before it ever reaches prepareValue (see
    // classifyIconValue below), because the eventual node value is a
    // .catalogus/icons/<id>.svg path this command has not fetched or
    // copied yet, not something a synchronous slug/text check could ever
    // produce. This entry exists so SERVICE_FIELD_PLACEHOLDERS -- and
    // through it SETTABLE_FIELDS, which the `set` command's own --help
    // text and the unknown-field message both read off this table -- lists
    // "services.<id>.icon" at all.
    icon: { path: [], kind: "text", hint: "an https:// URL to fetch, or a path to a local SVG file to copy" },
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

type PreparedIconValue = { ok: true; shape: IconSourceShape } | { ok: false; error: CommandResult };

/**
 * The two shapes `services.<id>.icon` accepts: an `https://` URL to fetch,
 * or a path to a local SVG file to copy. Checked here, by string shape
 * alone, before the manifest is even opened -- the same "usage error before
 * any I/O" property prepareValue already gives every other field. Kept as a
 * sibling to prepareValue rather than a branch inside it because the
 * eventual node value (a `.catalogus/icons/<id>.svg` path) can't be known
 * until the bytes are actually fetched or copied -- that I/O is
 * icon-fetch.ts's job, run later in runSet, after every id in this call is
 * confirmed to exist (see the vendoring pass below).
 *
 * "Anything else" -- `http://`, `ftp:`, a bare `thesvg:` ref, a bare word
 * with no dot or slash in it -- is refused here rather than let through as
 * a "path" that would just fail later at the filesystem. A scheme other
 * than https is caught by requiring at least two characters before the
 * colon, so a Windows drive letter ("C:\Users\...", "D:/icons/x.svg") is
 * never mistaken for one (drive letters are always exactly one character);
 * a value shaped like a catalog slug (isValidSlug: lowercase, digits,
 * single - or _ separators, no dot, no slash) reads as the mistake it
 * almost certainly is -- there is no thesvg registry to look a bare slug up
 * in (the owner declined that coupling, see this file's -- and
 * docs/custom-icon-brief.md's -- own history) -- rather than an ambiguous
 * path, because a real SVG file path on disk almost always carries a "."
 * (an extension) or a "/" (a directory) that a bare slug never does.
 *
 * D7 (validator, 2026-09-04): hasBlockingPrivateFreeText now runs only
 * inside the https:// branch below, not unconditionally over `value` the
 * way it did before. Unconditional, it refused a perfectly ordinary local
 * path outright -- an absolute path passing through a directory whose name
 * happens to look credential-shaped by coincidence (a hashed temp/scratch
 * directory, a UUID-named build output) tripped the guard's entropy
 * heuristics at exit 2, "looks like private data", even though no value
 * the caller typed was ever going to reach a committed file: icon-fetch.ts's
 * own PreparedIconVendor.comment doc records that a path source gets no
 * YAML comment at all. There was nothing here for the guard to protect. A
 * URL is the opposite case, which is exactly why the guard stays for it:
 * prepareIconVendor writes the URL itself into a comment on success, so a
 * presigned URL (a credential in the query string) or a userinfo URL
 * (`https://user:pass@host/...`) is precisely the shape
 * scanFreeTextForPrivateValues exists to catch, and refusing it here --
 * before any fetch, before any byte leaves this machine -- is the correct,
 * safe outcome, not a hole this fix reopens.
 */
function classifyIconValue(field: string, value: string): PreparedIconValue {
  if (value.trim() === "") {
    return { ok: false, error: usageError([`"${field}" cannot be set to an empty value.`]) };
  }

  if (/^https:\/\//i.test(value)) {
    if (hasBlockingPrivateFreeText(value)) {
      return { ok: false, error: usageError([privateFlagRefusalMessage(`the value given for ${field}`)]) };
    }
    return { ok: true, shape: { kind: "url", url: value } };
  }

  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value)?.[1];
  const looksLikeAnotherScheme = scheme !== undefined && scheme.length > 1;
  if (looksLikeAnotherScheme || isValidSlug(value)) {
    return {
      ok: false,
      error: usageError([
        `"${value}" is not a shape "${field}" accepts -- give an https:// URL to fetch, or a path to a local SVG file to copy.`,
      ]),
    };
  }

  // Path shape: the private-free-text guard never runs against it (see
  // this function's own doc comment, D7) -- a value that is never written
  // anywhere has nothing for that guard to be protecting.
  return { ok: true, shape: { kind: "path", path: value } };
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
  /** Which per-entry field: "role", "kind", "version" or "icon". Set with serviceId. */
  serviceField?: string;
  /**
   * Set only for services.<id>.icon, to the shape classifyIconValue
   * produced -- carries the raw URL or path through to the vendoring pass
   * below, since `node` can't hold the real value yet (it isn't known
   * until the bytes are fetched or copied).
   */
  iconShape?: IconSourceShape;
  /**
   * Set only for services.<id>.icon, once the vendoring pass below has
   * fetched or copied its bytes successfully -- the YAML comment
   * (icon-fetch.ts's PreparedIconVendor.comment) to attach to the node
   * after doc.setIn writes it, or undefined for a local-path source, which
   * gets no comment at all (see icon-fetch.ts's own doc on why).
   */
  iconComment?: string;
}

/**
 * `tokens` is the flat positional list: field, value, field, value, ...
 * Every value's shape is checked before the manifest is opened, so a typo
 * in the second pair never leaves the first one half-written. What cannot
 * be checked this early is whether a services.<id>.* edit names a real
 * id -- that needs the manifest open -- so runSet checks all of those
 * before writing any of them too, in a second pass below.
 *
 * `fetchImpl` is threaded through to services.<id>.icon's vendoring pass
 * (icon-fetch.ts's prepareIconVendor) and defaults to `globalThis.fetch`;
 * it exists so tests never open a real socket to exercise this command.
 */
export async function runSet(
  pathArg: string | undefined,
  tokens: string[],
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<CommandResult> {
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

    if (serviceField === "icon") {
      const classified = classifyIconValue(field, value);
      if (!classified.ok) {
        return classified.error;
      }
      // `node` stays unset until the vendoring pass below (after every id
      // in this call is confirmed to exist) fetches or copies the bytes
      // and learns the real .catalogus/icons/<id>.svg path to write.
      edits.push({ field, node: undefined, shown: value, path: [], serviceId, serviceField, iconShape: classified.shape });
      continue;
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

  // services.<id>.icon edits vendor their bytes now -- fetched over the
  // network, or copied from a local path -- but only after every id in
  // this call is confirmed to exist by the loop just above: an unknown id
  // must refuse before any fetch happens, the same property the
  // field-shape checks earlier in this function already give every other
  // kind of mistake (see this file's own module comment).
  //
  // Every icon edit is only *staged* here -- prepareIconVendor writes its
  // sanitised bytes to a temp file under .catalogus/icons/ without ever
  // touching the real destination path. The rename that actually commits a
  // staged file happens below, only after commitManifestEdit has proven
  // the whole edited document still validates: writing the real file
  // *before* that check passes would mean an edit refused for an unrelated
  // reason (a different pair in the same call) could still leave a
  // vendored icon sitting on disk with no manifest field pointing at it.
  // If any icon in this call fails to prepare, every icon that already did
  // prepare in the same call is discarded (discardIconVendor) rather than
  // left as a dangling temp file, and the manifest is never opened for
  // writing at all.
  //
  // D1/D2 (validator, 2026-09-04): everything from here through the
  // commitManifestEdit call below runs inside one try/catch, and the catch
  // discards every icon staged so far before rethrowing. Before this fix,
  // the discard above (on a returned `{ ok: false }`) and the discard below
  // (on a non-zero exit code) were the *only* two cleanup paths, and both
  // require the failing step to return normally -- neither one runs when a
  // step throws instead. Two different throws reached this function
  // unguarded: commitManifestEdit itself (writeManifestText hitting a
  // read-only catalogus.yaml -- EPERM -- reproduced against the built
  // binary with `attrib +R`), and prepareIconVendor's own fetch pipeline
  // when a response's body stalls until the 15s AbortSignal.timeout fires
  // mid-read (icon-fetch.ts's readBodyCapped, fixed the same day to frame
  // that failure as a normal `{ ok: false }` result rather than an
  // uncaught rejection -- see its own comment). This catch is deliberately
  // broader than either single cause: it is the general fix the D1 report
  // asked for ("discard in a finally-shaped path so any exit other than a
  // successful commit removes every staged temp file"), not a special case
  // for whichever throw was reproduced first. The original error is
  // rethrown unchanged so the caller still sees it exactly as before this
  // fix (cli.ts's runCli prints its message and exits 1) -- this only ever
  // adds a cleanup step in front of that, never changes what gets reported.
  const iconEdits = edits.filter((edit) => edit.iconShape !== undefined);
  const preparedIcons: PreparedIconVendor[] = [];
  try {
    for (const edit of iconEdits) {
      const prepared = await prepareIconVendor(
        location.dir,
        edit.serviceId as string,
        edit.iconShape as IconSourceShape,
        fetchImpl
      );
      if (!prepared.ok) {
        await Promise.all(preparedIcons.map((value) => discardIconVendor(value)));
        return { exitCode: 1, stdout: [], stderr: [`"${edit.field}": ${prepared.message}`] };
      }
      preparedIcons.push(prepared.value);
      edit.node = prepared.value.relativePath;
      // Overwrites the raw URL/path the caller typed with what was
      // actually written -- every other field's `shown` is already the
      // value now on disk (prepareValue sets it from the same node it
      // returns), and an icon edit's success report should say the same
      // kind of thing: what `catalogus view` will read, not what the
      // caller happened to type.
      edit.shown = prepared.value.relativePath;
      edit.iconComment = prepared.value.comment;
    }

    for (const edit of edits) {
      // setIn creates any missing intermediate map (project.vcs on a
      // manifest that has never named a provider), which is what makes
      // this work on a freshly scaffolded file rather than only on one
      // that already has the shape.
      doc.setIn(edit.path, doc.createNode(edit.node));
      // The fetch date and (query/fragment-stripped) source URL, recorded
      // as a YAML comment on the node `set` just wrote -- see
      // icon-fetch.ts's PreparedIconVendor.comment for why a local-path
      // source gets no comment at all.
      if (edit.iconComment !== undefined) {
        const written = doc.getIn(edit.path, true);
        if (isScalar(written)) {
          written.comment = ` ${edit.iconComment}`;
        }
      }
    }

    const described = edits.map((edit) => `${edit.field} = ${edit.shown}`);
    const result = await commitManifestEdit(opened.value, {
      failurePrefix: `Setting ${edits.map((edit) => edit.field).join(", ")} would make`,
      successLines: (filePath) => [`Updated ${filePath}`, ...described.map((line) => `  ${line}`)],
    });

    // Only now does a staged icon become the real .catalogus/icons/<id>.svg
    // file -- see the comment above the preparation loop for why this has
    // to wait for commitManifestEdit's own verdict rather than running
    // alongside it.
    if (result.exitCode === 0) {
      for (const prepared of preparedIcons) {
        await commitIconVendor(prepared);
      }
    } else {
      await Promise.all(preparedIcons.map((prepared) => discardIconVendor(prepared)));
    }

    return result;
  } catch (error) {
    await Promise.all(preparedIcons.map((prepared) => discardIconVendor(prepared)));
    // Exit 1 with the manifest named, not a rethrow: every other failure
    // on this path names what could not be done, and the re-validation of
    // 2026-09-04 found a read-only catalogus.yaml surfacing as the bare
    // "EPERM: operation not permitted, open '...'" out of runCli's generic
    // catch. The staged icons are already discarded above, so this is the
    // one remaining thing the caller needs to know.
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`could not update ${location.filePath}: ${message}`, "  nothing was written; any icon staged by this call was discarded."],
    };
  }
}
