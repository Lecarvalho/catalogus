import { describe, expect, it } from "vitest";

import { resolveIconPath } from "./icons.js";

describe("resolveIconPath", () => {
  it("resolves a known ref to real SVG path data", async () => {
    // "nginx" is both a catalog.ts ICON_OVERLAY key and a real installed
    // simple-icons slug (verified directly against the installed package
    // while writing this module) -- its path data starts with "M12 0L1.605".
    const d = await resolveIconPath("nginx");
    expect(d).not.toBeNull();
    expect(d).toMatch(/^M/);
    expect(d!.length).toBeGreaterThan(10);
  });

  it("returns null for undefined -- the 'no verified icon' case", async () => {
    expect(await resolveIconPath(undefined)).toBeNull();
  });

  it("returns null rather than throwing for a slug with no installed icon file", async () => {
    await expect(resolveIconPath("this-slug-does-not-exist-in-simple-icons")).resolves.toBeNull();
  });

  it("returns null rather than throwing for a ref shaped like a path-traversal attempt", async () => {
    // Defence in depth (see icons.ts's SAFE_ICON_REF comment): a ref this
    // package never actually produces itself, but the function must not
    // let it reach the filesystem.
    await expect(resolveIconPath("../../../etc/passwd")).resolves.toBeNull();
    await expect(resolveIconPath("nginx/../../../secret")).resolves.toBeNull();
  });

  it("resolves every real ICON_OVERLAY slug used by another handful of catalog rows, not just nginx", async () => {
    // Cheap breadth check beyond the single nginx case above, without
    // re-importing catalog.ts (that coupling already lives in
    // catalog.test.ts's own icon-resolution suite).
    for (const ref of ["stripe", "github", "react", "typescript"]) {
      const d = await resolveIconPath(ref);
      expect(d, `expected ${ref} to resolve`).not.toBeNull();
    }
  });
});
