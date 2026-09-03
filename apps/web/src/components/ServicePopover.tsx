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
// Decision 2 is superseded, not amended. Candidate E (approved 2026-08-26,
// docs/candidates/README.md) renders one tile per manifest entry -- `host-api`,
// `host-web` and `host-worker` are each their own icon now -- so the vendor
// group this component used to collapse several entries into no longer
// exists on the board. There is nothing left to choose between, so the
// chooser branch, its rows, its "N entries" header form and its own hint
// line are gone along with it. Every popover is now about exactly one
// manifest entry, the same as every tile is.
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
// mockup wins -- the same reasoning that retired the chooser above.
//
// The six facts, and their values, are candidate E's own
// (docs/candidates/candidate-e-homescreen.html's `.pop-facts`): Role, Kind
// (shown even for `kind: "service"`, unlike `ServiceSummary`'s service-page
// rendering), Version (a dimmed "not tracked" rather than an omitted row
// when absent), Status (sentence case, with `replaced_by` folded in as
// "Phasing out -> auth-users" rather than a separate row), Dependents in and
// Dependencies out (bare counts, including zero). The note, when the entry
// has one, sits below the facts in a top-ruled block -- this is the
// manifest's `notes` field, quoted the way the mockup quotes it.
//
// It carries no close button and traps no focus, because it is a peek, not a
// dialog. The page is where a reader lands and stays.
import type { Ref } from "react";
import type { ViewService } from "@catalogus/cli";

import { tagsFor } from "../service-tags.js";
import { Icon } from "./Icon.js";
import { Tag } from "./Tag.js";
import styles from "./ServicePopover.module.css";

export interface ServicePopoverProps {
  service: ViewService;
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
  /** This entry's edges, resolved by App.tsx from the payload. */
  dependsOn: string[];
  dependedOnBy: string[];
  /** Resolves an entry id to a readable label, for an edge endpoint or a `replaced_by` target. */
  labelForId: (id: string) => string;
  /**
   * The hover bridge. The tile schedules this popover's close on pointer
   * leave rather than clearing it outright, and these two cancel and re-arm
   * that timer -- without them the popover closes in the gap between the
   * tile and itself, and its content (which can run past the tile's own
   * height once a note is in it -- see the popover's `overflow-y: auto`)
   * can never be reached by a pointer trying to enter it.
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
  service,
  readAt,
  position,
  dependsOn,
  dependedOnBy,
  labelForId,
  onPointerEnter,
  onPointerLeave,
  popoverRef,
}: ServicePopoverProps) {
  const tags = tagsFor(service, readAt);
  const statusText = STATUS_TEXT.get(service.status) ?? service.status;

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
    >
      <header className={styles.header}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon iconPath={service.icon} iconHex={service.iconHex} rollup={service.rollup} label={service.name} colour />
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
    </div>
  );
}
