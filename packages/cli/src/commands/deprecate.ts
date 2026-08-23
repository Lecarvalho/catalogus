// `dagstree deprecate <id> [path] [--status <s>] [--replaced-by <id>]` --
// records that a service is on its way out.
//
// Lifecycle is one of the four things no scanner can ever supply (HANDOFF
// §3): a service that is being phased out is still fully present in the
// repo, so detection has nothing to go on. It is also the thing the
// migration dashboard in Phase 7 is entirely made of. Until now the only way
// to record it was to hand-edit `status` and `replaced_by` on an existing
// entry, which is exactly the sort of edit that quietly puts a manifest out
// of schema.
//
// `phasing_out` and `deprecated` are different claims -- "we are moving off
// this" versus "this is no longer the way" -- so --status takes both rather
// than the command name deciding for you. It defaults to `deprecated`.
import { commitManifestEdit, openManifestForEdit } from "../manifest-edit.js";
import { isValidSlug } from "../slug.js";
import type { CommandResult } from "../types.js";

/** The lifecycle values this command sets. `active` is not one: that is the absence of a phase-out, and `removed` means the entry should be gone, not annotated. */
const DEPRECATION_STATUSES = new Set(["deprecated", "phasing_out"]);

export interface DeprecateCommandOptions {
  status?: string;
  replacedBy?: string;
}

export async function runDeprecate(
  pathArg: string | undefined,
  id: string,
  options: DeprecateCommandOptions = {}
): Promise<CommandResult> {
  const status = options.status ?? "deprecated";

  if (!DEPRECATION_STATUSES.has(status)) {
    return {
      exitCode: 2,
      stdout: [],
      stderr: [
        `--status must be one of: ${[...DEPRECATION_STATUSES].join(", ")}.`,
        '  to mark an entry active again, or to remove it, edit the manifest and re-run "dagstree validate".',
      ],
    };
  }

  for (const [label, value] of [
    ["<id>", id],
    ["--replaced-by", options.replacedBy],
  ] as const) {
    if (value !== undefined && !isValidSlug(value)) {
      return {
        exitCode: 2,
        stdout: [],
        stderr: [
          `${label} "${value}" is not a valid local id (lowercase letters, digits, single - or _ separators).`,
        ],
      };
    }
  }

  const opened = await openManifestForEdit(pathArg);
  if (!opened.ok) {
    return opened.error;
  }
  const { location, manifest, doc } = opened.value;

  const index = manifest.services.findIndex((service) => service.id === id);
  if (index === -1) {
    const known = manifest.services.map((service) => service.id).sort().join(", ") || "(none yet)";
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`no service with id "${id}" exists in ${location.filePath}.`, `  known ids: ${known}`],
    };
  }

  // An unknown replaced_by target is caught by the schema's referential
  // integrity check before the write either way, but naming the flag the
  // user typed is a better message than a path into the document.
  if (options.replacedBy !== undefined) {
    if (options.replacedBy === id) {
      return { exitCode: 1, stdout: [], stderr: [`"${id}" cannot be replaced by itself.`] };
    }
    if (!manifest.services.some((service) => service.id === options.replacedBy)) {
      const known = manifest.services.map((service) => service.id).sort().join(", ");
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          `--replaced-by names unknown id "${options.replacedBy}" -- no service with this id exists in ${location.filePath}.`,
          `  known ids: ${known}`,
          '  add the replacement first with "dagstree add", then deprecate the entry it replaces.',
        ],
      };
    }
  }

  // By path rather than by grabbing the entry node: setIn adds the key when
  // the entry has never carried one and overwrites it when it has, without
  // this command needing to know which node type it is holding.
  doc.setIn(["services", index, "status"], status);
  if (options.replacedBy !== undefined) {
    doc.setIn(["services", index, "replaced_by"], options.replacedBy);
  }

  return commitManifestEdit(doc, location, {
    failurePrefix: `Deprecating "${id}" would make`,
    successLines: (filePath) => {
      const lines = [`Marked "${id}" ${status} in ${filePath}`];
      if (options.replacedBy !== undefined) {
        lines.push(`  replaced by: ${options.replacedBy}`);
      }
      return lines;
    },
  });
}
