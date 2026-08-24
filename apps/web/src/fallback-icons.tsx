// Generic glyphs for a service with no verified brand icon, keyed by
// `rollup` (the segment of `role` before the first "-") rather than by the
// catalog. This is deliberate, not a shortcut: docs/PLAN.md measured 38% of
// the catalog with no brand mark at all -- Slack, OpenAI and every AWS row
// among them -- so the fallback is the majority path for a real manifest,
// not a rare edge case, and a per-usage role is exactly what a generic icon
// should depict: whoever the vendor is, the database node gets a database
// glyph. Never a brand name or a brand-shaped mark -- every glyph below is
// hand-drawn from plain rects/circles/lines, not adapted from any real logo.
//
// Deliberately small and explicit -- one entry per rollup this project has
// actually seen (the ~20-word base list docs/PLAN.md's "naming a role"
// section settled on, trimmed to what a real manifest uses today), plus one
// neutral shape for everything else. Do not grow this into an exhaustive
// mapping for every role anyone could type; an unmatched rollup getting the
// same neutral shape as every other unmatched one is the point, not a gap.
import type { JSX } from "react";

export interface FallbackGlyphProps {
  rollup: string;
}

/**
 * Every glyph shares the same 24x24 viewBox and stroke-only rendering
 * (`fill="none"`, `currentColor` stroke) so a caller can recolor the whole
 * set with one CSS `color` -- see Icon.module.css's `.fallback` rule. Kept
 * as plain function components (not memoized, not wrapped) since a service
 * list is at most a few dozen rows; there is nothing here worth optimizing.
 *
 * Built on a null-prototype record, not a plain `{}` literal, for the same
 * reason CATALOGUS_CATALOG is (packages/core/src/catalog.ts -- read its doc
 * comment for the full account). `rollup` is the segment of `role` before
 * the first "-", and the schema's slug pattern
 * (`^[a-z0-9]+(?:[_-][a-z0-9]+)*$`) admits "constructor". On a plain
 * literal, `GLYPHS["constructor"]` resolves through Object.prototype to the
 * `Object` function -- truthy, and a function, so it is rendered as a
 * component. That is not a theoretical hazard: a manifest carrying
 * `role: constructor` validates clean, `catalogus graph` prints it fine, and
 * the served page went entirely blank (React error #31, no error UI at all,
 * because one bad node takes the whole tree down). Fixing it here rather
 * than at the lookup is deliberate: the defect is that the table was
 * prototype-reachable, not that the read was careless, and a guard at one
 * call site is one refactor away from being lost.
 */
const GLYPHS: Record<string, () => JSX.Element> = Object.assign(Object.create(null) as Record<string, () => JSX.Element>, {
  hosting: () => (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="4" rx="1" />
      <circle cx="6.5" cy="6" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="12" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="18" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  database: () => (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14a8 3 0 0 0 16 0V5" />
      <path d="M4 12a8 3 0 0 0 16 0" />
    </>
  ),
  auth: () => <path d="M12 2 3 6v6c0 5 4 8.5 9 10 5-1.5 9-5 9-10V6z" />,
  storage: () => <path d="M3 7h6l2 2h10v11H3z" />,
  cache: () => (
    <>
      <polygon points="12,3 21,7 12,11 3,7" />
      <polyline points="3,12 12,16 21,12" />
      <polyline points="3,17 12,21 21,17" />
    </>
  ),
  queue: () => (
    <>
      <line x1="3" y1="7" x2="15" y2="7" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="17" x2="15" y2="17" />
      <polyline points="17,4 21,12 17,20" fill="none" />
    </>
  ),
  search: () => (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.3" y1="15.3" x2="21" y2="21" />
    </>
  ),
  ai: () => <path d="M12 2 14 10 22 12 14 14 12 22 10 14 2 12 10 10Z" />,
  payments: () => (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </>
  ),
  email: () => (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <polyline points="3,6 12,13 21,6" />
    </>
  ),
  sms: () => <path d="M4 4h16v12H9l-4 4V16H4z" />,
  monitoring: () => (
    <>
      <path d="M4 15a8 8 0 0 1 16 0" />
      <line x1="12" y1="15" x2="16" y2="9" />
      <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  logs: () => (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
    </>
  ),
  analytics: () => (
    <>
      <line x1="3" y1="21" x2="21" y2="21" />
      <rect x="5" y="13" width="3.5" height="8" />
      <rect x="10.25" y="8" width="3.5" height="13" />
      <rect x="15.5" y="3" width="3.5" height="18" />
    </>
  ),
  dns: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </>
  ),
  registrar: () => (
    <>
      <path d="M6 2h9l5 5v15H6z" />
      <polyline points="15,2 15,7 20,7" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </>
  ),
  cdn: () => (
    <>
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <circle cx="12" cy="5" r="2.5" />
      <line x1="7" y1="17" x2="17" y2="17" />
      <line x1="6.5" y1="16" x2="10.5" y2="7" />
      <line x1="17.5" y1="16" x2="13.5" y2="7" />
    </>
  ),
  vcs: () => (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="12" r="2.2" />
      <path d="M6 8.2V18M6 8.2c0 4 3 5.8 8 5.8" />
    </>
  ),
  ci: () => (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <polyline points="7,12.5 10.5,16 17,8" />
    </>
  ),
  pm: () => (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="9.5" y="4" width="5" height="10" rx="1" />
      <rect x="16" y="4" width="5" height="13" rx="1" />
    </>
  ),
  secrets: () => (
    <>
      <circle cx="8" cy="15" r="4" />
      <line x1="11" y1="12" x2="20" y2="3" />
      <line x1="16" y1="7" x2="19" y2="10" />
      <line x1="18.5" y1="4.5" x2="21" y2="7" />
    </>
  ),
});

/** One neutral shape for a rollup nothing above names -- a shape, deliberately never an identity. */
function DefaultGlyph(): JSX.Element {
  return <polygon points="12,2 21,7.5 21,16.5 12,22 3,16.5 3,7.5" />;
}

export function FallbackGlyph({ rollup }: FallbackGlyphProps): JSX.Element {
  const Glyph = GLYPHS[rollup];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {Glyph ? <Glyph /> : <DefaultGlyph />}
    </svg>
  );
}
