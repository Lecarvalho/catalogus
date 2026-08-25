// Pure. One compact node: brand icon (or the rollup's fallback glyph) plus
// the display name, and nothing else -- role, kind, version, `added`,
// `replaced_by`, notes and edges all moved to the detail panel (see
// ServiceDetailPanel.tsx). This is deliberately the whole node now, not a
// trimmed-down card: docs/PLAN.md's Phase 3.7 restructure shrinks the node
// so the next slice can swap the list container this renders inside for an
// elkjs/React Flow canvas without rebuilding the node itself.
//
// Two signals stay on the node on purpose -- do not move either into the
// panel to "declutter" further:
//
//  - Status colour (the ring around the icon). Lifecycle at a glance is
//    what the whole viewer exists for; a migration view where every node
//    has to be clicked to find the deprecated one is not a migration view.
//    Colour only, no text, here -- the panel is where the status word
//    itself renders (StatusPill), which is what keeps this accessible: the
//    text equivalent exists and is reachable, just not painted onto every
//    node.
//  - The uncatalogued marker, when `known` is false. `service.name` is
//    already the raw slug in that case (view-payload.ts's fallback), and a
//    raw slug must never read as if it were a real catalogued display
//    name. Kept minimal on purpose (a small corner dot plus
//    visually-hidden text, not the old full-word "uncatalogued" pill) --
//    see ServiceNode.module.css's `.uncataloguedDot` comment for why a dot
//    rather than a badge.
//
// And one that appears only when it has to: the local id, rendered under
// the name when `showId` says another node beside this one shows the same
// display name. Two entries of one vendor (`supabase-db` and
// `supabase-auth`, both "Supabase") are otherwise the same node twice, on
// screen and in the accessible name. Conditional rather than always-on
// because the id is the thing the compact node was shrunk to drop.
//
// A control, not a card: rendered as a real `<button>` so keyboard
// operability (Tab to focus, Enter/Space to activate) and the accessible
// name come from native semantics rather than a hand-rolled click handler
// on a `<div>` or `<li>`. `aria-pressed` conveys the selected state to
// assistive tech -- the visual `.selected` styling is never the only signal
// for it.
import type { ViewService } from "@catalogus/cli";

import { Icon } from "./Icon.js";
import styles from "./ServiceNode.module.css";

export interface ServiceNodeProps {
  service: ViewService;
  isSelected: boolean;
  /**
   * True when another entry rendered beside this one carries the same
   * display name, in which case the local id renders under it -- two
   * entries of the same vendor are otherwise the same node twice. The
   * container decides, because only it knows what is on screen together
   * (see group-services.ts's `duplicateNames`); required rather than
   * optional so the canvas slice has to answer it rather than inherit a
   * default that silently drops the disambiguation.
   */
  showId: boolean;
  /** Called with the service id when this node is activated (click or keyboard). App.tsx turns this into a hash change -- this component never touches `window` itself. */
  onSelect: (id: string) => void;
}

/**
 * The DOM id this node's button carries, so App.tsx can hand focus back to
 * it when a detail panel closes that nothing on the page opened -- a deep
 * link, where there is no previously-focused element to restore. Exported
 * rather than duplicated as a template string at the call site: the format
 * is one fact, and a focus restore that silently finds nothing is invisible
 * in a passing test suite.
 *
 * Read back with `document.getElementById`, never a CSS selector: a service
 * id is manifest text and would need selector escaping, which is the kind
 * of detail that works until the first id with a dot in it.
 */
export function serviceNodeDomId(id: string): string {
  return `service-node-${id}`;
}

export function ServiceNode({ service, isSelected, showId, onSelect }: ServiceNodeProps) {
  return (
    <li className={styles.item}>
      <button
        type="button"
        id={serviceNodeDomId(service.id)}
        className={`${styles.node} ${isSelected ? styles.selected : ""}`}
        aria-pressed={isSelected}
        // Hover is a tooltip only -- name and role, nothing more. Never the
        // detail content: hover-to-open fights a pannable canvas (the next
        // slice) and is dead weight on a touch device, which is why this is
        // a plain `title` attribute rather than a custom hover panel.
        title={`${service.name} — ${service.role}`}
        onClick={() => onSelect(service.id)}
      >
        <span className={`${styles.ring} ${styles[`status-${service.status}`]}`}>
          <Icon iconPath={service.icon} rollup={service.rollup} label={service.name} />
          {!service.known && <span className={styles.uncataloguedDot} aria-hidden="true" />}
        </span>
        <span className={styles.label}>
          <span className={`${styles.name} ${service.known ? "" : styles.uncataloguedName}`}>
            {service.name}
            {!service.known && <span className={styles.srOnly}> (uncatalogued -- no catalog entry for this slug)</span>}
          </span>
          {showId && <span className={styles.id}>{service.id}</span>}
        </span>
      </button>
    </li>
  );
}
