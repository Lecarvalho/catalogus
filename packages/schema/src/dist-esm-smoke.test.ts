import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression coverage for a packaging bug the rest of this suite structurally
// can't see: vitest transforms src/*.ts directly and never touches dist/, so
// a bundler miscompiling an import — e.g. esbuild turning a TS `import X =
// require(...)` into a literal `require(...)` call inside a pure-ESM output
// file — passes every test that imports from "./validate.js" while breaking
// the instant a real ESM consumer (packages/cli, or any ".mjs"/"type":
// "module" file) does `import { parseManifest } from "@catalogus/schema"`.
// This test loads the actual built artifact instead of the TS source, so
// that class of bug fails the suite instead of shipping.
//
// It requires `pnpm build` to have already produced dist/index.js — true
// for this repo's documented verify sequence (`pnpm build` then `pnpm
// test`, see docs/HANDOFF.md) and for CI. On a pristine, unbuilt checkout
// it skips rather than fails, so a bare `vitest run` never reports a false
// negative for a build step it was never asked to run.
const distIndexUrl = new URL("../dist/index.js", import.meta.url);
const distExists = existsSync(fileURLToPath(distIndexUrl));

describe.skipIf(!distExists)("the built dist/index.js loads under native ESM", () => {
  it("imports without throwing and validates a manifest end to end", async () => {
    const dist = await import(/* @vite-ignore */ distIndexUrl.href);
    expect(typeof dist.parseManifest).toBe("function");

    const result = dist.parseManifest(
      "catalogus: 1\nproject:\n  name: X\n  slug: x\nservices: []\ndependencies: []\n",
    );
    expect(result.valid).toBe(true);
  });

  it("still enforces the private-key deny rule after bundling", async () => {
    const dist = await import(/* @vite-ignore */ distIndexUrl.href);
    const result = dist.parseManifest(
      "catalogus: 1\nproject:\n  name: X\n  slug: x\n  monthly_cost: 5\nservices: []\ndependencies: []\n",
    );
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e: { kind: string }) => e.kind === "private-key"),
    ).toBe(true);
  });

  it("still enforces the date format check (proves ajv-formats registered correctly)", async () => {
    const dist = await import(/* @vite-ignore */ distIndexUrl.href);
    const result = dist.parseManifest(
      "catalogus: 1\nproject:\n  name: X\n  slug: x\nservices:\n  - id: a\n    service: b\n    role: c\n    added: not-a-date\ndependencies: []\n",
    );
    expect(result.valid).toBe(false);
  });
});
