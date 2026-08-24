import { defineConfig } from "vitest/config";

// Root config so a single `pnpm test` (i.e. `vitest run` from the repo root)
// discovers and runs every package's tests without needing per-package
// vitest invocations wired into the workspace script graph.
export default defineConfig({
  test: {
    // apps/*/src includes .test.tsx alongside .test.ts -- apps/web is the
    // first workspace member with React components, which is the only
    // thing that needs the .tsx extension at all. The environment stays
    // node-default here; a DOM test opts in per-file with a
    // `// @vitest-environment jsdom` docblock (see apps/web/src/components/
    // Icon.test.tsx) rather than this config switching the default for
    // every existing packages/* test too.
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    passWithNoTests: false,
  },
});
