// The services the most things depend on, ranked. Pure.
//
// This is the module that answers the question the old list could not:
// which of these thirty-five entries actually holds the project up. The
// manifest has always known -- Clapline declares 41 edges -- but nothing
// rendered the number, so `fly-api` with fourteen dependents and
// `namecheap-registrar` with none were drawn as identical pills. A reader
// orienting in a project, or handed one, needs that ordering before they
// need anything else, which is why this module sits in the first viewport
// rather than inside the graph view.
//
// Ranked by inbound edge count, computed in bands.ts. Deliberately not
// "importance": the manifest declares dependencies, not criticality, and a
// module claiming to rank importance would be asserting a judgement the
// data does not contain.
import type { ViewService } from "@catalogus/cli";

import styles from "./RankModule.module.css";

export interface RankRow {
  service: ViewService;
  count: number;
}

export interface RankModuleProps {
  rows: RankRow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function RankModule({ rows, selectedId, onOpen }: RankModuleProps) {
  // Nothing depends on anything: a project with no declared edges. Rendering
  // an empty ranked module would imply the ranking exists and is empty,
  // when the truth is there is nothing to rank. The caller drops the module
  // entirely; this guard is the second line of that.
  if (rows.length === 0) return null;

  return (
    <section className={styles.module} aria-labelledby="band-rank">
      <header className={styles.header}>
        <h2 className={styles.title} id="band-rank">
          Most depended on
        </h2>
      </header>

      <ol className={styles.rows}>
        {rows.map((row, index) => (
          <li key={row.service.id}>
            <button
              type="button"
              className={`${styles.row} ${row.service.id === selectedId ? styles.selected : ""}`}
              onClick={() => onOpen(row.service.id)}
            >
              {/*
                The rank numeral. Only the top three take the signal fill --
                the source world's ranking module does the same, and the
                reason it works is that it puts a hard edge on "the ones
                that matter" instead of shading twelve rows by degree.
              */}
              <span className={`${styles.rank} ${index < 3 ? styles.top : ""}`} aria-hidden="true">
                {index + 1}
              </span>
              {/*
                The role sits beside the name because this module ranks
                *entries* while the board collapses *vendors*, and the two
                disagreeing on screen is a defect rather than a nuance:
                against Clapline the rank read "Fly.io / Fly.io / Fly.io" at
                positions 1, 4 and 5 while the board showed a single Fly.io
                tile. Edge counts are genuinely per-entry -- fourteen things
                depend on `fly-api`, nothing depends on "Fly.io" as a vendor
                -- so the ranking stays per-entry and names which one.
              */}
              <span className={styles.name}>
                {row.service.name}
                <span className={styles.role}>{row.service.role}</span>
              </span>
              <span className={styles.count}>
                <span aria-hidden="true">{row.count}</span>
                <span className={styles.srOnly}>
                  {row.count} {row.count === 1 ? "entry depends" : "entries depend"} on this
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
