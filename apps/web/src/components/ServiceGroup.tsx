// Pure. Renders one rollup group's heading and its compact nodes, already
// sorted by group-services.ts before this component ever sees them -- it
// does not re-sort or re-group anything itself.
import type { ViewService } from "dagstree";

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
  return (
    <section className={styles.group}>
      <h2 className={styles.heading}>{rollupLabel(rollup)}</h2>
      <ul className={styles.list}>
        {services.map((service) => (
          <ServiceNode key={service.id} service={service} isSelected={service.id === selectedId} onSelect={onSelect} />
        ))}
      </ul>
    </section>
  );
}
