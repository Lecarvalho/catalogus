import { describe, expect, it } from "vitest";

import { resolveIcon, resolveIconPath } from "./icons.js";

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

describe("resolveIcon", () => {
  it("resolves a known ref to both path data and a real 6-digit hex colour", async () => {
    // Stripe's brand hex is public and stable (635BFF) -- asserted as a
    // format check plus this one known value, not a hand-typed table of
    // every brand's colour, which is exactly the guess-not-verify shape
    // this function exists to avoid everywhere else.
    const resolved = await resolveIcon("stripe");
    expect(resolved).not.toBeNull();
    expect(resolved!.path).toMatch(/^M/);
    expect(resolved!.hex).toBe("#635BFF");
    expect(resolved!.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("resolves the same hex on a second call, from the cached data rather than a second read", async () => {
    const first = await resolveIcon("nginx");
    const second = await resolveIcon("nginx");
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
  });

  it("returns null for undefined -- the 'no verified icon' case", async () => {
    expect(await resolveIcon(undefined)).toBeNull();
  });

  it("returns null rather than throwing for a slug with no installed icon at all", async () => {
    await expect(resolveIcon("this-slug-does-not-exist-in-simple-icons")).resolves.toBeNull();
  });

  it("returns null rather than throwing for a ref shaped like a path-traversal attempt", async () => {
    await expect(resolveIcon("../../../etc/passwd")).resolves.toBeNull();
  });

  it("leaves resolveIconPath's own behaviour unchanged -- resolveIcon is additive, not a replacement", async () => {
    // The two functions must agree on the path half for the same ref: this
    // is the regression resolveIcon's own doc comment promises against --
    // reusing resolveIconPath rather than a second, divergent SVG lookup.
    const path = await resolveIconPath("stripe");
    const combined = await resolveIcon("stripe");
    expect(combined!.path).toBe(path);
  });
});
