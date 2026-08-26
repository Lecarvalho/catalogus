// Pure. One compact node: brand icon (or the rollup's fallback glyph) plus
// the display name, and nothing else -- role, kind, version, `added`,
// `replaced_by`, notes and edges all moved to the detail panel (see
// the service page). This is deliberately the whole node now, not a
// trimmed-down card: docs/PLAN.md's Phase 3.7 restructure shrinks the node
// so the next slice can swap the list container this renders inside for an
// elkjs/React Flow canvas without rebuilding the node itself.
//
// Two signals stay on the node on purpose -- do not move either into the
// panel to "declutter" further:
//
//  - Status, as a bar across the top edge. This used to be a coloured ring
//    around the icon with one rule per exact status value, including
//    `active` -- a leftover from before the 2026-08-25 world rewrite, which
//    settled a different rule: `active` is the norm (31 of 35 entries on a
//    real manifest) and the norm earns no mark at all, or the four
//    departures that actually matter are drowned out by thirty-one that
//    don't (service-tags.ts's own header). The bar is `ServiceTile.module
//    .css`'s `.mark` -- the board's own precedent for showing a status on a
//    small element without text -- reused rather than a third vocabulary
//    invented for the node. Colour only, no text, same as the ring it
//    replaces: the panel is where the status word itself renders
//    (as a Tag), which is what keeps this accessible without painting it
//    onto every node.
//  - The uncatalogued marker, when `known` is false. `service.name` is
//    already the raw slug in that case (view-payload.ts's fallback), and a
//    raw slug must never read as if it were a real catalogued display
//    name. Kept minimal on purpose (a small corner dot plus
//    visually-hidden text, not the old full-word "uncatalogued" pill) --
//    see ServiceNode.module.css's `.uncataloguedDot` comment for why a dot
//    rather than a badge.
//
// A third that is always present but only ever *differs* for two entries in
// three: `kind`. A vendor with an invoice, infrastructure the owner runs, and
// the language the code is written in are not interchangeable on screen --
// a cost rollup has to exclude the middle one rather than show it as zero --
// so the node carries the kind as a shape (see the `.kind-*` rules in
// ServiceNode.module.css), as a `data-kind` attribute, and, for the two
// non-default kinds, as visually-hidden text. Three carriers because the
// shape alone is unreadable to a screen reader and untestable without
// computed styles.
//
// And one that appears only when it has to: the local id, rendered under
// the name when `showId` says another node beside this one shows the same
// display name. Two entries of one vendor (`supabase-db` and
// `supabase-auth`, both "Supabase") are otherwise the same node twice, on
// screen and in the accessible name. Conditional rather than always-on
// because the id is the thing the compact node was shrunk to drop.
//
// A control, not a card: rendered as a real `<button>` -- the root element
// this component returns, not wrapped in a `<div>` or `<li>` of its own here
// -- so keyboard operability (Tab to focus, Enter/Space to activate) and the
// accessible name come from native semantics rather than a hand-rolled click
// handler. `aria-pressed` conveys the selected state to assistive tech --
// the visual `.selected` styling is never the only signal for it.
//
// The `<li>` a list needs around each node is the container's to add, not
// this component's: ServiceGroup.tsx wraps this button in one for its `<ul>`,
// while GraphCanvas.tsx wraps the same button in a plain `<div>` for the
// canvas. It used to be the other way around -- this component returned its
// own `<li>`, correct inside ServiceGroup's list and invalid on the canvas,
// where it was an `<li>` with no `<ul>` around it at all. Hoisting the `<li>`
// out to the one caller that actually has a list is what fixed that.
import type { ViewService } from "@catalogus/cli";

import { tagsFor } from "../service-tags.js";
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

/**
 * The status mark's tone -> class lookup.
 *
 * A `Map` over the three tones a status tag can actually produce here
 * (`signal-outline`/`ink-solid`/`grey-solid` -- phasing_out/deprecated/
 * removed) -- the same technique, for the same reason, as Tag.tsx's own
 * tone lookup below it. This comment used to contrast the two, back when
 * Tag.tsx still read `styles` through an `Object.prototype.hasOwnProperty`
 * guard; Tag.tsx was rewritten to this identical `Map` form on 2026-08-26,
 * after which there was no more contrast left to draw. The measurement that
 * motivated both -- what this project's CSS-module handling under vitest
 * actually does to a property-existence check versus a `Map` lookup -- lives
 * in Tag.tsx's header; this file does not restate it.
 */
const MARK_TONE_CLASSES: ReadonlyMap<string, string | undefined> = new Map([
  ["signal-outline", styles["signal-outline"]],
  ["ink-solid", styles["ink-solid"]],
  ["grey-solid", styles["grey-solid"]],
]);

export function ServiceNode({ service, isSelected, showId, onSelect }: ServiceNodeProps) {
  // The status mark, reduced from tagsFor's full three-tag vocabulary to the
  // one this node has room for. `kind: "service"` and `added: undefined`
  // suppress the kind tag and the recency tag -- this node already carries
  // kind as a shape (the `.kind-*` rules below) and has nowhere to spend a
  // "new" mark, so asking for all three and discarding two would be the
  // same defect as never asking, just spelled differently. Exactly
  // ServiceTile.tsx's own technique for the board's mark, reused rather
  // than re-derived. `readAt` is a required parameter but not a load-bearing
  // one here: `isRecentlyAdded` returns false the moment `added` is
  // `undefined`, before it ever reads `readAt`, so any value satisfies it.
  const [mark] = tagsFor({ ...service, kind: "service", added: undefined }, "");
  const markToneClass = mark ? MARK_TONE_CLASSES.get(mark.tone) : undefined;

  return (
    <button
      type="button"
      id={serviceNodeDomId(service.id)}
      // `?? ""`, because `kind: service` has no rule by design (see the
      // `.kind-*` comment in the stylesheet) and CSS Modules return
      // undefined for a class that does not exist -- which template-literals
      // into the literal string "undefined" as a class name. Harmless to
      // look at and wrong in a way that survives every test that checks
      // behaviour rather than markup; found by reading the live DOM.
      className={`${styles.node} ${styles[`kind-${service.kind}`] ?? ""} ${isSelected ? styles.selected : ""}`}
      aria-pressed={isSelected}
      // The shape cue below is CSS, which no test can read and no screen
      // reader announces. This is the machine-readable half of the same
      // fact: one attribute, asserted by the tests, and the only way the
      // three kinds are distinguishable without computing styles.
      data-kind={service.kind}
      // Hover is a tooltip only -- name and role, nothing more. Never the
      // detail content: hover-to-open fights a pannable canvas (the next
      // slice) and is dead weight on a touch device, which is why this is
      // a plain `title` attribute rather than a custom hover panel.
      title={`${service.name} — ${service.role}`}
      onClick={() => onSelect(service.id)}
    >
      {/*
        The mark carries no `title` of its own, unlike ServiceTile.module
        .css's board tile, whose button has no competing title attribute.
        This button already has one (name — role, immediately above), and
        Icon.tsx's own header already rejected stacking a second, narrower
        tooltip region on the same control for exactly this reason: it made
        hover answer a different question depending on which few pixels the
        pointer happened to be over. The status word itself stays reachable
        on the service page (as a Tag), same as when this was a ring.
      */}
      {mark && <span className={`${styles.mark} ${markToneClass ?? ""}`} aria-hidden="true" />}
      <span className={styles.iconWrap}>
        <Icon iconPath={service.icon} rollup={service.rollup} label={service.name} />
        {!service.known && <span className={styles.uncataloguedDot} aria-hidden="true" />}
      </span>
      <span className={styles.label}>
        <span className={`${styles.name} ${service.known ? "" : styles.uncataloguedName}`}>
          {service.name}
          {!service.known && <span className={styles.srOnly}> (uncatalogued -- no catalog entry for this slug)</span>}
        </span>
        {showId && <span className={styles.id}>{service.id}</span>}
        {service.kind !== "service" && (
          <span className={styles.srOnly}>
            {" "}
            ({service.kind === "component" ? "component -- infrastructure this project runs itself" : "stack -- what the code is written in"})
          </span>
        )}
      </span>
    </button>
  );
}
