import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  describeLocalIconRefusal,
  findIconRenderRisks,
  hoistStyleOnAttrs,
  MAX_ICON_BYTES,
  parseIconMarkup,
  resolveIcon,
  resolveLocalIcon,
} from "./icons.js";

// A live ESM binding for a Node builtin (`import * as fsPromises from
// "node:fs/promises"`) is non-configurable -- `vi.spyOn` on it throws
// "Cannot redefine property" rather than installing. `vi.mock` with
// `vi.hoisted` is the pattern vitest itself documents for this: it replaces
// the module in this file's own isolated module graph (vitest gives every
// test file its own, so this cannot leak into another file's tests), and
// the wrapper below calls straight through to the real implementation
// unless a test has armed `readFileMockState.failNext` -- so every other
// test in this file, including the sha256 drift suite's own `readFile`
// import above, reads real files exactly as it would unmocked. `calls`
// (added 2026-09-04, alongside resolveLocalIcon) counts every invocation
// regardless of failNext, so a test can prove readFile was never reached at
// all -- the MAX_ICON_BYTES cap test below needs exactly that: not "it came
// back null" (a parse refusal would look the same) but "the size check
// short-circuited before any read was attempted".
const readFileMockState = vi.hoisted(() => ({ failNext: false, calls: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: (...args: Parameters<typeof actual.readFile>) => {
      readFileMockState.calls += 1;
      if (readFileMockState.failNext) {
        readFileMockState.failNext = false;
        return Promise.reject(new Error("simulated ENOENT"));
      }
      return actual.readFile(...args);
    },
  };
});

const THESVG_DIR = new URL("../icons/thesvg/", import.meta.url);

// Shared between the parseIconMarkup refusal suite and the resolveLocalIcon
// suite below -- both write synthetic SVG bytes that start from the same
// minimal, valid open tag.
const VIEWBOX_SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';

// Two real owner-supplied files from an actual client repo (2026-09-06),
// copied here verbatim rather than paraphrased -- both carry their paint in
// `style="..."` instead of a presentation attribute, which is exactly the
// shape the hoist below (and the render-risk scan further down) exist for.
// Loki's real file has fourteen gradients; this is the same shape, trimmed
// to two stops.
const HEALTHCHECKS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" viewBox="46.6 2.94 418.8 506.2">' +
  '<path d="M309.2 899.8h-45.3l41.4 246.7h46.1l24-142.8h70.1l4.9-46.7H335.9l-7.5 44.6z" ' +
  'style="fill-rule:evenodd;clip-rule:evenodd;fill:#22bc66;stroke:#22bc66;stroke-width:30" ' +
  'transform="translate(0 -652.362)"/>' +
  '<path d="m218.9 670.3-47.6 283.1H68.6l-7 46.7h74.3l14.4 85.9h46.1l20.7-115.8 22.8-135.4 52.7-.1L265 670.3z" ' +
  'style="fill-rule:evenodd;clip-rule:evenodd;fill:#ffffff;stroke:#ffffff;stroke-width:30" ' +
  'transform="translate(0 -652.362)"/>' +
  "</svg>";

const LOKI_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
  '<linearGradient id="a" x1="485.057" x2="485.057" y1="-705.376" y2="-74.565" gradientUnits="userSpaceOnUse">' +
  '<stop offset="0" style="stop-color:#faed1e"/><stop offset="1" style="stop-color:#f15b2b"/>' +
  "</linearGradient>" +
  '<path d="m139.6 464.9-40.8 6.3 6.3 40.8 40.8-6.3z" style="fill:url(#a)"/>' +
  "</svg>";

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
    // materialises that explicitly (icons.ts's parseIconMarkup comment),
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

  it("all seven thesvg refs still resolve, and none of their bodies contain a style= attribute -- hoistStyleAttributes runs but has nothing to do on any of them", async () => {
    // None of the five vendored files carried a style attribute before the
    // 2026-09-06 hoist change (confirmed by reading all five directly), so
    // this is the "still byte-identical" guarantee the hoist promises for
    // this set: every per-file assertion in the tests above this one --
    // exact fill counts, exact path counts, exact viewBox strings -- is
    // unchanged from before this change, and this adds the one assertion
    // those tests don't already make individually.
    for (const slug of ["aws", "csharp", "openai", "slack", "googlevertexai", "codex", "xai"]) {
      const resolved = await resolveIcon(`thesvg:${slug}`);
      expect(resolved, slug).not.toBeNull();
      expect(resolved!.body, slug).not.toContain("style=");
    }
  });
});

describe("parseIconMarkup: sanitiser refusals on synthetic files", () => {
  // None of the five vendored files trip any of these -- confirmed by
  // reading all five directly -- so every case here is adversarial input
  // this module has never actually been handed, proving the refusal exists
  // rather than merely asserting it never fired. Renamed from
  // parseThesvgMarkup 2026-09-04 (icons.ts's own comment); the cases below
  // are unchanged.

  it("refuses a file containing <script>", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<script>alert(1)</script><path d="M0 0"/></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("refuses a file containing <foreignObject>", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("refuses a file containing an on* event-handler attribute", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" onload="alert(1)"/></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("refuses a file containing an href attribute", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<a href="https://evil.example"><path d="M0 0"/></a></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("refuses a file containing an xlink:href attribute", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<use xlink:href="#evil"/></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("refuses a file containing a <style> block", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<style>path{fill:red}</style><path d="M0 0"/></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("refuses a file with a second, nested <svg>", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<svg viewBox="0 0 1 1"><path d="M0 0"/></svg></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("refuses a file with no viewBox on the root element", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("accepts a clean file and strips <title>/<desc>, proving the refusals above are about content, not shape", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<title>Probe</title><desc>A probe icon</desc><path d="M0 0" fill="#000"/></svg>`;
    const parsed = parseIconMarkup(svg);
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
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    // parseIconMarkup only extracts { viewBox, body } -- the knockout
    // transform itself is icons.ts's private applyKnockout, exercised
    // end-to-end through resolveIcon("thesvg:csharp") above. This proves
    // parseIconMarkup carries both spellings through unmodified for that
    // later step to act on.
    expect(parsed!.body).toContain('fill="#FFF"');
    expect(parsed!.body).toContain('fill="#FFFFFF"');
  });

  // D8 (validator, 2026-09-04): a `url(...)` functional value is legal
  // inside a plain `style="..."` attribute, which none of the checks above
  // ever refuse (only a <style> *block* is blocked) -- and a browser
  // resolves a non-fragment url() as a real network fetch the moment the
  // mark renders. `style="fill:url(https://evil)"` used to sail straight
  // through parseIconMarkup with everything else in this describe block
  // still passing, because nothing here had ever looked inside a url()
  // argument at all.
  it("refuses a url() functional value whose argument is an unquoted https:// address", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style="fill:url(https://evil.example/x)"/></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("refuses a url() functional value whose argument is a double-quoted https:// address", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style='fill:url("https://evil.example/x")'/></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("refuses a url() functional value with leading whitespace before an http:// argument", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style="fill:url( http://evil.example/x )"/></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("accepts url(#grad), a same-document fragment reference -- a local gradient a brand mark defines is legitimate", () => {
    const svg =
      `${VIEWBOX_SVG_OPEN}<linearGradient id="grad"><stop offset="0" stop-color="#000"/></linearGradient>` +
      `<path d="M0 0" fill="url(#grad)"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('fill="url(#grad)"');
  });

  it("refuses a url() whose argument opens with a quote it never closes -- url('https://...) must not slip past on a quote mismatch", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style="fill:url('https://evil.example/x)"/></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  it("accepts url('#grad') and url(\"#grad\"), quoted same-document fragment references", () => {
    const svg =
      `${VIEWBOX_SVG_OPEN}<linearGradient id="grad"><stop offset="0" stop-color="#000"/></linearGradient>` +
      `<path d="M0 0" fill="url('#grad')"/><path d="M1 1" fill='url("#grad")'/></svg>`;
    expect(parseIconMarkup(svg)).not.toBeNull();
  });
});

describe("parseIconMarkup: hoisting paint out of style=\"...\" into presentation attributes", () => {
  // Added 2026-09-06: real owner-supplied files carry their colour in
  // `style="..."` instead of a presentation attribute -- neither the
  // viewer's monochrome CSS rule (Icon.module.css's
  // `.icon:not(.fallback):not(.colour) svg [fill]` selector) nor
  // findIconRenderRisks below ever look inside a style string, so this
  // hoist is what makes both actually see the colour a file like
  // Healthchecks' or Loki's really carries.

  it("healthchecks: hoists fill/stroke/stroke-width/fill-rule off both paths, leaving only clip-rule behind in style", () => {
    const parsed = parseIconMarkup(HEALTHCHECKS_SVG);
    expect(parsed).not.toBeNull();
    const body = parsed!.body;

    expect(body).toContain('fill="#22bc66"');
    expect(body).toContain('stroke="#22bc66"');
    expect(body).toContain('stroke-width="30"');
    expect(body).toContain('fill="#ffffff"');
    expect(body).toContain('stroke="#ffffff"');
    // fill-rule was a root-shared default in none of the vendored thesvg
    // files, but here it rides along in the very same style string as the
    // colour properties, on both paths -- the hoist has no reason to leave
    // it behind while moving its neighbours.
    expect((body.match(/fill-rule="evenodd"/g) ?? []).length).toBe(2);

    // Every style attribute that remains carries exactly clip-rule, and
    // nothing else -- in particular, no `fill:` survives inside any style
    // string on this body.
    const remainingStyles = [...body.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
    expect(remainingStyles).toEqual(["clip-rule:evenodd", "clip-rule:evenodd"]);
    expect(body).not.toMatch(/style="[^"]*fill:/);
  });

  it("loki: hoists stop-color onto both <stop> elements and fill onto the <path>, dropping style entirely", () => {
    const parsed = parseIconMarkup(LOKI_SVG);
    expect(parsed).not.toBeNull();
    const body = parsed!.body;

    expect(body).toContain('stop-color="#faed1e"');
    expect(body).toContain('stop-color="#f15b2b"');
    expect(body).toContain('fill="url(#a)"');
    expect(body).not.toContain("style=");
  });

  it("a style declaration overrides an attribute the element already carries -- SVG/CSS cascade, reproducing the file's real rendering", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" fill="red" style="fill:blue"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('fill="blue"');
    expect(parsed!.body).not.toContain('fill="red"');
    expect(parsed!.body).not.toContain("style=");
  });

  it("leaves clip-rule and any other non-hoisted declaration inside style untouched", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style="clip-rule:evenodd;opacity:0.5"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('style="clip-rule:evenodd;opacity:0.5"');
  });

  it("leaves an element with no style attribute at all byte-identical", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" fill="#000"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path d="M0 0" fill="#000"/>');
  });

  it("hoistStyleOnAttrs refuses (unsafe: true) a hoisted value containing '<'", () => {
    // Unreachable through parseIconMarkup itself: by the time any attrs
    // string reaches hoistStyleOnAttrs, OPENING_TAG_RE has already isolated
    // it, and OPENING_TAG_RE's own attrs group excludes '<'/'>' outright --
    // see hoistStyleOnAttrs's own comment. Proven directly against the
    // function it protects instead, the same defensive-floor testing style
    // SAFE_ICON_REF's own comment describes for itself.
    const attrs = ' style="fill:red<script>alert(1)</script>"';
    expect(hoistStyleOnAttrs(attrs)).toEqual({ attrs, unsafe: true });
  });

  it("hoistStyleOnAttrs leaves attrs with no style attribute alone, unsafe: false", () => {
    const attrs = ' d="M0 0" fill="#000"';
    expect(hoistStyleOnAttrs(attrs)).toEqual({ attrs, unsafe: false });
  });

  // Validator, 2026-09-06 (later): seven edge cases the first cut of the
  // hoist got wrong, each reproduced against the built binary before being
  // fixed here. Every one of them is a shape a real owner-supplied file can
  // carry (Inkscape and Illustrator both emit single-quoted attributes and
  // `!important` on request), not a synthetic curiosity.

  it("hoists out of a single-quoted style='...' attribute exactly as it does a double-quoted one", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style='fill:#ffffff;clip-rule:evenodd'/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('fill="#ffffff"');
    expect(parsed!.body).toMatch(/style="clip-rule:evenodd"/);
    expect(parsed!.body).not.toContain("style='");
    expect(findIconRenderRisks(parsed!.body)).toEqual([{ kind: "light-paint", attribute: "fill", value: "ffffff" }]);
  });

  it("a style declaration overrides a single-quoted attribute too -- one fill survives, not a second one appended after the first", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" fill='red' style="fill:blue"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect((parsed!.body.match(/\sfill\s*=/g) ?? []).length).toBe(1);
    expect(parsed!.body).toContain('fill="blue"');
    expect(parsed!.body).not.toContain("red");
  });

  it("does not treat data-style= or xml:style= as a style attribute -- no paint is invented from an attribute that is not style", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" data-style="fill:red"/><path d="M1 1" xml:style="fill:blue"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path d="M0 0" data-style="fill:red"/><path d="M1 1" xml:style="fill:blue"/>');
  });

  it("strips !important, /* comments */ and whitespace from a hoisted value, and drops a declaration with an empty value outright", () => {
    const svg =
      `${VIEWBOX_SVG_OPEN}<path d="M0 0" style="fill: #ffffff !important; /* brand */ stroke : /* x */ red ; stroke-width:;fill-rule:evenodd"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    const body = parsed!.body;
    expect(body).toContain('fill="#ffffff"');
    expect(body).toContain('stroke="red"');
    expect(body).toContain('fill-rule="evenodd"');
    expect(body).not.toContain("stroke-width");
    expect(body).not.toContain("important");
    expect(body).not.toContain("/*");
    expect(body).not.toContain("style=");
  });

  it("a root <svg style=\"fill:...\"> default is materialised onto children the same way a root fill= attribute is", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="fill:#abcdef"><path d="M0 0"/><path d="M1 1" fill="red"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path d="M0 0" fill="#abcdef" /><path d="M1 1" fill="red"/>');
  });

  it("duplicate style attributes on one element: the first wins and the rest are dropped, the HTML parser's own rule for a duplicate attribute", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style="fill:red" style="fill:blue;opacity:0.5"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path d="M0 0" fill="red" />');
  });

  it("hoistStyleOnAttrs refuses (unsafe: true) a single-quoted style whose hoisted value carries a double quote", () => {
    const attrs = ` style='fill:red"'`;
    expect(hoistStyleOnAttrs(attrs)).toEqual({ attrs, unsafe: true });
  });

  // Second validator pass, 2026-09-06 (later): the declaration splitter cut
  // on every `;`, including one inside a `url(...)` argument, and the hoist
  // only knew quoted attribute values.

  it("does not split a declaration on a ';' inside url(...) -- clip-path:url(#a;fill:#fff;) is one declaration, and no fill is invented from it", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style="clip-path:url(#a;fill:#fff;)"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).not.toMatch(/\sfill\s*=/);
    expect(parsed!.body).toContain('style="clip-path:url(#a;fill:#fff;)"');
    expect(findIconRenderRisks(parsed!.body)).toEqual([]);
  });

  it("hoists fill:url(#a;b) whole rather than cutting it at the ';'", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style="fill:url(#a;b);stroke:#000"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('fill="url(#a;b)"');
    expect(parsed!.body).toContain('stroke="#000"');
    expect(parsed!.body).not.toContain("style=");
  });

  it("hoists out of an unquoted style=fill:#fff attribute, which the HTML parser reads exactly like a quoted one", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style=fill:#fff /></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('fill="#fff"');
    expect(parsed!.body).not.toContain("style=");
  });

  it("a style declaration overrides an unquoted fill=red attribute too -- one fill survives", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" fill=red style="fill:blue"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect((parsed!.body.match(/\sfill\s*=/g) ?? []).length).toBe(1);
    expect(parsed!.body).toContain('fill="blue"');
    expect(parsed!.body).not.toContain("red");
  });

  // Third validator pass, 2026-09-06 (later): `style=` inside another
  // attribute's *value* was read as the style attribute -- the attribute
  // string is now tokenised into name/value pairs, so position decides.

  it("leaves style= inside another attribute's value alone -- id=\"style=fill:white\" is an id, not a style", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<rect id="style=fill:white" width="24" height="24"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<rect id="style=fill:white" width="24" height="24"/>');
    expect(findIconRenderRisks(parsed!.body)).toEqual([]);
  });

  it("hoists the real style while leaving a label whose value happens to contain style= intact", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<g inkscape:label="a style=fill:#fff" style="fill:red"><path d="M0 0"/></g></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('inkscape:label="a style=fill:#fff"');
    expect(parsed!.body).toContain('fill="red"');
    expect(parsed!.body).not.toContain('fill="#fff"');
  });

  it("an existing attribute is matched by position too -- id=\"fill=x\" is not the fill the hoisted value overrides", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path id="fill=x" d="M0 0" style="fill:blue"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('id="fill=x"');
    expect((parsed!.body.match(/\sfill\s*=/g) ?? []).length).toBe(1);
    expect(parsed!.body).toContain('fill="blue"');
  });

  it("a kept declaration carrying a double quote is re-emitted in a single-quoted style, not inside double quotes it would break", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path d="M0 0" style='font-family:"a";fill:#fff'/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain(`style='font-family:"a"'`);
    expect(parsed!.body).toContain('fill="#fff"');
  });

  it("hoistStyleOnAttrs refuses (unsafe: true) when a kept declaration carries both quote kinds -- no quoting can hold it", () => {
    // Unreachable through a real document (a quoted value cannot contain
    // its own quote, an unquoted one contains neither); proven directly.
    const attrs = ` style=font-family:"a'b`;
    expect(hoistStyleOnAttrs(attrs)).toEqual({ attrs, unsafe: true });
  });

  // Fourth validator pass, 2026-09-06 (later): a raw `>` inside a quoted
  // attribute value (a Figma layer name in an `id`) cut the opening tag
  // short, and the tag was rebuilt from the wrong slice.

  it("a '>' inside a quoted attribute value does not end the tag -- the id survives and the style is hoisted", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path style="fill:#22bc66" id="Group 1 > Path" d="M2 12"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path id="Group 1 > Path" d="M2 12" fill="#22bc66" />');
  });

  it("a '>' inside a quoted value after the style: the style is still hoisted and a white fill still flagged", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path id="Group 1 > Path" style="fill:#fff" d="M2 12"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path id="Group 1 > Path" d="M2 12" fill="#fff" />');
    expect(findIconRenderRisks(parsed!.body)).toEqual([{ kind: "light-paint", attribute: "fill", value: "ffffff" }]);
  });

  it("a root default lands correctly on an element whose d attribute carries a '>'", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M0 0 > 1"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path d="M0 0 > 1" fill="currentColor" />');
  });

  it("a '>' inside a root <svg> attribute value does not hide the viewBox", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" data-x="a > b" viewBox="0 0 24 24"><path d="M0 0"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.viewBox).toBe("0 0 24 24");
  });

  it("a character reference's own ';' is not a declaration separator -- fill:&#35;fff hoists whole", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path style="fill:&#35;fff;stroke:&#x23;000" d="M0 0"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('fill="&#35;fff"');
    expect(parsed!.body).toContain('stroke="&#x23;000"');
    expect(parsed!.body).not.toContain("style=");
  });

  it("duplicate raw attributes by a hoisted name: the first becomes the hoisted value and the later ones are dropped, so the body stays well-formed", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path fill="a" fill="b" style="fill:#000" d="M0 0"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path fill="#000" d="M0 0" />');
  });

  // Fifth validator pass, 2026-09-06 (later).

  it("two declarations of one property in a single style: the last wins, as CSS says, even with no raw attribute to replace", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path style="fill:#22bc66;fill-rule:evenodd;fill:#ffffff" d="M0 0"/><path style="fill:#fff;fill:none" d="M1 1"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path d="M0 0" fill="#ffffff" fill-rule="evenodd" /><path d="M1 1" fill="none" />');
    expect(findIconRenderRisks(parsed!.body)).toEqual([{ kind: "light-paint", attribute: "fill", value: "ffffff" }]);
  });

  it("a single-quoted root viewBox and a single-quoted root fill default are read like double-quoted ones", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox='0 0 24 24' fill='currentColor'><path d="M0 0"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.viewBox).toBe("0 0 24 24");
    expect(parsed!.body).toBe('<path d="M0 0" fill="currentColor" />');
  });

  it("url(&quot;#grad&quot;), the entity-escaped spelling of a same-document reference, is accepted and hoisted", () => {
    const svg =
      `${VIEWBOX_SVG_OPEN}<linearGradient id="grad"><stop offset="0" stop-color="#000"/></linearGradient>` +
      `<path style="fill:url(&quot;#grad&quot;)" d="M0 0"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('fill="url(&quot;#grad&quot;)"');
  });

  it("url(&#104;ttps://evil) -- an entity hiding a scheme -- is still refused", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path style="fill:url(&#104;ttps://evil.example/x)" d="M0 0"/></svg>`;
    expect(parseIconMarkup(svg)).toBeNull();
  });

  // Sixth validator pass, 2026-09-06 (later): dropping a leading `style`
  // took the tag's only separator with it.

  it("style as the first attribute with the next attribute flush against its closing quote: the tag name survives", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<g style="fill:#fff"transform="scale(1)"><path style='fill:#000'd="M0 0"/></g></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<g transform="scale(1)" fill="#fff"><path d="M0 0" fill="#000" /></g>');
  });

  // Seventh validator pass, 2026-09-06 (later).

  it("a non-HTML whitespace character before style is part of the attribute name, as the HTML tokenizer reads it -- nothing is hoisted", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path\u00a0style="fill:#ffffff" d="M0 0"/><path\u000bstyle="fill:#ffffff" d="M1 1"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path\u00a0style="fill:#ffffff" d="M0 0"/><path\u000bstyle="fill:#ffffff" d="M1 1"/>');
    expect(findIconRenderRisks(parsed!.body)).toEqual([]);
  });

  it("a U+00A0 inside a declaration is not CSS whitespace: '\u00a0fill' is not fill and 'fill:\u00a0#fff' is not a colour, so neither is hoisted", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path style=" fill:#ffffff" d="M0 0"/><path style="fill: #ffffff;stroke:#000" d="M1 1"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path d="M0 0" style=" fill:#ffffff" /><path d="M1 1" fill=" #ffffff" stroke="#000" />');
    expect(findIconRenderRisks(parsed!.body)).toEqual([]);
  });

  it("a '>' inside a style value is legal in a quoted attribute and is emitted, hoisted or kept, rather than refusing the file", () => {
    const svg = `${VIEWBOX_SVG_OPEN}<path style="stroke-width:2>" d="M0 0"/><rect style="font-family:a>b;fill:red" x="0"/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toBe('<path d="M0 0" stroke-width="2>" /><rect x="0" style="font-family:a>b" fill="red" />');
  });

  it("hoistStyleOnAttrs still refuses (unsafe: true) a '<' in a hoisted value", () => {
    const attrs = ' style="fill:a<b"';
    expect(hoistStyleOnAttrs(attrs)).toEqual({ attrs, unsafe: true });
  });

  it("a quoted same-document url(\"#grad\") inside a single-quoted style is hoisted as url(#grad), not refused for the double quote", () => {
    const svg =
      `${VIEWBOX_SVG_OPEN}<linearGradient id="grad"><stop offset="0" stop-color="#000"/></linearGradient>` +
      `<path d="M0 0" style='fill:url("#grad")'/></svg>`;
    const parsed = parseIconMarkup(svg);
    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('fill="url(#grad)"');
  });
});

describe("findIconRenderRisks: paint that may vanish on the viewer's light ground", () => {
  // Threshold and fixture luminance values computed directly (WCAG relative
  // luminance, sRGB-to-linear) rather than assumed:
  //   #ffffff -> 1.0            (flagged: white)
  //   #faed1e -> ~0.8099        (loki's bright yellow stop -- NOT flagged:
  //                              below the 0.85 floor, a saturated brand
  //                              colour, not paint that vanishes on light)
  //   #22bc66 -> ~0.3727        (healthchecks' green -- nowhere close)

  it("healthchecks body (post-hoist) reports exactly two risks: fill #ffffff and stroke #ffffff", () => {
    const parsed = parseIconMarkup(HEALTHCHECKS_SVG);
    expect(parsed).not.toBeNull();
    const risks = findIconRenderRisks(parsed!.body);
    expect(risks).toHaveLength(2);
    expect(risks).toContainEqual({ kind: "light-paint", attribute: "fill", value: "ffffff" });
    expect(risks).toContainEqual({ kind: "light-paint", attribute: "stroke", value: "ffffff" });
  });

  it("loki body (post-hoist) reports no risks -- #faed1e is bright, not pale", () => {
    const parsed = parseIconMarkup(LOKI_SVG);
    expect(parsed).not.toBeNull();
    expect(findIconRenderRisks(parsed!.body)).toEqual([]);
  });

  it('flags fill="white" (the CSS keyword, not a hex value)', () => {
    expect(findIconRenderRisks('<path d="M0 0" fill="white"/>')).toEqual([
      { kind: "light-paint", attribute: "fill", value: "ffffff" },
    ]);
  });

  it('flags fill="#FFF" and normalises it to "ffffff" in the reported value', () => {
    expect(findIconRenderRisks('<path d="M0 0" fill="#FFF"/>')).toEqual([
      { kind: "light-paint", attribute: "fill", value: "ffffff" },
    ]);
  });

  it("skips values it does not guess at: none, currentColor, url(#...), rgb()", () => {
    const body =
      '<path d="M0 0" fill="none"/>' +
      '<path d="M0 0" fill="currentColor"/>' +
      '<path d="M0 0" fill="url(#a)"/>' +
      '<path d="M0 0" fill="rgb(255,255,255)"/>';
    expect(findIconRenderRisks(body)).toEqual([]);
  });

  it("a knockout body (csharp, via resolveIcon) reports no risks -- the knockout fill became data-knockout, not a fill attribute", async () => {
    const resolved = await resolveIcon("thesvg:csharp");
    expect(resolved).not.toBeNull();
    expect(resolved!.body).toContain("data-knockout");
    expect(findIconRenderRisks(resolved!.body)).toEqual([]);
  });

  it("dedupes on (attribute, normalised value) -- two elements with the same white fill report once", () => {
    const body = '<path d="M0 0" fill="#fff"/><path d="M1 1" fill="#ffffff"/>';
    expect(findIconRenderRisks(body)).toEqual([{ kind: "light-paint", attribute: "fill", value: "ffffff" }]);
  });

  it("flags 8-digit (#rrggbbaa) and 4-digit (#rgba) hex, judged on the colour channels alone and reported without the alpha", () => {
    const body = '<path d="M0 0" fill="#FFFFFF80"/><path d="M1 1" stroke="#ffff"/><path d="M2 2" fill="#00000080"/>';
    expect(findIconRenderRisks(body)).toEqual([
      { kind: "light-paint", attribute: "fill", value: "ffffff" },
      { kind: "light-paint", attribute: "stroke", value: "ffffff" },
    ]);
  });

  it("flags a single-quoted fill='#fff' attribute -- a raw attribute the hoist never touched", () => {
    expect(findIconRenderRisks(`<path d="M0 0" fill='#fff'/>`)).toEqual([
      { kind: "light-paint", attribute: "fill", value: "ffffff" },
    ]);
  });

  it("decodes a numeric character reference before judging the colour -- fill=\"&#35;fff\" is white", () => {
    expect(findIconRenderRisks('<path d="M0 0" fill="&#35;fff"/><path d="M1 1" stroke="&#x23;FFFFFF"/>')).toEqual([
      { kind: "light-paint", attribute: "fill", value: "ffffff" },
      { kind: "light-paint", attribute: "stroke", value: "ffffff" },
    ]);
  });

  it("never throws on an out-of-range numeric character reference -- it is not a colour, so it is skipped", () => {
    expect(findIconRenderRisks('<path d="M0 0" fill="&#x110000;"/><path d="M1 1" stroke="&#99999999;"/>')).toEqual([]);
  });

  it("does not flag a fill separated from its tag by a non-HTML whitespace character -- a browser reads that as part of the tag name and paints nothing", () => {
    expect(findIconRenderRisks('<path fill="#ffffff" d="M0 0"/><path stroke="#fff" d="M1 1"/><path fill ="#fff"/>')).toEqual([]);
  });

  it("flags an unquoted fill=#fff and fill=white -- the HTML parser reads both exactly as it reads a quoted value", () => {
    expect(findIconRenderRisks('<path d="M0 0" fill=#fff /><path d="M1 1" stroke=white />')).toEqual([
      { kind: "light-paint", attribute: "fill", value: "ffffff" },
      { kind: "light-paint", attribute: "stroke", value: "ffffff" },
    ]);
  });
});

describe("resolveLocalIcon: an owner-supplied SVG the CLI has already vendored under .catalogus/icons/", () => {
  // A fresh temp directory per test -- these tests write real files and
  // read them back through the real filesystem (only readFile's failure
  // mode and call count are ever faked, via readFileMockState above), the
  // same "write the hostile bytes, do not mock the parser" standard the
  // parseIconMarkup suite above holds itself to.
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "catalogus-core-icons-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeIcon(name: string, content: string): Promise<string> {
    const filePath = join(dir, name);
    await writeFile(filePath, content, "utf8");
    return filePath;
  }

  it("resolves a clean multi-path SVG with hex: null and every fill kept exactly as authored", async () => {
    const filePath = await writeIcon(
      "loki.svg",
      `${VIEWBOX_SVG_OPEN}<path d="M0 0" fill="#F46800"/><path d="M1 1" fill="#0033AB"/></svg>`,
    );
    const resolved = await resolveLocalIcon(filePath);
    expect(resolved).not.toBeNull();
    expect(resolved!.viewBox).toBe("0 0 24 24");
    expect(resolved!.hex).toBeNull();
    expect(resolved!.body).toContain('fill="#F46800"');
    expect(resolved!.body).toContain('fill="#0033AB"');
    expect((resolved!.body.match(/<path\b/g) ?? []).length).toBe(2);
  });

  it('keeps fill="#fff" as a plain fill -- the brand policy here carries no knockout list at all', async () => {
    const filePath = await writeIcon("white-fill.svg", `${VIEWBOX_SVG_OPEN}<path d="M0 0" fill="#fff"/></svg>`);
    const resolved = await resolveLocalIcon(filePath);
    expect(resolved).not.toBeNull();
    expect(resolved!.hex).toBeNull();
    expect(resolved!.body).toContain('fill="#fff"');
    expect(resolved!.body).not.toContain("data-knockout");
  });

  it("returns null rather than throwing for a missing file", async () => {
    await expect(resolveLocalIcon(join(dir, "does-not-exist.svg"))).resolves.toBeNull();
  });

  it("returns null for a file the sanitiser refuses -- <script>", async () => {
    const filePath = await writeIcon(
      "hostile-script.svg",
      `${VIEWBOX_SVG_OPEN}<script>alert(1)</script><path d="M0 0"/></svg>`,
    );
    await expect(resolveLocalIcon(filePath)).resolves.toBeNull();
  });

  it("returns null for a file the sanitiser refuses -- <foreignObject>", async () => {
    const filePath = await writeIcon(
      "hostile-foreign-object.svg",
      `${VIEWBOX_SVG_OPEN}<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject></svg>`,
    );
    await expect(resolveLocalIcon(filePath)).resolves.toBeNull();
  });

  it("returns null for a file the sanitiser refuses -- an on* event-handler attribute", async () => {
    const filePath = await writeIcon(
      "hostile-onload.svg",
      `${VIEWBOX_SVG_OPEN}<path d="M0 0" onload="alert(1)"/></svg>`,
    );
    await expect(resolveLocalIcon(filePath)).resolves.toBeNull();
  });

  it("returns null for a file the sanitiser refuses -- an href attribute", async () => {
    const filePath = await writeIcon(
      "hostile-href.svg",
      `${VIEWBOX_SVG_OPEN}<a href="https://evil.example"><path d="M0 0"/></a></svg>`,
    );
    await expect(resolveLocalIcon(filePath)).resolves.toBeNull();
  });

  it("returns null for a file the sanitiser refuses -- a <style> block", async () => {
    const filePath = await writeIcon(
      "hostile-style.svg",
      `${VIEWBOX_SVG_OPEN}<style>path{fill:red}</style><path d="M0 0"/></svg>`,
    );
    await expect(resolveLocalIcon(filePath)).resolves.toBeNull();
  });

  it("returns null for a file the sanitiser refuses -- a second, nested <svg>", async () => {
    const filePath = await writeIcon(
      "hostile-nested.svg",
      `${VIEWBOX_SVG_OPEN}<svg viewBox="0 0 1 1"><path d="M0 0"/></svg></svg>`,
    );
    await expect(resolveLocalIcon(filePath)).resolves.toBeNull();
  });

  it("returns null for a file the sanitiser refuses -- no viewBox on the root element", async () => {
    const filePath = await writeIcon(
      "hostile-no-viewbox.svg",
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
    );
    await expect(resolveLocalIcon(filePath)).resolves.toBeNull();
  });

  it("returns null for a file over MAX_ICON_BYTES, without reading it in full", async () => {
    // Content that would parse cleanly if it were read -- this proves the
    // null comes from the size check itself, not incidentally from content
    // that also happens to be unparseable, and the unchanged readFile call
    // count proves the file was never opened at all.
    const oversized = `${VIEWBOX_SVG_OPEN}<path d="${"M0 0 ".repeat(Math.ceil(MAX_ICON_BYTES / 5))}"/></svg>`;
    expect(Buffer.byteLength(oversized, "utf8")).toBeGreaterThan(MAX_ICON_BYTES);
    const filePath = await writeIcon("too-big.svg", oversized);

    const callsBefore = readFileMockState.calls;
    await expect(resolveLocalIcon(filePath)).resolves.toBeNull();
    expect(readFileMockState.calls).toBe(callsBefore);
  });

  // D3 (validator, 2026-09-04): describeLocalIconRefusal is resolveLocalIcon's
  // diagnostic sibling -- it exists purely so a caller (icon-resolution.ts,
  // and through it commands/icons.ts's "(missing file)" vs "(refused: ...)"
  // label) can tell "nothing was ever fetched here" apart from "something
  // was fetched and it cannot be used", which resolveLocalIcon's single null
  // could never distinguish. See LocalIconRefusal's own comment for why that
  // distinction matters to an agent following the skill's 7b loop.
  describe("describeLocalIconRefusal", () => {
    it('reports { kind: "missing" } for a path that does not exist', async () => {
      const refusal = await describeLocalIconRefusal(join(dir, "does-not-exist.svg"));
      expect(refusal).toEqual({ kind: "missing" });
    });

    it('reports { kind: "refused", reason } -- not "missing" -- for a file that exists but the sanitiser refuses', async () => {
      const filePath = await writeIcon(
        "hostile-script.svg",
        `${VIEWBOX_SVG_OPEN}<script>alert(1)</script><path d="M0 0"/></svg>`,
      );
      const refusal = await describeLocalIconRefusal(filePath);
      expect(refusal?.kind).toBe("refused");
      if (refusal?.kind !== "refused") return;
      expect(refusal.reason).toMatch(/sanitiser/i);
    });

    it('reports { kind: "refused", reason } naming the size cap for a file over MAX_ICON_BYTES', async () => {
      const oversized = `${VIEWBOX_SVG_OPEN}<path d="${"M0 0 ".repeat(Math.ceil(MAX_ICON_BYTES / 5))}"/></svg>`;
      const filePath = await writeIcon("too-big.svg", oversized);

      const refusal = await describeLocalIconRefusal(filePath);
      expect(refusal?.kind).toBe("refused");
      if (refusal?.kind !== "refused") return;
      expect(refusal.reason).toContain(`${MAX_ICON_BYTES}`);
    });

    it("returns null for a file that actually resolves -- nothing to explain", async () => {
      const filePath = await writeIcon("loki.svg", `${VIEWBOX_SVG_OPEN}<path d="M0 0" fill="#F46800"/></svg>`);
      await expect(describeLocalIconRefusal(filePath)).resolves.toBeNull();
    });
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
