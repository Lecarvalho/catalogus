// The panel that appears beside a tile on hover. Pure: it renders what it is
// given at the position it is given, and owns no state.
//
// Owner decisions, 2026-08-25, in the order they arrived:
//
//   1. Hovering an item shows something near it; clicking opens its page.
//   2. Where a tile stands for several entries of one vendor, that something
//      lists the entries, "with different types", each its own page.
//   3. **"Instead of showing the actual popover, show this very panel."**
//      The thin hover summary was replaced by the detail panel's own content,
//      because there was no good reason for the same facts to have two
//      renderings -- a thin one on hover and a rich one on click.
//
// Decision 2 stood for less than a day (2026-08-25 to 2026-08-26): candidate
// E's one-tile-per-entry board retired it, since every tile was exactly one
// manifest entry and there was nothing left to choose between. **It is
// reinstated by this file, 2026-09-04** (docs/PLAN.md, "Owner decisions --
// 2026-09-04"; docs/brand-tile-brief.md, Part A), once bands.ts's
// `collapseByService` had a caller again (BandModule.tsx) and a tile could
// once more stand for several entries of one vendor. The shape below is not
// the 2026-08-25 chooser reborn, though -- see the mockup's own decision 4
// (docs/candidates/candidate-e-brandpage.html's leading comment) for what
// changed: the entry list replaces the six-fact grid outright rather than
// sitting in a picker above unchanged facts, each row states what the grid
// would have stated for that one entry (id, role, status when off the
// norm), and the note/hint lines are dropped because neither has a single
// value across a group.
//
// Decision 3's *mechanism* -- share one component, `ServiceSummary`, between
// the popover and the service page -- does not survive candidate E's
// popover. This was escalated rather than decided here, and the ruling was:
// build the six-fact grid in this file, and leave `ServiceSummary` untouched
// as the page's alone. The reasoning that keeps this from being a quiet
// reversal of decision 3: the popover and the page are not stating *the
// same fact* about a dependency edge. The page lists the edges themselves,
// by name, in both directions, because a reader who has landed on the page
// is deciding something that needs the names. The popover states two
// counts, because a reader who is hovering is deciding whether to click,
// and a count answers that in a box 268px wide without asking them to move
// the pointer to read a list. A count and a list are different facts about
// the same edge set, chosen for different jobs -- decision 3 ruled against
// two renderings of *one* fact, not against two facts that happen to share
// a data source. Where the popover and the page do state literally the same
// fact -- Role, Kind, Version, Status -- they read them off the same
// `ViewService`, so they cannot disagree; only the arrangement differs,
// which decision 3 never governed. Candidate E's own approval is the second
// reason: the owner approved this popover on sight as part of E, and where
// an approved mockup conflicts with an earlier decision on mechanism, the
// mockup wins -- the same reasoning that retired the chooser above, and the
// same reasoning that reinstates a shape of it now that a fresh mockup
// draws one.
//
// The six facts, and their values, are candidate E's own
// (docs/candidates/candidate-e-homescreen.html's `.pop-facts`), rendered for
// a **single-entry group only** (`group.entries.length === 1`), unchanged in
// every respect from before this pass: Role, Kind (shown even for `kind:
// "service"`, unlike `ServiceSummary`'s service-page rendering), Version (a
// dimmed "not tracked" rather than an omitted row when absent), Status
// (sentence case, with `replaced_by` folded in as "Phasing out ->
// auth-users" rather than a separate row), Dependents in and Dependencies
// out (bare counts, including zero). The note, when the entry has one, sits
// below the facts in a top-ruled block, and a closing hint line always
// follows -- all of this exactly as before, since a single-entry popover
// "is unchanged" (the brief's own words).
//
// It carries no close button and traps no focus, because it is a peek, not a
// dialog. The page is where a reader lands and stays.
import type { Ref } from "react";
import type { ViewService } from "@catalogus/cli";

import type { VendorGroup } from "../bands.js";
import { hashForServiceId } from "../hash-route.js";
import { tagsFor } from "../service-tags.js";
import { Icon } from "./Icon.js";
import { Tag } from "./Tag.js";
import styles from "./ServicePopover.module.css";

export interface ServicePopoverProps {
  /** The tile's whole content -- one entry, rendered exactly as before this pass, or several, rendered as an entry list in place of the fact grid (see this file's header). */
  group: VendorGroup;
  /** Server-stamped moment the manifest was read; every recency mark measures from it. */
  readAt: string;
  /** Viewport-relative placement, computed by App.tsx from the anchor element. */
  position: { top: number; left: number };
  /**
   * The rendered box, handed back to App.tsx so it can measure it. The
   * vertical placement needs this element's real height, and the only party
   * that can supply it is the element itself -- an estimate is what
   * popover-placement.ts's header records two shipped defects for. Same
   * mechanism and same reason as `ServicePage`'s `pageRef`: a ref prop rather
   * than `forwardRef`, so the component stays an ordinary function and the
   * prop says what it is for.
   */
  popoverRef?: Ref<HTMLDivElement>;
  /** The single entry's edges (`group.entries[0]`), resolved by App.tsx. Read only when `group` has exactly one entry -- a multi-entry group's popover has no per-edge fact to show at all (this file's header), so App.tsx is free to pass empty arrays for that case. */
  dependsOn: string[];
  dependedOnBy: string[];
  /** Resolves an entry id to a readable label, for an edge endpoint or a `replaced_by` target -- consulted only in the single-entry rendering. */
  labelForId: (id: string) => string;
  /**
   * Opens one entry's own page, at #/service/<id> (hash-route.ts). Wired to
   * every row of a multi-entry group's entry list, the same callback prop
   * `BrandPage.tsx` takes for its own identical rows -- both surfaces list
   * entries that each link to their own page, and both route the click
   * through App.tsx's `handleSelect` (a `history.replaceState`, never a
   * pushed entry) rather than the anchor's own default navigation, which
   * would push one.
   */
  onOpenEntry: (id: string) => void;
  /**
   * The hover bridge. The tile schedules this popover's close on pointer
   * leave rather than clearing it outright, and these two cancel and re-arm
   * that timer -- without them the popover closes in the gap between the
   * tile and itself, and its content (which can run past the tile's own
   * height once a note is in it -- see the popover's `overflow-y: auto`)
   * can never be reached by a pointer trying to enter it.
   *
   * Reused for the keyboard/focus path too, since 2026-09-04: this file
   * wires the identical two callbacks to the popover's own `onFocus`/
   * `onBlur`, so a reader tabbing from a group tile into one of its own
   * entry rows keeps the peek open the same way a pointer crossing the gap
   * does, and tabbing back out re-arms the close. See the render below.
   */
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

/**
 * Status, sentence case, exactly as candidate E's mockup states it -- a
 * `Map` rather than a keyed object literal. See Tag.tsx's header for why: a
 * manifest-derived key read off a plain object resolves through
 * `Object.prototype`, and this repo has shipped that exact defect five
 * times. `service.status` is schema-validated to one of these four, so the
 * `??` fallback below never fires on real data; it exists so a lookup miss
 * reads as the raw value rather than as `undefined`.
 */
const STATUS_TEXT = new Map<ViewService["status"], string>([
  ["active", "Active"],
  ["phasing_out", "Phasing out"],
  ["deprecated", "Deprecated"],
  ["removed", "Removed"],
]);

export function ServicePopover({
  group,
  readAt,
  position,
  dependsOn,
  dependedOnBy,
  labelForId,
  onOpenEntry,
  onPointerEnter,
  onPointerLeave,
  popoverRef,
}: ServicePopoverProps) {
  const isGroup = group.entries.length > 1;

  return (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      // Not a dialog and not `aria-live`: this mirrors content the tile
      // already names through its own accessible label, so announcing it
      // again would read the same thing twice. It exists for the eye.
      role="presentation"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      // The same bridge, for focus: React's onFocus/onBlur are implemented
      // on the bubbling focusin/focusout events, so a listener here fires
      // for any of this box's own descendants -- the entry rows below, for
      // a group -- not only for the box itself. Tabbing from one row to the
      // next fires a blur (schedules a close) immediately followed by a
      // focus (cancels it) in the same synchronous pass, so the two net out
      // to "still open" exactly as the pointer pair already does crossing
      // from the tile into this box.
      onFocus={onPointerEnter}
      onBlur={onPointerLeave}
    >
      {isGroup ? <GroupBody group={group} /> : <EntryBody service={group.entries[0]} readAt={readAt} dependsOn={dependsOn} dependedOnBy={dependedOnBy} labelForId={labelForId} />}
      {isGroup && <EntryRows group={group} onOpenEntry={onOpenEntry} />}
    </div>
  );
}

/**
 * A single entry's whole popover body -- header (mark, name, uncatalogued
 * notice, id), tag row, the six-fact grid, the note and the hint. Unchanged
 * from before the group pass; only the prop it reads (`service`, taken from
 * `group.entries[0]` by the caller) moved.
 */
function EntryBody({
  service,
  readAt,
  dependsOn,
  dependedOnBy,
  labelForId,
}: {
  service: ViewService;
  readAt: string;
  dependsOn: string[];
  dependedOnBy: string[];
  labelForId: (id: string) => string;
}) {
  const tags = tagsFor(service, readAt);
  const statusText = STATUS_TEXT.get(service.status) ?? service.status;

  return (
    <>
      <header className={styles.header}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon icon={service.icon} rollup={service.rollup} label={service.name} colour />
        </span>

        <span className={styles.identity}>
          <span className={styles.name}>{service.name}</span>
          {/*
            An uncatalogued slug is stated, not hidden. It means the display
            name is the raw slug and there is no verified icon -- a gap in the
            catalog the owner can close, not a property of their project.
            Saying so is the difference between "this looks broken" and "this
            is a known missing row".
          */}
          {!service.known && <span className={styles.uncatalogued}>no catalog entry for this slug</span>}
          <span className={styles.slug}>{service.id}</span>
        </span>

        {tags.length > 0 && (
          <span className={styles.tags}>
            {tags.map((tag) => (
              <Tag key={tag.id} tag={tag} />
            ))}
          </span>
        )}
      </header>

      <dl className={styles.facts}>
        <div>
          <dt>Role</dt>
          <dd>{service.role}</dd>
        </div>

        <div>
          <dt>Kind</dt>
          <dd>{service.kind}</dd>
        </div>

        <div>
          <dt>Version</dt>
          <dd>{service.version ?? <span className={styles.dim}>not tracked</span>}</dd>
        </div>

        <div>
          <dt>Status</dt>
          <dd>
            {statusText}
            {service.replaced_by && (
              <>
                {" → "}
                <span className={styles.mono}>{labelForId(service.replaced_by)}</span>
              </>
            )}
          </dd>
        </div>

        <div>
          <dt>Dependents in</dt>
          <dd>{dependedOnBy.length}</dd>
        </div>

        <div>
          <dt>Dependencies out</dt>
          <dd>{dependsOn.length}</dd>
        </div>
      </dl>

      {service.notes && <p className={styles.note}>&ldquo;{service.notes}&rdquo;</p>}

      <p className={styles.hint}>Click the tile to open its page.</p>
    </>
  );
}

/**
 * A multi-entry group's header: mark, name, entry count -- the mockup's own
 * decision 4, "the popover keeps its header (mark, name, '5 entries')". No
 * tag row and no uncatalogued notice: the mockup states only these three
 * elements for the header, and both of those are per-entry (or, for
 * uncatalogued, per-catalog-row) facts the six-fact grid already carried and
 * the mockup does not carry over -- inventing either here would be adding
 * content the approved artifact does not draw, which CLAUDE.md's "ask,
 * never guess" rules out as firmly as omitting a stated one would.
 */
function GroupBody({ group }: { group: VendorGroup }) {
  return (
    <header className={styles.header}>
      <span className={styles.glyph} aria-hidden="true">
        <Icon icon={group.icon} rollup={group.rollup} label={group.name} colour />
      </span>

      <span className={styles.identity}>
        <span className={styles.name}>{group.name}</span>
        {/*
          The count, in the id line's own slot -- .pop-count in the mockup,
          which is .pop-id's own 11px/faint/1px-gap treatment minus the mono
          face, the identical trade ServiceTile.module.css's `.count` makes
          for the tile's own second line.
        */}
        <span className={styles.count}>{group.entries.length} entries</span>
      </span>
    </header>
  );
}

/**
 * The entry list, in place of the six-fact grid -- decision 4 of the
 * mockup's leading comment: "IN PLACE OF the six-fact grid, not above it."
 * Four of the six facts (Role, Version, Status, the two edge counts) are
 * per-entry and have no single value for a group; Kind is the one that
 * could be stated once, and it is on the brand page instead
 * (`BrandPage.tsx`). Each row carries what the grid would have carried for
 * that one entry -- id (mono), role beneath it, and the status word on the
 * right, in ink's own weight but the signal colour, shown only when the
 * entry departs from `active` -- the same rule the tile's own status line
 * applies, so a reader scanning five rows sees the one that matters. No
 * note and no hint: a note belongs to one entry, and there is nothing left
 * to click-vs-hover between once every row already is its own destination.
 *
 * Real `<a href="#/service/<id>">` elements, reachable by Tab -- the brief's
 * own requirement -- rather than a `<div onClick>` that only a pointer or a
 * synthetic activation could reach. The default navigation is still stopped
 * and routed through `onOpenEntry`, the same `preventDefault` + callback
 * pattern `BrandPage.tsx`'s identical rows use, so a click here does not
 * push a history entry the way the anchor's own default navigation would
 * (App.tsx's `handleSelect` always replaces).
 */
function EntryRows({ group, onOpenEntry }: { group: VendorGroup; onOpenEntry: (id: string) => void }) {
  return (
    <div className={styles.entries}>
      {group.entries.map((entry) => (
        <a
          key={entry.id}
          className={styles.entry}
          href={hashForServiceId(entry.id)}
          onClick={(event) => {
            event.preventDefault();
            onOpenEntry(entry.id);
          }}
        >
          <span>
            <span className={styles.entryId}>{entry.id}</span>
            <span className={styles.entryRole}>{entry.role}</span>
          </span>
          {entry.status !== "active" && <span className={styles.entryStatus}>{STATUS_TEXT.get(entry.status) ?? entry.status}</span>}
        </a>
      ))}
    </div>
  );
}
