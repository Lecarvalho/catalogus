// Test-only fixture helpers. Not exported from index.ts / not part of the
// public API — tsup only bundles what index.ts's module graph reaches, so
// this never ships in dist.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const fixturesRoot = fileURLToPath(new URL("../test/fixtures", import.meta.url));

export function fixturePath(kind: "valid" | "invalid", filename: string): string {
  return join(fixturesRoot, kind, filename);
}

export function readFixture(kind: "valid" | "invalid", filename: string): string {
  return readFileSync(fixturePath(kind, filename), "utf8");
}

export function listFixtures(kind: "valid" | "invalid"): string[] {
  return readdirSync(join(fixturesRoot, kind))
    .filter((name) => name.endsWith(".yaml"))
    .sort();
}

/**
 * Walks up from `fromDir` to find the dagstree monorepo root, identified by
 * `pnpm-workspace.yaml` (the one file that only ever lives at the root —
 * see CLAUDE.md's package layout section). Deliberately not based on
 * `process.cwd()`: `pnpm test` runs `vitest run` from the repo root, but a
 * package-level `vitest run` (e.g. `pnpm --filter @dagstree/schema test`)
 * does not, and both must resolve repo-root-relative paths (like
 * `skills/dagstree/SKILL.md`) to the same place. Pass
 * `fileURLToPath(new URL(".", import.meta.url))` from the calling test file
 * so the walk starts from a location fixed at that file's own path, not
 * wherever the process happened to be launched from.
 */
export function findRepoRoot(fromDir: string): string {
  let dir = fromDir;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not locate the dagstree monorepo root (looked for pnpm-workspace.yaml in every ` +
          `ancestor of "${fromDir}").`,
      );
    }
    dir = parent;
  }
}
