// The open-edit-validate-write cycle every writing command shares (`add`,
// `set`, `link`, `deprecate`, `remove`).
//
// Two properties are worth keeping in exactly one place rather than four.
// First, the manifest is a human-edited file, so edits go through the `yaml`
// package's Document API rather than a round-trip through a plain object:
// comments, key order and the `$schema` modeline all survive untouched.
// Second, a manifest that would fail `catalogus validate` is never written --
// schema, referential integrity, the private-value guard and acyclicity are
// all checked against the mutated document *before* it reaches disk. A
// command that forgot either property would look like it worked and leave a
// file nobody can validate.
import { stat } from "node:fs/promises";

import { edgePairs, MANIFEST_FILENAME, MANIFEST_FILENAME_FALLBACK } from "@catalogus/schema";
import type { CatalogusManifestV1 } from "@catalogus/schema";
import { parseDocument } from "yaml";
import type { Document, YAMLSeq } from "yaml";

import { loadValidManifest } from "./load-manifest.js";
import { checkManifestObject, warningLines } from "./manifest-checks.js";
import { findManifest, findManifestIn, writeManifestText } from "./manifest-io.js";
import type { ManifestLocation } from "./manifest-io.js";
import { resolveTargetPath } from "./paths.js";
import { findCycles } from "./toposort.js";
import type { CommandResult } from "./types.js";

export interface OpenedManifest {
  location: ManifestLocation;
  /** The manifest as it validated on disk, for pre-checks that read ids or services. */
  manifest: CatalogusManifestV1;
  /** The same file as an editable Document, comments and formatting intact. */
  doc: Document;
  /**
   * Cycles the manifest already carried when it was opened, so
   * commitManifestEdit can tell a cycle this edit introduced from one that
   * was in the file before the command ran. Empty for a healthy manifest,
   * which is every manifest the CLI itself has written.
   */
  preexistingCycles: string[][];
}

export type OpenOutcome = { ok: true; value: OpenedManifest } | { ok: false; error: CommandResult };

/**
 * Resolves the target directory, loads the manifest there and reparses it as
 * an editable Document.
 *
 * A path argument the caller actually typed is a concrete claim about which
 * project this edit targets -- unlike the no-argument default, it must never
 * silently fall back to an ancestor directory's manifest via findManifest's
 * git-style upward walk. Without this check a typo'd subdirectory that
 * happens to sit under a directory with its own manifest edits that
 * unrelated parent manifest instead of failing loudly.
 */
export async function openManifestForEdit(pathArg: string | undefined): Promise<OpenOutcome> {
  const targetDir = resolveTargetPath(pathArg);

  if (pathArg !== undefined) {
    try {
      const info = await stat(targetDir);
      if (!info.isDirectory()) {
        return { ok: false, error: { exitCode: 2, stdout: [], stderr: [`"${targetDir}" is not a directory.`] } };
      }
    } catch {
      return { ok: false, error: { exitCode: 2, stdout: [], stderr: [`"${targetDir}" does not exist.`] } };
    }

    // Existing-but-empty is the half of the promise above that the
    // directory check alone does not deliver. A typo'd or wrong-level
    // subdirectory exists perfectly often, and letting it through means
    // loadValidManifest's upward walk silently retargets the edit at
    // whichever ancestor happens to hold a manifest -- observed as
    // `catalogus remove fly-api <dir>/sub` deleting the entry from
    // <dir>/catalogus.yaml at exit 0. Refuse here instead, and name the
    // ancestor that *was* found so the message says what to type next
    // rather than only what went wrong.
    if (!(await findManifestIn(targetDir))) {
      const ancestor = await findManifest(targetDir);
      const stderr = [`No ${MANIFEST_FILENAME} in "${targetDir}".`];
      stderr.push(
        ancestor
          ? `${ancestor.filePath} exists, but "${targetDir}" was named explicitly, so the search did not walk up to it. ` +
              `Point the command at "${ancestor.dir}" to edit that manifest.`
          : `Run "catalogus init" to create one.`
      );
      return { ok: false, error: { exitCode: 2, stdout: [], stderr } };
    }
  }

  const loaded = await loadValidManifest(targetDir);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }

  return {
    ok: true,
    value: {
      location: loaded.value.location,
      manifest: loaded.value.manifest,
      doc: parseDocument(loaded.value.text),
      // Read before the edit rather than after, because "was this cycle
      // already here?" is not a question the mutated document can answer.
      preexistingCycles: findCycles(
        loaded.value.manifest.services.map((service) => service.id),
        edgePairs(loaded.value.manifest)
      ).cycles,
    },
  };
}

export interface CommitOptions {
  /**
   * Opens the failure message, e.g. `Adding "supabase-auth" would make`.
   * The file path and the validator's own lines follow it.
   */
  failurePrefix: string;
  /** The success report. Takes the written path, which is not always the path that was read. */
  successLines: (filePath: string) => string[];
}

/**
 * Identifies a cycle by the loop itself rather than by where the traversal
 * happened to enter it.
 *
 * findCycles returns a closed walk (`b -> c -> b`) whose starting node
 * depends on the order services are declared in, so an edit that removes an
 * unrelated entry earlier in the list can rotate the same loop's rendering.
 * Dropping the repeated terminal node and rotating the smallest id to the
 * front makes the key stable across exactly the edits this is used to see
 * through. Direction is deliberately kept: `b -> c -> b` and `c -> b -> c`
 * as *edge sets* are the same loop, but a reversed pair of edges is a
 * different manifest and worth failing on.
 */
export function cycleKey(cycle: readonly string[]): string {
  const nodes = cycle.slice(0, -1);
  if (nodes.length === 0) {
    return cycle.join(" -> ");
  }
  let start = 0;
  for (let i = 1; i < nodes.length; i++) {
    const candidate = nodes[i];
    const smallest = nodes[start];
    if (candidate !== undefined && smallest !== undefined && candidate < smallest) {
      start = i;
    }
  }
  return [...nodes.slice(start), ...nodes.slice(0, start)].join(" -> ");
}

/**
 * Validates the mutated document and, only if it passes, writes it.
 *
 * The check is the same one `catalogus validate` runs, so "the CLI wrote it"
 * and "it validates" cannot come apart.
 */
export async function commitManifestEdit(opened: OpenedManifest, options: CommitOptions): Promise<CommandResult> {
  const { doc, location } = opened;
  const check = checkManifestObject(doc.toJS());
  if (!check.ok) {
    // The two checks this module runs are not the same check.
    // openManifestForEdit accepts anything parseManifest accepts -- schema,
    // referential integrity, the private-value guard -- while the check
    // above additionally runs checkAcyclic. So a manifest that already
    // carried a cycle opens cleanly and fails here, and failurePrefix would
    // name this command as the cause of a cycle that predates it, sending
    // the user to fix an edit that was never the problem.
    //
    // Opening it at all is deliberate: `catalogus remove` on one of the
    // cycle's services is the only thing in the CLI that breaks a cycle, so
    // refusing to open a cyclic manifest would make it unfixable by the
    // tool that reports it. The edit is still refused when it leaves the
    // cycle standing -- exit 1, nothing written -- but it is refused in the
    // file's name rather than in the command's.
    const before = new Set(opened.preexistingCycles.map(cycleKey));
    const cycles = check.cycles ?? [];
    if (cycles.length > 0 && cycles.every((cycle) => before.has(cycleKey(cycle)))) {
      return {
        exitCode: 1,
        stdout: [],
        stderr: [
          `${location.filePath} already contained a cyclic dependency before this command, and this edit does not break it:`,
          ...check.lines,
          `Nothing was written. Run "catalogus validate" for the full report; ` +
            `"catalogus remove" on one of the services above drops its edges with it.`,
        ],
      };
    }
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`${options.failurePrefix} ${location.filePath} invalid:`, ...check.lines],
    };
  }

  const filePath = await writeManifestText(location.dir, doc.toString({ flowCollectionPadding: false }));
  const lines = options.successLines(filePath);

  // writeManifestText always writes catalogus.yaml, even when the manifest
  // was read from the stack.yaml fallback (manifest-io.ts's contract) -- so
  // a repo that still used the old name now has two files that disagree.
  // Say so explicitly rather than leaving the stale stack.yaml to surprise
  // whoever reads it next.
  if (location.filename === MANIFEST_FILENAME_FALLBACK) {
    lines.push(`  migrated ${location.filePath} -> ${filePath}; delete ${location.filePath} once you've checked this in.`);
  }

  // Soft private-value hits never block (see private-guard.ts), but dropping
  // them silently would make the guard invisible on exactly the paths that
  // write to the file.
  return { exitCode: 0, stdout: lines, stderr: warningLines(check.warnings) };
}

/**
 * Empty sequences parsed from `[]` default to flow style; forcing block
 * style before the first real entry keeps a freshly-scaffolded manifest from
 * turning into an ugly single-line list the first time something is added to
 * it. A sequence that already has entries keeps whatever style the human
 * gave it.
 */
export function preferBlockStyleWhenEmpty(seq: YAMLSeq): void {
  if (seq.items.length === 0) {
    seq.flow = false;
  }
}
