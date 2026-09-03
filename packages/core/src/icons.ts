// Server-side icon resolution: given a verified icon ref (the `icon` field
// on a CatalogEntry, see catalog.ts), returns the markup the viewer draws it
// with. This exists as a separate module from catalog.ts because catalog.ts
// only ever answers "is there a verified icon ref for this catalogus slug"
// -- a synchronous, in-memory lookup -- and turning that ref into actual
// drawable markup means reading a file, which is an I/O concern the catalog
// itself has no reason to carry.
//
// Why this runs server-side rather than shipping simple-icons to the
// browser: the installed package's own bundle
// (simple-icons/index.mjs, v16.28.0) is 5.2 MB, and a catalogus.yaml's
// service slugs are only known at runtime, so nothing about the way the
// viewer's bundle is built could ever tree-shake that down -- every icon
// the manifest might name would have to ship. docs/PLAN.md's Phase 3.7
// section records this as a correction to an earlier plan that assumed
// bundling; the browser gets a small { viewBox, body, hex } payload per
// service instead, over the same /api/project payload that carries
// everything else.
//
// Resolution is deliberately lazy and per-slug, never a bulk load: this
// reads exactly the icon files a manifest's own services actually
// reference, not the full 3,453-icon simple-icons set (nor, on the thesvg
// side, more than the one vendored file a resolved ref names).
//
// A ref names one of two sources. Unprefixed (`nginx`, `stripe`) means
// simple-icons, exactly as before. `thesvg:`-prefixed (`thesvg:aws`) means
// one of the five files vendored under ../icons/thesvg/ -- brand marks
// simple-icons@16.28.0 doesn't carry (four removed under trademark
// pressure, one it never had; see catalog.ts's THESVG_ICON_OVERLAY comment
// and ../icons/thesvg/LICENSES.md for the per-file provenance and licence
// record). Both sources resolve through the one exported function below,
// to the one ResolvedIcon shape, so a caller never has to know which source
// a given ref came from.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

// createRequire(import.meta.url), not a bare `import.meta.resolve` call:
// both were verified to resolve `simple-icons/icons/<ref>.svg` correctly
// against the installed package (its package.json exports
// "./icons/*": ["./icons/*"], a plain subpath pattern with no import/require
// condition split, so either resolution mechanism reaches the same file) --
// require.resolve() was picked because it returns a plain filesystem path
// directly, where import.meta.resolve() returns a file: URL that would need
// an extra fileURLToPath() step for no benefit here.
const require = createRequire(import.meta.url);

/**
 * simple-icons slugs are not uniformly `[a-z0-9]+` -- a handful in the
 * installed v16.28.0 set (e.g. "backstage_casting", "uniqlo_ja") carry a
 * disambiguating underscore -- so the allow-list has to include it. This is
 * the same floor a thesvg ref's slug half is held to (resolveIcon below),
 * chosen deliberately squashed-lowercase-no-hyphen to fit this exact
 * pattern rather than widening it: `googlevertexai`, not
 * `google-vertex-ai`, the same convention ICON_OVERLAY's own
 * `googlecloudstorage`/`googleanalytics`/`googlegemini` rows already use
 * for a multi-word Google product.
 *
 * This exists as a defensive floor, not the primary safety mechanism: every
 * ref this function is actually called with today comes from catalog.ts's
 * own ICON_OVERLAY/THESVG_ICON_OVERLAY tables, a hardcoded set this package
 * controls. It's here so that if that assumption ever stops holding -- a
 * future caller resolving a ref from somewhere less trusted -- a value
 * shaped like `../../secret` is rejected before it ever reaches
 * require.resolve() or a thesvg file lookup, rather than relying on either
 * one alone to contain it.
 */
const SAFE_ICON_REF = /^[a-z0-9_]+$/;

/**
 * Pulls the `d` attribute off a simple-icons SVG's single `<path>` element.
 * Every icon in the installed package is exactly one `<title>` plus one
 * `<path d="...">` -- confirmed by reading several source files directly,
 * including nginx.svg -- so the first (only) `d="..."` match is the whole
 * answer; there's no second path to be greedy about. This does not
 * generalise to the vendored thesvg files below, which are not one-path
 * files -- see parseThesvgMarkup's own comment for why that file needs a
 * different approach rather than a second, greedier version of this one.
 */
function extractPathData(svg: string): string | null {
  const match = /<path\b[^>]*\sd="([^"]*)"/.exec(svg);
  return match ? match[1]! : null;
}

/**
 * One record as it appears in simple-icons' bulk data export
 * (`simple-icons/icons.json`, verified below to resolve to
 * `data/simple-icons.json` in the installed v16.28.0 package) -- only the
 * two fields this module reads. Every one of the package's 3,453 records
 * carries both, confirmed directly against the installed data file rather
 * than assumed from the package's types.
 */
interface SimpleIconRecord {
  readonly slug?: string;
  readonly hex: string;
}

/**
 * Lazily-built, process-lifetime cache of every installed simple-icons
 * slug's brand hex. Unlike the per-icon SVG reads below, there is no
 * per-icon file to read for hex -- it lives only in this one bulk JSON
 * export -- so the first call reads and parses that one file (~450 KB,
 * 3,453 records) and every later call in this process reuses the resulting
 * Map, regardless of how many distinct icons a manifest actually
 * references. A rejected load is not cached: a transient read failure gets
 * a fresh attempt on the next call rather than being pinned to "no hex"
 * for the rest of the process.
 */
let hexBySlug: Promise<Map<string, string>> | undefined;

function loadHexBySlug(): Promise<Map<string, string>> {
  if (!hexBySlug) {
    hexBySlug = (async () => {
      const dataPath = require.resolve("simple-icons/icons.json");
      const raw = await readFile(dataPath, "utf8");
      const records = JSON.parse(raw) as SimpleIconRecord[];
      const bySlug = new Map<string, string>();
      for (const record of records) {
        if (record.slug) {
          bySlug.set(record.slug, record.hex);
        }
      }
      return bySlug;
    })().catch((err: unknown) => {
      hexBySlug = undefined;
      throw err;
    });
  }
  return hexBySlug;
}

/**
 * The hex half of a simple-icons resolution. Split out so the ref-safety
 * and lookup-miss cases can be reasoned about independently of the SVG path
 * lookup, while still reusing SAFE_ICON_REF rather than a second copy of
 * that check. Never throws: a data-file read failure or a slug with no hex
 * record both degrade to null, same contract as the rest of this module.
 */
async function resolveIconHex(icon: string): Promise<string | null> {
  let bySlug: Map<string, string>;
  try {
    bySlug = await loadHexBySlug();
  } catch {
    return null;
  }

  const hex = bySlug.get(icon);
  return hex ? `#${hex}` : null;
}

/**
 * One resolved icon, whichever of the two sources it came from -- the one
 * shape resolveIcon returns, so a caller (ViewService, and through it the
 * viewer) never has to branch on where a mark was drawn from.
 */
export interface ResolvedIcon {
  /** the SVG's own viewBox, verbatim */
  viewBox: string;
  /** inner SVG markup: <path>/<g>/<circle>… elements only, no <svg> wrapper */
  body: string;
  /**
   * The brand colour a single-ink mark is painted with when colour is asked
   * for. null for a multi-colour mark, whose colour form is its own fills.
   */
  hex: string | null;
}

const SIMPLE_ICONS_VIEWBOX = "0 0 24 24";

/**
 * Reads a verified simple-icons ref's one `<path d="...">` off disk. Split
 * out from resolveSimpleIconsIcon below so the file read and the hex lookup
 * (a separate file entirely, see resolveIconHex) can run concurrently
 * without either one's failure shape leaking into the other.
 */
async function readSimpleIconPathData(icon: string): Promise<string | null> {
  let filePath: string;
  try {
    filePath = require.resolve(`simple-icons/icons/${icon}.svg`);
  } catch {
    return null;
  }

  let svg: string;
  try {
    svg = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  return extractPathData(svg);
}

/**
 * Resolves a verified simple-icons ref to a ResolvedIcon. `body` is built
 * as `<path d="…" fill="currentColor"/>` -- simple-icons ships every mark
 * as a single monochrome path meant to inherit its colour, exactly what
 * `fill="currentColor"` gives it -- and `viewBox` is the fixed
 * `0 0 24 24` every installed icon shares (confirmed directly against the
 * installed package, not assumed). Never throws: a missing file or a
 * missing hex record both degrade to null.
 */
async function resolveSimpleIconsIcon(icon: string): Promise<ResolvedIcon | null> {
  const [d, hex] = await Promise.all([readSimpleIconPathData(icon), resolveIconHex(icon)]);
  if (d === null || hex === null) {
    return null;
  }
  return { viewBox: SIMPLE_ICONS_VIEWBOX, body: `<path d="${d}" fill="currentColor"/>`, hex };
}

// ---------------------------------------------------------------------------
// thesvg.org: the five vendored files under ../icons/thesvg/. See that
// directory's LICENSES.md for what each file is, where it came from, and
// the licence record for each -- this section only covers turning a
// vendored file's bytes into safe, policy-applied markup.

/**
 * Refuses anything this module has no reason to ever pass through to a
 * browser's dangerouslySetInnerHTML (see apps/web's Icon.tsx, which is the
 * one and only consumer of `body`): a <script>, a <foreignObject> (an
 * escape hatch into arbitrary HTML inside an SVG), an event-handler
 * attribute, an <a href>/<use xlink:href> reference, or a <style> block.
 * None of the five vendored files trip this -- confirmed by reading all
 * five directly -- so this exists for defence in depth against a future
 * vendored file, or a corrupted one, rather than a defect any file in this
 * package's own history has actually shown.
 */
const FORBIDDEN_MARKUP_RE = /<script\b|<foreignobject\b|<style\b|\bon[a-zA-Z-]*\s*=|\bhref\s*=/i;

function hasForbiddenMarkup(svg: string): boolean {
  return FORBIDDEN_MARKUP_RE.test(svg);
}

/** Reads one double-quoted attribute value out of a raw attribute string (an already-isolated `<tag ...>`'s inside, never the whole document). */
function getAttr(attrs: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(attrs);
  return match?.[1];
}

/**
 * Matches one element's opening tag, self-closing or not, capturing its
 * tag name, its raw attribute text, and (if present) the self-closing `/`
 * -- kept as a separate group from the attribute text specifically so
 * withElementDefault below can append a new attribute without landing it
 * after that `/`, which would turn `<path .../>` into the malformed
 * `<path ... / fill="...">`. The attrs group is lazy so the engine finds
 * the *narrowest* span ending in the tag's own close, rather than a greedy
 * match swallowing a later tag's `/>` too.
 */
const OPENING_TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s[^<>]*?)?)\s*(\/)?>/g;

/**
 * Materialises an inherited default onto every element in `markup` that has
 * no attribute of its own by that name -- used only for `fill`/`fill-rule`,
 * and only when the source file's root <svg> set one (see
 * parseThesvgMarkup's own comment on why aws.svg is the one vendored file
 * that needs this). Applying it to every element regardless of nesting
 * depth, not just the root's direct children, is deliberate: SVG's own
 * inheritance cascades the same way, so this is the more faithful
 * reproduction of the original file's rendering, not a shortcut.
 */
function withElementDefault(markup: string, attrName: string, value: string): string {
  const hasAttr = new RegExp(`\\b${attrName}\\s*=`, "i");
  return markup.replace(OPENING_TAG_RE, (whole, tag: string, attrs: string, selfClose: string | undefined) => {
    if (hasAttr.test(attrs)) {
      return whole;
    }
    return `<${tag}${attrs} ${attrName}="${value}"${selfClose ? " /" : ""}>`;
  });
}

/** Matches one `fill="..."` attribute anywhere in a markup string, whatever element it sits on -- csharp's knockout fill is set on a `<g>`, not on the `<path>` elements it wraps, so this is deliberately not scoped to `<path>`. */
const FILL_ATTR_RE = /\s+fill\s*=\s*"([^"]*)"/gi;

/**
 * Normalises a fill value to a bare, lowercase 6-digit hex string for
 * comparison, or null when it isn't a hex colour at all (e.g.
 * `currentColor`, which must never match a knockout entry -- aws's
 * currentColor text fill is not a knockout, it is the mark's own ink).
 * Accepts both 3- and 6-digit spellings and either case, on both sides of
 * the comparison it's used for (icons.test.ts writes both spellings against
 * this).
 */
function normalizeHexValue(value: string): string | null {
  const trimmed = value.trim();
  const hexPart = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{3}$/.test(hexPart) && !/^[0-9a-fA-F]{6}$/.test(hexPart)) {
    return null;
  }
  const lower = hexPart.toLowerCase();
  return lower.length === 3
    ? lower
        .split("")
        .map((c) => c + c)
        .join("")
    : lower;
}

/** The `ink` fill policy: every fill attribute, on every element, becomes `currentColor`. */
function applyInkPolicy(markup: string): string {
  return markup.replace(FILL_ATTR_RE, ' fill="currentColor"');
}

/**
 * The knockout half of the `brand` fill policy: every `fill="..."` whose
 * value normalises to one of `knockoutHexValues` is replaced with
 * `data-knockout=""` and its own fill attribute removed, wherever in the
 * markup it sits (see FILL_ATTR_RE's own comment on why that's not scoped
 * to `<path>`). The viewer paints `[data-knockout]` as the page ground
 * (apps/web's Icon.module.css); fill is an inherited SVG property, so
 * marking the wrapping element is enough to cover every child that relies
 * on it rather than carrying its own fill.
 */
function applyKnockout(markup: string, knockoutHexValues: readonly string[]): string {
  const knockoutSet = new Set(
    knockoutHexValues.map(normalizeHexValue).filter((value): value is string => value !== null)
  );
  return markup.replace(FILL_ATTR_RE, (whole, value: string) => {
    const normalized = normalizeHexValue(value);
    return normalized !== null && knockoutSet.has(normalized) ? ' data-knockout=""' : whole;
  });
}

interface ParsedThesvgMarkup {
  readonly viewBox: string;
  readonly body: string;
}

/**
 * Turns a vendored thesvg.org file's raw bytes into `{ viewBox, body }` --
 * the two pieces of a ResolvedIcon that come straight off the file, before
 * the per-icon fill policy (THESVG_ICONS below) runs. Never throws: every
 * malformed- or unsafe-shaped input returns null, same contract as the rest
 * of this module.
 *
 * Not a parser -- extractPathData's own comment already covers why one
 * regex greedily grabbing every `d="..."` doesn't generalise past a
 * one-path file, and none of the five vendored files are one-path files.
 * What this function does instead is sound for a narrower reason: every one
 * of the five vendored files is `<svg …>inner</svg>` with no second,
 * nested `<svg>` (confirmed by reading all five directly), so the inner
 * markup a caller wants is exactly the substring between the root tag's own
 * `>` and the document's last `</svg>` -- no tree-walking required to find
 * it. The svgTagCount check below is what keeps that assumption from
 * silently stopping being true: a file with a second `<svg` is refused
 * rather than sliced at the wrong boundary.
 *
 * Exported only for icons.test.ts, so the sanitiser's refusals (a synthetic
 * <script>-bearing file, a nested <svg>, a missing viewBox) can be proven
 * directly against this function rather than indirectly through a fixture
 * file on disk -- resolveThesvgIcon below only ever calls this with the
 * bytes of one of the five vendored, already-known-safe files. Not part of
 * this package's public API surface -- index.ts does not re-export it.
 */
export function parseThesvgMarkup(raw: string): ParsedThesvgMarkup | null {
  // Comments stripped before the forbidden-markup check, not after: a
  // <script> hidden inside <!-- --> must never have been visible to a
  // later, trusting reader, not merely "removed before it mattered". None
  // of the five vendored files carry a comment at all -- this only matters
  // for the synthetic adversarial files icons.test.ts writes.
  const stripped = raw.replace(/^\uFEFF?<\?xml[^>]*\?>\s*/i, "").replace(/<!--[\s\S]*?-->/g, "");

  if (hasForbiddenMarkup(stripped)) {
    return null;
  }

  const svgTagCount = (stripped.match(/<svg\b/gi) ?? []).length;
  if (svgTagCount !== 1) {
    return null;
  }

  const openTag = /<svg\b([^>]*)>/i.exec(stripped);
  const closeIndex = stripped.lastIndexOf("</svg>");
  if (!openTag || closeIndex === -1 || closeIndex < openTag.index + openTag[0].length) {
    return null;
  }

  const attrs = openTag[1] ?? "";
  const viewBox = getAttr(attrs, "viewBox");
  if (!viewBox) {
    return null;
  }

  let body = stripped
    .slice(openTag.index + openTag[0].length, closeIndex)
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/gi, "")
    .trim();

  // aws.svg sets `fill="currentColor" fill-rule="evenodd"` once, as a
  // default on the root <svg>, rather than repeating it on its one child
  // that carries no fill of its own -- valid SVG (both are inherited
  // presentation properties), but this function keeps only the inner
  // markup and discards the root tag that default was hanging off.
  // Materialising it onto whichever elements below have no attribute of
  // their own reproduces the original file's rendering exactly, which is
  // what TRADEMARK.md's "accurate, unmodified official marks" requires --
  // and is a no-op for the other four vendored files, none of which set a
  // root-level default at all.
  const defaultFill = getAttr(attrs, "fill");
  const defaultFillRule = getAttr(attrs, "fill-rule");
  if (defaultFill !== undefined) {
    body = withElementDefault(body, "fill", defaultFill);
  }
  if (defaultFillRule !== undefined) {
    body = withElementDefault(body, "fill-rule", defaultFillRule);
  }

  return { viewBox, body };
}

/**
 * One row per vendored file: which file, and the fill policy its brand
 * needs applied at read time (never inferred from the file itself, so a
 * future edit to a vendored file can't silently change how it's painted).
 *
 *  - `ink`: a mark meant to be drawn in one colour, exactly like a
 *    simple-icons mark -- every fill in the file becomes `currentColor`,
 *    and `hex` (the thesvg manifest's own `hex` field -- see LICENSES.md)
 *    is what a caller asking for colour gets.
 *  - `brand`: a mark whose colour form *is* its own fills -- multi-colour
 *    (slack, vertexai), or a single custom colour that isn't meant to
 *    invert to currentColor (aws's orange smile). Fills are kept verbatim;
 *    `hex` is null, the same "no single colour to hand back" contract a
 *    multi-colour simple-icons mark would never have a way to express
 *    either.
 *  - `knockout`: only under `brand`. Fill values (matched case- and
 *    digit-form-insensitively -- normalizeHexValue) that must render as the
 *    page ground rather than as painted colour -- csharp's cut-out letters.
 */
interface ThesvgIconSpec {
  readonly file: string;
  readonly policy: "ink" | "brand";
  readonly hex: string | null;
  readonly knockout?: readonly string[];
}

const THESVG_ICONS: Record<string, ThesvgIconSpec> = {
  aws: { file: "aws.svg", policy: "brand", hex: null },
  csharp: { file: "csharp.svg", policy: "brand", hex: null, knockout: ["#fff"] },
  openai: { file: "openai.svg", policy: "ink", hex: "#000000" },
  slack: { file: "slack.svg", policy: "brand", hex: null },
  googlevertexai: { file: "googlevertexai.svg", policy: "brand", hex: null },
  // Added 2026-09-03 (second session) after the owner's second look at the
  // real inventory: both are one currentColor path on a 24x24 box, drawn
  // for a dark ground -- thesvg's manifest hex for each is `fff`, which is
  // "white", not a brand colour. `hex: null` on purpose: with no brand
  // colour to give it, the mark renders in the surrounding ink in colour
  // mode too, rather than in a black this file would have had to invent.
  codex: { file: "codex.svg", policy: "ink", hex: null },
  xai: { file: "xai.svg", policy: "ink", hex: null },
};

/**
 * `new URL(..., import.meta.url)`, not a path built off `process.cwd()` or
 * `__dirname` (unavailable in ESM anyway): the same reasoning as
 * view-payload.ts's CLI_VERSION comment on `"../package.json"` -- this file
 * sits one level below packages/core's own root under both layouts it runs
 * in (src/icons.ts under vitest, dist/index.js under the tsup bundle), so
 * `../icons/thesvg/` reaches the same real directory either way. It resolves
 * correctly through the pnpm workspace symlink too: `@catalogus/core` stays
 * an external, unbundled import in the built CLI (confirmed by reading
 * packages/cli/dist's own output), so Node's loader resolves this module's
 * `import.meta.url` against @catalogus/core's real installed location, not
 * the CLI's -- the identical mechanism simple-icons/icons/*.svg resolution
 * already relies on above, just via require.resolve() instead of a bare URL.
 */
const THESVG_ICON_DIR = new URL("../icons/thesvg/", import.meta.url);

/**
 * Resolves a thesvg slug (already stripped of its `thesvg:` prefix and
 * validated against SAFE_ICON_REF by resolveIcon below) to a ResolvedIcon.
 * Never throws: an unregistered slug, a missing file, or a file that fails
 * parseThesvgMarkup's checks all degrade to null.
 */
async function resolveThesvgIcon(slug: string): Promise<ResolvedIcon | null> {
  const spec = THESVG_ICONS[slug];
  if (!spec) {
    return null;
  }

  let raw: string;
  try {
    raw = await readFile(new URL(spec.file, THESVG_ICON_DIR), "utf8");
  } catch {
    return null;
  }

  const parsed = parseThesvgMarkup(raw);
  if (!parsed) {
    return null;
  }

  let body = parsed.body;
  if (spec.policy === "ink") {
    body = applyInkPolicy(body);
  } else if (spec.knockout) {
    body = applyKnockout(body, spec.knockout);
  }

  return { viewBox: parsed.viewBox, body, hex: spec.hex };
}

/** Every thesvg ref this module resolves is prefixed with this, so it can share one flat `CatalogEntry.icon: string` field with an unprefixed simple-icons ref rather than needing a second field. */
const THESVG_PREFIX = "thesvg:";

/**
 * Resolves a verified icon ref (CatalogEntry.icon) to a ResolvedIcon, or
 * null when there is nothing to draw -- a missing ref, a ref shaped
 * unsafely, a ref naming a file that no longer resolves (simple-icons has
 * dropped brand marks under trademark pressure before -- see catalog.ts's
 * ICON_OVERLAY comment), or a file that doesn't parse the way it's expected
 * to. Never throws: a broken icon must fall back to the viewer's generic
 * glyph, not fail the request that carries it.
 *
 * Takes `icon: string | undefined` rather than requiring the caller to
 * branch first, since the overwhelmingly common call shape is "the field a
 * CatalogEntry may or may not carry" (`resolveIcon(getCatalogEntry(slug)?.icon)`).
 *
 * Branches on the ref's own shape, not on any table lookup, so the two
 * source-specific resolvers above stay the only place that knows how their
 * own source works: unprefixed goes to simple-icons; `thesvg:`-prefixed has
 * its prefix stripped, the remaining slug re-validated against
 * SAFE_ICON_REF (the same floor an unprefixed ref is held to, applied here
 * to the slug half only -- the prefix itself is a fixed literal, not
 * untrusted input), and goes to the vendored files under ../icons/thesvg/.
 */
export async function resolveIcon(icon: string | undefined): Promise<ResolvedIcon | null> {
  if (!icon) {
    return null;
  }

  if (icon.startsWith(THESVG_PREFIX)) {
    const slug = icon.slice(THESVG_PREFIX.length);
    return SAFE_ICON_REF.test(slug) ? resolveThesvgIcon(slug) : null;
  }

  return SAFE_ICON_REF.test(icon) ? resolveSimpleIconsIcon(icon) : null;
}
