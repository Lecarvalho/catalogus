// Fixture `.git` directories can't be committed to git — a path with a
// literal `.git` path component is untrackable regardless of .gitignore
// (verified directly: `git add -A` on a tree containing one silently drops
// it, and `git status --porcelain` shows nothing afterward). VCS fixtures
// that need a real git config therefore store it under `dotgit/` instead;
// this materialises that content as a real `.git/` inside a throwaway temp
// directory so detectVcs can read it exactly as it would a real checkout.
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface GitFixture {
  /** Absolute path to the temp directory containing the materialised `.git/`. */
  repoPath: string;
  /** Removes the temp directory. Always call this, even on test failure. */
  dispose: () => Promise<void>;
}

export async function materializeGitFixture(fixtureDir: string): Promise<GitFixture> {
  const repoPath = await mkdtemp(join(tmpdir(), "dagstree-git-fixture-"));
  await cp(join(fixtureDir, "dotgit"), join(repoPath, ".git"), { recursive: true });
  return {
    repoPath,
    dispose: () => rm(repoPath, { recursive: true, force: true }),
  };
}
