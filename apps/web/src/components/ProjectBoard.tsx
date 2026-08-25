// The project page's main field: a mosaic of band modules plus the rank
// module. Pure -- it composes, it does not fetch, route, or touch `window`.
//
// This replaces ServiceList, and the difference is not styling. ServiceList
// grouped by rollup and ordinal-sorted, which against a real manifest
// produced 21 alphabetical headings for 35 services, 15 of them holding one
// row. This groups into at most eight architecture bands in a fixed reading
// order that describes how a system works -- front door, what it keeps, what
// it calls, what it is made of, what watches it, what builds it, the
// paperwork -- so a reader who scans top to bottom has been told the shape
// of the project rather than an index of it. See bands.ts for why bands key
// on `rollup` rather than on the full `role`.
//
// **The "most depended on" ranking was removed on 2026-08-25**, by the owner:
// "the most depend panel is noise for now, we should first work on the
// catalog before start judging."
//
// That is a sequencing argument rather than a verdict on the module, and it is
// the right one. A ranking is a judgement, and this one would have been made
// over a catalog that cannot yet name four of the services it ranks --
// `grafana`, `loki`, `prometheus` and `healthchecks-io` have no catalog row,
// so they render as raw slugs with generic glyphs. Ranking data that
// incomplete puts a confident ordering in front of a reader on top of
// reference data nobody has finished, which is this project's recurring defect
// wearing a new hat.
//
// `RankModule.tsx` and bands.ts's `mostDependedOn` are kept, not deleted: they
// are correct, tested, and the hierarchy problem they solve is real -- the
// board still gives `fly-api` and `namecheap-registrar` identical weight. They
// simply have no caller until the catalog is worth judging on. `dependentCounts`
// remains in use; the popover states per-entry dependents.
import type { ViewService } from "@catalogus/cli";

import type { VendorGroup } from "../bands.js";
import { groupIntoBands } from "../bands.js";
import { BandModule } from "./BandModule.js";
import styles from "./ProjectBoard.module.css";

export interface ProjectBoardProps {
  services: ViewService[];
  /** Server-stamped moment the manifest was read; every recency mark measures from it. */
  readAt: string;
  selectedId: string | null;
  /** Catalog slug of the tile whose popover is pinned open, if any. */
  expandedService: string | null;
  onActivate: (group: VendorGroup, anchor: HTMLElement) => void;
  onPeek: (group: VendorGroup, anchor: HTMLElement) => void;
  onPeekEnd: () => void;
}

export function ProjectBoard({
  services,
  readAt,
  selectedId,
  expandedService,
  onActivate,
  onPeek,
  onPeekEnd,
}: ProjectBoardProps) {
  const bands = groupIntoBands(services);

  if (bands.length === 0) {
    return <p className={styles.empty}>No services declared.</p>;
  }

  return (
    <div className={styles.board}>
      {bands.map((group) => (
        <BandModule
          key={group.band.id}
          band={group.band}
          services={group.services}
          readAt={readAt}
          selectedId={selectedId}
          expandedService={expandedService}
          onActivate={onActivate}
          onPeek={onPeek}
          onPeekEnd={onPeekEnd}
        />
      ))}
    </div>
  );
}
