// One vendor's tile on the wall, rendered as a bare home-screen icon: the
// mark on the ground, no card, no border, no panel. Candidate E's own icon
// treatment (see git history for the pre-candidate-E bordered tile, and this
// file's own history for the doc-comment that explained it and for the
// "one tile per manifest entry, never collapsed" pass that stood here from
// 2026-08-26 to 2026-09-04).
//
// **2026-09-04: one tile per brand per band, restored** (docs/PLAN.md, "Owner
// decisions -- 2026-09-04", findings 4 and 5 of 2026-09-03;
// docs/brand-tile-brief.md, Part A). The 2026-08-26 pass above retired
// `collapseByService` from this file's call graph on the theory that a
// bare-icon board had no card left to carry a collapsed tile's `xN` --
// correct as far as it went, and wrong about the fix: the owner's actual
// objection, once a real manifest (Clapline, five Fly.io entries in one
// band) put the theory in front of them, was to the repeated MARK, not to a
// missing count. Five identical Fly.io icons in a row say "Fly.io" five
// times to say one thing, exactly the complaint `collapseByService` was
// first written to answer (bands.ts's own header, 2026-08-25). So this file
// takes a `VendorGroup` again -- one entry (unchanged rendering, in full)
// or several (the new rendering below) -- and `collapseByService` has a
// caller again: `BandModule.tsx`, once per band, per the shared contract
// (docs/brand-tile-brief.md).
//
// **What changes for a multi-entry group, and what deliberately does not**
// (owner decisions, 2026-09-04, and the mockup's own leading comment,
// `docs/candidates/candidate-e-brandpage.html`, decisions 2 and 3):
//
//   - **The second label line is the entry count** ("5 entries"), in the id
//     line's own slot, size and colour -- not mono, because a count is not a
//     literal the reader may type into a `catalogus` command the way an id
//     is (the mockup's own comment on `.icon-count`).
//   - **The tile carries the group's worst status** (`groupStatus`,
//     bands.ts) through the corner badge and the status word, exactly as a
//     single entry's own status drives both today -- **but never through
//     desaturation.** The owner's ruling, reviewing the first draft, which
//     desaturated the whole mark and read as dimming four live Fly apps
//     because one of the five was phasing out: "the mark stays in colour."
//     A single-entry tile is unaffected -- desaturation, colour, the badge
//     and the word are still all three status signals candidate E specifies
//     for it (this file's original 2026-08-26 comment, points 1-4 below,
//     none of it retracted for that case).
//   - **The status word names the one entry that departs, id first, no
//     arrow** -- "host-preview phasing out" rather than "Phasing out ->
//     host-preview" -- because the arrow already means "replaced by
//     <target>" everywhere else on this tile (single-entry `replaced_by`,
//     just below) and reusing it here for "the entry that is" would
//     overload it. Where more than one entry shares the group's worst
//     status, the first in the group's own stable id order is named (the
//     same tie-break `collapseByService`/`groupStatus` already use
//     throughout bands.ts) -- the mockup's own fixture never has two, so
//     this is this file's own choice, flagged here per CLAUDE.md rather
//     than left silent.
//   - **The active + `replaced_by` exception (2026-08-31 ruling, below) is
//     not extended to a multi-entry tile.** That ruling was put to one
//     entry's own tile specifically ("Both surfaces show it" paired it with
//     ServicePopover's single-entry rendering); a group's status line is
//     already a different shape (id then word, no target), and there is no
//     source describing a fourth shape for "one of several active entries
//     also carries a replacement", so none is invented.
//
// Candidate E ("the home screen", approved 2026-08-26 --
// docs/candidates/candidate-e-homescreen.html, docs/candidates/README.md)
// changed two things, not just the CSS, for the single-entry case this file
// still renders unchanged:
//
//   1. Bare icons, no card. "It doesn't need all that shell" -- meaning the
//      card around each service, not the app chrome (separately approved
//      and frozen).
//   2. Two-line label: vendor name, then the manifest id (or, since
//      2026-09-04, the entry count for a group). `db-primary` and
//      `db-replica` are both PostgreSQL; a vendor-only label would render
//      them identically.
//   3. Status without hover, three independent ways for a single entry,
//      none of them hue-only: a shaped corner badge, the mark desaturated,
//      and the status spelled out in words -- verified under a full-page
//      `grayscale(1)` filter.
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
// does not extend to (the badge, the desaturation, and -- since 2026-09-04
// -- a multi-entry group).
import { useRef, type FocusEvent, type PointerEvent } from "react";

import type { ViewService } from "@catalogus/cli";

import type { BandId, VendorGroup } from "../bands.js";
import { groupStatus } from "../bands.js";
import { Icon } from "./Icon.js";
import { STATUS_WORDS, statusPhrase as sharedStatusPhrase, StatusBadgeGlyph } from "./ServiceStatus.js";
import styles from "./ServiceTile.module.css";

export interface ServiceTileProps {
  /** The tile's whole content: one entry (`entries.length === 1`) or several sharing one catalog slug within this band. */
  group: VendorGroup;
  /** The band this group renders in -- carried for `serviceTileDomId` alone; see that function's own comment for why a band-scoped id is needed. */
  bandId: BandId;
  /**
   * Server-stamped moment the manifest was read; every recency mark
   * measures from it. Accepted for shape parity with ServicePopover's props
   * (both read off the same payload) but not consulted by this component:
   * candidate E's mockup carries no "recently added" mark on the tile
   * itself, only the status treatment below, so there is nothing here yet
   * for it to drive.
   */
  readAt: string;
  /** True when the currently open entry page belongs to this group -- one of its entries for a multi-entry group, the entry itself for a single one. */
  selected: boolean;
  onActivate: (group: VendorGroup) => void;
  onPeek: (group: VendorGroup, anchor: HTMLElement) => void;
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
 * `sharedStatusPhrase` instead and used only for a single entry's non-active
 * branch. The owner's 2026-08-31 ruling on `active` + `replaced_by` (docs/
 * DIRECTION.md, "Signal red: the rule stands, and the build was wrong rather
 * than the rule") was put to this component specifically -- "Both surfaces
 * show it" pairs this tile with ServicePopover.tsx, which already renders
 * the combination -- and not to ServiceNode.tsx or MigrationList.tsx, so the
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
 *     stays keyed off `groupStatus(group) !== "active"`, unchanged in
 *     meaning: this case renders the word and nothing else. If the owner
 *     wants a fourth pictogram, that is a new mockup decision, not something
 *     this file can infer from the other three.
 *   - **No desaturation.** `isActive` (below) still governs
 *     `styles.desaturated` for a single-entry tile, unchanged, so this case's
 *     mark stays at full tone. Desaturation is documented as status signal 2
 *     of 3 alongside the badge and the word (this file's own comments, and
 *     DIRECTION.md's "corner badge ... the mark itself desaturated ...
 *     spelled out in words"), all three keyed to the same three non-active
 *     statuses -- there is no source describing a fourth, partial
 *     application of it to an `active` mark, so none is added.
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

/**
 * The status line for a multi-entry group: `<entry id> <word, lower case>`,
 * naming the one entry responsible for the group's worst status, no arrow --
 * candidate-e-homescreen.html's own artboard-1 markup for the Fly.io tile
 * ("host-preview phasing out"), and the file header's decision 3 above for
 * why no arrow. `undefined` when the worst status is `active`, the same
 * "the norm earns nothing" rule the single-entry `statusPhrase` follows.
 *
 * Which entry is named, when more than one shares the worst status: the
 * first in the group's own stable id order (`group.entries` is already
 * sorted that way -- bands.ts's `collapseByService`). This file's own
 * choice, not stated by the mockup or the owner's decisions -- flagged here
 * per CLAUDE.md, "ask, never guess", for anyone who wants to confirm it.
 */
function groupStatusPhrase(group: VendorGroup): { entryId: string; word: string } | undefined {
  const worst = groupStatus(group);
  if (worst === "active") {
    return undefined;
  }
  const departed = group.entries.find((entry) => entry.status === worst) ?? group.entries[0];
  return { entryId: departed.id, word: STATUS_WORDS[worst].toLowerCase() };
}

/**
 * The peek's four handlers, shared by the single-entry tile and `GroupTile`
 * below so the touch rule lives once.
 *
 * `onPointerEnter` skips a touch pointer: touch has no hover, so a popover it
 * opened would be one the reader cannot dismiss. That alone was not enough --
 * a tap also *focuses* the button (Chrome on Android; Safari does not), and
 * `onFocus` opened the peek for keyboard parity without asking where the
 * focus came from, so on a phone every tap flashed the popover before the
 * page replaced it. The owner, 2026-09-04: "on mobile the popover should not
 * open, since we have no hover, it's only tap." So focus peeks only when no
 * pointer put it there: `onPointerDown` (any pointer -- a mouse click's focus
 * has nothing to add, since its hover already peeked) raises a flag that the
 * next `onFocus` consumes instead of peeking. The flag is cleared on click
 * and on pointer cancel too, because a press on a tile that already has focus
 * raises it without a focus event ever consuming it, and a press that turns
 * into a scroll never reaches click; either way a later Tab onto the tile
 * must still peek. `:focus-visible` would say the same thing in one selector,
 * but a ref is testable in jsdom and does not depend on each browser's
 * heuristic for it.
 */
function usePeekHandlers(group: VendorGroup, onPeek: ServiceTileProps["onPeek"], onPeekEnd: ServiceTileProps["onPeekEnd"]) {
  const pointerFocusRef = useRef(false);
  // No `onClick` here on purpose: the spread lands after the button's own
  // `onClick={() => onActivate(group)}` and would replace it. The clear on
  // click is `onClickCapture` below instead.
  return {
    onPointerDown: () => {
      pointerFocusRef.current = true;
    },
    onPointerCancel: () => {
      pointerFocusRef.current = false;
    },
    onPointerEnter: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "touch") return;
      onPeek(group, event.currentTarget);
    },
    onPointerLeave: onPeekEnd,
    onFocus: (event: FocusEvent<HTMLButtonElement>) => {
      if (pointerFocusRef.current) {
        pointerFocusRef.current = false;
        return;
      }
      onPeek(group, event.currentTarget);
    },
    onBlur: onPeekEnd,
    onClickCapture: () => {
      pointerFocusRef.current = false;
    },
  };
}

export function ServiceTile({ group, bandId, selected, onActivate, onPeek, onPeekEnd }: ServiceTileProps) {
  const isGroup = group.entries.length > 1;
  const domId = serviceTileDomId(bandId, group);

  if (isGroup) {
    return (
      <GroupTile
        group={group}
        domId={domId}
        selected={selected}
        onActivate={onActivate}
        onPeek={onPeek}
        onPeekEnd={onPeekEnd}
      />
    );
  }

  return (
    <SingleEntryTile
      service={group.entries[0]}
      group={group}
      domId={domId}
      selected={selected}
      onActivate={onActivate}
      onPeek={onPeek}
      onPeekEnd={onPeekEnd}
    />
  );
}

interface TileShellProps {
  group: VendorGroup;
  domId: string;
  selected: boolean;
  onActivate: (group: VendorGroup) => void;
  onPeek: (group: VendorGroup, anchor: HTMLElement) => void;
  onPeekEnd: () => void;
}

/**
 * A single manifest entry's tile -- candidate E's original rendering,
 * unchanged since 2026-08-26: name, id, and, only when the entry is not
 * `active`, the full three-signal status treatment (badge, desaturation,
 * worded status). Split out from the group tile below rather than branched
 * inline, because the two shapes now genuinely differ (desaturation exists
 * on one and not the other) and a single component reading `group.entries[0]`
 * defensively throughout was harder to see as "this case is untouched" than
 * a second, small component is.
 */
function SingleEntryTile({ service, group, domId, selected, onActivate, onPeek, onPeekEnd }: TileShellProps & { service: ViewService }) {
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
      id={domId}
      className={`${styles.tile} ${selected ? styles.selected : ""}`}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      onClick={() => onActivate(group)}
      // Pointer events rather than mouseenter/mouseleave so a touch device,
      // which has no hover at all, never gets a popover it cannot dismiss.
      // On touch the click path is the whole interaction, which is the right
      // degradation: the popover was only ever a shortcut to the page.
      // Keyboard parity: a focused tile peeks the same way a hovered one
      // does, so the summary is not a mouse-only affordance. For a group,
      // ArrowDown/ArrowUp then walk into the popover's rows -- App.tsx's
      // peek keydown effect owns that, since the popover is not this
      // button's DOM neighbour and Tab cannot reach it. `usePeekHandlers`
      // holds the one subtlety: a tap focuses the button too, and that
      // focus must not peek.
      {...usePeekHandlers(group, onPeek, onPeekEnd)}
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
          <Icon icon={service.icon} rollup={service.rollup} label={service.name} colour />
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
          The manifest id, not just the vendor name: db-primary and
          db-replica are both PostgreSQL, and a label naming only the vendor
          would render the same tile twice (docs/candidates/README.md,
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
 * A multi-entry group's tile -- one vendor standing for every entry it
 * collapsed in this band (docs/candidates/candidate-e-brandpage.html,
 * artboard 1). See this file's header for the three things that differ from
 * a single entry's own tile and the one that deliberately does not
 * (desaturation).
 */
function GroupTile({ group, domId, selected, onActivate, onPeek, onPeekEnd }: TileShellProps) {
  const isFallback = group.icon === null;
  const worst = groupStatus(group);
  const departure = groupStatusPhrase(group);

  // The accessible name states the same facts the label renders: the vendor
  // name, the entry count (not an id -- there is no single id for a group),
  // and the departure phrase when there is one. Mirrors the single-entry
  // tile's own `label` construction just above.
  const label = [group.name, `${group.entries.length} entries`, departure ? `${departure.entryId} ${departure.word}` : undefined]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      id={domId}
      className={`${styles.tile} ${selected ? styles.selected : ""}`}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      onClick={() => onActivate(group)}
      {...usePeekHandlers(group, onPeek, onPeekEnd)}
    >
      {/*
        No `styles.desaturated` here, ever -- the header's decision 3: "the
        mark stays in colour" for a group, regardless of `worst`. The badge
        is the only one of the three single-entry signals a group keeps, per
        the same decision.
      */}
      <span className={[styles.squircle, isFallback ? styles.fallback : ""].filter(Boolean).join(" ")} aria-hidden="true" data-testid="icon-mark">
        {isFallback ? (
          <span className={styles.monogram}>{monogramFor(group.service)}</span>
        ) : (
          <Icon icon={group.icon} rollup={group.rollup} label={group.name} colour />
        )}

        {worst !== "active" && (
          <span className={styles.badge} data-testid="status-badge">
            <StatusBadgeGlyph status={worst} />
          </span>
        )}
      </span>

      <span className={styles.label}>
        <span className={styles.name}>{group.name}</span>
        {/*
          The entry count, in the id line's own slot -- see .count in
          ServiceTile.module.css for why it is not mono.
        */}
        <span className={styles.count} data-testid="entry-count">
          {group.entries.length} entries
        </span>

        {departure !== undefined && (
          <span className={styles.status} data-testid="status-text">
            <span className={styles.statusTarget}>{departure.entryId}</span>
            {` ${departure.word}`}
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
 * DOM id for one tile. A single-entry group keys on the entry's own manifest
 * id, unchanged from before this pass -- unique within a manifest
 * (@catalogus/schema guarantees it), so no band qualifier is needed. A
 * multi-entry group keys on `${bandId}-${group.service}` instead: the
 * catalog slug alone is not unique across the *board*, because
 * `collapseByService` runs per band (bands.ts's own header) -- Supabase as
 * `supabase-auth` collapses inside "Runs in production" and as
 * `supabase-db` inside "Holds data", two different tiles that would collide
 * on one DOM id without the band in it. `bandId` is exactly the qualifier
 * `collapseByService` itself does not carry (by design -- it "has no notion
 * of band", bands.test.ts's own words), so this function is where that
 * qualifier gets added back, once, for the one caller (this file's render)
 * that needs a globally unique id out of a per-band computation.
 *
 * This exists so App.tsx can hand focus back to the tile a page (entry or
 * brand) was opened from. A focus restore that silently finds nothing is
 * invisible in a passing test suite -- the exact failure that shipped once
 * on the migration board, where rows carried no id and closing a panel
 * dropped focus to `<body>` (docs/PLAN.md).
 */
export function serviceTileDomId(bandId: BandId, group: VendorGroup): string {
  return group.entries.length === 1 ? `service-tile-${group.entries[0].id}` : `service-tile-${bandId}-${group.service}`;
}
