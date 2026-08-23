// `dagstree add <service> --role <role> [--depends-on <id>...] [--id <id>]`
// -- adds a service entry (and any dependency edges) to the manifest. The
// manifest is a human-edited file: this edits the parsed yaml Document in
// place via the `yaml` package's Document API rather than round-tripping
// through a plain object, so comments, key order, and formatting (including
// the $schema modeline) all survive untouched. The result is always
// validated -- schema plus acyclicity, the same check `dagstree validate`
// runs -- before anything is written; a manifest that would fail that check
// is never written, duplicate ids included.
import type { YAMLSeq } from "yaml";

import { commitManifestEdit, openManifestForEdit, preferBlockStyleWhenEmpty } from "../manifest-edit.js";
import { resolveTargetPath } from "../paths.js";
import { hasBlockingPrivateFreeText, privateFlagRefusalMessage } from "../private-guard.js";
import { deriveLocalId, isValidSlug } from "../slug.js";
import type { CommandResult } from "../types.js";

export interface AddCommandOptions {
  role: string;
  id?: string;
  dependsOn?: string[];
  status?: string;
  replacedBy?: string;
  added?: string;
  notes?: string;
}

const VALID_STATUSES = new Set(["active", "deprecated", "phasing_out", "removed"]);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reconciles `add`'s optional positional [path] (added so `add` matches
 * every other command's surface -- init/detect/diff/validate/graph all take
 * `[path]`) with the pre-existing `--path <path>` flag, kept working as an
 * alias for anything already scripted against it. When a caller gives both
 * and they don't name the same directory, picking one silently would hide a
 * real mistake, so that's a hard error instead of a precedence rule. The
 * comparison resolves both through the same cwd-relative logic
 * resolveTargetPath uses (not a raw string compare) so "target" and
 * "./target" -- or, on Windows, "./target" and ".\target" -- are recognized
 * as the same directory rather than being reported as disagreeing.
 */
export function resolveAddPathArg(
  positional: string | undefined,
  pathFlag: string | undefined
): { ok: true; value: string | undefined } | { ok: false; error: CommandResult } {
  if (
    positional !== undefined &&
    pathFlag !== undefined &&
    resolveTargetPath(positional) !== resolveTargetPath(pathFlag)
  ) {
    return {
      ok: false,
      error: {
        exitCode: 2,
        stdout: [],
        stderr: [
          `Both a positional path ("${positional}") and --path ("${pathFlag}") were given and they disagree -- pass only one.`,
        ],
      },
    };
  }
  return { ok: true, value: positional ?? pathFlag };
}

export async function runAdd(
  pathArg: string | undefined,
  service: string,
  options: AddCommandOptions
): Promise<CommandResult> {
  if (options.status && !VALID_STATUSES.has(options.status)) {
    return {
      exitCode: 2,
      stdout: [],
      stderr: [`--status must be one of: ${[...VALID_STATUSES].join(", ")}`],
    };
  }

  if (options.notes && hasBlockingPrivateFreeText(options.notes)) {
    return { exitCode: 2, stdout: [], stderr: [privateFlagRefusalMessage("--notes")] };
  }

  const slugFields: Array<[string, string | undefined]> = [
    ["service", service],
    ["role", options.role],
    ["id", options.id],
    ["replaced-by", options.replacedBy],
  ];
  for (const [flag, value] of slugFields) {
    if (value !== undefined && !isValidSlug(value)) {
      return {
        exitCode: 2,
        stdout: [],
        stderr: [`--${flag} "${value}" is not a valid slug (lowercase letters, digits, single - or _ separators).`],
      };
    }
  }

  // --depends-on is variadic (see the comment further down, at the
  // known-ids check), so a target-directory argument typed after it gets
  // swallowed into this array instead of being read as the positional
  // [path] -- and a path can never be a legal slug (it has a "/" or a "."
  // in it), so checking the *shape* here, before a manifest is even
  // resolved, catches that mistake regardless of whether the current
  // directory happens to have a manifest of its own. Without this, the
  // swallowed path either surfaces as findManifest failing to locate a
  // manifest in the wrong (cwd) directory, or -- worse, if cwd does have
  // one -- as the unknown-id check below misreporting a path as a bad
  // dependency id.
  for (const dependencyId of options.dependsOn ?? []) {
    if (!isValidSlug(dependencyId)) {
      return {
        exitCode: 2,
        stdout: [],
        stderr: [
          `--depends-on "${dependencyId}" is not a valid slug (lowercase letters, digits, single - or _ ` +
            "separators) -- it looks like a path. A directory argument typed right after --depends-on is " +
            "swallowed into it; give the target directory before --depends-on, or pass it via --path instead.",
        ],
      };
    }
  }

  const opened = await openManifestForEdit(pathArg);
  if (!opened.ok) {
    return opened.error;
  }
  const { location, manifest, doc } = opened.value;

  const existingIds = new Set(manifest.services.map((s) => s.id));
  const existingServices = new Set(manifest.services.map((s) => s.service));
  const id = options.id ?? deriveLocalId(service, options.role, existingIds, existingServices);

  // Every --depends-on value is slug-shaped by now (checked above); this
  // second pass catches the case where it's a *valid-looking* slug that
  // just isn't a real id in this manifest yet. Checked against the ids this
  // manifest will actually have (its existing ids, plus the entry being
  // added -- so a deliberate, and separately cycle-checked, self-dependency
  // still reaches this check rather than being misreported as "unknown")
  // before the document is touched, with a message that names the bad
  // value directly.
  const knownIdsAfterAdd = new Set([...existingIds, id]);
  for (const dependencyId of options.dependsOn ?? []) {
    if (!knownIdsAfterAdd.has(dependencyId)) {
      const known = [...existingIds].sort().join(", ") || "(none yet)";
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          `--depends-on names unknown id "${dependencyId}" -- no service with this id exists in ${location.filePath}.`,
          `  known ids: ${known}`,
        ],
      };
    }
  }

  const servicesSeq = doc.get("services", true) as YAMLSeq;
  preferBlockStyleWhenEmpty(servicesSeq);

  const entry: Record<string, unknown> = { id, service, role: options.role, added: options.added ?? today() };
  if (options.status) entry.status = options.status;
  if (options.replacedBy) entry.replaced_by = options.replacedBy;
  if (options.notes) entry.notes = options.notes;
  servicesSeq.add(doc.createNode(entry));

  const dependsOn = options.dependsOn ?? [];
  if (dependsOn.length > 0) {
    const depsSeq = doc.get("dependencies", true) as YAMLSeq;
    preferBlockStyleWhenEmpty(depsSeq);
    for (const dependencyId of dependsOn) {
      const tuple = doc.createNode([id, dependencyId]);
      tuple.flow = true;
      depsSeq.add(tuple);
    }
  }

  return commitManifestEdit(doc, location, {
    failurePrefix: `Adding "${id}" would make`,
    successLines: (filePath) => {
      const lines = [`Added service "${id}" (${service}, role: ${options.role}) to ${filePath}`];
      if (dependsOn.length > 0) {
        lines.push(`  depends on: ${dependsOn.join(", ")}`);
      }
      return lines;
    },
  });
}
