// Pure. One compact mark on the canvas: brand icon (or the catalog-slug
// monogram) in a squircle, a name-then-id label beside it, and -- only when
// the status departs from `active` -- a corner badge and a status word.
//
// This is the graph's move into candidate E, the home screen
// (docs/candidates/candidate-e-homescreen.html, docs/candidates/README.md,
// owner-approved 2026-08-26). The mockup covers the List view only -- there
// is no graph mockup -- so this file takes the mark treatment, the label
// stack and the status cues from ServiceTile.tsx, the world's nearest thing
// to a graph node, rather than inventing a second vocabulary for the same
// three facts. What follows is a narrower node than the tile: candidate E's
// own 76px icon tile has no room to spare inside the fixed 216x64 box
// graph-layout.ts's `NODE_SIZE` lays elk out against -- a constant this file
// does not own and cannot resize. It fits without needing a different size
// (the arithmetic is in this move's own report), so `NODE_SIZE` is
// untouched.
//
// No card, no border, no background box around the node -- the same "sharp
// structure... a graph node is not a transient surface" rule that keeps a
// radius off everything but the icon tile itself
// (apps/web/docs/DIRECTION.md, OWN-WORLD). The old dense-world node drew a
// bordered, radiused box (`border: 1px solid var(--color-line)`) exactly
// where this world's own contract says a hairline lives on the shell, not
// on a service -- that box is gone, not merely restyled.
//
// **Two things the List's tile carries that this node deliberately drops,
// both so the two views stay one app rather than two:**
//
//  - `kind` (component/stack/service), which used to be a shape on the
//    node's own outer box (a dashed border, a squared corner) before this
//    move. ServiceTile.tsx carries no visual `kind` treatment at all --
//    candidate E's tile is mark, label, status and nothing else -- and a
//    kind shape had nowhere left to live once the outer box it was drawn on
//    went with the retired world. Still reachable the same way the List
//    already relies on for it: click through to the service page.
//  - The uncatalogued corner dot. ServiceTile.tsx does not surface
//    `known: false` on the tile either -- the List states it in the hover
//    popover and the service page, never on the mark. The graph has no
//    equivalent of the popover (GraphCanvas.tsx never wires a peek handler
//    to this node; the note below on `title` says why a canvas-hover panel
//    fights panning), so the same fact reaches a reader the same way it
//    already does from the List: the click-through page.
//
// Both are reported, not silently dropped -- CLAUDE.md's "ask, never guess"
// binds a design call as much as a manifest fact, and this one trades a
// small amount of node-only information for the thing this whole move
// exists to avoid: a reader who can tell, from the mark alone, which view
// they are looking at.
//
// **2026-08-31: the status vocabulary moved to ServiceStatus.tsx.** This
// file's own `STATUS_WORDS`, `StatusBadgeGlyph` and `statusPhrase` used to be
// a deliberate, flagged copy of ServiceTile.tsx's private versions (this
// file could not import them: ServiceTile.tsx was being built by a separate,
// concurrent slice and exported neither). Both slices are settled now, so
// the copy is gone in favour of importing the one shared version -- see
// ServiceStatus.tsx's own header for why the duplication mattered enough to
// lift rather than merely note. This node's own behaviour is unchanged: an
// `active` service still earns no badge and no status word here, full stop
// -- the owner's 2026-08-31 ruling on `active` + `replaced_by` was put to
// ServiceTile.tsx specifically (docs/DIRECTION.md, "Signal red: the rule
// stands..."), not to this file, so `statusPhrase` here keeps returning
// `undefined` for every `active` service, exactly as before.
import type { ViewService } from "@catalogus/cli";

import { Icon } from "./Icon.js";
import { STATUS_WORDS, StatusBadgeGlyph, statusPhrase } from "./ServiceStatus.js";
import { monogramFor } from "./ServiceTile.js";
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
 * **Unchanged by this file's move into candidate E.** `MigrationList.tsx`
 * imports this export by name and depends on the exact string it returns;
 * this move does not own that file, so neither the name nor the format
 * below changed.
 *
 * Read back with `document.getElementById`, never a CSS selector: a service
 * id is manifest text and would need selector escaping, which is the kind
 * of detail that works until the first id with a dot in it.
 */
export function serviceNodeDomId(id: string): string {
  return `service-node-${id}`;
}

export function ServiceNode({ service, isSelected, showId, onSelect }: ServiceNodeProps) {
  const isFallback = service.icon === null;
  const phrase = statusPhrase(service);

  // The accessible name states everything the mark and label carry
  // visually -- the name, the id where it is shown, and the status phrase
  // where there is one -- the same construction ServiceTile.tsx uses for
  // its own `aria-label`, and for the same reason: the squircle below is
  // `aria-hidden`, so nothing inside it (the icon's own `role="img"`, the
  // badge's glyph) reaches assistive tech any other way.
  const label = [service.name, showId ? service.id : undefined, phrase].filter(Boolean).join(", ");

  const squircleClassName = [styles.squircle, isFallback ? styles.fallback : "", service.status !== "active" ? styles.desaturated : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      id={serviceNodeDomId(service.id)}
      className={`${styles.node} ${isSelected ? styles.selected : ""}`}
      aria-label={label}
      aria-pressed={isSelected}
      // Hover is a native tooltip only, name and role, nothing more --
      // unchanged by this move. A custom hover panel (the List's popover)
      // fights a pannable canvas and has no touch equivalent, which is why
      // GraphCanvas.tsx never wires a peek handler to this node.
      title={`${service.name} — ${service.role}`}
      onClick={() => onSelect(service.id)}
    >
      {/*
        The squircle: this world's icon tile, scaled down to fit the graph
        node (ServiceNode.module.css's header has the numbers and why).
        aria-hidden throughout -- the button's own aria-label above is the
        one accessible name, the same choice ServiceTile.tsx makes for its
        identical squircle.
      */}
      <span className={squircleClassName} aria-hidden="true" data-testid="icon-mark">
        {isFallback ? (
          // No verified brand icon: a dashed, sunken tile and a monogram
          // from the raw catalog slug, imported from ServiceTile.tsx rather
          // than re-derived -- one fact, one function.
          <span className={styles.monogram}>{monogramFor(service.service)}</span>
        ) : (
          <Icon iconPath={service.icon} iconHex={service.iconHex} rollup={service.rollup} label={service.name} colour />
        )}

        {/*
          Status signal 1 of 2: a corner badge, shaped per status so it reads
          before any word does. Signal 2 is the worded status under the
          label, below. Both together are the graph's whole status
          vocabulary -- no third, colour-only cue, and no `.mark`/tone ramp
          coloured differently per status the way the retired dense world
          drew across the node's top edge: `--color-signal` is spent in
          exactly these two places, never on the mark's fill or the node
          itself (apps/web/docs/DIRECTION.md).
        */}
        {service.status !== "active" && (
          <span className={styles.badge} aria-hidden="true" data-testid="status-badge">
            <StatusBadgeGlyph status={service.status} />
          </span>
        )}
      </span>

      <span className={styles.label}>
        <span className={styles.name}>{service.name}</span>

        {/*
          The disambiguating id line, rendered only when another node beside
          this one shows the same display name (see the `showId` prop
          above). Monospace and muted -- manifest text reads as manifest
          text, the same convention ServiceTile.module.css's own `.id` uses.
        */}
        {showId && <span className={styles.id}>{service.id}</span>}

        {service.status !== "active" && (
          <span className={styles.status} data-testid="status-text">
            {STATUS_WORDS[service.status]}
            {service.replaced_by && (
              <>
                {" → "}
                <span className={styles.statusTarget}>{service.replaced_by}</span>
              </>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
