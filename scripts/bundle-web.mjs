#!/usr/bin/env node
// Copies the built web app into the CLI's own dist/, so `dagstree view`
// (packages/cli/src/commands/view.ts) can serve it as a static file tree
// with no runtime dependency on apps/web at all -- by the time this script
// runs, apps/web/dist is a plain folder of HTML/JS/CSS, and the CLI package
// that ships to users needs nothing else to serve it.
//
// A copy rather than a symlink or a build-time alias: packages/cli/package.json
// already lists "dist" under `files`, so a plain copy ships with the
// published package for free, with no change needed there (a symlink would
// not survive npm's own packing step the same way).
//
// Run as the last step of the root build ("pnpm -r run build && node
// scripts/bundle-web.mjs"), after apps/web has already been built --
// apps/web declares "dagstree": "workspace:*" as a devDependency (type-only,
// so nothing is bundled) purely so pnpm's own topological ordering builds
// packages/cli before apps/web; this script is what then moves apps/web's
// own output into packages/cli/dist, a step pnpm's dependency graph has no
// way to express on its own, since apps/web is not a runtime dependency of
// the CLI at all -- see docs/PLAN.md's Phase 3.7 section for why that split
// is deliberate (the CLI must never depend on @dagstree/web, which would be
// a workspace cycle).
import { cp, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(repoRoot, "apps", "web", "dist");
const destination = join(repoRoot, "packages", "cli", "dist", "web");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(source))) {
    console.error(`${source} does not exist -- did "pnpm --filter @dagstree/web build" run first?`);
    process.exitCode = 1;
    return;
  }

  // Clean first: a stale file from a previous build (a renamed or removed
  // hashed asset) must not linger next to the new ones, where the static
  // server would keep serving it indefinitely.
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });

  console.log(`Copied ${source} -> ${destination}`);
}

await main();
