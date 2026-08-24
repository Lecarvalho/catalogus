// Pure functions for the one route this app has: `#/service/<id>`, the
// detail panel's address (docs/PLAN.md's Phase 3.7 restructure). No router
// dependency -- App.tsx pairs these with a `hashchange` listener instead,
// since one route does not warrant pulling in react-router. Kept pure and
// out of App.tsx, the same way group-services.ts is kept out of the render
// tree, so the parsing rules are testable without jsdom and without
// App.tsx's fetch/window plumbing -- and so App.tsx stays the only file
// that actually reads `window.location`, per this app's existing purity
// rule (see App.tsx's own top comment).
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
