// One band, as a full-width section of bare icons.
//
// Candidate E (docs/candidates/candidate-e-homescreen.html,
// docs/candidates/README.md; owner-approved 2026-08-26) replaced the boxed
// module in a mosaic with a plain heading, an optional note, and a grid of
// bare icons -- no hairline box, no filled header bar, no uneven masonry
// packing. Read BandModule.module.css's git history for the mosaic's own
// reasoning; it was sound for the dense world being retired and does not
// carry over to a single vertical stack.
//
// **2026-09-04: one tile per brand per band, restored** (docs/PLAN.md, "Owner
// decisions -- 2026-09-04"; docs/brand-tile-brief.md, Part A, "Shared
// contract"). From 2026-08-26 to 2026-09-04 this component mapped over
// `services` directly, one tile per manifest entry, because a bare-icon
// board seemed to have no card left to carry a collapsed tile's `xN`. A real
// manifest (Clapline, five Fly.io entries in "Runs in production") put that
// theory in front of the owner and it did not survive contact: five
// identical Fly.io marks in a row say "Fly.io" five times, which is exactly
// the repetition `collapseByService` (bands.ts) was written to collapse on
// 2026-08-25 and lost its only caller when this file stopped calling it the
// next day. It has a caller again, here, once per band -- the shared
// contract's own words: "**the collapse happens inside `BandModule`, once,
// and the tile receives a `VendorGroup`**".
//
// **`services` stays the flat entry list**, unchanged in shape from the
// one-tile-per-entry pass: the header below still needs the true entry
// count, and that count and the number of tiles on screen are no longer the
// same number now that a repeated vendor collapses -- the Fly.io band reads
// "9" in the header for five tiles, one of them carrying its own "5
// entries" label (ServiceTile.tsx). Collapsing happens inside this
// component's own render, once, from that flat list -- `ProjectBoard.tsx`
// never sees a `VendorGroup` at all, and neither does anything above it.
//
// `onActivate`/`onPeek` widen to carry the band alongside the group
// (`(band, group) => void` / `(band, group, anchor) => void`) rather than a
// bare `ViewService` -- this is the one place that knows both, since a
// `VendorGroup` alone cannot say which band it collapsed inside (bands.ts's
// own words: `collapseByService` "has no notion of band"), and App.tsx needs
// the band id to route a group click to `#/brand/<bandId>/<service>`
// (hash-route.ts) and to compute `serviceTileDomId`'s own band-qualified id.
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
  onActivate: (band: BandDefinition, group: VendorGroup) => void;
  onPeek: (band: BandDefinition, group: VendorGroup, anchor: HTMLElement) => void;
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
  // The section carries the anchor id -- the mockup's left rail links to
  // `#band-production`, and that shell work is the next brief, so the
  // target has to exist now and has to be the section, not the heading. The
  // heading needs an id of its own that does not collide with it, for
  // `aria-labelledby` to point at.
  const sectionId = `band-${band.id}`;
  const headingId = `${sectionId}-title`;

  // Collapsed once, per band, from this band's own flat slice of the
  // manifest -- collapseByService's own header is explicit that collapsing
  // is per band only, never global, and this call site is the reason:
  // handing it the whole manifest here (rather than one band's `services`)
  // would merge Supabase-as-auth and Supabase-as-database into one tile and
  // force a single band on a vendor that does two jobs in this project.
  const groups = collapseByService(services);

  return (
    <section id={sectionId} className={styles.band} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 className={styles.title} id={headingId}>
          {band.label}
        </h2>
        {/*
          aria-hidden on the element itself -- the heading it sits beside
          already names the band, and a screen reader announcing "Runs in
          production 9" as a heading would be reading a decoration as
          content. The rows carry the real information.

          Entries, not tiles (owner, 2026-09-04): the rail and the footer
          both count entries, and one page should count one thing. A
          collapsed tile's own "5 entries" line (ServiceTile.tsx) is what
          reconciles this number with the tile count on screen.
        */}
        <span className={styles.count} aria-hidden="true">
          {services.length}
        </span>
      </div>

      {/*
        A note only where the band's membership is not self-evident, and
        never as decoration. `unplaced` is the case this exists for: a
        reader seeing that heading needs to know it is a vocabulary gap they
        can fix, not a defect in the viewer.
      */}
      {band.note && <p className={styles.note}>{band.note}</p>}

      <div className={styles.grid}>
        {groups.map((group) => (
          <ServiceTile
            key={group.service}
            group={group}
            bandId={band.id}
            readAt={readAt}
            selected={group.entries.some((entry) => entry.id === selectedId)}
            onActivate={(activated) => onActivate(band, activated)}
            onPeek={(peeked, anchor) => onPeek(band, peeked, anchor)}
            onPeekEnd={onPeekEnd}
          />
        ))}
      </div>
    </section>
  );
}
