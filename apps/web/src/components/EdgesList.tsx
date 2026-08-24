// Pure. The whole-manifest edges list, alongside the per-entry
// depends-on/depended-on-by rendering that now lives in
// ServiceDetailPanel.tsx (it was ServiceCard.tsx until the compact-node
// restructure removed that component).
import type { ViewPayload } from "@catalogus/cli";

import styles from "./EdgesList.module.css";

export interface EdgesListProps {
  edges: ViewPayload["edges"];
  labelForId: (id: string) => string;
}

export function EdgesList({ edges, labelForId }: EdgesListProps) {
  if (edges.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Dependencies</h2>
      <ul className={styles.list}>
        {edges.map((edge, index) => (
          <li key={`${edge.from}->${edge.to}#${index}`} className={styles.edge}>
            <span className={styles.node}>{labelForId(edge.from)}</span>
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
            <span className={styles.node}>{labelForId(edge.to)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
