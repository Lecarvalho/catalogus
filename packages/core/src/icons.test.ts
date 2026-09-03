import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { parseThesvgMarkup, resolveIcon } from "./icons.js";

// A live ESM binding for a Node builtin (`import * as fsPromises from
// "node:fs/promises"`) is non-configurable -- `vi.spyOn` on it throws
// "Cannot redefine property" rather than installing. `vi.mock` with
// `vi.hoisted` is the pattern vitest itself documents for this: it replaces
// the module in this file's own isolated module graph (vitest gives every
// test file its own, so this cannot leak into another file's tests), and
// the wrapper below calls straight through to the real implementation
// unless a test has armed `readFileMockState.failNext` -- so every other
// test in this file, including the sha256 drift suite's own `readFile`
// import above, reads real files exactly as it would unmocked.
const readFileMockState = vi.hoisted(() => ({ failNext: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: (...args: Parameters<typeof actual.readFile>) => {
      if (readFileMockState.failNext) {
        readFileMockState.failNext = false;
        return Promise.reject(new Error("simulated ENOENT"));
      }
      return actual.readFile(...args);
    },
  };
});

const THESVG_DIR = new URL("../icons/thesvg/", import.meta.url);

describe("resolveIcon: simple-icons refs (unprefixed)", () => {
  it("resolves a known ref to real SVG body markup, wrapped in a currentColor path", async () => {
    // "nginx" is both a catalog.ts ICON_OVERLAY key and a real installed
    // simple-icons slug (verified directly against the installed package
    // while writing this module) -- its path data starts with "M12 0L1.605".
    const resolved = await resolveIcon("nginx");
    expect(resolved).not.toBeNull();
    expect(resolved!.viewBox).toBe("0 0 24 24");
    expect(resolved!.body).toMatch(/^<path d="M12 0L1\.605.*" fill="currentColor"\/>$/);
    expect(resolved!.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("resolves a known ref to both markup and a real 6-digit hex colour", async () => {
    // Stripe's brand hex is public and stable (635BFF) -- asserted as a
    // format check plus this one known value, not a hand-typed table of
    // every brand's colour, which is exactly the guess-not-verify shape
    // resolveIcon exists to avoid everywhere else.
    const resolved = await resolveIcon("stripe");
    expect(resolved).not.toBeNull();
    expect(resolved!.body).toMatch(/^<path d="M/);
    expect(resolved!.hex).toBe("#635BFF");
  });

  it("resolves the same result on a second call, from the cached hex data rather than a second read", async () => {
    const first = await resolveIcon("nginx");
    const second = await resolveIcon("nginx");
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
  });

  it("returns null for undefined -- the 'no verified icon' case", async () => {
    expect(await resolveIcon(undefined)).toBeNull();
  });

  it("returns null rather than throwing for a slug with no installed icon file", async () => {
    await expect(resolveIcon("this-slug-does-not-exist-in-simple-icons")).resolves.toBeNull();
  });

  it("returns null rather than throwing for a ref shaped like a path-traversal attempt", async () => {
    // Defence in depth (see icons.ts's SAFE_ICON_REF comment): a ref this
    // package never actually produces itself, but the function must not
    // let it reach the filesystem.
    await expect(resolveIcon("../../../etc/passwd")).resolves.toBeNull();
    await expect(resolveIcon("nginx/../../../secret")).resolves.toBeNull();
  });

  it("resolves every real ICON_OVERLAY slug used by another handful of catalog rows, not just nginx", async () => {
    // Cheap breadth check beyond the single nginx case above, without
    // re-importing catalog.ts (that coupling already lives in
    // catalog.test.ts's own icon-resolution suite).
    for (const ref of ["stripe", "github", "react", "typescript"]) {
      const resolved = await resolveIcon(ref);
      expect(resolved, `expected ${ref} to resolve`).not.toBeNull();
    }
  });
});

describe("resolveIcon: thesvg refs (thesvg:<slug>)", () => {
  // Per-icon outcomes match docs/icons-brief.md's own table exactly: path
  // counts and viewBox were verified against the fetched files before they
  // were vendored, and are re-asserted here so an edit to the fill-policy
  // table (icons.ts's THESVG_ICONS) or to a vendored file can't silently
  // change what the viewer paints without a test noticing.

  it("aws: brand policy -- keeps both fills verbatim (the orange smile and the currentColor text), null hex", async () => {
    const resolved = await resolveIcon("thesvg:aws");
    expect(resolved).not.toBeNull();
    expect(resolved!.viewBox).toBe("0 0 24 24");
    expect(resolved!.hex).toBeNull();
    expect(resolved!.body).toContain('fill="#F90"');
    // aws.svg sets fill="currentColor" once, as a default on the root <svg>,
    // on its one child with no fill of its own -- withElementDefault
    // materialises that explicitly (icons.ts's parseThesvgMarkup comment),
    // so it must survive as a real attribute here, not merely as something
    // that used to be true only by inheritance from a tag this module drops.
    expect(resolved!.body).toContain('fill="currentColor"');
    expect(resolved!.body).not.toContain("data-knockout");
    expect((resolved!.body.match(/<path\b/g) ?? []).length).toBe(2);
  });

  it("csharp: brand policy with a knockout -- the two letter paths lose their fill and gain data-knockout, no #fff survives", async () => {
    const resolved = await resolveIcon("thesvg:csharp");
    expect(resolved).not.toBeNull();
    expect(resolved!.viewBox).toBe("0 -1.43 255.58 290.11");
    expect(resolved!.hex).toBeNull();
    expect(resolved!.body).toContain('fill="#a179dc"');
    expect(resolved!.body).toContain('fill="#280068"');
    expect(resolved!.body).toContain('fill="#390091"');
    expect(resolved!.body).not.toMatch(/fill="#fff"/i);
    expect(resolved!.body).not.toMatch(/fill="#ffffff"/i);
    // The knockout fill sits on the <g> wrapping the two letter paths, not
    // on the paths themselves (see icons.ts's FILL_ATTR_RE comment) -- one
    // data-knockout marker, covering both letters through SVG's own fill
    // inheritance once the viewer paints it as the page ground.
    expect((resolved!.body.match(/data-knockout/g) ?? []).length).toBe(1);
    expect((resolved!.body.match(/<path\b/g) ?? []).length).toBe(5);
  });

  it("openai: ink policy -- every fill becomes currentColor, hex is the manifest's black", async () => {
    const resolved = await resolveIcon("thesvg:openai");
    expect(resolved).not.toBeNull();
    expect(resolved!.viewBox).toBe("0 0 256 260");
    expect(resolved!.hex).toBe("#000000");
    expect(resolved!.body).toContain('fill="currentColor"');
    expect(resolved!.body).not.toMatch(/fill="#/i);
    expect((resolved!.body.match(/<path\b/g) ?? []).length).toBe(1);
  });

  it("slack: brand policy -- keeps all four brand colours, no knockout", async () => {
    const resolved = await resolveIcon("thesvg:slack");
    expect(resolved).not.toBeNull();
    expect(resolved!.viewBox).toBe("0 0 2447.6 2452.5");
    expect(resolved!.hex).toBeNull();
    for (const hex of ["#36c5f0", "#2eb67d", "#ecb22e", "#e01e5a"]) {
      expect(resolved!.body.toLowerCase()).toContain(`fill="${hex}"`);
    }
    expect(resolved!.body).not.toContain("data-knockout");
    expect((resolved!.body.match(/<path\b/g) ?? []).length).toBe(4);
  });

  it("google-vertex-ai (thesvg:googlevertexai): brand policy -- keeps all three blues, no knockout", async () => {
    const resolved = await resolveIcon("thesvg:googlevertexai");
    expect(resolved).not.toBeNull();
    expect(resolved!.viewBox).toBe("0 0 24 24");
    expect(resolved!.hex).toBeNull();
    for (const hex of ["#4285f4", "#669df6", "#aecbfa"]) {
      expect(resolved!.body.toLowerCase()).toContain(`fill="${hex}"`);
    }
    expect(resolved!.body).not.toContain("data-knockout");
    expect((resolved!.body.match(/<path\b/g) ?? []).length).toBe(8);
  });

  it("codex and xai: ink policy with no brand hex -- one currentColor path each, hex null so colour mode paints them in the surrounding ink", async () => {
    for (const slug of ["codex", "xai"]) {
      const resolved = await resolveIcon(`thesvg:${slug}`);
      expect(resolved, slug).not.toBeNull();
      expect(resolved!.viewBox, slug).toBe("0 0 24 24");
      expect(resolved!.hex, slug).toBeNull();
      expect(resolved!.body, slug).toContain('fill="currentColor"');
      expect(resolved!.body, slug).not.toMatch(/fill="#/i);
      expect((resolved!.body.match(/<path\b/g) ?? []).length, slug).toBe(1);
    }
  });

  it("returns null for a thesvg ref naming a slug this table doesn't carry -- e.g. loki, which stays a fallback deliberately", async () => {
    await expect(resolveIcon("thesvg:loki")).resolves.toBeNull();
    await expect(resolveIcon("thesvg:notarealslug")).resolves.toBeNull();
  });

  it("returns null rather than throwing for a thesvg ref shaped like a path-traversal attempt", async () => {
    await expect(resolveIcon("thesvg:../../../etc/passwd")).resolves.toBeNull();
    await expect(resolveIcon("thesvg:aws/../../../secret")).resolves.toBeNull();
  });

  it("returns null when a registered thesvg file fails to read from disk", async () => {
    // The fixed THESVG_ICONS table only ever names one of the five vendored
    // files, and the sha256 drift test below guarantees those stay present
    // and unedited -- so there is no *registered* slug whose file is
    // genuinely absent short of tampering the repo. This simulates that one
    // remaining failure mode (a transient read error, a deleted file)
    // directly at the fs layer, for the one call resolveIcon("thesvg:openai")
    // is expected to make -- readFileMockState.failNext (see this file's
    // vi.mock above) is consumed by the very next readFile call, so it
    // cannot bleed into any other test's real file reads.
    readFileMockState.failNext = true;
    await expect(resolveIcon("thesvg:openai")).resolves.toBeNull();
    expect(readFileMockState.failNext).toBe(false);
  });
});

describe("parseThesvgMarkup: sanitiser refusals on synthetic files", () => {
  // None of the five vendored files trip any of these -- confirmed by
  // reading all five directly -- so every case here is adversarial input
  // this module has never actually been handed, proving the refusal exists
  // rather than merely asserting it never fired.
  const VIEWBOX_SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';

  it("refuses a file containing <script>", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<script>alert(1)</script><path d="M0 0"/></svg>`;
    expect(parseThesvgMarkup(svg)).toBeNull();
  });

  it("refuses a file containing <foreignObject>", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject></svg>`;
    expect(parseThesvgMarkup(svg)).toBeNull();
  });

  it("refuses a file containing an on* event-handler attribute", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" onload="alert(1)"/></svg>`;
    expect(parseThesvgMarkup(svg)).toBeNull();
  });

  it("refuses a file containing an href attribute", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<a href="https://evil.example"><path d="M0 0"/></a></svg>`;
    expect(parseThesvgMarkup(svg)).toBeNull();
  });

  it("refuses a file containing an xlink:href attribute", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<use xlink:href="#evil"/></svg>`;
    expect(parseThesvgMarkup(svg)).toBeNull();
  });

  it("refuses a file containing a <style> block", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<style>path{fill:red}</style><path d="M0 0"/></svg>`;
    expect(parseThesvgMarkup(svg)).toBeNull();
  });

  it("refuses a file with a second, nested <svg>", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<svg viewBox="0 0 1 1"><path d="M0 0"/></svg></svg>`;
    expect(parseThesvgMarkup(svg)).toBeNull();
  });

  it("refuses a file with no viewBox on the root element", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    expect(parseThesvgMarkup(svg)).toBeNull();
  });

  it("accepts a clean file and strips <title>/<desc>, proving the refusals above are about content, not shape", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<title>Probe</title><desc>A probe icon</desc><path d="M0 0" fill="#000"/></svg>`;
    const parsed = parseThesvgMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.viewBox).toBe("0 0 24 24");
    expect(parsed!.body).not.toContain("<title>");
    expect(parsed!.body).not.toContain("<desc>");
    expect(parsed!.body).toContain('<path d="M0 0" fill="#000"/>');
  });

  it("matches a knockout-shaped fill case-insensitively in both 3- and 6-digit form", () => {
    // Not exercised by any of the five vendored files in this exact pair
    // (csharp's own knockout is 3-digit lowercase only) -- this is the
    // "both spellings" case icons.ts's normalizeHexValue comment promises.
    const svg = `${VIEWBOX_SVG_OPEN}<g fill="#FFF"><path d="M0 0"/></g><path d="M1 1" fill="#FFFFFF"/></svg>`;
    const parsed = parseThesvgMarkup(svg);
    expect(parsed).not.toBeNull();
    // parseThesvgMarkup only extracts { viewBox, body } -- the knockout
    // transform itself is icons.ts's private applyKnockout, exercised
    // end-to-end through resolveIcon("thesvg:csharp") above. This proves
    // parseThesvgMarkup carries both spellings through unmodified for that
    // later step to act on.
    expect(parsed!.body).toContain('fill="#FFF"');
    expect(parsed!.body).toContain('fill="#FFFFFF"');
  });
});

describe("vendored thesvg files: sha256 drift against LICENSES.md", () => {
  // Guards LICENSES.md's own provenance record: if a vendored file is ever
  // edited (even by one byte), its recomputed hash stops matching what's
  // recorded, and this fails -- so the record and the bytes it describes
  // can never quietly drift apart. TRADEMARK.md asks for unmodified marks;
  // this is what keeps that true after the fact, not just at vendoring time.
  const FILES: Record<string, string> = {
    "aws.svg": "65e2ca39ef0669dbb0323bc5ab69f981b8087d8ebb3e4a3bce1d3b32b3b67151",
    "csharp.svg": "637b695492be05f7d0ec6977de4aa9b46133df52315be214c34572d176c8a1e3",
    "openai.svg": "db81a8225166f02f773304ba4d8f0141343da5f43870d8b41f10bf6bc59840c8",
    "slack.svg": "29734796b3a85f9d0e03150d53142fab0b7f994ae80c7e3e1efd0bef52c12f5d",
    "googlevertexai.svg": "36a5bbdaffe24fa703ad938716f81c45e78042faaf3ae8a45009e2710aaa3548",
    "codex.svg": "5f424b10216e17cd79c5f852138969453e031066e68a8d9c661e74534276ed9c",
    "xai.svg": "823bbbf2c6781192aa849f69dbaf57c8caffa21d39e79992c473dacaad2b09f5",
  };

  it("every vendored file's recomputed sha256 matches its own hardcoded value here", async () => {
    for (const [file, expectedHash] of Object.entries(FILES)) {
      const bytes = await readFile(new URL(file, THESVG_DIR));
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      expect(actualHash, `${file} sha256`).toBe(expectedHash);
    }
  });

  it("LICENSES.md records the same sha256 this test just computed for every file, so the two can't drift apart", async () => {
    const licenses = await readFile(new URL("LICENSES.md", THESVG_DIR), "utf8");
    for (const [file, expectedHash] of Object.entries(FILES)) {
      expect(licenses, `LICENSES.md should record ${file}'s sha256`).toContain(expectedHash);
    }
  });
});
