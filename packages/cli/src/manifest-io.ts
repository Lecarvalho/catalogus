// Manifest resolution and raw file I/O. HANDOFF.md's cross-cutting rules:
// look for dagstree.yaml, fall back to stack.yaml when reading, always
// write dagstree.yaml; walk up from the current directory to find it, the
// way git finds its root; a clear error when no manifest exists, naming the
// command that creates one.
import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { MANIFEST_FILENAME, MANIFEST_FILENAME_FALLBACK } from "@dagstree/schema";

export class ManifestNotFoundError extends Error {
  constructor(startPath: string) {
    super(
      `No ${MANIFEST_FILENAME} (or ${MANIFEST_FILENAME_FALLBACK}) found in "${startPath}" or any parent directory. ` +
        'Run "dagstree init" to create one.'
    );
    this.name = "ManifestNotFoundError";
  }
}

export interface ManifestLocation {
  /** Directory the manifest was found in. */
  dir: string;
  /** Absolute path to the manifest file that was actually found. */
  filePath: string;
  /** Which filename was found -- dagstree.yaml, or the stack.yaml fallback. */
  filename: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Looks for a manifest in exactly one directory, with no upward walk.
 *
 * Split out from findManifest rather than inlined into it because callers
 * that were handed an explicit directory need the "is it *here*" question
 * answered without the walk (see manifest-edit.ts's openManifestForEdit),
 * and the dagstree.yaml-beats-stack.yaml precedence has to be the same
 * answer for both questions or the two disagree about which file a
 * directory holds.
 */
export async function findManifestIn(dir: string): Promise<ManifestLocation | null> {
  for (const filename of [MANIFEST_FILENAME, MANIFEST_FILENAME_FALLBACK]) {
    const filePath = join(dir, filename);
    if (await fileExists(filePath)) {
      return { dir, filePath, filename };
    }
  }
  return null;
}

/**
 * Walks upward from startDir (inclusive), the way git locates .git/,
 * looking for dagstree.yaml and falling back to stack.yaml at each level.
 * dagstree.yaml wins over stack.yaml within the same directory. Returns
 * null once the filesystem root is reached with nothing found.
 */
export async function findManifest(startDir: string): Promise<ManifestLocation | null> {
  let dir = startDir;
  for (;;) {
    const here = await findManifestIn(dir);
    if (here) {
      return here;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export async function readManifestText(location: ManifestLocation): Promise<string> {
  return readFile(location.filePath, "utf8");
}

/**
 * Writes text to dagstree.yaml in `dir`, regardless of which filename the
 * manifest was originally read from -- per HANDOFF.md, the CLI never writes
 * stack.yaml, even when editing a repo that still uses the fallback name.
 */
export async function writeManifestText(dir: string, text: string): Promise<string> {
  const filePath = join(dir, MANIFEST_FILENAME);
  await writeFile(filePath, text, "utf8");
  return filePath;
}
