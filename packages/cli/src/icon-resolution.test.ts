import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveServiceIcon } from "./icon-resolution.js";
import { createTempDir, removeTempDir, writeFixtureFile } from "./test-support/temp-dir.js";

// A clean, multi-path SVG -- two fills, neither currentColor -- proving
// resolveServiceIcon's "local" branch keeps fills verbatim (the `brand`
// policy resolveLocalIcon itself applies, with hex always null; see
// @catalogus/core's icons.ts, whose own icons.test.ts already covers the
// sanitiser and the policy in depth) rather than this file re-testing that
// machinery a second time.
const CLEAN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<path d="M1 1h2v2h-2z" fill="#123456"/><path d="M3 3h2v2h-2z" fill="#abcdef"/></svg>';

function baseEntry(overrides: Partial<Parameters<typeof resolveServiceIcon>[1]> = {}) {
  return {
    id: "svc",
    service: "some-slug-nobody-has-catalogued",
    role: "widget-thing",
    added: "2026-01-01",
    ...overrides,
  } as Parameters<typeof resolveServiceIcon>[1];
}

describe("resolveServiceIcon", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("resolves 'local' with the icon's own fills kept and hex null when the entry names a valid vendored file", async () => {
    await mkdir(join(dir, ".catalogus", "icons"), { recursive: true });
    await writeFixtureFile(dir, ".catalogus/icons/svc.svg", CLEAN_SVG);

    const resolution = await resolveServiceIcon(dir, baseEntry({ icon: ".catalogus/icons/svc.svg" }));

    expect(resolution.source).toBe("local");
    expect(resolution.localPath).toBe(".catalogus/icons/svc.svg");
    expect(resolution.stale).toBe(false);
    expect(resolution.icon).not.toBeNull();
    expect(resolution.icon!.hex).toBeNull();
    expect(resolution.icon!.body).toContain('fill="#123456"');
    expect(resolution.icon!.body).toContain('fill="#abcdef"');
  });

  it("reports 'local' with stale: true, refusalReason undefined, and a null icon when the named file is missing and the catalog has nothing to fall back to", async () => {
    const resolution = await resolveServiceIcon(dir, baseEntry({ icon: ".catalogus/icons/missing.svg" }));

    expect(resolution.source).toBe("local");
    expect(resolution.localPath).toBe(".catalogus/icons/missing.svg");
    expect(resolution.stale).toBe(true);
    // D3 (validator, 2026-09-04): refusalReason stays undefined for a
    // genuinely absent file -- commands/icons.ts's "(missing file)" label
    // branches on exactly this, distinct from the "(refused: <reason>)"
    // case the next test proves.
    expect(resolution.refusalReason).toBeUndefined();
    expect(resolution.icon).toBeNull();
  });

  // D3 (validator, 2026-09-04): before refusalReason existed, this case --
  // a file that exists but the sanitiser refuses -- was reported identically
  // to the missing-file case above (both "stale: true", nothing to tell
  // them apart), which sent an agent following the skill's 7b loop back to
  // re-fetch a URL whose refusal will never change on a second try.
  it("reports 'local' with stale: true and a refusalReason naming the sanitiser when the named file exists but is refused", async () => {
    const hostileSvg = `${'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'}<script>alert(1)</script><path d="M0 0"/></svg>`;
    await mkdir(join(dir, ".catalogus", "icons"), { recursive: true });
    await writeFixtureFile(dir, ".catalogus/icons/svc.svg", hostileSvg);

    const resolution = await resolveServiceIcon(dir, baseEntry({ icon: ".catalogus/icons/svc.svg" }));

    expect(resolution.source).toBe("local");
    expect(resolution.stale).toBe(true);
    expect(resolution.refusalReason).toMatch(/sanitiser/i);
    expect(resolution.icon).toBeNull();
  });

  it("falls back to the catalog icon when the named local file is missing but the catalog service has a verified icon", async () => {
    // "nginx" has a real simple-icons row (see @catalogus/core's catalog.ts
    // and view-payload.test.ts's own "ingress" fixture).
    const resolution = await resolveServiceIcon(
      dir,
      baseEntry({ service: "nginx", icon: ".catalogus/icons/missing.svg" })
    );

    expect(resolution.source).toBe("local");
    expect(resolution.stale).toBe(true);
    expect(resolution.icon).not.toBeNull();
    expect(resolution.icon!.viewBox).toBe("0 0 24 24");
  });

  it("resolves 'simple-icons' when the entry has no icon field and the catalog has a simple-icons ref", async () => {
    const resolution = await resolveServiceIcon(dir, baseEntry({ service: "nginx" }));

    expect(resolution.source).toBe("simple-icons");
    expect(resolution.stale).toBe(false);
    expect(resolution.localPath).toBeUndefined();
    expect(resolution.icon).not.toBeNull();
  });

  it("resolves 'thesvg' when the entry has no icon field and the catalog ref is thesvg-prefixed", async () => {
    // "openai" resolves through a vendored thesvg.org file, not simple-icons
    // -- see view-payload.test.ts's own "llm" fixture and catalog.ts's
    // THESVG_ICON_OVERLAY.
    const resolution = await resolveServiceIcon(dir, baseEntry({ service: "openai" }));

    expect(resolution.source).toBe("thesvg");
    expect(resolution.icon).not.toBeNull();
    expect(resolution.icon!.hex).toBe("#000000");
  });

  it("resolves 'none' with a null icon when neither the entry nor the catalog names anything", async () => {
    const resolution = await resolveServiceIcon(dir, baseEntry());

    expect(resolution.source).toBe("none");
    expect(resolution.stale).toBe(false);
    expect(resolution.icon).toBeNull();
  });

  // The defensive floor: proven by building the entry object directly
  // (bypassing @catalogus/schema's own pattern, which already refuses `..`
  // on write -- see schema.ts's serviceEntry.icon) so this exercises the
  // floor itself rather than the schema's refusal to ever produce such a
  // value.
  it("refuses a path outside .catalogus/icons/ even when the schema is bypassed", async () => {
    // .catalogus/icons/../../evil.svg, joined onto `dir`, collapses to
    // `dir/evil.svg` -- inside the manifest's own directory, but outside
    // .catalogus/icons/, which is exactly the distinction this floor exists
    // to catch (not merely "somewhere under the project root").
    await writeFixtureFile(dir, "evil.svg", CLEAN_SVG);

    const resolution = await resolveServiceIcon(dir, baseEntry({ icon: ".catalogus/icons/../../evil.svg" }));

    expect(resolution.source).toBe("local");
    expect(resolution.stale).toBe(true);
    // Reported as refused, not missing: the containment floor is what
    // refused this, and a real file sits at the resolved path -- see
    // resolveServiceIcon's own comment on why this branch is deliberately
    // not asked to distinguish "outside the icons dir, and also missing"
    // from "outside the icons dir, but present".
    expect(resolution.refusalReason).toBe("outside .catalogus/icons/");
    expect(resolution.icon).toBeNull();
  });
});
