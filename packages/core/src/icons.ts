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
//
// Added 2026-09-04 (docs/custom-icon-brief.md): a third, unrelated concept
// lives in this file too now -- resolveLocalIcon, near the bottom. A
// CatalogEntry.icon ref (above) names a slug into this package's own fixed
// ICON_OVERLAY/THESVG_ICON_OVERLAY tables; a *service entry's* own `icon`
// field (packages/schema/src/schema.ts) names a file the CLI fetched from
// a URL the owner supplied, or copied from a local path, exactly once, and
// vendored under `.catalogus/icons/` beside the manifest. Different input
// (arbitrary, not from a table this package controls), same output shape
// and the same untrusted-bytes posture, so it goes through the same
// sanitiser (parseIconMarkup, renamed this same day from
// parseThesvgMarkup -- see that function's own comment) rather than a
// second copy of it.
//
// Same day, later pass: a validator running the built binary found that
// resolveLocalIcon's single null could not answer "should the caller try
// fetching this again, or is there simply nothing here yet" (D3,
// docs/custom-icon-brief.md's follow-up). describeLocalIconRefusal, beside
// resolveLocalIcon below, is the fix -- see its own comment and
// LocalIconRefusal's.
import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";

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
 * files -- see parseIconMarkup's own comment for why that file needs a
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

/**
 * D8 (validator, 2026-09-04): `url(...)` -- an SVG/CSS functional value, not
 * an element or attribute FORBIDDEN_MARKUP_RE's own checks were ever built
 * to see -- is legal on `fill`, `stroke`, `clip-path`, `mask`, `filter`, and
 * inside a plain `style="..."` attribute (which nothing above refuses; only
 * a <style> *block* is), and a browser resolves a non-fragment argument to
 * it as a real network fetch: `style="fill:url(https://evil.example/x)"`
 * makes the viewer's browser request that URL the moment the mark renders,
 * off a `catalogus.yaml` value the CLI itself vendored. `url(#grad)` -- a
 * same-document reference to a `<linearGradient id="grad">` this same SVG
 * defines -- is the one legitimate use this repo's own fill machinery
 * relies on (a gradient a brand mark defines and immediately references),
 * so the rule is specifically "the argument must start with `#`", not "no
 * url() at all".
 *
 * Matches every `url(...)` in the document regardless of which attribute or
 * block it sits inside -- scoping this to `fill`/`style` specifically would
 * miss `stroke`, `clip-path`, `mask`, `filter`, and any future property a
 * hostile file could put it on, and there is no legitimate reason for this
 * sanitiser to draw that line narrower than "everywhere".
 */
const URL_FUNCTION_RE = /\burl\(\s*(?:['"]|&quot;|&apos;|&#34;|&#39;|&#x22;|&#x27;)?\s*([^'")\s]*)/gi;

/**
 * True when a `url(...)` argument matched by URL_FUNCTION_RE is not a
 * same-document fragment reference (`#...`) -- see URL_FUNCTION_RE's own
 * comment for why that is the one shape this sanitiser allows.
 *
 * Validator, 2026-09-06 (later): the first cut of URL_FUNCTION_RE matched
 * the closing quote and `)` with a backreference, so `url('https://evil)`
 * -- an opening quote never closed -- failed to match at all and slipped
 * through as "no url() here". The regex now stops reading at the argument's
 * first character run and never requires the call to be well-formed: a
 * `url(` is judged on what follows it, whatever punctuation comes after.
 * Fifth pass: the entity spellings of a quote (`&quot;`, `&#34;`, ...) are
 * skipped like a literal one, so `url(&quot;#grad&quot;)` -- the spec's
 * own escaping of a quoted fragment inside a double-quoted attribute -- is
 * read as the `#grad` it is. Any other entity stays part of the argument,
 * so `url(&#104;ttps://...)` does not start with `#` and is refused.
 */
function hasUnsafeUrlFunction(svg: string): boolean {
  for (const match of svg.matchAll(URL_FUNCTION_RE)) {
    const argument = match[1] ?? "";
    if (!argument.startsWith("#")) {
      return true;
    }
  }
  return false;
}

function hasForbiddenMarkup(svg: string): boolean {
  return FORBIDDEN_MARKUP_RE.test(svg) || hasUnsafeUrlFunction(svg);
}

/** Reads one attribute's value out of a raw attribute string (an already-isolated `<tag ...>`'s inside, never the whole document) -- by position, via tokenizeAttrs, so any quoting the HTML parser accepts is read the same way here (validator, 2026-09-06 (later), fifth pass: a single-quoted `viewBox='...'` used to read as "no viewBox"). */
function getAttr(attrs: string, name: string): string | undefined {
  const lower = name.toLowerCase();
  const token = tokenizeAttrs(attrs).find((candidate) => candidate.name.toLowerCase() === lower);
  return token?.value ?? undefined;
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
 *
 * Validator, 2026-09-06 (later), fourth pass: the attrs group used to be a
 * flat `[^<>]*?`, so a raw `>` inside a *quoted* value -- a Figma layer
 * name like `id="Group 1 > Path"`, legal in SVG and HTML alike -- ended the
 * tag early, and every rewrite built on that slice (the hoist, the root
 * default) pushed the rest of the tag out into text content. Quoted values
 * are now consumed whole, so a `>` only ends the tag when it sits outside
 * quotes.
 */
const OPENING_TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s(?:"[^"]*"|'[^']*'|[^<>"'])*?)?)\s*(\/)?>/g;

/** The root `<svg ...>` opening tag, its attribute text captured -- quote-aware for the same reason OPENING_TAG_RE is. */
const ROOT_SVG_TAG_RE = /<svg\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i;

/**
 * Materialises an inherited default onto every element in `markup` that has
 * no attribute of its own by that name -- used only for `fill`/`fill-rule`,
 * and only when the source file's root <svg> set one (see
 * parseIconMarkup's own comment on why aws.svg is the one vendored file
 * that needs this). Applying it to every element regardless of nesting
 * depth, not just the root's direct children, is deliberate: SVG's own
 * inheritance cascades the same way, so this is the more faithful
 * reproduction of the original file's rendering, not a shortcut.
 */
function withElementDefault(markup: string, attrName: string, value: string): string {
  return markup.replace(OPENING_TAG_RE, (whole, tag: string, attrs: string, selfClose: string | undefined) => {
    if (hasAttrToken(attrs, attrName)) {
      return whole;
    }
    return `<${tag}${attrs} ${attrName}="${value}"${selfClose ? " /" : ""}>`;
  });
}

/**
 * The paint-shaped presentation properties this module's own fill-based
 * logic (FILL_ATTR_RE, applyInkPolicy, applyKnockout, withElementDefault,
 * and the light-paint scan further below) and the viewer's monochrome CSS
 * rule (Icon.module.css's `.icon:not(.fallback):not(.colour) svg [fill]`
 * selector) all key off -- every one of them looks for a real attribute,
 * none of them look inside a `style="..."` string. Real-world owner-supplied
 * files (added 2026-09-06 after two from an actual client repo: Healthchecks
 * carries `style="fill:#22bc66;..."` on its own paths, Loki's 14 gradients
 * carry `style="stop-color:#faed1e"` on every `<stop>`) routinely carry
 * exactly these properties as CSS instead, which every one of those
 * consumers would silently miss. `fill-rule`/`stroke-width` are on the list
 * too even though neither is a *colour* property, because they ride along in
 * the same `style="..."` string in practice (Healthchecks' own files do
 * exactly this) and hoistStyleOnAttrs below has no reason to leave one
 * paint-adjacent property behind while moving its neighbours.
 */
const HOISTABLE_STYLE_PROPS = ["fill", "stroke", "stop-color", "fill-rule", "stroke-width"] as const;

/**
 * One attribute inside an already-isolated opening tag, as the HTML
 * tokenizer the viewer hands `body` to would read it: a name, an optional
 * value (double-quoted, single-quoted, or unquoted up to the next
 * whitespace), and the span it occupies in the attrs string -- `start`
 * includes the whitespace before the name so a dropped attribute takes its
 * own separator with it.
 */
interface AttrToken {
  readonly name: string;
  readonly value: string | null;
  readonly start: number;
  readonly nameStart: number;
  readonly end: number;
}

/**
 * Splits an element's raw attribute text into AttrTokens, by position.
 *
 * Validator, 2026-09-06 (later), third pass: every earlier cut found the
 * `style` attribute with a regex over the whole attrs string, and however
 * tight its lookbehind got, a `style=` sitting *inside another attribute's
 * value* (`id="style=fill:white"`, Inkscape's `inkscape:label="..."`)
 * still matched: paint was invented and the host value truncated, an `id`
 * wiped breaking every `url(#id)` that pointed at it. Only a walk that
 * knows where each value starts and ends can say which `style=` is an
 * attribute name, so this is that walk. It follows the HTML tokenizer's
 * rules for names and values (a name runs to whitespace, `=`, `/` or the
 * tag end; an unquoted value runs to whitespace; an unterminated quote runs
 * to the end) because the HTML parser, not an XML one, is what the viewer's
 * dangerouslySetInnerHTML actually feeds this markup to.
 */
function tokenizeAttrs(attrs: string): AttrToken[] {
  const tokens: AttrToken[] = [];
  let i = 0;
  // The HTML tokenizer's whitespace set, not JS's `\s`: U+00A0 or U+000B
  // before a name is part of the name to a browser, so `\u00a0style` is
  // not a style attribute (validator, 2026-09-06 (later), seventh pass).
  const isSpace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\f" || c === "\r";
  while (i < attrs.length) {
    const start = i;
    while (i < attrs.length && isSpace(attrs[i]!)) i++;
    if (i >= attrs.length) break;
    if (attrs[i] === "/" || attrs[i] === "=") {
      // A stray `/` or `=` where a name should be: the tokenizer skips it.
      i++;
      continue;
    }
    const nameStart = i;
    while (i < attrs.length && !isSpace(attrs[i]!) && attrs[i] !== "=" && attrs[i] !== "/") i++;
    const name = attrs.slice(nameStart, i);
    let j = i;
    while (j < attrs.length && isSpace(attrs[j]!)) j++;
    if (attrs[j] !== "=") {
      tokens.push({ name, value: null, start, nameStart, end: i });
      continue;
    }
    j++;
    while (j < attrs.length && isSpace(attrs[j]!)) j++;
    const quote = attrs[j];
    let value: string;
    if (quote === '"' || quote === "'") {
      const close = attrs.indexOf(quote, j + 1);
      value = close === -1 ? attrs.slice(j + 1) : attrs.slice(j + 1, close);
      i = close === -1 ? attrs.length : close + 1;
    } else {
      const valueStart = j;
      while (j < attrs.length && !isSpace(attrs[j]!)) j++;
      value = attrs.slice(valueStart, j);
      i = j;
    }
    tokens.push({ name, value, start, nameStart, end: i });
  }
  return tokens;
}

/** True when the attrs string carries an attribute called exactly `name` (case-insensitive), by position -- the same tokenizer walk hoistStyleOnAttrs uses, so `id="fill=x"` is never mistaken for a `fill`. */
function hasAttrToken(attrs: string, name: string): boolean {
  const lower = name.toLowerCase();
  return tokenizeAttrs(attrs).some((token) => token.name.toLowerCase() === lower);
}

/**
 * Wraps an attribute value in whichever quote it does not itself contain,
 * or returns null when it contains both (an HTML value cannot: a quoted
 * value cannot contain its own quote and an unquoted one contains neither,
 * so null is a defensive floor rather than a reachable branch). `<` is
 * refused too -- the value is about to sit inside markup this module has
 * already sanitised. `>` is not: it is legal inside a quoted attribute,
 * OPENING_TAG_RE reads past it, and a real file can carry one in a
 * `font-family` (validator, seventh pass).
 */
function quoteAttrValue(value: string): string | null {
  if (value.includes("<")) {
    return null;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  return null;
}

/** One CSS block comment, anywhere inside a `style` value -- stripped before the value is split into declarations, since a comment can sit inside a value as easily as between declarations. */
const CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

/** A trailing `!important` on a declaration's value, with any CSS whitespace around the `!`. */
const CSS_IMPORTANT_RE = /[ \t\n\f\r]*![ \t\n\f\r]*important[ \t\n\f\r]*$/i;

/** `String.prototype.trim` for CSS: only tab, LF, FF, CR and space are whitespace to a CSS parser, so a U+00A0 stays part of the property name (`\u00a0fill` is not `fill`) instead of being trimmed into a match (validator, 2026-09-06 (later), seventh pass -- the CSS-side mirror of tokenizeAttrs's own whitespace set). */
function cssTrim(text: string): string {
  return text.replace(/^[ \t\n\f\r]+|[ \t\n\f\r]+$/g, "");
}

/** A quoted same-document `url("#x")` / `url('#x')` -- rewritten to the bare `url(#x)` on hoist, which CSS reads identically, so the quote never has to sit inside the new attribute's own quotes. A non-fragment argument never reaches here: hasUnsafeUrlFunction refused the whole file first. */
const QUOTED_FRAGMENT_URL_RE = /url\(\s*(['"])(#[^'"()\s]*)\1\s*\)/gi;

/**
 * Splits a `style` value into declarations on `;`, except a `;` inside
 * parentheses or a quoted string. Validator, 2026-09-06 (later), second
 * pass: `clip-path:url(#a;fill:#fff;)` is one declaration to CSS (a `;` is
 * legal inside an unquoted `url()` token), and a plain `split(";")` turned
 * its tail into a `fill` the browser never applies -- so the hoist painted
 * the mark white where the original renders in the default ink, which is
 * the exact opposite of the render-preservation the hoist exists for.
 * A character reference (`&#35;`, `&#x23;`, `&quot;`) is copied whole for
 * the same reason: its terminating `;` is part of the reference, not a
 * separator, and the HTML parser decodes it inside the attribute value
 * before CSS ever sees it.
 */
function splitStyleDeclarations(style: string): string[] {
  const declarations: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < style.length; index++) {
    const char = style[index]!;
    if (char === "&") {
      const reference = /^&#?\w+;/.exec(style.slice(index));
      if (reference) {
        current += reference[0];
        index += reference[0].length - 1;
        continue;
      }
    }
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (char === ";" && depth === 0) {
      declarations.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  declarations.push(current);
  return declarations;
}

/**
 * Rewrites one element's raw attribute text (already isolated by
 * OPENING_TAG_RE, the same "not a parser, regex over already-isolated
 * opening tags" posture as getAttr/withElementDefault) so every paint
 * declaration inside its `style="..."` attribute (HOISTABLE_STYLE_PROPS)
 * becomes a real presentation attribute, and is removed from `style`. An
 * element with no `style` attribute at all is returned unchanged --
 * `unsafe: false` and `attrs` identical to the input, so hoistStyleAttributes
 * below can skip reconstructing (and thus reformatting) a tag that needed no
 * change at all.
 *
 * SVG/CSS's own cascade rule says a `style` declaration always outranks a
 * presentation attribute of the same name -- so an element carrying both
 * `fill="red"` and `style="fill:blue"` renders blue, not red, in a real
 * browser. When that happens here, the hoisted value *overwrites* the
 * existing attribute rather than losing to it, which reproduces the file's
 * real rendering rather than inventing a new one.
 *
 * Returns `unsafe: true` (with `attrs` unchanged) when a hoisted value would
 * contain `"` or `<` -- becoming a presentation attribute means the value
 * is about to sit inside a new double-quoted attribute of its own, and a
 * `"` would let it escape that quote; a `<` has no business in a value this
 * module has already sanitised. Both checks are load-bearing since the
 * quote-aware OPENING_TAG_RE: a single-quoted `style='fill:red"'` carries a
 * double quote tokenizeAttrs reads straight through as part of the value,
 * and a `<` inside a quoted value reaches here the same way. A `>` is
 * allowed: legal inside a quoted attribute, and real files carry one.
 *
 * Exported only for icons.test.ts, the same reason parseIconMarkup's own
 * comment states for itself: through a real SVG document (parseIconMarkup ->
 * hoistStyleAttributes -> here), `attrs` only ever arrives OPENING_TAG_RE-
 * isolated, so a `<`/`>` in a hoisted value has no way to be exercised except
 * by calling this function directly with an `attrs` string OPENING_TAG_RE
 * itself could never have isolated in the first place. Not part of this
 * package's public API surface -- index.ts does not re-export it.
 */
export function hoistStyleOnAttrs(attrs: string): { attrs: string; unsafe: boolean } {
  const tokens = tokenizeAttrs(attrs);
  const styleTokens = tokens.filter((token) => token.name.toLowerCase() === "style");
  const firstStyle = styleTokens[0];
  if (!firstStyle) {
    return { attrs, unsafe: false };
  }

  // Validator, 2026-09-06 (later): an element carrying two `style`
  // attributes hoisted from the second and left the first in place. The
  // viewer hands `body` to the HTML parser (dangerouslySetInnerHTML), whose
  // rule for a duplicate attribute is that the first wins and every later
  // one is dropped -- so that is what happens here too: the first `style`
  // is the one read, and all of them are excised below.
  const styleValue = firstStyle.value ?? "";

  const kept: string[] = [];
  const hoisted: { name: (typeof HOISTABLE_STYLE_PROPS)[number]; value: string }[] = [];

  // Comments go first, before the split: `fill:/* x */#fff` is one
  // declaration with a comment inside its value, and a comment can carry a
  // `;` of its own.
  for (const rawDeclaration of splitStyleDeclarations(styleValue.replace(CSS_COMMENT_RE, ""))) {
    const declaration = cssTrim(rawDeclaration);
    if (!declaration) {
      continue;
    }
    const colonIndex = declaration.indexOf(":");
    if (colonIndex === -1) {
      kept.push(declaration);
      continue;
    }
    const prop = cssTrim(declaration.slice(0, colonIndex)).toLowerCase();
    const hoistableName = HOISTABLE_STYLE_PROPS.find((name) => name === prop);
    if (!hoistableName) {
      kept.push(declaration);
      continue;
    }
    // `!important` is a cascade priority, not part of the value; as a
    // presentation attribute the value has no cascade left to win, so the
    // marker is dropped. An empty value (`fill:;`) is an invalid declaration
    // a browser ignores outright, so it is neither hoisted nor kept.
    const value = cssTrim(
      declaration.slice(colonIndex + 1).replace(CSS_IMPORTANT_RE, "").replace(QUOTED_FRAGMENT_URL_RE, "url($2)")
    );
    if (value === "") {
      continue;
    }
    hoisted.push({ name: hoistableName, value });
  }

  if (hoisted.some(({ value }) => value.includes('"') || value.includes("<"))) {
    return { attrs, unsafe: true };
  }

  // What remains of `style` keeps whatever the author wrote, so a kept
  // `font-family:"a"` needs single quotes around it (validator, third
  // pass: it used to be re-emitted inside double quotes, which the HTML
  // parser read back as a truncated style plus a junk attribute).
  const keptStyle = kept.length > 0 ? quoteAttrValue(kept.join(";")) : undefined;
  if (keptStyle === null) {
    return { attrs, unsafe: true };
  }

  // Rebuild by token: every `style` is dropped (its leading whitespace with
  // it); the first existing attribute by a hoisted name is replaced in
  // place -- a `fill='red'` beside `style="fill:blue"` must become one
  // `fill="blue"`, not gain a second `fill` the HTML parser would drop in
  // favour of the first (validator, 2026-09-06 (later)); everything else is
  // copied verbatim, separators included.
  const replaced = new Set<string>();
  let rewritten = "";
  let cursor = 0;
  // Every emitted attribute gets a whitespace separator before its name,
  // whether the source had one or not: a dropped leading `style` used to
  // take the tag's only separator with it, and `<path style="..."d="..."/>`
  // (no whitespace, a recoverable HTML parse error) came back as `<pathd=`
  // (validator, 2026-09-06 (later), sixth pass).
  const emit = (separator: string, text: string) => {
    rewritten += /\s$/.test(separator) ? separator + text : `${separator} ${text}`;
  };
  for (const token of tokens) {
    const lowerName = token.name.toLowerCase();
    if (lowerName === "style") {
      cursor = token.end;
      continue;
    }
    const hoistedHere = hoisted.filter(({ name }) => name === lowerName);
    const last = hoistedHere[hoistedHere.length - 1];
    if (last) {
      // The first raw attribute by this name takes the hoisted value; a
      // later duplicate is dropped, which is what the HTML parser would do
      // with it anyway and keeps the body well-formed.
      if (!replaced.has(lowerName)) {
        replaced.add(lowerName);
        emit(attrs.slice(cursor, token.nameStart), `${last.name}="${last.value}"`);
      }
      cursor = token.end;
      continue;
    }
    emit(attrs.slice(cursor, token.nameStart), attrs.slice(token.nameStart, token.end));
    cursor = token.end;
  }
  rewritten += attrs.slice(cursor);

  if (keptStyle !== undefined) {
    rewritten += ` style=${keptStyle}`;
  }
  // Appended last-wins too (validator, fifth pass): `fill:#22bc66;...;
  // fill:#ffffff` renders white in CSS, and the in-place branch above
  // already takes the last declaration, so this branch must as well. The
  // attributes still land in the order their property first appeared.
  const lastByName = new Map<string, string>();
  for (const { name, value } of hoisted) {
    lastByName.set(name, value);
  }
  for (const [name, value] of lastByName) {
    if (replaced.has(name)) {
      continue;
    }
    replaced.add(name);
    rewritten += ` ${name}="${value}"`;
  }

  return { attrs: rewritten, unsafe: false };
}

/**
 * Runs hoistStyleOnAttrs across every element in `markup`. Must run before
 * withElementDefault (parseIconMarkup's own call order enforces this): a
 * root `fill=` default materialised first would land on an element whose
 * real fill was still hiding in `style="..."` at that point, painting it
 * with the wrong colour instead of leaving its own (about to be hoisted)
 * fill alone. `unsafe: true` means some element's hoisted value failed the
 * quoted-attribute-escape check above -- parseIconMarkup turns that into a
 * flat null, the same refusal shape every other sanitiser check in this file
 * already returns.
 */
function hoistStyleAttributes(markup: string): { markup: string; unsafe: boolean } {
  let unsafe = false;
  const rewritten = markup.replace(OPENING_TAG_RE, (whole, tag: string, attrs: string, selfClose: string | undefined) => {
    if (unsafe || !hasAttrToken(attrs, "style")) {
      return whole;
    }
    const result = hoistStyleOnAttrs(attrs);
    if (result.unsafe) {
      unsafe = true;
      return whole;
    }
    return `<${tag}${result.attrs}${selfClose ? " /" : ""}>`;
  });
  return { markup: rewritten, unsafe };
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

interface ParsedIconMarkup {
  readonly viewBox: string;
  readonly body: string;
}

/**
 * Turns raw SVG bytes -- a vendored thesvg.org file, or (as of 2026-09-04,
 * docs/custom-icon-brief.md) an owner-supplied file the CLI has fetched or
 * copied and vendored under `.catalogus/icons/` -- into `{ viewBox, body }`,
 * the two pieces of a ResolvedIcon that come straight off the file, before
 * whatever per-icon fill policy the caller applies runs (THESVG_ICONS below
 * for a vendored file; resolveLocalIcon applies none at all -- see its own
 * comment). Never throws: every malformed- or unsafe-shaped input returns
 * null, same contract as the rest of this module.
 *
 * Named parseIconMarkup, not parseThesvgMarkup as it was until 2026-09-04:
 * the function itself never changed, only the fact that its caller is no
 * longer only "one of five files this package vendors" -- an owner-supplied
 * file is exactly as untrusted as a vendored one, so it goes through the
 * same sanitiser rather than a second copy of it, and the name should not
 * claim a narrower job than the one it actually does. The rename carried
 * every existing test in icons.test.ts across unchanged; none of the
 * behaviour below moved.
 *
 * Not a parser -- extractPathData's own comment already covers why one
 * regex greedily grabbing every `d="..."` doesn't generalise past a
 * one-path file, and none of the five vendored files (nor any realistic
 * owner-supplied brand mark) are one-path files. What this function does
 * instead is sound for a narrower reason: every file it is ever handed is
 * expected to be `<svg …>inner</svg>` with no second, nested `<svg>`, so the
 * inner markup a caller wants is exactly the substring between the root
 * tag's own `>` and the document's last `</svg>` -- no tree-walking
 * required to find it. The svgTagCount check below is what keeps that
 * assumption from silently stopping being true: a file with a second `<svg`
 * is refused rather than sliced at the wrong boundary.
 *
 * Exported only for icons.test.ts, so the sanitiser's refusals (a synthetic
 * <script>-bearing file, a nested <svg>, a missing viewBox) can be proven
 * directly against this function rather than indirectly through a fixture
 * file on disk -- resolveThesvgIcon and resolveLocalIcon below only ever
 * call this with bytes already read off disk. Not part of this package's
 * public API surface -- index.ts does not re-export it.
 */
export function parseIconMarkup(raw: string): ParsedIconMarkup | null {
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

  const openTag = ROOT_SVG_TAG_RE.exec(stripped);
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

  // Added 2026-09-06 (two real owner-supplied files from a client repo):
  // hoist every paint declaration out of a `style="..."` attribute and into
  // a real presentation attribute (hoistStyleAttributes's own comment has
  // the full reasoning). Must run before the root-default materialisation
  // just below: withElementDefault only looks at real attributes, so a root
  // `fill=` default applied first would land on an element whose actual
  // fill was still hiding in `style="..."` at that point, painting over it
  // with the wrong colour instead of leaving the (about to be hoisted) real
  // one alone. None of the five vendored thesvg files carry a `style`
  // attribute at all (confirmed by reading all five, and guarded by the
  // sha256 drift test below), so this is a no-op for every one of them.
  const hoistResult = hoistStyleAttributes(body);
  if (hoistResult.unsafe) {
    return null;
  }
  body = hoistResult.markup;

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
  // The root's own `style="fill:..."` is a default in exactly the same way
  // a root `fill="..."` is (validator, 2026-09-06 (later): it was dropped
  // with the root tag), so the root's attributes are hoisted first and the
  // default read off the result.
  const rootHoist = hoistStyleOnAttrs(attrs);
  if (rootHoist.unsafe) {
    return null;
  }
  const defaultFill = getAttr(rootHoist.attrs, "fill");
  const defaultFillRule = getAttr(rootHoist.attrs, "fill-rule");
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
 * parseIconMarkup's checks all degrade to null.
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

  const parsed = parseIconMarkup(raw);
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

// ---------------------------------------------------------------------------
// Render risk: paint that may vanish on the viewer's light ground. Added
// 2026-09-06, same pass as hoistStyleAttributes above and for the same
// underlying reason -- an owner-supplied file can carry a fill that is
// perfectly legitimate on the ground it was originally drawn for, and wrong
// on the viewer's. This section works on any already-resolved ResolvedIcon's
// `body`, whichever of the three sources (simple-icons, thesvg, owner-
// supplied) produced it -- it is not part of resolution itself, and is
// deliberately a separate exported function rather than a field on
// ResolvedIcon (see its own comment for why).

/** One `fill`/`stroke`/`stop-color` presentation attribute anywhere in a resolved body, double-quoted, single-quoted or unquoted (group 2, 3 or 4; the HTML parser reads all three the same way), separated by HTML whitespace only -- `<path fill=...>` is a tag named `path fill=...` to a browser and paints nothing (validator, eighth pass) -- run after the hoist above, so a colour hiding inside `style="..."` has already become one of these three real attributes by the time findIconRenderRisks ever sees it. */
const PAINT_ATTR_RE = /[ \t\n\f\r](fill|stroke|stop-color)[ \t\n\f\r]*=[ \t\n\f\r]*(?:"([^"]*)"|'([^']*)'|([^ \t\n\f\r"'<>=`]+))/gi;

/**
 * Decodes numeric character references (`&#35;`, `&#x23;`) the way the HTML
 * parser does before CSS reads an attribute value. A reference outside the
 * Unicode range becomes U+FFFD, as in a browser, rather than a thrown
 * RangeError (validator, 2026-09-06 (later), fifth pass: `&#x110000;` took
 * down `catalogus icons` and `list_icons` for the whole manifest).
 */
function decodeNumericReferences(value: string): string {
  const decode = (codePoint: number) => (Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "\uFFFD");
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_whole, hex: string) => decode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_whole, dec: string) => decode(Number(dec)));
}

/**
 * normalizeHexValue for the light-paint scan only: the 4-digit (`#rgba`)
 * and 8-digit (`#rrggbbaa`) spellings have their alpha digits cut before
 * normalising, so `#ffffff80` is judged as the white it is. Alpha does not
 * make a light paint darker, only fainter, and fainter white on a light
 * ground is the very thing this scan reports. Kept out of normalizeHexValue
 * itself because that one also drives the knockout comparison, where an
 * alpha-carrying spelling has never been declared and must not start
 * matching a knockout entry by accident.
 */
function normalizePaintHexValue(value: string): string | null {
  const trimmed = cssTrim(value);
  const hexPart = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{4}$/.test(hexPart)) {
    return normalizeHexValue(hexPart.slice(0, 3));
  }
  if (/^[0-9a-fA-F]{8}$/.test(hexPart)) {
    return normalizeHexValue(hexPart.slice(0, 6));
  }
  // Only a bare 3- or 6-digit run goes on to normalizeHexValue: that one
  // trims with JS whitespace, which would let a U+00A0 the CSS parser
  // treats as part of the value (an invalid colour) read as white here.
  return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hexPart) ? normalizeHexValue(hexPart) : null;
}

/** The WCAG relative-luminance floor a colour must clear to be reported. 1.0 (pure white) and the `white` keyword both clear it easily; #faed1e, a real saturated brand yellow pulled from one of the two fixtures below, computes to ~0.81 and does not -- the threshold is meant to catch pale-to-white paint that can vanish against a light page, not merely bright colour. */
const LIGHT_PAINT_LUMINANCE_THRESHOLD = 0.85;

/** One channel of sRGB (0-1) converted to linear light, the standard WCAG relative-luminance gamma step. */
function srgbChannelToLinear(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white) of a bare, lowercase 6-digit hex string -- callers are expected to have already run normalizeHexValue (or to hand in "ffffff" directly for the `white` keyword) rather than a raw, unvalidated value. */
function relativeLuminance(hex6: string): number {
  const r = Number.parseInt(hex6.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex6.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex6.slice(4, 6), 16) / 255;
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

/**
 * One paint value in a resolved icon's body that is light enough to risk
 * disappearing against the viewer's light page ground -- see
 * findIconRenderRisks's own comment for the full "why report instead of
 * decide" reasoning. `value` is always the normalised form (lowercase
 * 6-digit hex, no leading `#`; `white` itself normalises to `ffffff`) so two
 * spellings of the same colour never produce two entries.
 */
export interface IconRenderRisk {
  readonly kind: "light-paint";
  readonly attribute: "fill" | "stroke" | "stop-color";
  readonly value: string;
}

/**
 * Scans a resolved icon's body for paint light enough to vanish against the
 * viewer's light page ground, one entry per distinct (attribute, normalised
 * value) pair actually found.
 *
 * Why this reports a fact instead of making a call: the same bytes mean two
 * opposite things depending on what the file was drawn for. Healthchecks'
 * own mark carries a white bar -- real painted ink, meant to sit on the
 * brand's dark green ground it was designed against. csharp's thesvg file
 * carries `fill="#fff"` on its cut-out letters -- not ink at all, a hole
 * this package's own knockout policy turns into `data-knockout` so the
 * viewer paints the page ground through it (see applyKnockout's comment).
 * Nothing in a file's bytes says which one a given white fill is; a mark
 * this package has never seen a fill policy declared for (every owner-
 * supplied icon, via resolveLocalIcon) carries no such policy at all. Both
 * "invent a currentColor inversion" and "invent a knockout" are exactly the
 * shape of guess CLAUDE.md's "ask, never guess" rule forbids, so this
 * function does neither: it reports the fact, and leaves "does this look
 * right?" to a caller that can put the rendered mark in front of the owner
 * (the CLI's `catalogus icons` report, and the skill's guidance to look at
 * the rendered result before moving on).
 *
 * Parses only what it can prove is a colour: 3-, 4-, 6- or 8-digit hex
 * (normalizePaintHexValue) and the CSS keyword `white`. `none`, `currentColor`,
 * `url(#...)` (a gradient reference, resolved to whatever colours its own
 * `<stop>` elements carry -- each already scanned in its own right),
 * `inherit`, `transparent`, `rgb()`/`hsl()` functions, and every other named
 * CSS colour are skipped outright, the same "do not guess" floor applied to
 * parsing rather than to the paint-or-hole judgement above: a value this
 * function cannot classify with certainty is left unreported, not guessed
 * at either way.
 *
 * Elements carrying `data-knockout` (applyKnockout's own output) have no
 * fill attribute left at all by the time this runs -- PAINT_ATTR_RE simply
 * never matches them, so a knockout body reports nothing, without this
 * function needing to know `data-knockout` exists.
 */
export function findIconRenderRisks(body: string): IconRenderRisk[] {
  const seen = new Set<string>();
  const risks: IconRenderRisk[] = [];

  for (const match of body.matchAll(PAINT_ATTR_RE)) {
    const attribute = match[1]!.toLowerCase() as IconRenderRisk["attribute"];
    // A numeric character reference is what the HTML parser decodes before
    // CSS reads the value, so `&#35;fff` is judged as the `#fff` it renders.
    const rawValue = cssTrim(decodeNumericReferences(match[2] ?? match[3] ?? match[4] ?? ""));

    const normalizedValue = /^white$/i.test(rawValue) ? "ffffff" : normalizePaintHexValue(rawValue);
    if (normalizedValue === null) {
      continue;
    }

    if (relativeLuminance(normalizedValue) < LIGHT_PAINT_LUMINANCE_THRESHOLD) {
      continue;
    }

    const dedupeKey = `${attribute}:${normalizedValue}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    risks.push({ kind: "light-paint", attribute, value: normalizedValue });
  }

  return risks;
}

// ---------------------------------------------------------------------------
// Owner-supplied icons (2026-09-04, docs/custom-icon-brief.md). A service
// entry's own `icon` field (packages/schema/src/schema.ts's serviceEntry.icon)
// is not a ref into any table this package controls: it is a repo-relative
// `.catalogus/icons/<name>.svg` path the CLI wrote after fetching the bytes
// from an `https://` URL the manifest's author supplied, or copying them from
// a local file, exactly once (`catalogus set services.<id>.icon <url|path>`).
// resolveLocalIcon is the read-time half of that design: it never touches the
// network itself -- by the time anything calls it, the bytes are already on
// disk -- and it applies the same untrusted-input posture the vendored thesvg
// files get, because "this file arrived over HTTPS, or via --path, from
// outside this package" is exactly as untrusted as "this file lives in this
// package's own tree" was before parseIconMarkup existed to check it.

/**
 * The size ceiling both `catalogus set services.<id>.icon` (packages/cli)
 * and this module's own resolveLocalIcon enforce, so the two can never
 * disagree about what is too big to vendor -- the CLI refuses to write a
 * file this resolver would later refuse to read, and this resolver refuses
 * to read a file the CLI would never have written, whichever one a given
 * bug or hand-edit produced. 256 KiB is generous for a hand-drawn brand
 * mark (every one of the five vendored thesvg.org files under
 * ../icons/thesvg/ is well under 6 KB) while still cheap to stat and read
 * on every `catalogus view` / `catalogus icons` run.
 */
export const MAX_ICON_BYTES = 256 * 1024;

/**
 * Why a local file failed to resolve -- `"missing"` when nothing is there at
 * all, `"refused"` (with a human-readable `reason`) when a file *is* there
 * but couldn't be used. Added 2026-09-04, alongside describeLocalIconRefusal
 * below, for a defect the validator reproduced against the built binary
 * (D3, docs/custom-icon-brief.md's follow-up): `catalogus icons` labelled a
 * file that existed but failed the sanitiser the exact same way it labelled
 * one nobody had ever fetched -- "(missing file)" either way -- so an agent
 * running the skill's 7b loop had no way to tell "this has never been
 * fetched" from "this was fetched and cannot be used; fetching the same URL
 * again will not help" apart. The two calls for an agent to make in
 * response are different (fetch something, versus pick a different
 * source), and the CLI was reporting one signal for both.
 */
export type LocalIconRefusal = { readonly kind: "missing" } | { readonly kind: "refused"; readonly reason: string };

type LocalIconOutcome = { readonly ok: true; readonly icon: ResolvedIcon } | { readonly ok: false; readonly refusal: LocalIconRefusal };

/** `error instanceof Error ? error.message : String(error)`, kept local rather than imported: this package has no dependency on packages/cli's own copy (types.ts's errorMessage), and pulling one in for a single one-line helper used only in a refusal-reason string would be the wrong direction for that dependency to run. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The one real implementation behind both resolveLocalIcon (the hot,
 * render-time path: succeed or degrade to null, no caller has ever needed
 * more than that) and describeLocalIconRefusal (the cold, reporting-time
 * path added for D3 above: a caller that already knows resolution failed
 * and needs to say why). Kept as a single function reading the file at most
 * once, rather than resolveLocalIcon and a second, independent diagnostic
 * function each re-running the same stat/read/parse -- two copies of this
 * exact sequence is how they drift, which is the same reason parseIconMarkup
 * itself is shared with the vendored-thesvg path rather than duplicated.
 *
 * The size check runs first, against a `stat`, before any byte of the file
 * is read: a resolver handed a path to a file the CLI would never itself
 * have written (a 40 MB SVG dropped in by hand, or produced by a future bug
 * elsewhere) has to refuse it cheaply, not by reading the whole thing into
 * memory first and discarding it.
 */
async function resolveLocalIconDetailed(absolutePath: string): Promise<LocalIconOutcome> {
  let info;
  try {
    info = await stat(absolutePath);
  } catch {
    return { ok: false, refusal: { kind: "missing" } };
  }
  if (info.size > MAX_ICON_BYTES) {
    return { ok: false, refusal: { kind: "refused", reason: `over the ${MAX_ICON_BYTES}-byte size cap` } };
  }

  let raw: string;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch (error) {
    // A stat that succeeded followed by a read that failed (EISDIR on a
    // directory, an ACL that allows stat but not open, a race where the
    // file was removed between the two calls) is "something is there" by
    // the same test D3 asks for -- reported as refused, not missing.
    return { ok: false, refusal: { kind: "refused", reason: `could not be read (${describeError(error)})` } };
  }

  const parsed = parseIconMarkup(raw);
  if (!parsed) {
    return {
      ok: false,
      refusal: {
        kind: "refused",
        // Phrased to follow "it": the callers (`catalogus icons`, `view`'s
        // stderr line) frame it once. The first cut began "the sanitiser
        // refused it (...)" and both callers said so again, so the line an
        // agent reads in the skill's 7b loop read "refused it (the sanitiser
        // refused it (...))" -- a re-validation finding, 2026-09-04.
        reason:
          "failed the sanitiser: it carries a <script>, <foreignObject>, on*= handler, <a href>/<use xlink:href>, " +
          "<style> block, a url(...) reference that isn't a same-document #fragment or a nested <svg>, " +
          "or it has no viewBox",
      },
    };
  }

  return { ok: true, icon: { viewBox: parsed.viewBox, body: parsed.body, hex: null } };
}

/**
 * Resolves an owner-supplied SVG the CLI has already vendored to disk --
 * `absolutePath` is a real filesystem path, not a repo-relative one; see
 * this function's own callers in packages/cli (view-payload.ts, icons.ts)
 * for how a service entry's `icon` field becomes one. Never throws: a
 * missing file, an unreadable file, a file over MAX_ICON_BYTES, or markup
 * parseIconMarkup refuses all degrade to null, the same contract every
 * other resolver in this module keeps -- a broken icon must fall back to
 * the viewer's generic glyph, not fail the request that carries it.
 *
 * Always applies the `brand` fill policy with no knockout list -- every
 * fill in the file is kept exactly as parseIconMarkup returns it, and `hex`
 * is always null. This is deliberate, not a placeholder for a real policy
 * later (docs/custom-icon-brief.md, "The contract..."): this module has no
 * way to know whether a user-supplied mark is a single-ink glyph meant to
 * invert to currentColor (the `ink` policy THESVG_ICONS gives openai.svg)
 * or which of its own fills, if any, are letters cut out of a ground (the
 * `knockout` policy THESVG_ICONS gives csharp.svg) -- both are per-icon
 * facts only a human who has looked at the mark can supply, and guessing
 * either one is exactly the shape of guess root CLAUDE.md's "ask, never
 * guess" rule exists to forbid. Treating the file exactly as it is drawn is
 * the one policy that requires no guess. A later field letting a manifest
 * author record a per-icon policy, the way THESVG_ICONS does for the fixed
 * vendored set, is a plausible future addition and is deliberately out of
 * scope here.
 *
 * Knows nothing about `.catalogus/icons/`, the manifest's own directory, or
 * containment within it -- exactly as resolveIcon above knows nothing about
 * paths at all. That floor belongs to the caller that both knows the
 * manifest's location and is the one place expected to hold it (packages/
 * cli's view-payload.ts asserts the resolved absolute path is inside
 * `<manifestDir>/.catalogus/icons/` before ever calling this).
 */
export async function resolveLocalIcon(absolutePath: string): Promise<ResolvedIcon | null> {
  const outcome = await resolveLocalIconDetailed(absolutePath);
  return outcome.ok ? outcome.icon : null;
}

/**
 * The diagnostic sibling of resolveLocalIcon, for the one caller that has
 * to *explain* a null instead of just rendering around it -- see
 * LocalIconRefusal's own comment for D3, the defect this exists to fix.
 * Returns null when `absolutePath` actually resolves (nothing to explain);
 * callers in practice only reach for this after resolveLocalIcon has
 * already returned null for the same path (icon-resolution.ts's
 * resolveServiceIcon), so that branch mainly protects against a
 * check-then-act race rather than a case any caller relies on.
 *
 * Deliberately not the hot path: every render-time caller (view-payload.ts,
 * through icon-resolution.ts) keeps calling resolveLocalIcon and degrading
 * silently on null, exactly as before -- this is a second stat+read+parse
 * pass, paid only where a caller needs the reason, which today is just
 * `catalogus icons`' report line and (once view.ts picks this up) its
 * stale-pointer stderr warning.
 */
export async function describeLocalIconRefusal(absolutePath: string): Promise<LocalIconRefusal | null> {
  const outcome = await resolveLocalIconDetailed(absolutePath);
  return outcome.ok ? null : outcome.refusal;
}
