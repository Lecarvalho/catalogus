// Test-only helper. Not exported from index.ts, so tsup never ships it:
// tsup only bundles what index.ts's module graph reaches.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Walks up from `fromDir` to find the catalogus monorepo root, identified by
 * `pnpm-workspace.yaml` (the one file that only ever lives at the root — see
 * CLAUDE.md's package layout section). Deliberately not based on
 * `process.cwd()`: `pnpm test` runs `vitest run` from the repo root, but a
 * package-level `vitest run` does not, and both have to resolve repo-root
 * relative paths (like `skills/catalogus/SKILL.md`) to the same place. Pass
 * `fileURLToPath(new URL(".", import.meta.url))` from the calling test file
 * so the walk starts at that file's own location rather than wherever the
 * process was launched.
 *
 * A near-copy of @catalogus/schema's test-utils.ts version, on purpose: that
 * one is test-only and deliberately not exported from its package's public
 * API, and reaching into another workspace package's src/ to borrow it would
 * be a worse coupling than a fifteen-line walk.
 */
export function findRepoRoot(fromDir: string): string {
  let dir = fromDir;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not locate the catalogus monorepo root (looked for pnpm-workspace.yaml in every ` +
          `ancestor of "${fromDir}").`,
      );
    }
    dir = parent;
  }
}
