// `catalogus rename <old> <new> [path]` -- changes one service entry's local
// id, and moves every reference to it along with the entry.
//
// This is not a `catalogus set services.<id>.id`, and the difference is the
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
//
// One thing outside the manifest moves with the id (added 2026-09-05): a
// vendored icon file. `catalogus set services.<id>.icon` writes the mark
// under `.catalogus/icons/<id>.svg` and records that path in the entry, so
// after a rename the pointer still resolves but the file is named after an
// id that no longer exists -- and the `<id>.svg` convention `catalogus
// icons` and the skill teach silently stops holding for that one entry.
// So when the entry's `icon` is exactly the old id's conventional path, the
// file is moved to the new id's and the field rewritten. A pointer to any
// other name is left alone, file and field both: it is legal by the schema,
// it still resolves, and guessing that it "should" have been named after
// the id is the kind of plausible default this repo refuses to write.
import { rename as renameFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { edgePairs } from "@catalogus/schema";
import { isMap, isSeq } from "yaml";
import type { Scalar, YAMLSeq } from "yaml";

import { vendoredIconRelativePath } from "../icon-fetch.js";
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

  // The vendored-icon half, decided before anything is mutated so every
  // refusal below still leaves the manifest and the icons directory exactly
  // as they were. The manifest is consulted before the filesystem, both
  // ways (validator, 2026-09-05): another entry naming the *old* path means
  // the file is shared and stays put, as `remove` keeps a shared file;
  // another entry naming the *new* path means the move would bind that
  // entry to this one's mark whether or not a file is there yet, so it is
  // refused and the entry named. Only then does the filesystem get a say --
  // something already at the new name that no entry claims. The schema
  // allows any `<name>.svg`, so both states are legal by hand even though
  // `set` never produces them.
  //
  // Then three shapes for the entry itself: no icon or one not named after
  // the old id (nothing to move); the conventional file present (move it);
  // the conventional pointer with no file behind it (a stale pointer -- the
  // field still follows the id, so `catalogus icons` keeps reporting the
  // same "(missing file)" under the new name rather than a path to a file
  // that was never there under either name).
  const currentIcon = manifest.services[index]?.icon;
  const oldIconPath = vendoredIconRelativePath(oldId);
  const newIconPath = vendoredIconRelativePath(newId);
  const namesIcon = (path: string): string[] =>
    manifest.services.filter((service) => service.id !== oldId && service.icon === path).map((service) => service.id);
  const sharedWith = currentIcon === oldIconPath ? namesIcon(oldIconPath) : [];
  let iconMove: { from: string; to: string } | undefined;
  let iconFileMissing = false;
  let sourceIsDirectory = false;
  if (currentIcon === oldIconPath && sharedWith.length === 0) {
    const claimants = namesIcon(newIconPath);
    if (claimants.length > 0) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          `"${oldId}" cannot be renamed to "${newId}": its icon would move to ${newIconPath}, ` +
            `which ${quoteList(claimants)} already ${claimants.length === 1 ? "names" : "name"}.`,
          `  re-point ${claimants.length === 1 ? "that entry's icon" : "those entries' icons"} with "catalogus set services.<id>.icon", or pick another id.`,
        ],
      };
    }
    const from = join(location.dir, oldIconPath);
    const to = join(location.dir, newIconPath);
    // Something at the new name that no entry claims is not one this CLI
    // vendored -- the check above proved that -- and nothing here can tell
    // what it is, so it is not overwritten. Say what is there (a directory
    // is not a file, and "move it" means something different for one) and
    // leave the decision with whoever can look at it. The skill's rule
    // against touching vendored files by hand does not cover this: an
    // unreferenced file is not vendored.
    const occupant = await kindAt(to);
    if (occupant !== undefined) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          `"${oldId}" cannot be renamed to "${newId}": its icon would move to ${newIconPath}, but a ${occupant} already sits there.`,
          `  no entry in ${location.filePath} names it, so it is not one this CLI vendored. Move or delete it yourself, then rename again.`,
        ],
      };
    }
    const source = await kindAt(from);
    if (source === "file") {
      iconMove = { from, to };
    } else if (source === undefined) {
      iconFileMissing = true;
    }
    // A directory at the source (second validator, 2026-09-05) is neither
    // a file to move nor a missing one: the pointer is already refused by
    // `catalogus icons`, and moving a directory under a new icon name would
    // report it as an icon. Left where it is, field and all, and said so.
    sourceIsDirectory = source === "directory";
  }

  const servicesSeq = doc.get("services", true) as YAMLSeq;
  const entry = servicesSeq.items[index];
  if (!isMap(entry) || !renameScalar(entry.get("id", true), oldId, newId)) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`could not rewrite the id of "${oldId}" in ${location.filePath}; nothing was written.`],
    };
  }

  if (currentIcon === oldIconPath && sharedWith.length > 0) {
    // Shared with another entry: the file stays, and so does this entry's
    // pointer to it -- still valid, still resolving -- the way `remove`
    // keeps a shared file. Moving it would break the other entry silently.
    moved.push(`icon ${oldIconPath} kept its name: ${quoteList(sharedWith)} still ${sharedWith.length === 1 ? "names" : "name"} it`);
  } else if (sourceIsDirectory) {
    moved.push(`icon ${oldIconPath} kept its name: a directory sits there, not a file, so nothing was moved`);
  } else if (currentIcon === oldIconPath) {
    // The field follows the id whether or not a file is there to move --
    // see the stale-pointer case above. Inline comment on the node (`#
    // fetched from ... on ...`) is attached to the pair, so it survives
    // this the same way it survives every other renameScalar call here.
    if (!renameScalar(entry.get("icon", true), oldIconPath, newIconPath)) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: [`could not rewrite the icon path of "${oldId}" in ${location.filePath}; nothing was written.`],
      };
    }
    moved.push(
      iconFileMissing
        ? `icon is now ${newIconPath} (no file was at ${oldIconPath} to move; the pointer was already stale)`
        : `icon ${oldIconPath} moved to ${newIconPath}`
    );
  } else if (currentIcon !== undefined) {
    moved.push(`icon ${currentIcon} kept its name and its file (it was not named after "${oldId}")`);
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

  // The file moves *before* the manifest is written and moves back if the
  // write is refused or throws -- the same order `set` keeps with a staged
  // icon (icon-fetch.ts): the manifest, the thing that gets committed to
  // the repo, is only ever written once everything it points at is already
  // where it says. A rename is cheap and exactly reversible, which is what
  // makes the rollback honest rather than best-effort.
  let iconMoved = false;
  const restoreIcon = async (): Promise<void> => {
    if (iconMove && iconMoved) {
      await renameFile(iconMove.to, iconMove.from).catch(() => {});
    }
  };

  let result: CommandResult;
  try {
    if (iconMove) {
      // Inside the try, so a move the filesystem refuses (a directory ACL
      // that denies deleting from `.catalogus/icons/`, reproduced by the
      // 2026-09-05 validator) is reported with the same framing as a
      // manifest write that throws, not as a bare errno.
      await renameFile(iconMove.from, iconMove.to);
      iconMoved = true;
    }
    result = await commitManifestEdit(opened.value, {
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
  } catch (error) {
    await restoreIcon();
    const message = error instanceof Error ? error.message : String(error);
    const failed = iconMove && !iconMoved ? `could not move ${oldIconPath} to ${newIconPath}` : `could not update ${location.filePath}`;
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`${failed}: ${message}`, "  nothing was written; the icon file was not moved."],
    };
  }
  if (result.exitCode !== 0) {
    await restoreIcon();
  }
  return result;
}

/** What sits at `path`, as the noun a message can use, or undefined when nothing does. */
async function kindAt(path: string): Promise<"file" | "directory" | undefined> {
  try {
    return (await stat(path)).isDirectory() ? "directory" : "file";
  } catch {
    return undefined;
  }
}

function quoteList(ids: readonly string[]): string {
  return ids.map((id) => `"${id}"`).join(", ");
}
