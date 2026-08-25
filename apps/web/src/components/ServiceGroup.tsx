// Pure. Renders one rollup group's heading and its compact nodes, already
// sorted by group-services.ts before this component ever sees them -- it
// does not re-sort or re-group anything itself.
import type { ViewService } from "@catalogus/cli";

import { duplicateNames } from "../group-services.js";
import { rollupLabel } from "../rollup-labels.js";
import { ServiceNode } from "./ServiceNode.js";
import styles from "./ServiceGroup.module.css";

export interface ServiceGroupProps {
  rollup: string;
  services: ViewService[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ServiceGroup({ rollup, services, selectedId, onSelect }: ServiceGroupProps) {
  // Scoped to this group, not to the manifest: a node shows its id to be
  // told apart from the node *next to it*, and two entries of one vendor
  // sitting under different headings are already told apart by the
  // headings. See group-services.ts's `duplicateNames`.
  const duplicated = duplicateNames(services);

  return (
    <section className={styles.group}>
      <h2 className={styles.heading}>{rollupLabel(rollup)}</h2>
      <ul className={styles.list}>
        {services.map((service) => (
          // The `<li>` lives here, not inside ServiceNode: this is the one
          // caller with a `<ul>` around it. GraphCanvas.tsx renders the same
          // ServiceNode inside a plain `<div>` instead -- see ServiceNode.tsx's
          // top comment for why the wrapper moved out.
          <li key={service.id} className={styles.item}>
            <ServiceNode
              service={service}
              isSelected={service.id === selectedId}
              showId={duplicated.has(service.name)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
