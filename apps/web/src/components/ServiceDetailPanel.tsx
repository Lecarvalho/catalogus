// Pure. Everything a compact ServiceNode no longer shows inline -- role,
// kind, version, `added`, `replaced_by`, notes, and this one service's
// edges -- rendered beside the list rather than inline in a card
// (docs/PLAN.md's Phase 3.7 restructure). This is where growth lands: Layer
// 3 cost, end-of-life dates and blast radius all arrive here later, which
// is why this is laid out to scroll (see .panel in the module CSS) rather
// than to fit a fixed size.
//
// `dependsOn`/`dependedOnBy` arrive pre-resolved for this one service (a
// `string[]` of ids, not the full Map App.tsx builds) -- this component
// never needs to know there was a Map, only the slice of it that applies
// to the service it's showing, which is what keeps it a pure, easily
// canvas-portable prop shape rather than one tied to how App.tsx happens
// to store the graph today.
import type { Ref } from "react";
import type { ViewService } from "dagstree";

import { Icon } from "./Icon.js";
import { StatusPill } from "./StatusPill.js";
import styles from "./ServiceDetailPanel.module.css";

export interface ServiceDetailPanelProps {
  service: ViewService;
  dependsOn: string[];
  dependedOnBy: string[];
  labelForId: (id: string) => string;
  onClose: () => void;
  /**
   * Imperative focus handle for App.tsx: it moves focus into the panel when
   * one opens (click or deep link) and needs a target to focus, and moving
   * that decision here (rather than App.tsx reaching into this component's
   * DOM) keeps App.tsx's one job "own the selection", not "know this
   * component's internal markup".
   */
  panelRef?: Ref<HTMLElement>;
}

const headingId = (id: string) => `service-panel-heading-${id}`;

export function ServiceDetailPanel({ service, dependsOn, dependedOnBy, labelForId, onClose, panelRef }: ServiceDetailPanelProps) {
  return (
    <aside className={styles.panel} role="region" aria-labelledby={headingId(service.id)} tabIndex={-1} ref={panelRef}>
      <div className={styles.header}>
        <Icon iconPath={service.icon} rollup={service.rollup} label={service.name} />
        <div className={styles.identity}>
          <h2 id={headingId(service.id)} className={styles.name}>
            {service.name}
            {!service.known && <span className={styles.uncatalogued}>uncatalogued -- no catalog entry for this slug</span>}
          </h2>
          <div className={styles.id}>{service.id}</div>
        </div>
        <StatusPill status={service.status} />
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>

      <dl className={styles.facts}>
        <dt>role</dt>
        <dd>{service.role}</dd>

        {service.kind !== "service" && (
          <>
            <dt>kind</dt>
            <dd>
              <span className={styles.kindBadge}>{service.kind}</span>
            </dd>
          </>
        )}

        {service.version && (
          <>
            <dt>version</dt>
            <dd>{service.version}</dd>
          </>
        )}

        {service.added && (
          <>
            <dt>added</dt>
            <dd>{service.added}</dd>
          </>
        )}

        {service.replaced_by && (
          <>
            <dt>replaced by</dt>
            <dd>{labelForId(service.replaced_by)}</dd>
          </>
        )}
      </dl>

      {service.notes && <p className={styles.notes}>{service.notes}</p>}

      {(dependsOn.length > 0 || dependedOnBy.length > 0) && (
        <div className={styles.deps}>
          {dependsOn.length > 0 && (
            <div>
              <span className={styles.depsLabel}>depends on:</span> {dependsOn.map((id) => labelForId(id)).join(", ")}
            </div>
          )}
          {dependedOnBy.length > 0 && (
            <div>
              <span className={styles.depsLabel}>depended on by:</span> {dependedOnBy.map((id) => labelForId(id)).join(", ")}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
