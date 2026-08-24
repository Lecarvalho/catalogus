// `dagstree rename <old> <new> [path]` -- changes one service entry's local
// id, and moves every reference to it along with the entry.
//
// This is not a `dagstree set services.<id>.id`, and the difference is the
// whole command. `set` writes one field and is done; an id is referenced
// from three places outside the entry that carries it -- both endpoints of
// every dependency edge, and any other entry's `replaced_by` -- so writing
// only the field leaves a manifest that fails referential integrity on the
// next `validate`, which is the "one wrong write, no way back" shape
// docs/PLAN.md's `remove` section exists to close. It shares `remove`'s
// find-every-reference traversal for that reason, and was built after it.
//
// Where it is *simpler* than `remove`: nothing is deleted, so none of that
// command's comment-attachment hazards apply. Every reference is overwritten
// in place, so a comment attached to any node -- above it, inline on it,
// trailing after it -- stays attached to that same node and still reads
// correctly, because the node is still there.
//
// That holds for `doc.setIn` too, measured rather than assumed: an inline
// comment on `id: fly-api # the public API` is attached to the *pair*, not
// to the value scalar, so `setIn(["services", 0, "id"], ...)` keeps it. The
// reason the scalars are mutated through `renameScalar` instead is not
// comment preservation -- it is that one call handles all three shapes a
// reference can take (a map value, a tuple element, another entry's
// replaced_by) and *reports whether it found what it expected*, which
// `setIn` cannot: `setIn` writes the new id whether or not the old one was
// there, and a rename that quietly wrote over the wrong thing is the
// failure this command is least able to afford.
import { edgePairs } from "@dagstree/schema";
import { isMap, isSeq } from "yaml";
import type { Scalar, YAMLSeq } from "yaml";

import { commitManifestEdit, openManifestForEdit } from "../manifest-edit.js";
import { isValidSlug } from "../slug.js";
import type { CommandResult } from "../types.js";

/**
 * Overwrites a scalar's value in place if that is what `node` is.
 *
 * Returns whether it did, because "the traversal found the reference but
 * the document held something other than a scalar there" is not a case to
 * paper over: a rename that silently skipped a reference would leave a
 * dangling id behind, which is exactly the failure this command exists to
 * prevent. It cannot happen on a manifest that passed validation on the way
 * in -- an id is a string by the schema -- so the caller treats a false as
 * a bug rather than as a user error, and the pre-write check in
 * commitManifestEdit catches it either way.
 */
function renameScalar(node: unknown, from: string, to: string): boolean {
  const scalar = node as Scalar | undefined;
  if (scalar && typeof scalar === "object" && "value" in scalar && scalar.value === from) {
    scalar.value = to;
    return true;
  }
  return false;
}

export async function runRename(
  pathArg: string | undefined,
  oldId: string,
  newId: string
): Promise<CommandResult> {
  // Both ids are checked before the manifest is opened, matching `set`'s
  // "a bad argument never gets as far as touching the file" property.
  for (const [label, value] of [
    ["old", oldId],
    ["new", newId],
  ] as const) {
    if (!isValidSlug(value)) {
      return {
        exitCode: 2,
        stdout: [],
        stderr: [`<${label}> "${value}" is not a valid local id (lowercase letters, digits, single - or _ separators).`],
      };
    }
  }

  const opened = await openManifestForEdit(pathArg);
  if (!opened.ok) {
    return opened.error;
  }
  const { location, manifest, doc } = opened.value;

  const index = manifest.services.findIndex((service) => service.id === oldId);
  if (index === -1) {
    const known = manifest.services.map((service) => service.id).sort().join(", ") || "(none yet)";
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`no service with id "${oldId}" exists in ${location.filePath}.`, `  known ids: ${known}`],
    };
  }

  // Checked before the same-name case below, deliberately: if <new> is
  // already taken by a *different* entry this is a collision either way,
  // and reporting it as "nothing to do" would be wrong. When old and new
  // are the same string, the only entry holding <new> is the one being
  // renamed, so this does not fire.
  const collision = manifest.services.findIndex((service) => service.id === newId);
  if (collision !== -1 && collision !== index) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `"${newId}" is already the id of another service in ${location.filePath}.`,
        `  local ids must be unique -- rename or remove that entry first, or pick another id.`,
      ],
    };
  }

  // A no-op at exit 0 rather than a usage error, matching `link`'s
  // treatment of an edge that already exists: the state the user asked for
  // is the state on disk, and nothing about that deserves a non-zero exit.
  if (oldId === newId) {
    return {
      exitCode: 0,
      stdout: [`"${oldId}" is already its own id in ${location.filePath}; nothing to do.`],
      stderr: [],
    };
  }

  const moved: string[] = [];

  const servicesSeq = doc.get("services", true) as YAMLSeq;
  const entry = servicesSeq.items[index];
  if (!isMap(entry) || !renameScalar(entry.get("id", true), oldId, newId)) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`could not rewrite the id of "${oldId}" in ${location.filePath}; nothing was written.`],
    };
  }

  // Same index correspondence `remove` relies on: edgePairs() normalizes
  // both legal edge shapes to {from, to} in manifest.dependencies order,
  // which is the order of the document's own dependencies sequence -- so
  // index i names the same edge in both. Unlike `remove` nothing is
  // spliced, so no index shifts and the walk can run in file order.
  const depsSeq = doc.get("dependencies", true) as YAMLSeq;
  edgePairs(manifest).forEach(({ from, to }, i) => {
    if (from !== oldId && to !== oldId) {
      return;
    }
    const edge = depsSeq.items[i];
    // A tuple edge holds two scalars positionally; an object edge holds
    // them under `from`/`to`. Both are legal in the same file, so both are
    // handled rather than assuming whichever shape the fixtures use.
    if (isSeq(edge)) {
      renameScalar(edge.items[0], oldId, newId);
      renameScalar(edge.items[1], oldId, newId);
    } else if (isMap(edge)) {
      renameScalar(edge.get("from", true), oldId, newId);
      renameScalar(edge.get("to", true), oldId, newId);
    }
    moved.push(`edge ${from} -> ${to} is now ${from === oldId ? newId : from} -> ${to === oldId ? newId : to}`);
  });

  // replaced_by is the other place an id is referenced, and the one most
  // easily forgotten: it is a lifecycle claim on a *different* entry than
  // the one being renamed, so nothing about editing this entry brings it to
  // mind. Leaving it behind would dangle, and dangling replaced_by is a
  // referential-integrity failure the same as a dangling edge.
  manifest.services.forEach((service, i) => {
    if (service.replaced_by !== oldId) {
      return;
    }
    const other = servicesSeq.items[i];
    if (isMap(other)) {
      renameScalar(other.get("replaced_by", true), oldId, newId);
      moved.push(`replaced_by on "${service.id}" now points at ${newId}`);
    }
  });

  return commitManifestEdit(opened.value, {
    failurePrefix: `Renaming "${oldId}" to "${newId}" would make`,
    successLines: (filePath) => {
      const lines = [`Renamed service "${oldId}" to "${newId}" in ${filePath}`];
      for (const line of moved) {
        lines.push(`  ${line}`);
      }
      if (moved.length === 0) {
        lines.push("  no dependency edges or replaced_by references named it");
      }
      return lines;
    },
  });
}
