// The summary that appears beside a tile. Pure: it renders what it is given
// at the position it is given, and owns no state.
//
// Owner decisions, 2026-08-25: hovering an item shows a popover near it and
// clicking opens the item's page; and where a tile stands for several
// entries of one vendor -- Clapline's four Fly.io apps -- "the popover shows
// 3 items with different types", each of which is its own page.
//
// So this component has two shapes and they are not variants of each other:
//
//   - **One entry:** the summary of that entry. Hovering has already told the
//     reader what clicking will open, which is what makes the click cheap.
//   - **Several entries:** a chooser. The vendor is not itself a page --
//     there is no "Fly.io" document, there are four Fly.io deployments --
//     so this lists them and each row is the destination.
//
// It carries no close button and traps no focus, because it is a peek, not a
// dialog. The page is where a reader lands and stays; anything that makes
// this feel like a place to be is working against that.
import type { VendorGroup } from "../bands.js";
import { tagsFor } from "../service-tags.js";
import { Tag } from "./Tag.js";
import styles from "./ServicePopover.module.css";

export interface ServicePopoverProps {
  group: VendorGroup;
  /** Server-stamped moment the manifest was read; every recency mark measures from it. */
  readAt: string;
  /** Viewport-relative placement, computed by App.tsx from the anchor element. */
  position: { top: number; left: number };
  /** How many entries depend on each entry id. */
  dependentsById: Map<string, number>;
  /** Resolves an entry id to a readable label, for a `replaced_by` target. */
  labelForId: (id: string) => string;
  onOpen: (id: string) => void;
}

export function ServicePopover({
  group,
  readAt,
  position,
  dependentsById,
  labelForId,
  onOpen,
}: ServicePopoverProps) {
  const multiple = group.entries.length > 1;

  return (
    <div
      className={styles.popover}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      // Not a dialog and not `aria-live`: this mirrors content the tile
      // already names through its own accessible label, so announcing it
      // again would read the same thing twice. It exists for the eye.
      role="presentation"
    >
      <header className={styles.header}>
        <span className={styles.name}>{group.name}</span>
        {multiple && <span className={styles.count}>{group.entries.length} entries</span>}
      </header>

      <ul className={styles.entries}>
        {group.entries.map((entry) => {
          const tags = tagsFor(entry, readAt);
          const dependents = dependentsById.get(entry.id) ?? 0;

          return (
            <li key={entry.id}>
              <button type="button" className={styles.entry} onClick={() => onOpen(entry.id)}>
                <span className={styles.entryHead}>
                  {/*
                    The role leads, not the id. On a multi-entry tile the
                    reader's question is "which of these is which", and the
                    role is the answer -- `hosting-api` against
                    `hosting-monitoring`. The id follows for anyone who needs
                    to type it into a `catalogus set services.<id>...`.
                  */}
                  <span className={styles.role}>{entry.role}</span>
                  <span className={styles.id}>{entry.id}</span>
                </span>

                {tags.length > 0 && (
                  <span className={styles.tags}>
                    {tags.map((tag) => (
                      <Tag key={tag.id} tag={tag} />
                    ))}
                  </span>
                )}

                <span className={styles.facts}>
                  {dependents > 0 && (
                    <span className={styles.fact}>
                      {dependents} {dependents === 1 ? "entry depends" : "entries depend"} on this
                    </span>
                  )}
                  {entry.replaced_by && <span className={styles.fact}>replaced by {labelForId(entry.replaced_by)}</span>}
                  {entry.version && <span className={styles.fact}>version {entry.version}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        The one instruction, and only where it is not obvious. A single-entry
        popover's tile opens on click, which the reader is about to discover
        for free. A multi-entry tile does not open anything, so the rows are
        the destinations and that has to be said once.
      */}
      <p className={styles.hint}>{multiple ? "Choose one to open its page." : "Click to open its page."}</p>
    </div>
  );
}
