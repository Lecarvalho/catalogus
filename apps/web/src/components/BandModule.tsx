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
// **One tile per manifest entry, not per vendor.** ServiceTile no longer
// collapses by catalog slug -- a bare-icon board tells `host-api`,
// `host-web` and `host-worker` apart by the tile's own two-line
// vendor-name-then-id label, so three Fly.io entries are three tiles rather
// than one tile carrying an `x3` a bare icon has no card left to hold. This
// component now maps over `services` directly, in the order
// `groupIntoBands` already put them in, and `collapseByService` has no
// caller left here (bands.ts keeps it; the main session owns its fate).
//
// That also retires the header-count argument the previous version of this
// file made at length: the header used to count *entries* rather than
// tiles because a collapsed tile's `xN` made the two numbers genuinely
// different, and the entry count was the one that reconciled with the
// manifest and the CLI. There is no collapsing left, so the header count
// and the number of tiles on screen are now the same number, and the header
// simply states it.
import type { ViewService } from "@catalogus/cli";

import type { BandDefinition } from "../bands.js";
import { ServiceTile } from "./ServiceTile.js";
import styles from "./BandModule.module.css";

export interface BandModuleProps {
  band: BandDefinition;
  services: ViewService[];
  readAt: string;
  selectedId: string | null;
  onActivate: (service: ViewService) => void;
  onPeek: (service: ViewService, anchor: HTMLElement) => void;
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

  return (
    <section id={sectionId} className={styles.band} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 className={styles.title} id={headingId}>
          {band.label}
        </h2>
        {/*
          aria-hidden on the element itself -- the heading it sits beside
          already names the band, and a screen reader announcing "Runs in
          production 7" as a heading would be reading a decoration as
          content. The rows carry the real information.
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
        {services.map((service) => (
          <ServiceTile
            key={service.id}
            service={service}
            readAt={readAt}
            selected={service.id === selectedId}
            onActivate={onActivate}
            onPeek={onPeek}
            onPeekEnd={onPeekEnd}
          />
        ))}
      </div>
    </section>
  );
}
