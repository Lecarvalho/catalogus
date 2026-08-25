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
// The body is `ServiceSummary`, shared with the service page, so the facts
// have exactly one implementation. This file owns only the header, the
// multi-entry chooser, and the hover bridge.
//
// Two shapes, and they are not variants of each other:
//
//   - **One entry:** the panel. Role, kind, version, added, replaced_by and
//     this entry's edges. Hovering has already told the reader what clicking
//     will open, which is what makes the click cheap.
//   - **Several entries:** a chooser. The vendor is not itself a page --
//     there is no "Fly.io" document, there are five Fly.io deployments -- so
//     this lists them and each row is the destination. Five full panels
//     stacked would be a worse answer than five rows.
//
// It carries no close button and traps no focus, because it is a peek, not a
// dialog. The page is where a reader lands and stays.
import type { VendorGroup } from "../bands.js";
import { tagsFor } from "../service-tags.js";
import { Icon } from "./Icon.js";
import { ServiceSummary } from "./ServiceSummary.js";
import { StatusPill } from "./StatusPill.js";
import { Tag } from "./Tag.js";
import styles from "./ServicePopover.module.css";

export interface ServicePopoverProps {
  group: VendorGroup;
  /** Server-stamped moment the manifest was read; every recency mark measures from it. */
  readAt: string;
  /** Viewport-relative placement, computed by App.tsx from the anchor element. */
  position: { top: number; left: number };
  /** Per-entry edge slices, resolved by App.tsx from the payload. */
  dependsOn: (id: string) => string[];
  dependedOnBy: (id: string) => string[];
  /** Resolves an entry id to a readable label, for an edge endpoint or a `replaced_by` target. */
  labelForId: (id: string) => string;
  onOpen: (id: string) => void;
  /**
   * The hover bridge. The tile schedules this popover's close on pointer
   * leave rather than clearing it outright, and these two cancel and re-arm
   * that timer -- without them the popover closes in the gap between the tile
   * and itself, and its rows can never be reached. For a vendor with several
   * entries those rows are the only route to a page, so this is load-bearing
   * rather than a nicety.
   */
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function ServicePopover({
  group,
  readAt,
  position,
  dependsOn,
  dependedOnBy,
  labelForId,
  onOpen,
  onPointerEnter,
  onPointerLeave,
}: ServicePopoverProps) {
  const multiple = group.entries.length > 1;
  const single = group.entries[0];

  return (
    <div
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
          <Icon iconPath={group.icon} iconHex={group.iconHex} rollup={group.rollup} label={group.name} colour />
        </span>

        <span className={styles.identity}>
          <span className={styles.name}>{group.name}</span>
          {/*
            An uncatalogued slug is stated, not hidden. It means the display
            name is the raw slug and there is no verified icon -- a gap in the
            catalog the owner can close, not a property of their project.
            Saying so is the difference between "this looks broken" and "this
            is a known missing row".
          */}
          {!single.known && <span className={styles.uncatalogued}>no catalog entry for this slug</span>}
          <span className={styles.slug}>{multiple ? `${group.entries.length} entries` : single.id}</span>
        </span>

        {!multiple && <StatusPill status={single.status} />}
      </header>

      {multiple ? (
        <>
          <ul className={styles.entries}>
            {group.entries.map((entry) => {
              const tags = tagsFor(entry, readAt);
              const dependents = dependedOnBy(entry.id).length;

              return (
                <li key={entry.id}>
                  <button type="button" className={styles.entry} onClick={() => onOpen(entry.id)}>
                    <span className={styles.entryHead}>
                      {/*
                        The role leads, not the id. On a multi-entry tile the
                        reader's question is "which of these is which", and
                        the role is the answer -- `hosting-api` against
                        `hosting-metrics`. The id follows for anyone who needs
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

                    {dependents > 0 && (
                      <span className={styles.fact}>
                        {dependents} {dependents === 1 ? "entry depends" : "entries depend"} on this
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className={styles.hint}>Choose one to open its page.</p>
        </>
      ) : (
        <>
          <ServiceSummary
            service={single}
            dependsOn={dependsOn(single.id)}
            dependedOnBy={dependedOnBy(single.id)}
            labelForId={labelForId}
          />
          <p className={styles.hint}>Click the tile to open its page.</p>
        </>
      )}
    </div>
  );
}
