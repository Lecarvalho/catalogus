// Pure functions for this app's two routes: `#/service/<id>`, the detail
// panel's address (docs/PLAN.md's Phase 3.7 restructure), and, since the
// 2026-09-04 brand-tile pass (docs/brand-tile-brief.md, "Shared contract"),
// `#/brand/<bandId>/<serviceSlug>` -- what a tile standing for several
// entries of one vendor opens instead of an entry's own page. No router
// dependency -- App.tsx pairs these with a `hashchange` listener instead,
// since two routes still do not warrant pulling in react-router. Kept pure
// and out of App.tsx, the same way group-services.ts is kept out of the
// render tree, so the parsing rules are testable without jsdom and without
// App.tsx's fetch/window plumbing -- and so App.tsx stays the only file
// that actually reads `window.location`, per this app's existing purity
// rule (see App.tsx's own top comment).
import type { BandId } from "./bands.js";

const HASH_PREFIX = "#/service/";

/**
 * Extracts the service id from a location hash, or null when the hash
 * doesn't address a service at all -- empty, some other shape, or absent.
 *
 * Never throws. `decodeURIComponent` throws `URIError` on a malformed
 * percent-escape (`#/service/%`), and the hash is exactly the part of the
 * URL a person can hand-edit or a stale bookmark can carry -- "a hostile or
 * stale id must not throw" is the stated requirement this guards, not a
 * theoretical one. A decode failure falls back to the raw (still-encoded)
 * remainder rather than null, on the same "an unknown id selects nothing
 * and does not crash" logic App.tsx already applies once this id fails to
 * match any real service: whatever text survives is treated as an id
 * candidate, and a real service will never coincidentally have one that
 * only decodes into a URIError, so this can never mask a legitimate id.
 */
export function serviceIdFromHash(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) {
    return null;
  }
  const raw = hash.slice(HASH_PREFIX.length);
  if (raw.length === 0) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Builds the hash that addresses one service's detail panel. */
export function hashForServiceId(id: string): string {
  return `${HASH_PREFIX}${encodeURIComponent(id)}`;
}

// 2026-09-04: the brand page's own route, added for the one-tile-per-brand
// pass (docs/brand-tile-brief.md, "Shared contract" -- Part A owns this
// file). `<bandId>` is needed alongside the catalog slug because
// `collapseByService` runs per band (bands.ts's own header): the same slug
// can collapse into two different groups in two different bands -- Supabase
// as `supabase-auth` in "Runs in production" and `supabase-db` in "Holds
// data" -- so the slug alone would address two different pages.
const BRAND_HASH_PREFIX = "#/brand/";

/**
 * Extracts the band id and catalog slug from a `#/brand/<bandId>/<service>`
 * hash, or null when the hash doesn't address a brand page at all -- wrong
 * prefix, a missing segment, or an empty one.
 *
 * Never throws, for the same reason `serviceIdFromHash` does not: the hash
 * is exactly the part of the URL a person can hand-edit or a stale bookmark
 * can carry. `band` is typed `BandId` for the caller's convenience but is
 * not validated against `BANDS` here -- the same trust boundary
 * `serviceIdFromHash` draws for a service id. A hostile or stale band
 * segment resolves no real `VendorGroup` once App.tsx looks one up against
 * the loaded payload, so it selects nothing rather than crashing; checking
 * it a second time here would only move that same "no match" outcome one
 * file earlier, for no caller that needs it sooner.
 */
export function brandFromHash(hash: string): { band: BandId; service: string } | null {
  if (!hash.startsWith(BRAND_HASH_PREFIX)) {
    return null;
  }
  const rest = hash.slice(BRAND_HASH_PREFIX.length);
  const slashIndex = rest.indexOf("/");
  // No "/" at all (-1), a band segment of zero length (slashIndex 0), or a
  // service segment of zero length (the "/" is the last character) all read
  // as "this hash does not name a complete brand address" -- the same
  // "empty after the prefix means null" rule serviceIdFromHash applies to
  // its own single segment, extended to two.
  if (slashIndex <= 0 || slashIndex === rest.length - 1) {
    return null;
  }
  const rawBand = rest.slice(0, slashIndex);
  const rawService = rest.slice(slashIndex + 1);
  try {
    return { band: decodeURIComponent(rawBand) as BandId, service: decodeURIComponent(rawService) };
  } catch {
    // A decode failure on either segment falls back to the raw (still-
    // encoded) text for both, on the same "whatever text survives is an id
    // candidate" logic serviceIdFromHash uses -- a real band id or catalog
    // slug never contains a percent sign that decodeURIComponent chokes on.
    return { band: rawBand as BandId, service: rawService };
  }
}

/** Builds the hash that addresses one band's brand page for one catalog slug. */
export function hashForBrand(band: BandId, service: string): string {
  return `${BRAND_HASH_PREFIX}${encodeURIComponent(band)}/${encodeURIComponent(service)}`;
}
