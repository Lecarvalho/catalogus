// One vendor, as a tile: the icon, the name under it, and a count when the
// tile stands for more than one manifest entry. Pure -- props in, callbacks
// out.
//
// Owner decisions, 2026-08-25, in the order they arrived:
//
//   1. "The items could be just an icon and the name below, much simpler,
//      then the details live in the popover and the page itself." So the
//      tile carries no role, no tags, no dependent count. The board is for
//      recognising; the popover is for summarising; the page is for reading.
//   2. "I don't know if repeating items is the right approach, maybe just
//      have 1 per service." So a tile is a *vendor*, not an entry. Clapline
//      runs four Fly.io entries, and four identical marks said "Fly.io" four
//      times to say one thing.
//
// What survives on the tile is only what would make the board *wrong* if it
// were left off:
//
//   - **The entry count, when it is more than one.** A tile standing for
//     four things while looking like it stands for one is a miscount, and
//     the band header's total would not reconcile with what a reader can
//     see. `x4` makes 4 tiles sum to the 7 the header claims.
//   - **A status mark, when the group's status is not `active`.** Taken as
//     the most consequential status across the group (bands.ts's
//     groupStatus), so a vendor with three live entries and one deprecated
//     one is marked rather than silently reading as fine.
//
// The local id is gone from the tile, and that is the collapse paying for
// itself: it existed only to tell four identical Fly.io tiles apart, and
// there are no longer four of them.
import type { VendorGroup } from "../bands.js";
import { groupStatus } from "../bands.js";
import { tagsFor } from "../service-tags.js";
import { Icon } from "./Icon.js";
import styles from "./ServiceTile.module.css";

export interface ServiceTileProps {
  group: VendorGroup;
  /** Server-stamped moment the manifest was read; every recency mark measures from it. */
  readAt: string;
  /** True when any entry in this group is the currently selected one. */
  selected: boolean;
  /** Expanded means this tile's popover is pinned open by a click. */
  expanded: boolean;
  onActivate: (group: VendorGroup, anchor: HTMLElement) => void;
  onPeek: (group: VendorGroup, anchor: HTMLElement) => void;
  onPeekEnd: () => void;
}

export function ServiceTile({ group, readAt, selected, expanded, onActivate, onPeek, onPeekEnd }: ServiceTileProps) {
  const count = group.entries.length;

  // The mark is derived from a synthetic entry carrying the group's worst
  // status, so the tag vocabulary stays the single source of what each
  // status looks like rather than this file re-deriving it. Recency and
  // `kind` marks are deliberately not consulted here: on a collapsed tile
  // they would be claims about "some of these", which is not a thing a
  // single bar can say honestly. The popover states them per entry.
  const status = groupStatus(group);
  const first = group.entries[0];
  const [mark] = tagsFor({ ...first, status, kind: "service", added: undefined }, readAt);

  const label =
    count === 1
      ? [group.name, first.role, mark ? mark.label : ""].filter(Boolean).join(", ")
      : `${group.name}, ${count} entries${mark ? `, ${mark.label}` : ""}`;

  return (
    <button
      type="button"
      id={serviceTileDomId(group.service)}
      className={`${styles.tile} ${selected ? styles.selected : ""} ${expanded ? styles.expanded : ""}`}
      aria-label={label}
      // A multi-entry tile opens a popover listing its entries rather than
      // navigating, so it is a disclosure control and says so. A
      // single-entry tile navigates, and carries no expanded state.
      aria-expanded={count > 1 ? expanded : undefined}
      aria-current={selected ? "true" : undefined}
      onClick={(event) => onActivate(group, event.currentTarget)}
      // Pointer events rather than mouseenter/mouseleave so a touch device,
      // which has no hover at all, never gets a popover it cannot dismiss.
      // On touch the click path is the whole interaction, which is the right
      // degradation: the popover was only ever a shortcut to the page.
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        onPeek(group, event.currentTarget);
      }}
      onPointerLeave={onPeekEnd}
      // Keyboard parity: a focused tile peeks the same way a hovered one
      // does, so the summary is not a mouse-only affordance.
      onFocus={(event) => onPeek(group, event.currentTarget)}
      onBlur={onPeekEnd}
    >
      {/*
        The mark is a bar across the tile's top edge, not a dot or a floating
        badge: a bar has a position and a length, so it reads in greyscale and
        at a glance, and it cannot be mistaken for part of the brand icon the
        way a corner dot can.
      */}
      {mark && <span className={`${styles.mark} ${styles[mark.tone] ?? ""}`} title={mark.title} aria-hidden="true" />}

      <span className={styles.glyph} aria-hidden="true">
        <Icon iconPath={group.icon} rollup={group.rollup} label={group.name} />
      </span>

      <span className={styles.name}>{group.name}</span>

      {count > 1 && (
        <span className={styles.count} aria-hidden="true">
          ×{count}
        </span>
      )}
    </button>
  );
}

/**
 * DOM id for one tile, keyed by the catalog slug the tile stands for -- not
 * by an entry id, because a collapsed tile has several of those and no
 * single one names it.
 *
 * This exists so App.tsx can hand focus back to the tile a page was opened
 * from. A focus restore that silently finds nothing is invisible in a
 * passing test suite -- the exact failure that shipped once on the migration
 * board, where rows carried no id and closing a panel dropped focus to
 * `<body>` (docs/PLAN.md).
 */
export function serviceTileDomId(service: string): string {
  return `service-tile-${service}`;
}
