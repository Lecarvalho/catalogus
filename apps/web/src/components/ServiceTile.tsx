// One manifest entry, rendered as a bare home-screen icon: the mark on the
// ground, no card, no border, no panel. This replaces the bordered,
// collapsed-by-vendor tile the board used before candidate E (see git
// history for that version, and this file's own history for the doc-comment
// that explained it).
//
// Candidate E ("the home screen", approved 2026-08-26 --
// docs/candidates/candidate-e-homescreen.html, docs/candidates/README.md)
// changed two things, not just the CSS:
//
//   - **One tile per manifest entry, not per vendor.** The old tile
//     collapsed `host-api`, `host-web` and `host-worker` into a single
//     Fly.io tile carrying `x3`, because three identical marks said "Fly.io"
//     three times to say one thing. A bare icon has no card left to carry
//     that count, and README.md is explicit that a label showing only the
//     vendor name renders those three entries identically -- so the tile now
//     shows the manifest `id` as a second label line instead of collapsing.
//     `collapseByService`, `groupStatus` and `VendorGroup` (bands.ts) have no
//     caller left in this file; the main session owns whether they still
//     have one anywhere else.
//   - **Colour.** `<Icon colour />`, a reversal of the old board's monochrome
//     rule -- see Icon.tsx's own doc-comment for the case against a coloured
//     board (a real logo and a grey fallback sit at different visual
//     weights). Candidate E's answer to that objection is the dashed
//     monogram tile below: it reads as deliberate next to a coloured mark
//     where a generic category glyph read as broken.
//
// Owner decisions, 2026-08-26 (docs/candidates/README.md, "What E actually
// decided, and why each was hard"):
//
//   1. Bare icons, no card. "It doesn't need all that shell" -- meaning the
//      card around each service, not the app chrome (separately approved
//      and frozen).
//   2. Two-line label: vendor name, then the manifest id. `db-primary` and
//      `db-replica` are both PostgreSQL; a vendor-only label would render
//      them identically.
//   3. Status without hover, three independent ways, none of them
//      hue-only: a shaped corner badge, the mark desaturated, and the status
//      spelled out in words -- verified under a full-page `grayscale(1)`
//      filter.
//   4. A service with no verified brand icon keeps its tile -- dashed
//      border, sunken fill, a monogram from the raw slug -- rather than the
//      generic rollup glyph the old board used for it. `monogramFor` is
//      exported so the popover can render the same glyph.
import type { ViewService } from "@catalogus/cli";

import { Icon } from "./Icon.js";
import styles from "./ServiceTile.module.css";

export interface ServiceTileProps {
  service: ViewService;
  /**
   * Server-stamped moment the manifest was read; every recency mark
   * measures from it. Accepted for shape parity with ServicePopover's props
   * (both read off the same payload) but not consulted by this component:
   * candidate E's mockup carries no "recently added" mark on the tile
   * itself, only the status treatment below, so there is nothing here yet
   * for it to drive.
   */
  readAt: string;
  /** True when this entry is the currently selected one. */
  selected: boolean;
  onActivate: (service: ViewService) => void;
  onPeek: (service: ViewService, anchor: HTMLElement) => void;
  onPeekEnd: () => void;
}

type NonActiveStatus = Exclude<ViewService["status"], "active">;

/**
 * The status word spelled out under the label -- one of the three
 * independent, non-colour signals candidate E requires (README.md). Wording
 * matches candidate-e-homescreen.html's own `.icon-status` text exactly
 * ("Phasing out", "Deprecated", "Removed"); `active` never reaches this map
 * because the tile renders no status row at all for it.
 */
const STATUS_WORDS: Record<NonActiveStatus, string> = {
  phasing_out: "Phasing out",
  deprecated: "Deprecated",
  removed: "Removed",
};

/**
 * The corner badge's pictogram, one distinct shape per status so it reads
 * before any word does and survives a full-page `grayscale(1)` filter on
 * shape alone -- the check candidate-e-homescreen.html was verified against.
 * Markup (viewBox, stroke attributes, path data) is taken verbatim from the
 * mockup's `.status-badge--phasing_out` / `--deprecated` / `--removed`
 * elements, not redrawn, so this is a record rather than a fresh guess at
 * what those shapes should be (CLAUDE.md, "ask, never guess").
 */
function StatusBadgeGlyph({ status }: { status: NonActiveStatus }) {
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
 * The status phrase for the accessible label and the worded status line:
 * the status word alone, or `${word} → ${replaced_by}` where the manifest
 * names a replacement. `undefined` for `active`, which earns neither.
 */
function statusPhrase(service: ViewService): string | undefined {
  if (service.status === "active") return undefined;
  const word = STATUS_WORDS[service.status];
  return service.replaced_by ? `${word} → ${service.replaced_by}` : word;
}

export function ServiceTile({ service, selected, onActivate, onPeek, onPeekEnd }: ServiceTileProps) {
  const isActive = service.status === "active";
  const isFallback = service.icon === null;
  const phrase = statusPhrase(service);

  // Name and id both go in, unconditionally: they are both load-bearing on
  // screen (point 2 above), and a screen reader gets no benefit from the
  // visual layout that makes that obvious, so the accessible name states
  // both explicitly rather than leaning on the button's rendered children.
  const label = [service.name, service.id, phrase].filter(Boolean).join(", ");

  const squircleClassName = [styles.squircle, isFallback ? styles.fallback : "", !isActive ? styles.desaturated : ""].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      id={serviceTileDomId(service.id)}
      className={`${styles.tile} ${selected ? styles.selected : ""}`}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      onClick={() => onActivate(service)}
      // Pointer events rather than mouseenter/mouseleave so a touch device,
      // which has no hover at all, never gets a popover it cannot dismiss.
      // On touch the click path is the whole interaction, which is the right
      // degradation: the popover was only ever a shortcut to the page.
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        onPeek(service, event.currentTarget);
      }}
      onPointerLeave={onPeekEnd}
      // Keyboard parity: a focused tile peeks the same way a hovered one
      // does, so the summary is not a mouse-only affordance.
      onFocus={(event) => onPeek(service, event.currentTarget)}
      onBlur={onPeekEnd}
    >
      {/*
        The squircle: a phone-like corner radius behind the brand mark, the
        one declared exception to this world's "sharp structure, soft
        transients" rule (tokens.css's comment above --icon-tile-radius).
        aria-hidden throughout -- the button's own aria-label above is the
        one accessible name, so nothing in here needs to announce itself
        separately (matches the old tile's identical choice on its glyph
        wrapper).
      */}
      <span className={squircleClassName} aria-hidden="true" data-testid="icon-mark">
        {isFallback ? (
          // The no-brand-icon case: a dashed, sunken tile carrying a
          // monogram rather than the generic rollup glyph Icon.tsx would
          // otherwise fall back to -- candidate E's answer to a coloured
          // board splitting into logos and grey holes (Icon.tsx's own
          // `colour` doc-comment).
          <span className={styles.monogram}>{monogramFor(service.service)}</span>
        ) : (
          <Icon iconPath={service.icon} iconHex={service.iconHex} rollup={service.rollup} label={service.name} colour />
        )}

        {/*
          Status signal 1 of 3: a corner badge, shaped per status so it reads
          before any word does. Signal 2 (the mark desaturated) is the
          `styles.desaturated` class above; signal 3 (the word) is below,
          under the label. None of the three is colour alone.
        */}
        {service.status !== "active" && (
          <span className={styles.badge} data-testid="status-badge">
            <StatusBadgeGlyph status={service.status} />
          </span>
        )}
      </span>

      <span className={styles.label}>
        <span className={styles.name}>{service.name}</span>
        {/*
          The manifest id, not just the vendor name: host-api, host-web and
          host-worker are all Fly.io, and a label naming only the vendor
          would render the same tile three times (docs/candidates/README.md,
          "Two-line label").
        */}
        <span className={styles.id}>{service.id}</span>

        {service.status !== "active" && (
          <span className={styles.status} data-testid="status-text">
            {STATUS_WORDS[service.status]}
            {service.replaced_by && (
              <>
                {" → "}
                <span className={styles.statusTarget}>{service.replaced_by}</span>
              </>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Two-letter monogram for a catalog slug with no verified brand icon --
 * candidate E's dashed-tile treatment (docs/candidates/README.md,
 * "`legacy-ledger` keeps its tile"). `acme-ledger` -> `AL`: the first
 * letter of each of the slug's first two `-`/`_`-separated segments,
 * uppercased.
 *
 * Total by construction -- never throws, never returns an empty string --
 * so a malformed or single-word slug still renders something rather than a
 * blank squircle:
 *
 *   - **One segment** (no `-` or `_` at all, e.g. `vercel`): there is only
 *     one word to draw initials from, so this takes that segment's own
 *     first two characters instead (`vercel` -> `VE`). A single-character
 *     segment repeats that character (`x` -> `XX`) so the result is always
 *     two characters, never one.
 *   - **More than two segments** (e.g. `hosting-api-eu`): only the first two
 *     are read (`hosting-api-eu` -> `HA`). A three-letter monogram would be
 *     a different, unrequested design, and nothing in the mockup or the
 *     schema calls for reading further than two.
 *   - **No alphanumeric content at all** (`""`; the schema's slug pattern
 *     should make this unreachable from a real manifest, but this function
 *     does not trust a caller not to hand it one anyway): `"??"`, rather
 *     than throwing or returning the empty string a squircle would render
 *     as visibly blank.
 *
 * These rules beyond the `acme-ledger` case are this file's own choice, not
 * stated by the mockup or docs/PLAN.md -- flagged here, and in the
 * implementation report, per CLAUDE.md's "ask, never guess" for anyone who
 * wants to confirm them against the owner rather than this reasoning.
 */
export function monogramFor(slug: string): string {
  const segments = slug.split(/[-_]/).filter((segment) => segment.length > 0);

  if (segments.length >= 2) {
    return (segments[0]![0]! + segments[1]![0]!).toUpperCase();
  }

  const [only] = segments;
  if (only !== undefined && only.length >= 2) {
    return only.slice(0, 2).toUpperCase();
  }
  if (only !== undefined && only.length === 1) {
    return (only[0]! + only[0]!).toUpperCase();
  }

  return "??";
}

/**
 * DOM id for one tile, keyed by the manifest entry id -- unlike the
 * collapsed board's version of this function, which keyed on the catalog
 * slug because several entries shared one tile there. A tile is one entry
 * now, and its id is the thing that already names it uniquely.
 *
 * This exists so App.tsx can hand focus back to the tile a page was opened
 * from. A focus restore that silently finds nothing is invisible in a
 * passing test suite -- the exact failure that shipped once on the migration
 * board, where rows carried no id and closing a panel dropped focus to
 * `<body>` (docs/PLAN.md).
 */
export function serviceTileDomId(id: string): string {
  return `service-tile-${id}`;
}
