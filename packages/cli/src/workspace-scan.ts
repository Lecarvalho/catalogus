// Workspace scanner: the data source behind Phase 3.7's viewer. Given an
// absolute path to a directory that holds several repositories side by
// side, finds every immediate child directory that carries a Dagstree
// manifest, loads and validates each one, and returns a stable report the
// caller can render -- one broken manifest must not sink the scan (see
// WorkspaceScanResult below).
//
// Depth 1 only -- immediate children of root, no recursion. Grounded, not
// assumed: the owner's real workspace root holds repos as direct
// subdirectories (18 of them, one carrying a dagstree.yaml, at the time
// this was written). Recursing would walk into node_modules and every
// nested worktree inside each of those repos, which is both ruinously slow
// and wrong -- a manifest sitting inside a dependency is not a project in
// the portfolio. If a deeper layout is ever needed, that is a decision for
// whoever has evidence for it; do not "fix" this into a recursive walk.
import type { Dirent } from "node:fs";
import { readdir, readlink, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { parseManifest } from "@dagstree/schema";
import type { DagstreeManifestError, DagstreeManifestV1 } from "@dagstree/schema";

import { findManifestIn, readManifestText } from "./manifest-io.js";
import type { ManifestLocation } from "./manifest-io.js";
import { errorMessage } from "./types.js";

/** Thrown by scanWorkspace() when root doesn't name a real, absolute directory. */
export class InvalidWorkspaceRootError extends Error {
  constructor(root: string, reason: string) {
    super(`scanWorkspace(): invalid root ${JSON.stringify(root)} — ${reason}`);
    this.name = "InvalidWorkspaceRootError";
  }
}

async function assertValidWorkspaceRoot(root: string): Promise<void> {
  if (!isAbsolute(root)) {
    throw new InvalidWorkspaceRootError(root, "must be an absolute path");
  }
  let info;
  try {
    info = await stat(root);
  } catch {
    throw new InvalidWorkspaceRootError(root, "does not exist");
  }
  if (!info.isDirectory()) {
    throw new InvalidWorkspaceRootError(root, "is not a directory");
  }
}

/** Identifies one immediate child of the workspace root, valid or not. */
export interface WorkspaceRepoRef {
  /** Absolute path to the repo directory. */
  path: string;
  /** The directory's own name -- e.g. "dagstree" for C:/repos/dagstree. */
  name: string;
}

/**
 * Why a repo's manifest could not be used, for a viewer to say something
 * useful instead of the repo silently vanishing from the portfolio:
 *
 * "unreadable" -- findManifestIn() found the file but reading it failed
 * (permissions, or a TOCTOU race where it was removed in between); also
 * used for a symlink/junction root entry whose target no longer exists --
 * see the "broken link" handling in scanWorkspace() below for why that
 * case is folded in here rather than getting a reason of its own.
 * "malformed-yaml" -- the file isn't valid YAML at all.
 * "invalid" -- it parses but fails schema/referential validation (the
 * same class of problem `dagstree validate` reports in full).
 */
export type WorkspaceManifestFailureReason = "unreadable" | "malformed-yaml" | "invalid";

export interface WorkspaceManifestFailure extends WorkspaceRepoRef {
  /** Which manifest file was found and couldn't be used. */
  location: ManifestLocation;
  reason: WorkspaceManifestFailureReason;
  /** Human-readable summary, always non-empty. */
  message: string;
  /**
   * Structured detail from @dagstree/schema when available -- empty for
   * "unreadable" (there was never anything to parse), one synthetic entry
   * for "malformed-yaml" (schema's own "Could not parse YAML: ..." error),
   * the full validation error list for "invalid".
   */
  errors: readonly DagstreeManifestError[];
}

export interface WorkspaceManifestEntry extends WorkspaceRepoRef {
  /** Which manifest file was found -- dagstree.yaml, or the stack.yaml fallback. */
  location: ManifestLocation;
  manifest: DagstreeManifestV1;
}

export interface WorkspaceScanResult {
  /** The absolute root path that was scanned. */
  root: string;
  /** Repos with a manifest that read, parsed and validated cleanly. */
  manifests: WorkspaceManifestEntry[];
  /** Repos with a manifest file that could not be turned into a valid manifest. */
  failures: WorkspaceManifestFailure[];
  /**
   * Immediate children with no dagstree.yaml or stack.yaml at all. Not an
   * error -- most directories in a workspace root are not Dagstree
   * projects -- kept separate from `failures` because "has no manifest"
   * and "has a broken manifest" are different facts a viewer renders
   * differently.
   */
  unmanaged: WorkspaceRepoRef[];
}

/**
 * Returns the single error describing a YAML syntax failure, or null when
 * `errors` describes an ordinary validation failure instead.
 *
 * parseManifest() (packages/schema/src/validate.ts) folds a YAML syntax
 * error into the same DagstreeValidationResult shape as a schema failure,
 * distinguished only by this exact message prefix and by being the sole,
 * path-less error -- there's no separate discriminant to import instead,
 * so this mirrors validate.ts's own text. If that message ever changes,
 * this stops matching and the failure is reported as "invalid" rather
 * than "malformed-yaml" (still reported, just under the less specific
 * reason).
 */
function malformedYamlError(errors: readonly DagstreeManifestError[]): DagstreeManifestError | null {
  const only = errors.length === 1 ? errors[0] : undefined;
  if (!only) {
    return null;
  }
  return only.instancePath === "" && only.message.startsWith("Could not parse YAML:") ? only : null;
}

function summarizeErrors(location: ManifestLocation, errors: readonly DagstreeManifestError[]): string {
  const count = errors.length === 1 ? "1 error" : `${errors.length} errors`;
  return `${location.filePath} does not pass validation (${count}): ${errors.map((error) => error.message).join("; ")}`;
}

/** One classified root entry: either a repo to scan, or a link that never resolved. */
type ScanEntry = { kind: "repo"; ref: WorkspaceRepoRef } | { kind: "broken-link"; ref: WorkspaceRepoRef };

/**
 * Classifies a single readdir() entry: a repo to scan, a broken link, or
 * neither (an ordinary file, or a link resolving to one -- both return
 * null and vanish from every list, same as a loose file always has).
 *
 * A plain directory dirent is trusted as-is (no extra syscall -- this is
 * the overwhelmingly common case and dirent.isDirectory() is already
 * correct for it). Only a symlink/junction dirent needs resolving, and
 * it's resolved with `readlink` + `stat` on the raw target rather than
 * `stat`ing the link path directly, for a Windows-specific reason:
 * `stat()` on a junction whose target is a *file* throws ENOENT on this
 * platform -- the identical error a missing target produces -- so
 * stat(link) alone cannot tell "points at a file" apart from "points at
 * nothing" (confirmed on this platform: both raise ENOENT with no
 * distinguishing detail). Reading the target text ourselves and
 * `stat`ing *that* path sidesteps the Windows junction-traversal quirk
 * and gives the right answer on POSIX too, where stat(link) would have
 * worked either way.
 */
async function classifyEntry(root: string, dirent: Dirent): Promise<ScanEntry | null> {
  const ref: WorkspaceRepoRef = { path: join(root, dirent.name), name: dirent.name };

  if (dirent.isDirectory()) {
    return { kind: "repo", ref };
  }
  if (!dirent.isSymbolicLink()) {
    return null;
  }

  let rawTarget: string;
  try {
    rawTarget = await readlink(ref.path);
  } catch {
    return { kind: "broken-link", ref };
  }
  const resolvedTarget = isAbsolute(rawTarget) ? rawTarget : resolve(dirname(ref.path), rawTarget);

  let targetInfo;
  try {
    targetInfo = await stat(resolvedTarget);
  } catch {
    return { kind: "broken-link", ref };
  }
  return targetInfo.isDirectory() ? { kind: "repo", ref } : null;
}

/**
 * A symlink/junction root entry whose target doesn't exist. Reported
 * under the existing "unreadable" reason rather than adding a fourth one
 * -- see WorkspaceManifestFailureReason's doc comment -- since "we could
 * not read what this entry names" is exactly true here, just one step
 * earlier than the usual case: `location` names the link itself, not a
 * guessed dagstree.yaml/stack.yaml filename, because the scan never got
 * far enough to know which name would have applied inside it.
 */
function brokenLinkFailure(ref: WorkspaceRepoRef): WorkspaceManifestFailure {
  return {
    ...ref,
    location: { dir: ref.path, filePath: ref.path, filename: ref.name },
    reason: "unreadable",
    message: `Could not read ${ref.path}: broken symlink or junction (link target does not exist)`,
    errors: [],
  };
}

/**
 * Scans an absolute workspace root and reports what its immediate child
 * directories hold. Read-only -- never writes anywhere. Rejects with
 * InvalidWorkspaceRootError for a missing root, a non-directory, or a
 * relative path, the same absolute-only contract @dagstree/core's
 * detect() enforces for repoPath (see packages/core/src/index.ts) and for
 * the same reason: resolving a relative root against an unstated cwd is
 * guessing, and a bad root is a caller error, unlike a bad manifest inside
 * an otherwise-good root.
 *
 * A repo whose manifest cannot be read, parsed or validated is reported in
 * `failures`, not thrown -- one bad manifest must not sink the scan of
 * every other repo in the workspace.
 *
 * Every list is sorted ordinally (by UTF-16 code unit, i.e. plain `<`) on
 * the directory's own name -- not a locale-aware collation, so the order
 * never depends on the host's ICU data, and not the read order `readdir`
 * happens to return, which is not guaranteed to be stable across
 * platforms or across reloads of the same directory.
 *
 * Follows symlinks and Windows junctions: an immediate child that is a
 * link is resolved to what it points at, and treated exactly like an
 * ordinary repo directory when that target is a directory. This is safe
 * *because* the scan is depth 1 with no recursion -- following costs one
 * extra `readlink` + `stat` per link and there is no walk for a cycle to
 * loop inside. (A recursive version of this scan would need cycle
 * detection this one deliberately does not have; do not add recursion
 * without adding that.) `readdir(..., { withFileTypes: true })` reports a
 * symlink/junction entry's own type, not its target's -- confirmed on
 * this platform: a Windows junction pointing at a real directory reports
 * `dirent.isDirectory() === false` -- so directory-ness for a link entry
 * is decided by resolving the link and `stat`ing the target instead (see
 * classifyEntry() above), never by trusting the dirent alone.
 *
 * Three link outcomes fall out of this, each handled explicitly:
 *   - target is a directory -> treated as a repo, same as a plain
 *     directory (this is the fix for the defect this comment used to
 *     describe as intentional: a junctioned-in repo used to vanish from
 *     all three result lists, reported as nothing at all).
 *   - target is a file -> not a repo, same as an ordinary file sitting in
 *     the root; silently excluded from every list.
 *   - target does not exist (a broken link) -> reported in `failures`
 *     with reason "unreadable" (see WorkspaceManifestFailureReason).
 *     Deliberately not `unmanaged`: `unmanaged` asserts "no manifest
 *     here", a fact this scan does not have for a link it couldn't
 *     resolve -- the directory (if any) was never reached to check.
 */
export async function scanWorkspace(root: string): Promise<WorkspaceScanResult> {
  await assertValidWorkspaceRoot(root);

  const dirents = await readdir(root, { withFileTypes: true });

  // Sequential, not Promise.all -- same reasoning as the manifest-loading
  // loop below: dozens of entries, not thousands, and no evidence this
  // needs concurrency.
  const entries: ScanEntry[] = [];
  for (const dirent of dirents) {
    const entry = await classifyEntry(root, dirent);
    if (entry) {
      entries.push(entry);
    }
  }
  entries.sort((a, b) => (a.ref.name < b.ref.name ? -1 : a.ref.name > b.ref.name ? 1 : 0));

  const manifests: WorkspaceManifestEntry[] = [];
  const failures: WorkspaceManifestFailure[] = [];
  const unmanaged: WorkspaceRepoRef[] = [];

  // Sequential, not Promise.all: repo counts here are "several repos side
  // by side" (dozens, not thousands), the already-sorted `entries` order
  // becomes the output order for free this way, and there is no evidence
  // yet that a workspace this size needs the concurrency -- premature
  // parallelism is exactly the kind of infra this slice's non-goals rule
  // out ("no caching, no incremental rescan").
  for (const entry of entries) {
    if (entry.kind === "broken-link") {
      failures.push(brokenLinkFailure(entry.ref));
      continue;
    }
    const repo = entry.ref;

    const location = await findManifestIn(repo.path);
    if (!location) {
      unmanaged.push(repo);
      continue;
    }

    let text: string;
    try {
      text = await readManifestText(location);
    } catch (error) {
      failures.push({
        ...repo,
        location,
        reason: "unreadable",
        message: `Could not read ${location.filePath}: ${errorMessage(error)}`,
        errors: [],
      });
      continue;
    }

    const parsed = parseManifest(text);
    if (parsed.valid) {
      manifests.push({ ...repo, location, manifest: parsed.manifest });
      continue;
    }

    const malformed = malformedYamlError(parsed.errors);
    failures.push({
      ...repo,
      location,
      reason: malformed ? "malformed-yaml" : "invalid",
      message: malformed ? malformed.message : summarizeErrors(location, parsed.errors),
      errors: parsed.errors,
    });
  }

  return { root, manifests, failures, unmanaged };
}
