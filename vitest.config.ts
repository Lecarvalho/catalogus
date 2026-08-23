import { defineConfig } from "vitest/config";

// Root config so a single `pnpm test` (i.e. `vitest run` from the repo root)
// discovers and runs every package's tests without needing per-package
// vitest invocations wired into the workspace script graph.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    passWithNoTests: false,
  },
});
