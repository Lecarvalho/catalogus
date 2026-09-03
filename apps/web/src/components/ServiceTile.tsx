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
//
// Owner ruling, 2026-08-31 (docs/DIRECTION.md, "Signal red: the rule
// stands..."): an `active` service that also carries `replaced_by` -- the
// schema permits the combination -- now shows the replacement in the status
// row here, matching ServicePopover.tsx, which already rendered it. See the
// local `statusPhrase` below for the exact rule and what it deliberately
// does not extend to (the badge, the desaturation).
import type { ViewService } from "@catalogus/cli";

import { Icon } from "./Icon.js";
import { STATUS_WORDS, statusPhrase as sharedStatusPhrase, StatusBadgeGlyph } from "./ServiceStatus.js";
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

/**
 * The status word and pictogram (`STATUS_WORDS`, `StatusBadgeGlyph`) used to
 * be private to this file -- ServiceNode.tsx and MigrationList.tsx each kept
 * their own flagged copy because neither could reach into this file while it
 * was mid-flight. Both are settled now, so all three import the single
 * shared version from ServiceStatus.tsx; see that file's own header for why
 * the duplication mattered enough to lift.
 *
 * `statusPhrase` below is *not* the shared one, imported as
 * `sharedStatusPhrase` instead and used only for the non-active branch. The
 * owner's 2026-08-31 ruling on `active` + `replaced_by` (docs/DIRECTION.md,
 * "Signal red: the rule stands, and the build was wrong rather than the
 * rule") was put to this component specifically -- "Both surfaces show it"
 * pairs this tile with ServicePopover.tsx, which already renders the
 * combination -- and not to ServiceNode.tsx or MigrationList.tsx, so the
 * exception is layered on here rather than folded into the shared function
 * every caller already agreed on.
 *
 * The rule this protects (docs/DIRECTION.md, OWN-WORLD): "`active` carries
 * no badge and no status word: tagging the norm is what produced thirty-five
 * identical marks before." That is a rule about the *norm* -- an `active`
 * service that already carries `replaced_by` is not the norm, it is "the
 * exception that rule exists to make visible" (the ruling's own words), so
 * it still earns nothing when `replaced_by` is unset, and only then.
 *
 * Two things this exception does *not* extend to, on the evidence available
 * rather than a fresh guess (CLAUDE.md):
 *
 *   - **No corner badge.** The badge is a pictogram keyed to one of three
 *     shapes candidate-e-homescreen.html actually draws -- an hourglass, an
 *     archive box, a cross -- and none of them is captioned `active`. There
 *     is no fourth shape in the mockup to draw here, and inventing one is
 *     exactly what "ask, never guess" forbids. So the badge condition below
 *     stays `service.status !== "active"`, unchanged: this case renders the
 *     word and nothing else. If the owner wants a fourth pictogram, that is
 *     a new mockup decision, not something this file can infer from the
 *     other three.
 *   - **No desaturation.** `isActive` (below) still governs
 *     `styles.desaturated`, unchanged, so this case's mark stays at full
 *     tone. Desaturation is documented as status signal 2 of 3 alongside the
 *     badge and the word (this file's own comments, and DIRECTION.md's
 *     "corner badge ... the mark itself desaturated ... spelled out in
 *     words"), all three keyed to the same three non-active statuses -- there
 *     is no source describing a fourth, partial application of it to an
 *     `active` mark, so none is added.
 *
 * The word itself is "Active", transcribed from ServicePopover.tsx's own
 * `STATUS_TEXT.get("active")` (the surface this tile is being made to
 * agree with renders exactly this word for exactly this status) rather than
 * picked fresh. The target after the arrow is `service.replaced_by` itself
 * -- the raw manifest id, not a `labelForId`-resolved "id (Name)" label the
 * way ServicePopover's does: this component is never handed a resolver
 * (BandModule.tsx, its only call site, passes none), and the tile's own
 * existing convention for every other status already prints the bare id
 * here (see the status row below), so the active case matches its own
 * sibling rows rather than reaching for a format nothing else on this tile
 * uses.
 */
function statusPhrase(service: ViewService): string | undefined {
  if (service.status === "active") {
    return service.replaced_by ? `Active → ${service.replaced_by}` : undefined;
  }
  return sharedStatusPhrase(service);
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

        {/*
          Rendered whenever `statusPhrase` above produced something --
          `service.status !== "active"`, exactly as before, plus the one
          2026-08-31 exception: `active` with `replaced_by` set. That
          exception is why this guard reads off `phrase` now rather than
          re-deriving `service.status !== "active"` a second time here; the
          two conditions are no longer the same one. `service.status ===
          "active"` in the ternary just below is narrowed by TypeScript, not
          re-checked at runtime for a third time.
        */}
        {phrase !== undefined && (
          <span className={styles.status} data-testid="status-text">
            {service.status === "active" ? "Active" : STATUS_WORDS[service.status]}
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
