// The open-edit-validate-write cycle every writing command shares (`add`,
// `set`, `link`, `deprecate`).
//
// Two properties are worth keeping in exactly one place rather than four.
// First, the manifest is a human-edited file, so edits go through the `yaml`
// package's Document API rather than a round-trip through a plain object:
// comments, key order and the `$schema` modeline all survive untouched.
// Second, a manifest that would fail `dagstree validate` is never written --
// schema, referential integrity, the private-value guard and acyclicity are
// all checked against the mutated document *before* it reaches disk. A
// command that forgot either property would look like it worked and leave a
// file nobody can validate.
import { stat } from "node:fs/promises";

import { MANIFEST_FILENAME_FALLBACK } from "@dagstree/schema";
import type { DagstreeManifestV1 } from "@dagstree/schema";
import { parseDocument } from "yaml";
import type { Document, YAMLSeq } from "yaml";

import { loadValidManifest } from "./load-manifest.js";
import { checkManifestObject, warningLines } from "./manifest-checks.js";
import { writeManifestText } from "./manifest-io.js";
import type { ManifestLocation } from "./manifest-io.js";
import { resolveTargetPath } from "./paths.js";
import type { CommandResult } from "./types.js";

export interface OpenedManifest {
  location: ManifestLocation;
  /** The manifest as it validated on disk, for pre-checks that read ids or services. */
  manifest: DagstreeManifestV1;
  /** The same file as an editable Document, comments and formatting intact. */
  doc: Document;
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
 * Validates the mutated document and, only if it passes, writes it.
 *
 * The check is the same one `dagstree validate` runs, so "the CLI wrote it"
 * and "it validates" cannot come apart.
 */
export async function commitManifestEdit(
  doc: Document,
  location: ManifestLocation,
  options: CommitOptions
): Promise<CommandResult> {
  const check = checkManifestObject(doc.toJS());
  if (!check.ok) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`${options.failurePrefix} ${location.filePath} invalid:`, ...check.lines],
    };
  }

  const filePath = await writeManifestText(location.dir, doc.toString({ flowCollectionPadding: false }));
  const lines = options.successLines(filePath);

  // writeManifestText always writes dagstree.yaml, even when the manifest
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
