// `apply_manifest_edit` -- the MCP tool that actually writes (Phase 6,
// decision 14, docs/mcp-apply-brief.md). Decision 14 amends HANDOFF.md
// section 6's "propose, never write" to "propose, then apply": the
// single-writer rule was always about the code path (manifest-edit.ts:
// validate before write, comments survive, private data refused), not about
// the binary, so an MCP tool that runs the exact same command functions is
// that same writer over a different transport.
//
// Shaped like propose-edit.ts on purpose, right down to the `Edit` union
// (imported from there, not duplicated) and the `runEdit`/`buildCommand`
// dispatch (imported from edit-runner.ts, which propose-edit.ts also uses)
// -- the proposal and the application must run the same code, or the diff a
// user approved is not the diff that actually lands. The one real
// difference from propose-edit.ts is the one that matters: there is no
// scratch directory here. Every edit runs against `location.dir`, the real
// project directory, so a successful step is really on disk the moment it
// exits 0 -- exactly as if the `catalogus ...` line propose_manifest_edit
// printed had been typed by hand. (2026-09-06.)
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { MANIFEST_FILENAME, MANIFEST_FILENAME_FALLBACK } from "@catalogus/schema";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";

import { findManifest, findManifestIn, readManifestText } from "../manifest-io.js";
import { resolveTargetPath } from "../paths.js";
import { buildCommand, runEdit } from "./edit-runner.js";
import { editSchema, sha256Hex } from "./propose-edit.js";
import type { Edit } from "./propose-edit.js";

/** Raw zod shape, for a caller (the MCP server) registering this as a tool's `inputSchema`. The `edits` field reuses propose-edit.ts's `editSchema` byte-identically, so an agent can pass a proposal's own input straight through. */
export const applyManifestEditInputShape = {
  path: z.string().optional(),
  edits: z.array(editSchema).min(1),
  /**
   * The `baseSha256` a prior `propose_manifest_edit` call returned. When
   * given, this call refuses to write unless the manifest currently on disk
   * still hashes to it -- see the module comment on `checkBase` below for
   * exactly what that guarantees and what it does not.
   */
  baseSha256: z.string().optional(),
};

const applyManifestEditInputSchema = z.object(applyManifestEditInputShape);

export type ApplyManifestEditInput = z.infer<typeof applyManifestEditInputSchema>;

/** Read by an agent choosing a tool -- says what this returns and, just as importantly, that it writes for real. */
export const APPLY_MANIFEST_EDIT_DESCRIPTION =
  "Runs one or more manifest edits (add, set, link, unlink, deprecate, remove, rename) against the " +
  "real catalogus.yaml and writes the result. This is the tool that actually changes the file -- call " +
  "propose_manifest_edit first, show the user its diff, and pass this tool the same `edits` (and the " +
  "proposal's baseSha256, to guard against the file having changed since) once they approve it.";

// --- result shape ------------------------------------------------------------

export interface ApplyManifestEditStep {
  op: Edit["op"];
  /** The `catalogus ...` line this step ran, quoted the same way propose_manifest_edit's `commands` is. */
  command: string;
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

/** No manifest was found to apply an edit against. */
export interface ApplyManifestEditNotFound {
  ok: false;
  error: string;
  /**
   * Names the fix as a tool, not a CLI line -- unlike propose-edit.ts's
   * `fill` (which names "catalogus init --yes" because the CLI is what an
   * agent without this server would run), this server now has its own
   * `init_manifest` tool, so that is the fix an agent already connected to
   * it should be told to call.
   */
  fill: "init_manifest";
}

/** The manifest on disk no longer hashes to the `baseSha256` this call was given -- refused before anything ran. */
export interface ApplyManifestEditStaleBase {
  ok: false;
  error: string;
  /**
   * Distinguishes this from a mid-run failure (`ApplyManifestEditReport`
   * with `ok: false`, which is not an error result -- some of its steps may
   * genuinely have written): this variant means nothing here ran at all.
   */
  staleBase: true;
}

export interface ApplyManifestEditReport {
  /** True only when every edit in `input.edits` ran and exited 0. */
  ok: boolean;
  /** The manifest that was found and read before any edit ran -- catalogus.yaml, or the stack.yaml fallback. */
  manifestPath: string;
  /** Where the CLI actually writes -- always catalogus.yaml, per writeManifestText's own contract, even when manifestPath is the stack.yaml fallback. */
  writtenTo: string;
  changed: boolean;
  /** Unified diff of the manifest's text before this call against what it is now. Empty string when `changed` is false. */
  diff: string;
  /** One entry per edit that was attempted, in order; stops at the first non-zero exit. Earlier steps' writes are already on disk. */
  steps: ApplyManifestEditStep[];
  /** True when `input.baseSha256` was given and checked. False means this call applied without that guard -- still worth writing, but not proposal-checked. */
  baseChecked: boolean;
  /** SHA-256 hex of the manifest's text after this call, so a follow-up apply can chain off it. */
  sha256After: string;
}

export type ApplyManifestEditResult = ApplyManifestEditNotFound | ApplyManifestEditStaleBase | ApplyManifestEditReport;

export interface ApplyManifestEditOptions {
  /** Passed straight through to `runSet` (commands/set.ts's own `fetchImpl` parameter), the same reason propose-edit.ts's own option exists: a test apply never opens a real socket. */
  fetchImpl?: typeof fetch;
}

// --- the tool itself ----------------------------------------------------------

export async function applyManifestEdit(
  input: ApplyManifestEditInput,
  options: ApplyManifestEditOptions = {}
): Promise<ApplyManifestEditResult> {
  const targetDir = resolveTargetPath(input.path);

  // Same explicit-path rule as propose-edit.ts and read-manifest.ts: a
  // named path is a concrete claim about which project this call targets,
  // so it never gets the upward walk `findManifest` gives a bare `path:
  // undefined`.
  const location = input.path !== undefined ? await findManifestIn(targetDir) : await findManifest(targetDir);
  if (!location) {
    return {
      ok: false,
      error:
        input.path !== undefined
          ? `No ${MANIFEST_FILENAME} (or ${MANIFEST_FILENAME_FALLBACK}) found in "${targetDir}".`
          : `No ${MANIFEST_FILENAME} (or ${MANIFEST_FILENAME_FALLBACK}) found in "${targetDir}" or any parent directory.`,
      fill: "init_manifest",
    };
  }

  const originalText = await readManifestText(location);

  // The proposal-to-approval guard, not a lock: hashing here and writing a
  // moment later is still two separate steps, so two agents (or an agent
  // and a person editing the file by hand) can race between them exactly
  // as they could race between any read and any write. What this check
  // catches is the ordinary case -- the file changed since the proposal
  // this baseSha256 came from -- not concurrent writers colliding with
  // each other; it is not, and does not pretend to be, a file lock.
  if (input.baseSha256 !== undefined && input.baseSha256 !== sha256Hex(originalText)) {
    return {
      ok: false,
      error:
        `${location.filePath} has changed since the proposal this baseSha256 came from -- ` +
        "nothing was written. Propose again against the current file.",
      staleBase: true,
    };
  }
  const baseChecked = input.baseSha256 !== undefined;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const steps: ApplyManifestEditStep[] = [];
  for (const edit of input.edits) {
    const { tokens, result } = await runEdit(edit, location.dir, fetchImpl);
    steps.push({
      op: edit.op,
      command: buildCommand(tokens),
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    // Stop at the first failure. Every step before it already ran against
    // the real directory and is already on disk -- there is no scratch copy
    // to discard here, so "stop" means "no more edits run", not "undo what
    // already landed".
    if (result.exitCode !== 0) {
      break;
    }
  }

  // writeManifestText always writes catalogus.yaml, even when the source
  // was the stack.yaml fallback (manifest-io.ts's own contract), so the
  // path a successful step actually wrote to can differ from
  // `location.filePath`. Read from that real destination; a missing file
  // there (every step failed before the first successful write, or none
  // was ever needed) means nothing changed, so the original text is still
  // the whole truth.
  const writtenTo = join(location.dir, MANIFEST_FILENAME);
  let newText = originalText;
  try {
    newText = await readFile(writtenTo, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const changed = newText !== originalText;
  const diff = changed ? createTwoFilesPatch(location.filePath, location.filePath, originalText, newText) : "";

  return {
    ok: steps.every((step) => step.exitCode === 0),
    manifestPath: location.filePath,
    writtenTo,
    changed,
    diff,
    steps,
    baseChecked,
    sha256After: sha256Hex(newText),
  };
}
