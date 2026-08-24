// Server-side icon resolution: given a verified `simple-icons` slug (the
// `icon` field on a CatalogEntry, see catalog.ts), returns the SVG path
// data the viewer draws it with. This exists as a separate module from
// catalog.ts because catalog.ts only ever answers "is there a verified
// icon ref for this dagstree slug" -- a synchronous, in-memory lookup -- and
// turning that ref into actual path data means reading a file, which is an
// I/O concern the catalog itself has no reason to carry.
//
// Why this runs server-side rather than shipping simple-icons to the
// browser: the installed package's own bundle
// (simple-icons/index.mjs, v16.28.0) is 5.2 MB, and a dagstree.yaml's
// service slugs are only known at runtime, so nothing about the way the
// viewer's bundle is built could ever tree-shake that down -- every icon
// the manifest might name would have to ship. docs/PLAN.md's Phase 3.7
// section records this as a correction to an earlier plan that assumed
// bundling; the browser gets a plain `d` string per service instead, over
// the same /api/project payload that carries everything else.
//
// Resolution is deliberately lazy and per-slug, never a bulk load: this
// reads exactly the icon files a manifest's own services actually
// reference, not the full 3,453-icon set.
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
 * disambiguating underscore -- so the allow-list has to include it. This
 * exists as a defensive floor, not the primary safety mechanism: every ref
 * this function is actually called with today comes from catalog.ts's own
 * ICON_OVERLAY table, a hardcoded set this package controls. It's here so
 * that if that assumption ever stops holding -- a future caller resolving a
 * ref from somewhere less trusted -- a value shaped like `../../secret` is
 * rejected before it ever reaches require.resolve() rather than relying on
 * require.resolve() alone to contain it.
 */
const SAFE_ICON_REF = /^[a-z0-9_]+$/;

/**
 * Pulls the `d` attribute off a simple-icons SVG's single `<path>` element.
 * Every icon in the installed package is exactly one `<title>` plus one
 * `<path d="...">` -- confirmed by reading several source files directly,
 * including nginx.svg -- so the first (only) `d="..."` match is the whole
 * answer; there's no second path to be greedy about.
 */
function extractPathData(svg: string): string | null {
  const match = /<path\b[^>]*\sd="([^"]*)"/.exec(svg);
  return match ? match[1]! : null;
}

/**
 * Resolves a verified simple-icons ref (CatalogEntry.icon) to its SVG path
 * data, or null when there is nothing to draw -- a missing ref, a ref shaped
 * unsafely, a file that no longer resolves (simple-icons has dropped brand
 * marks under trademark pressure before -- see catalog.ts's ICON_OVERLAY
 * comment), or a file that doesn't parse the way every installed icon is
 * expected to. Never throws: a broken icon must fall back to the viewer's
 * generic glyph, not fail the request that carries it.
 *
 * Takes `icon: string | undefined` rather than requiring the caller to
 * branch first, since the overwhelmingly common call shape is "the field
 * a CatalogEntry may or may not carry" (`resolveIconPath(getCatalogEntry(slug)?.icon)`).
 */
export async function resolveIconPath(icon: string | undefined): Promise<string | null> {
  if (!icon || !SAFE_ICON_REF.test(icon)) {
    return null;
  }

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
