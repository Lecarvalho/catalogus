// Pure. The one place group-services.ts's grouping function is called from
// the render tree -- everything below it just receives an already-grouped
// shape. Only carries what a compact node needs (`selectedId`/`onSelect`);
// the per-service edge maps and `labelForId` moved to App.tsx, which now
// resolves them only for whichever one service is selected (see
// ServiceDetailPanel.tsx) rather than threading them through every node in
// the list.
import type { ViewService } from "@catalogus/cli";

import { groupByRollup } from "../group-services.js";
import { ServiceGroup } from "./ServiceGroup.js";
import styles from "./ServiceList.module.css";

export interface ServiceListProps {
  services: ViewService[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ServiceList({ services, selectedId, onSelect }: ServiceListProps) {
  const groups = groupByRollup(services);

  if (groups.length === 0) {
    return <p className={styles.empty}>No services declared.</p>;
  }

  return (
    <div className={styles.groups}>
      {groups.map((group) => (
        <ServiceGroup key={group.rollup} rollup={group.rollup} services={group.services} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}
