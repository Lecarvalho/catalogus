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
import type { ViewService } from "@catalogus/cli";

import type { VendorGroup } from "../bands.js";
import { groupIntoBands, mostDependedOn } from "../bands.js";
import { BandModule } from "./BandModule.js";
import { RankModule } from "./RankModule.js";
import styles from "./ProjectBoard.module.css";

/**
 * How many rows the rank module shows. Eight is enough to cover the spine of
 * a project this size without the tail -- past that the counts flatten to
 * one and two, where the ordering stops meaning anything and the module
 * would be asserting a ranking the data no longer supports.
 */
const RANK_LIMIT = 8;

export interface ProjectBoardProps {
  services: ViewService[];
  edges: { from: string; to: string }[];
  /** Server-stamped moment the manifest was read; every recency mark measures from it. */
  readAt: string;
  selectedId: string | null;
  /** Catalog slug of the tile whose popover is pinned open, if any. */
  expandedService: string | null;
  /** Opening one entry by id -- used by the rank module, whose rows are entries. */
  onOpen: (id: string) => void;
  onActivate: (group: VendorGroup, anchor: HTMLElement) => void;
  onPeek: (group: VendorGroup, anchor: HTMLElement) => void;
  onPeekEnd: () => void;
}

export function ProjectBoard({
  services,
  edges,
  readAt,
  selectedId,
  expandedService,
  onOpen,
  onActivate,
  onPeek,
  onPeekEnd,
}: ProjectBoardProps) {
  const bands = groupIntoBands(services);
  const rank = mostDependedOn(services, edges, RANK_LIMIT);

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

      <RankModule rows={rank} selectedId={selectedId} onOpen={onOpen} />
    </div>
  );
}
