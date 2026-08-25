// `catalogus unlink <from> <to> [path]` -- removes one dependency edge
// between two services, and only that edge.
//
// `link <from> <to>` adds an edge one at a time, because nothing else can
// supply it (HANDOFF §3). Nothing removes one the same way: `remove <id>`
// takes an edge out only as a side effect of deleting the whole entry it
// names, which is the wrong tool when the entry is still correct and only
// one of its edges has gone stale -- an entry's role changes, or an edge
// was recorded against the wrong neighbour, and the entry itself has done
// nothing wrong. Before this, the only route to a manifest without that
// edge was deleting the entry and rebuilding it, which is exactly the
// hand-edit-shaped workaround this package exists to make unnecessary. See
// CLAUDE.md: the CLI is the only writer, so a manifest state it cannot
// reach is a hole in that guarantee.
import { edgePairs } from "@catalogus/schema";
import type { YAMLSeq } from "yaml";

import { commitManifestEdit, openManifestForEdit } from "../manifest-edit.js";
import { isValidSlug } from "../slug.js";
import type { CommandResult } from "../types.js";

export async function runUnlink(
  pathArg: string | undefined,
  from: string,
  to: string
): Promise<CommandResult> {
  for (const [label, value] of [
    ["from", from],
    ["to", to],
  ] as const) {
    if (!isValidSlug(value)) {
      return {
        exitCode: 2,
        stdout: [],
        stderr: [
          `<${label}> "${value}" is not a valid local id (lowercase letters, digits, single - or _ separators).`,
        ],
      };
    }
  }

  const opened = await openManifestForEdit(pathArg);
  if (!opened.ok) {
    return opened.error;
  }
  const { location, manifest, doc } = opened.value;

  // An id neither `link` nor any other writer could ever have put in an
  // edge -- referential integrity is checked on every write, so a valid
  // manifest never names a service that isn't there. Checked before the
  // edge lookup below so a typo'd id is reported as the typo it is, rather
  // than folded into the "nothing to do" case every real edge miss uses.
  const knownIds = new Set(manifest.services.map((service) => service.id));
  const unknown = [from, to].filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    const known = [...knownIds].sort().join(", ") || "(none yet)";
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `no service with id ${unknown.map((id) => `"${id}"`).join(" or ")} exists in ${location.filePath}.`,
        `  known ids: ${known}`,
      ],
    };
  }

  // Via edgePairs, for the same reason link and remove both go through it:
  // an edge is legally either a [from, to] pair or a {from, to, notes}
  // object, and matching only the array form would miss one written the
  // other way.
  const pairs = edgePairs(manifest);
  const index = pairs.findIndex((edge) => edge.from === from && edge.to === to);

  // Mirrors link's own no-op: re-adding an edge that is already there is
  // exit 0 there because the state the caller asked for already holds, not
  // because nothing was checked. The same reasoning runs in reverse here --
  // "unlinked" is already true -- so this is a no-op success, not a
  // usage error, and the message says so in those words rather than
  // treating the manifest as at fault for an edge the caller expected to
  // find.
  if (index === -1) {
    return {
      exitCode: 0,
      stdout: [`"${from}" does not depend on "${to}" in ${location.filePath}; nothing to do.`],
      stderr: [],
    };
  }

  // depsHeaderComment is captured before the splice for the same reason
  // remove.ts captures it before its own: a comment written directly above
  // the *first* item in a YAMLSeq belongs to the sequence node itself
  // (`seq.commentBefore`), not to that item, so splicing item 0 out leaves
  // it sitting above whatever edge is now first -- or above nothing, if the
  // removed edge was the only one. It cannot be moved on a guess (the same
  // ambiguity remove.ts documents at length: a genuine list header and a
  // note meant for the first edge specifically are indistinguishable once
  // parsed), so it is left exactly where it is and reported instead.
  const depsSeq = doc.get("dependencies", true) as YAMLSeq;
  const depsHeaderComment = depsSeq.commentBefore;
  const strandedHeaderComment = index === 0 && depsHeaderComment !== undefined;
  const removedNotes = pairs[index]?.notes;
  depsSeq.items.splice(index, 1);

  return commitManifestEdit(opened.value, {
    // Removing one edge from a manifest that already validated cannot fail
    // schema or referential integrity, and cannot introduce a cycle --
    // taking an edge out of a graph can only ever break a cycle, never
    // close one. A manifest that already carried a cycle not touched by
    // this edge still fails commitManifestEdit's check, but in the file's
    // name rather than this command's -- see manifest-edit.ts.
    failurePrefix: `Unlinking "${from}" -> "${to}" would make`,
    successLines: (filePath) => {
      const lines = [`Unlinked "${from}" -> "${to}" in ${filePath}`];
      // The edge's own annotation is about to be gone along with it. Naming
      // it here is the difference between a human's note disappearing and
      // a human's note being discarded on purpose, in front of the person
      // running the command.
      if (removedNotes !== undefined) {
        lines.push(`  discarded notes: ${removedNotes}`);
      }
      if (strandedHeaderComment) {
        lines.push(
          "  comment text above the removed edge was attached to the dependencies list itself rather " +
            "than to the edge, so it stayed behind" +
            (depsSeq.items.length === 0 ? "; the list is now empty, so it sits above nothing." : ".")
        );
      }
      return lines;
    },
  });
}
