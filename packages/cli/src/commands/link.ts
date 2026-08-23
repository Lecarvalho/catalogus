// `dagstree link <from> <to> [path]` -- adds one dependency edge between two
// services that already exist.
//
// Edges are the product. They are also the one thing no scanner can supply
// (HANDOFF §3), so they arrive one at a time as the user remembers them --
// and before this, the only way to record one was to re-run `add`, which
// wants to create a service entry, or to hand-edit the file. Both are worse
// than a command that does exactly this.
import { edgePairs } from "@dagstree/schema";
import type { YAMLSeq } from "yaml";

import { commitManifestEdit, openManifestForEdit, preferBlockStyleWhenEmpty } from "../manifest-edit.js";
import { isValidSlug } from "../slug.js";
import type { CommandResult } from "../types.js";

export async function runLink(
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

  // A self-edge is a cycle, which the pre-write validation would catch --
  // but "cyclic dependency: a -> a" reads like a bug report about the tool
  // rather than about the command that was typed.
  if (from === to) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`"${from}" cannot depend on itself.`],
    };
  }

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
        "  add the service first with \"dagstree add\", then link it.",
      ],
    };
  }

  // Re-adding an edge that is already there would leave a duplicate the
  // schema does not forbid and the graph would render twice.
  // Via edgePairs, because an edge is legally either a [from, to] pair or a
  // {from, to, notes} object; reading the array form only would miss a
  // duplicate written the other way.
  const alreadyLinked = edgePairs(manifest).some((edge) => edge.from === from && edge.to === to);
  if (alreadyLinked) {
    return { exitCode: 0, stdout: [`"${from}" already depends on "${to}" in ${location.filePath}; nothing to do.`], stderr: [] };
  }

  const depsSeq = doc.get("dependencies", true) as YAMLSeq;
  preferBlockStyleWhenEmpty(depsSeq);
  const tuple = doc.createNode([from, to]);
  tuple.flow = true;
  depsSeq.add(tuple);

  return commitManifestEdit(doc, location, {
    failurePrefix: `Linking "${from}" -> "${to}" would make`,
    successLines: (filePath) => [`Linked "${from}" -> "${to}" in ${filePath}`],
  });
}
