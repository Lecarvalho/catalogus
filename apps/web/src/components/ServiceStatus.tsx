// The status vocabulary shared by every surface that draws a manifest
// entry's lifecycle status on the ground rather than in a fact grid:
// ServiceTile.tsx (the List's icon), ServiceNode.tsx (the graph's node) and
// MigrationList.tsx (the migrations board's row). All three drew the same
// three things -- the status word, the corner-badge pictogram, and the
// word-plus-arrow-target phrase -- and until this file existed each kept its
// own copy, because the components were built (and are still owned) by
// separate, concurrent slices that could not reach into a sibling file mid-
// flight. ServiceNode.tsx's and MigrationList.tsx's own header comments both
// name the duplication as deliberate-for-now and flag it for exactly this
// lift.
//
// The lift matters beyond tidiness. docs/DIRECTION.md names the pictogram's
// *shape* as the mechanism by which status survives a full-page
// `grayscale(1)` filter -- "a corner badge with a distinct pictogram per
// state ... so the signal colour is never the only way to read it". Three
// independent copies of that shape were three chances for the mechanism to
// drift apart, silently: nobody diffs two SVG `d` attributes in two files by
// eye in review. One copy, three importers, is the only way the three
// surfaces are guaranteed to agree.
//
// Markup (viewBox, stroke attributes, path data) is taken verbatim from
// candidate-e-homescreen.html's `.status-badge--phasing_out` /
// `--deprecated` / `--removed` elements, not redrawn -- a record of an
// approved shape, not a fresh guess at what it should look like (CLAUDE.md,
// "ask, never guess"). The wording matches the mockup's own `.icon-status`
// text exactly ("Phasing out", "Deprecated", "Removed").
//
// What this file does *not* own: the owner's 2026-08-31 ruling that an
// `active` service carrying `replaced_by` must show the replacement on the
// tile (docs/DIRECTION.md, "Signal red: the rule stands, and the build was
// wrong rather than the rule"). That case is specific to ServiceTile.tsx --
// it is where the ruling was put, and ServiceNode.tsx and MigrationList.tsx
// were not part of it -- so `statusPhrase` below keeps `active` returning
// `undefined` for every caller, exactly as all three files agreed before the
// lift, and ServiceTile.tsx layers its own narrow exception on top locally.
// See that file's own comment for why the exception lives there and not
// here.
import type { ViewService } from "@catalogus/cli";

/**
 * Every status but the norm. `active` earns neither a badge nor a word --
 * docs/DIRECTION.md, OWN-WORLD: "`active` carries no badge and no status
 * word: tagging the norm is what produced thirty-five identical marks
 * before" -- so it has no entry in `STATUS_WORDS` and no case in
 * `StatusBadgeGlyph` below.
 */
export type NonActiveStatus = Exclude<ViewService["status"], "active">;

/**
 * The status word spelled out -- one of the independent, non-colour status
 * signals candidate E requires (docs/candidates/README.md). Title Case,
 * matching candidate-e-homescreen.html's own `.icon-status` text exactly.
 */
export const STATUS_WORDS: Record<NonActiveStatus, string> = {
  phasing_out: "Phasing out",
  deprecated: "Deprecated",
  removed: "Removed",
};

/**
 * The corner badge's pictogram, one distinct shape per status so it reads
 * before any word does and survives a full-page `grayscale(1)` filter on
 * shape alone -- the check candidate-e-homescreen.html was verified against.
 * Verbatim from the mockup, not redrawn (see this file's header).
 */
export function StatusBadgeGlyph({ status }: { status: NonActiveStatus }) {
  switch (status) {
    case "phasing_out":
      // An hourglass.
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 2.5h10M7 21.5h10M8 2.5c0 4.2 3.1 5.9 4 6.4.9-.5 4-2.2 4-6.4M8 21.5c0-4.2 3.1-5.9 4-6.4.9.5 4 2.2 4 6.4" />
        </svg>
      );
    case "deprecated":
      // An archive box.
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="4.2" rx="1.1" />
          <path d="M5 8.7v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" />
          <path d="M10.2 13.4h3.6" />
        </svg>
      );
    case "removed":
      // An X.
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
  }
}

/**
 * The status phrase for an accessible label or a worded status line: the
 * status word alone, or `${word} → ${replaced_by}` where the manifest names
 * a replacement. `undefined` for `active` -- every caller of this shared
 * function agreed on that before the lift (ServiceTile.tsx and
 * ServiceNode.tsx each had their own identical version; MigrationList.tsx
 * never needs it at all, since migrations.ts guarantees it is only ever
 * handed a non-active row). ServiceTile.tsx's own local wrapper is the one
 * exception, for the one case the owner ruled on after this function's
 * contract was already settled everywhere else -- see this file's header.
 */
export function statusPhrase(service: ViewService): string | undefined {
  if (service.status === "active") return undefined;
  const word = STATUS_WORDS[service.status];
  return service.replaced_by ? `${word} → ${service.replaced_by}` : word;
}
