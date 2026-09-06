// `propose_manifest_edit` -- the MCP tool's handler body (Phase 6,
// docs/plan/phase-6-mcp.md; design settled in docs/propose-edit-brief.md).
// Added 2026-09-06.
//
// CLAUDE.md is explicit: "the CLI is the only writer." An MCP tool that grew
// its own editing engine -- walking the YAML Document itself, the way
// manifest-edit.ts's callers do -- would be a second engine that could
// disagree with `add`/`set`/`link`/... about what a valid edit looks like,
// and the two would drift apart exactly the way every duplicated check in
// this repo's history has (private-guard.ts's own header names four
// instances of that same defect shape). So this never touches a YAML
// Document: it calls the exact same run* functions program.ts wires onto
// the command line -- `runAdd`, `runSet`, `runLink`, `runUnlink`,
// `runDeprecate`, `runRemove`, `runRename` -- against a scratch copy of the
// manifest, and hands back a diff plus the `catalogus ...` lines that would
// reproduce it for real. Nothing here ever calls `writeManifestText`,
// `commitManifestEdit`, or any fs write against the real manifest's path.
//
// Because an explicit `pathArg` never walks upward (openManifestForEdit's
// own comment, manifest-edit.ts), pointing every run* call at the scratch
// directory guarantees none of them can resolve back to a parent
// directory's real manifest by accident -- the scratch directory has no
// parent that could hold one.
//
// The real manifest is located directly (findManifestIn / findManifest,
// mirroring openManifestForEdit's own no-upward-walk-on-an-explicit-path
// rule) rather than by calling openManifestForEdit itself: that function
// also parses and validates the manifest (loadValidManifest) before handing
// it back, which is a second way for this step to fail over something that
// only ever needs a file's path and its raw bytes. The real validation
// still happens -- for free, against the *scratch* copy -- the moment the
// first edit below calls into a run* function, which is the validation
// that actually matters (it is the one a real `catalogus add`/`set`/...
// would run).
//
// `runEdit` and `buildCommand` themselves live in `edit-runner.ts`, not
// here -- `apply_manifest_edit` (Phase 6, decision 14) needs to run the
// exact same dispatch against the *real* directory once a proposal is
// approved, and a second copy of that switch statement is precisely the
// kind of duplicated check this module's own opening paragraph just warned
// against. See edit-runner.ts's header for why the resulting circular
// reference (this file exports `editSchema`/`Edit`, edit-runner.ts imports
// `Edit` as a type; edit-runner.ts exports `runEdit`/`buildCommand`, this
// file imports them as values) is not actually a runtime cycle. (2026-09-06.)
//
// `.catalogus/` travels into the scratch directory alongside the manifest
// because it is not always a spectator to these edits: `set
// services.<id>.icon` vendors a file under `.catalogus/icons/`, and
// `remove`/`rename` move or delete files there (commands/remove.ts,
// commands/rename.ts). A proposal that copied only the manifest would
// report a different edit than the one the CLI actually makes whenever one
// of those three is in play.
import { createHash } from "node:crypto";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MANIFEST_FILENAME, MANIFEST_FILENAME_FALLBACK } from "@catalogus/schema";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";

import { findManifest, findManifestIn, readManifestText } from "../manifest-io.js";
import { resolveTargetPath } from "../paths.js";
import { buildCommand, runEdit } from "./edit-runner.js";

/**
 * Exported so apply-edit.ts hashes a manifest's text exactly the same way a
 * proposal did -- the `baseSha256` this function attaches to a report and
 * the current-file hash `applyManifestEdit` compares it against must agree
 * on what "the same text" means, or the check that ties an approval to the
 * file state it was given on would be comparing two different notions of a
 * hash rather than the same one twice. (2026-09-06.)
 */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// --- input shape -----------------------------------------------------------
//
// Field names mirror the CLI's own option names exactly (the same words
// `catalogus add --help` etc. use) so the `commands` this tool returns round
// -trip straight back into them -- see the command-building section below.
const addEditSchema = z.object({
  op: z.literal("add"),
  service: z.string(),
  role: z.string(),
  id: z.string().optional(),
  kind: z.string().optional(),
  version: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  status: z.string().optional(),
  replacedBy: z.string().optional(),
  added: z.string().optional(),
  notes: z.string().optional(),
});

const setEditSchema = z.object({
  op: z.literal("set"),
  field: z.string(),
  value: z.string(),
});

const linkEditSchema = z.object({
  op: z.literal("link"),
  from: z.string(),
  to: z.string(),
});

const unlinkEditSchema = z.object({
  op: z.literal("unlink"),
  from: z.string(),
  to: z.string(),
});

const deprecateEditSchema = z.object({
  op: z.literal("deprecate"),
  id: z.string(),
  status: z.string().optional(),
  replacedBy: z.string().optional(),
});

const removeEditSchema = z.object({
  op: z.literal("remove"),
  id: z.string(),
});

const renameEditSchema = z.object({
  op: z.literal("rename"),
  from: z.string(),
  to: z.string(),
});

// Exported (not just the inferred `Edit` type below) so apply-edit.ts can
// reuse this exact union for `applyManifestEditInputShape` -- the two tools'
// `edits` input must be byte-identical, so an agent can pass a proposal's
// input straight through to apply_manifest_edit, and there must be exactly
// one place that decides what a legal edit looks like.
export const editSchema = z.discriminatedUnion("op", [
  addEditSchema,
  setEditSchema,
  linkEditSchema,
  unlinkEditSchema,
  deprecateEditSchema,
  removeEditSchema,
  renameEditSchema,
]);

export type Edit = z.infer<typeof editSchema>;

/** Raw zod shape, for a caller (the MCP server, elsewhere) registering this as a tool's `inputSchema`. */
export const proposeManifestEditInputShape = {
  path: z.string().optional(),
  edits: z.array(editSchema).min(1),
};

const proposeManifestEditInputSchema = z.object(proposeManifestEditInputShape);

export type ProposeManifestEditInput = z.infer<typeof proposeManifestEditInputSchema>;

/** Read by an agent choosing a tool -- says what this returns and, just as importantly, what it never does. */
export const PROPOSE_MANIFEST_EDIT_DESCRIPTION =
  "Runs one or more manifest edits (add, set, link, unlink, deprecate, remove, rename) against a " +
  "scratch copy of catalogus.yaml and returns a unified diff plus the exact `catalogus ...` command " +
  "line for each edit that succeeded, and baseSha256, the hash of the file it read. It never writes " +
  "catalogus.yaml itself: show the diff to the user, then call apply_manifest_edit with the same " +
  "edits and that baseSha256.";

// --- result shape ------------------------------------------------------------

export interface ProposeManifestEditStep {
  op: Edit["op"];
  /** The `catalogus ...` line this step ran, quoted the same way `commands` below is. */
  command: string;
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

export interface ProposeManifestEditOtherFile {
  /** Repo-relative, e.g. ".catalogus/icons/fly-io.svg" -- never the file's contents (an icon SVG in a tool result is noise, and worse for anything binary). */
  path: string;
  change: "added" | "removed" | "modified";
}

/** No manifest was found to propose an edit against. */
export interface ProposeManifestEditNotFound {
  ok: false;
  error: string;
  /** The command that fills the gap -- CLAUDE.md's "ask, never guess": name the fix rather than invent a manifest. */
  fill: string;
}

export interface ProposeManifestEditReport {
  /** True only when every edit in `input.edits` ran and exited 0. */
  ok: boolean;
  /** The manifest that was actually found and read -- catalogus.yaml, or the stack.yaml fallback. */
  manifestPath: string;
  /** Where the CLI would write -- always catalogus.yaml, per writeManifestText's own contract, even when manifestPath is the stack.yaml fallback. */
  writesTo: string;
  changed: boolean;
  /** Unified diff of the real manifest's current text against what it would become. Empty string when `changed` is false. */
  diff: string;
  otherFiles: ProposeManifestEditOtherFile[];
  /** One entry per edit that was attempted, in order; stops at the first non-zero exit. */
  steps: ProposeManifestEditStep[];
  /** The shell lines for the steps that succeeded, in order -- what the agent runs once the user approves. */
  commands: string[];
  /**
   * SHA-256 hex of the real manifest's text exactly as it was read for this
   * proposal (before any edit ran, against the scratch copy). An
   * `apply_manifest_edit` call given this same value refuses to write when
   * the real file no longer hashes to it -- so an approval is tied to the
   * file state it was given on, not just to the edits it approved. (2026-09-06.)
   */
  baseSha256: string;
}

export type ProposeManifestEditResult = ProposeManifestEditNotFound | ProposeManifestEditReport;

export interface ProposeManifestEditOptions {
  /**
   * Passed straight through to `runSet` (commands/set.ts's own `fetchImpl`
   * parameter) so a test proposal never opens a real socket. A real `set
   * services.<id>.icon <url>` proposal *does* fetch -- the CLI's own `set`
   * would too -- and the scratch copy under `.catalogus/icons/` is exactly
   * where the fetched bytes are meant to land, so `otherFiles` can report
   * them the same way it would for the real command.
   */
  fetchImpl?: typeof fetch;
  /**
   * Test-only: called with the scratch directory's absolute path once it is
   * created, before any edit runs. Lets a test assert the directory is gone
   * once this function returns -- for both a successful and a failed
   * proposal -- without guessing its name out of `os.tmpdir()`'s listing.
   */
  onScratchDir?: (dir: string) => void;
}

// --- .catalogus/ before/after snapshot ---------------------------------------
//
// Names and bytes, not just names: `set services.<id>.icon` can leave a
// file's *name* unchanged while replacing its bytes (re-vendoring the same
// id from a new source), which a names-only comparison would report as
// nothing having happened. The returned report only ever surfaces the path
// and the change kind, never the bytes themselves (this file's own module
// comment: an icon SVG in a tool result is noise).
async function snapshotCatalogusDir(dir: string, prefix = ""): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return files;
    }
    throw error;
  }
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [nestedPath, content] of await snapshotCatalogusDir(join(dir, entry.name), relativePath)) {
        files.set(nestedPath, content);
      }
    } else if (entry.isFile()) {
      files.set(relativePath, await readFile(join(dir, entry.name)));
    }
  }
  return files;
}

function diffCatalogusSnapshots(
  before: Map<string, Buffer>,
  after: Map<string, Buffer>
): ProposeManifestEditOtherFile[] {
  const changes: ProposeManifestEditOtherFile[] = [];
  for (const [relativePath, content] of after) {
    const previous = before.get(relativePath);
    if (previous === undefined) {
      changes.push({ path: `.catalogus/${relativePath}`, change: "added" });
    } else if (!previous.equals(content)) {
      changes.push({ path: `.catalogus/${relativePath}`, change: "modified" });
    }
  }
  for (const relativePath of before.keys()) {
    if (!after.has(relativePath)) {
      changes.push({ path: `.catalogus/${relativePath}`, change: "removed" });
    }
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

// --- the tool itself ----------------------------------------------------------

export async function proposeManifestEdit(
  input: ProposeManifestEditInput,
  options: ProposeManifestEditOptions = {}
): Promise<ProposeManifestEditResult> {
  const targetDir = resolveTargetPath(input.path);

  // An explicit path is a concrete claim about which project this proposal
  // targets, the same reasoning openManifestForEdit itself gives for never
  // walking upward from one -- see this file's module comment for why that
  // rule is applied directly here instead of through openManifestForEdit.
  const location = input.path !== undefined ? await findManifestIn(targetDir) : await findManifest(targetDir);
  if (!location) {
    return {
      ok: false,
      error:
        input.path !== undefined
          ? `No ${MANIFEST_FILENAME} (or ${MANIFEST_FILENAME_FALLBACK}) found in "${targetDir}".`
          : `No ${MANIFEST_FILENAME} (or ${MANIFEST_FILENAME_FALLBACK}) found in "${targetDir}" or any parent directory.`,
      fill: "catalogus init --yes",
    };
  }

  const originalText = await readManifestText(location);
  const scratchDir = await mkdtemp(join(tmpdir(), "catalogus-propose-edit-"));
  options.onScratchDir?.(scratchDir);

  try {
    // The manifest, under its own filename -- catalogus.yaml or the
    // stack.yaml fallback, both legal to read -- so a step's own
    // openManifestForEdit call finds it exactly the way it found the real
    // one.
    await writeFile(join(scratchDir, location.filename), originalText, "utf8");

    // `.catalogus/` is optional on a real project (most manifests have no
    // vendored icons yet), so a missing source directory is not a failure
    // -- snapshotCatalogusDir already tolerates a missing directory the
    // same way, both here and when reading it back after the edits run.
    const sourceCatalogusDir = join(location.dir, ".catalogus");
    const scratchCatalogusDir = join(scratchDir, ".catalogus");
    try {
      await cp(sourceCatalogusDir, scratchCatalogusDir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    const before = await snapshotCatalogusDir(scratchCatalogusDir);

    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const steps: ProposeManifestEditStep[] = [];
    const commands: string[] = [];
    for (const edit of input.edits) {
      const { tokens, result } = await runEdit(edit, scratchDir, fetchImpl);
      const command = buildCommand(tokens);
      // The command's own lines name the file it wrote, which is the scratch
      // copy -- a path that no longer exists by the time the agent reads
      // this report. Rewrite it to the real directory so the lines describe
      // where the same command would write once approved (2026-09-06
      // validation, observation).
      const unscratch = (line: string): string => line.split(scratchDir).join(location.dir);
      steps.push({
        op: edit.op,
        command,
        exitCode: result.exitCode,
        stdout: result.stdout.map(unscratch),
        stderr: result.stderr.map(unscratch),
      });
      // Stop at the first failure: every edit after it was written against
      // a manifest state that this run never actually reached.
      if (result.exitCode !== 0) {
        break;
      }
      commands.push(command);
    }

    // writeManifestText always writes catalogus.yaml, even when the source
    // was the stack.yaml fallback (manifest-io.ts's own contract) -- so the
    // path a successful step actually wrote to can differ from
    // `location.filePath`. Read from that real destination name;
    // `location.filePath` is used only for the diff's headers below, which
    // must still describe the file this proposal read from.
    const scratchManifestPath = join(scratchDir, MANIFEST_FILENAME);
    let newText = originalText;
    try {
      newText = await readFile(scratchManifestPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      // No step ever wrote successfully (every edit failed before
      // committing, or the manifest was already catalogus.yaml and no step
      // changed it) -- the copy under its original name is still the whole
      // truth, so "new" text is exactly what this proposal started from.
    }

    const changed = newText !== originalText;
    const diff = changed ? createTwoFilesPatch(location.filePath, location.filePath, originalText, newText) : "";

    const after = await snapshotCatalogusDir(scratchCatalogusDir);
    const otherFiles = diffCatalogusSnapshots(before, after);

    return {
      ok: steps.every((step) => step.exitCode === 0),
      manifestPath: location.filePath,
      writesTo: join(location.dir, MANIFEST_FILENAME),
      changed,
      diff,
      otherFiles,
      steps,
      commands,
      baseSha256: sha256Hex(originalText),
    };
  } finally {
    // Runs whether every step succeeded, one failed partway through, or
    // something above threw -- the scratch copy never outlives one call,
    // successful or not.
    await rm(scratchDir, { recursive: true, force: true });
  }
}
