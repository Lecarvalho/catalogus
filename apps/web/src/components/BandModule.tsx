// One band, as a boxed module in the mosaic. Pure.
//
// The module is the unit of the layout: a hairline box with a filled header
// bar carrying the band's name on the left and its entry count on the right,
// then a grid of vendor tiles. Modules tile in an uneven grid rather than a
// uniform card wall -- a band with nine services occupies more of the field
// than one with two, which is the point. A uniform grid would restate the
// problem the old list had, where every group got equal weight regardless of
// what was in it.
//
// The header counts **entries**, not tiles, and those differ wherever a
// vendor is collapsed: Clapline's "Serves requests" holds seven entries
// rendered as four tiles. The entry count is the manifest's own number and
// the one that reconciles with the graph and the CLI, so it is what the
// header states; each collapsed tile carries its own `xN` so the arithmetic
// is visible rather than something a reader has to take on trust.
import type { ViewService } from "@catalogus/cli";

import type { BandDefinition, VendorGroup } from "../bands.js";
import { collapseByService } from "../bands.js";
import { ServiceTile } from "./ServiceTile.js";
import styles from "./BandModule.module.css";

export interface BandModuleProps {
  band: BandDefinition;
  services: ViewService[];
  readAt: string;
  selectedId: string | null;
  onActivate: (group: VendorGroup) => void;
  onPeek: (group: VendorGroup, anchor: HTMLElement) => void;
  onPeekEnd: () => void;
}

export function BandModule({
  band,
  services,
  readAt,
  selectedId,
  onActivate,
  onPeek,
  onPeekEnd,
}: BandModuleProps) {
  // Collapsed within this band only. Supabase is `auth` here and `database`
  // in "Holds data"; collapsing across bands would force one Supabase tile
  // into one band and state that it does one job, when the manifest says it
  // does two. bands.ts carries the full reasoning.
  const groups = collapseByService(services);

  return (
    <section className={styles.module} aria-labelledby={`band-${band.id}`}>
      <header className={styles.header}>
        <h2 className={styles.title} id={`band-${band.id}`}>
          {band.label}
        </h2>
        <span className={styles.count} aria-hidden="true">
          {services.length}
        </span>
      </header>

      {/*
        A note only where the band's membership is not self-evident, and
        never as decoration. `unplaced` is the case this exists for: a
        reader seeing that heading needs to know it is a vocabulary miss
        they can fix, not a defect in the viewer.
      */}
      {band.note && <p className={styles.note}>{band.note}</p>}

      <div className={styles.grid}>
        {groups.map((group) => (
          <ServiceTile
            key={group.service}
            group={group}
            readAt={readAt}
            selected={group.entries.some((entry) => entry.id === selectedId)}
            onActivate={onActivate}
            onPeek={onPeek}
            onPeekEnd={onPeekEnd}
          />
        ))}
      </div>
    </section>
  );
}
