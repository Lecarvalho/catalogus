import { describe, expect, it } from "vitest";

import { rollupLabel } from "./rollup-labels.js";

describe("rollupLabel", () => {
  it("fixes the one truncation-shaped rollup: coding-agent's rollup 'coding' reads as a whole phrase", () => {
    expect(rollupLabel("coding")).toBe("Coding agent");
  });

  it("labels a rollup examples/reference.catalogus.yaml and SKILL.md's vocabulary both name", () => {
    expect(rollupLabel("hosting")).toBe("Hosting");
    expect(rollupLabel("database")).toBe("Database");
    expect(rollupLabel("dns")).toBe("DNS");
  });

  it("falls back to the raw rollup, verbatim, for one this table doesn't name -- not a placeholder", () => {
    expect(rollupLabel("some-rollup-nobody-has-used")).toBe("some-rollup-nobody-has-used");
  });

  // Regression, same shape as Icon.test.tsx's "constructor" case and
  // fallback-icons.tsx's GLYPHS table: `rollup` comes from `role`, and the
  // schema's slug pattern admits "constructor" as a legal value. On a plain
  // object literal this lookup would resolve through Object.prototype to
  // the `Object` function instead of falling through to the raw rollup.
  it("falls back to the raw rollup for 'constructor' rather than inheriting Object.prototype", () => {
    expect(rollupLabel("constructor")).toBe("constructor");
  });
});
