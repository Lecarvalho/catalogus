import { rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsup";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const webDistDir = join(packageRoot, "dist", "web");

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  // `clean: true` above only knows about the entries this config declares
  // (index.js, cli.js, their .d.ts/.map siblings) -- it is not scoped to
  // leave dist/web/ (scripts/bundle-web.mjs's copy of apps/web/dist,
  // placed there by the *root* build, never by this package's own "build"
  // script) alone. Running `pnpm --filter @catalogus/cli build` in isolation, on
  // a repo that already had a complete dist/web from an earlier root
  // build, wipes dist/web/index.html while leaving its now-empty assets/
  // subdirectory behind. createViewServer's own guard (commands/view.ts)
  // checks for index.html specifically, so it never starts a server
  // against that half-built state -- but the half state sitting on disk is
  // still a landmine for the next thing that stats dist/web and finds it
  // "exists". Delete the remainder here so an isolated cli build leaves
  // dist/web either complete (a subsequent root `pnpm build` copies a
  // fresh one back in) or entirely absent, never partial (D2, Phase 3.7
  // hardening pass).
  //
  // This does not, and must not, rebuild dist/web itself -- doing that
  // here would mean packages/cli depending on @catalogus/web at build time,
  // the workspace cycle scripts/bundle-web.mjs's own comment already rules
  // out.
  //
  // The same gap reaches publishing: this package's "files": ["dist"] and
  // "build": "tsup" mean `npm publish` from packages/cli alone -- without
  // the root build having run first -- ships a dist/ with no web/ at all,
  // and this hook cannot fix that (there is nothing to clean up; dist/web
  // was simply never produced). No guard against that exists today; if
  // this package is ever published on its own rather than through a
  // root-build-then-publish sequence, that gap needs closing first.
  onSuccess: async () => {
    if ((await exists(webDistDir)) && !(await exists(join(webDistDir, "index.html")))) {
      await rm(webDistDir, { recursive: true, force: true });
    }
  },
});
