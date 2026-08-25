// Pure. The migration dashboard: the lifecycle tail that still needs a
// decision -- `phasing_out` (in flight) and `deprecated` (overdue) -- in two
// labelled sections, each row naming the service and, where one is on
// record, what replaces it. `removed` never appears here (that migration is
// finished, there is nothing left to decide) and neither does `active` (it
// never enters a migration conversation at all) -- docs/PLAN.md's Phase 3.7,
// scope widened 2026-08-25.
//
// HANDOFF.md section 4.2 query 4 asks for "edges/nodes marked phasing_out,
// with their replaced_by targets". Only the nodes half is rendered here --
// see migrations.ts's top comment for why an edge status is not this
// dashboard's to invent.
//
// Grouping, sorting and label resolution are migrations.ts's job, the same
// division ServiceList keeps with group-services.ts -- this component only
// renders what buildMigrationDashboard returns.
import type { ViewService } from "@catalogus/cli";

import { buildMigrationDashboard, type MigrationRow } from "../migrations.js";
import { serviceNodeDomId } from "./ServiceNode.js";
import { StatusPill } from "./StatusPill.js";
import styles from "./MigrationList.module.css";

/** The id of the element naming a row's replacement, referenced by the row's own `aria-describedby` -- see the row markup below for why the replacement has to reach the accessible description. */
const replacementDomId = (id: string) => `migration-replacement-${id}`;

export interface MigrationListProps {
  services: ViewService[];
  selectedId: string | null;
  /** Called with the service id when a row is activated (click or keyboard). App.tsx turns this into the same `#/service/<id>` hash change ServiceList and GraphCanvas use -- this component never touches `window` itself. */
  onSelect: (id: string) => void;
}

interface MigrationSectionProps {
  rows: MigrationRow[];
  emptyMessage: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function MigrationSection({ rows, emptyMessage, selectedId, onSelect }: MigrationSectionProps) {
  if (rows.length === 0) {
    return <p className={styles.sectionEmpty}>{emptyMessage}</p>;
  }

  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <li key={row.service.id} className={styles.row}>
          {/* A real button, like ServiceNode: keyboard operability and the
              accessible name come from native semantics, not a hand-rolled
              click handler. Only the row's own service is selectable here --
              the replacement is text, not a second selection target, so the
              row keeps the single onSelect(id) contract every other view
              uses.

              It carries `serviceNodeDomId` for the same reason ServiceNode
              does, and the validation pass is why: App.tsx restores focus on
              panel close by looking that id up, so a row without one dropped
              focus to `<body>` in this view and only this view -- exactly the
              regression App.tsx's own comment says was already found and
              fixed once. `serviceNodeDomId`'s doc comment predicted the shape
              of it: "a focus restore that silently finds nothing is invisible
              in a passing test suite". Only one view renders at a time, so
              the id stays unique across the page.

              `aria-describedby` is what puts the replacement into the row's
              accessible description. The replacement is the point of the row,
              and it sits outside the control so that clicking it cannot
              select the wrong service -- which left it out of the button's
              name entirely, audible only in a screen reader's browse mode. */}
          <button
            type="button"
            id={serviceNodeDomId(row.service.id)}
            className={styles.service}
            aria-pressed={row.service.id === selectedId}
            aria-describedby={replacementDomId(row.service.id)}
            onClick={() => onSelect(row.service.id)}
          >
            <span className={styles.name}>{row.service.name}</span>
            <span className={styles.id}>{row.service.id}</span>
            <StatusPill status={row.service.status} />
          </button>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
          {row.replacementLabel ? (
            <span id={replacementDomId(row.service.id)} className={styles.replacement}>
              {/* The arrow carries "replaced by" for a sighted reader and is
                  aria-hidden, so the description this element provides would
                  otherwise be a bare name with no relationship attached to
                  it. Same srOnly device ServiceNode uses for the uncatalogued
                  marker, and for the same reason. */}
              <span className={styles.srOnly}>replaced by </span>
              {row.replacementLabel}
            </span>
          ) : (
            // Explicit and plain, not blank -- an absent replaced_by is an
            // unanswered question, not an error (CLAUDE.md's "ask, never
            // guess"; migrations.ts's own comment on `replacementLabel`).
            <span id={replacementDomId(row.service.id)} className={styles.noReplacement}>
              no replacement recorded
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function MigrationList({ services, selectedId, onSelect }: MigrationListProps) {
  const { inFlight, overdue } = buildMigrationDashboard(services);

  // The all-clear state: a real and good state for a project, not an error
  // and not nothing rendered at all.
  if (inFlight.length === 0 && overdue.length === 0) {
    return <p className={styles.empty}>Nothing needs a migration decision -- no service here is phasing out or deprecated.</p>;
  }

  return (
    <div className={styles.board}>
      <section className={styles.section}>
        <h2 className={styles.heading}>In flight</h2>
        <MigrationSection rows={inFlight} emptyMessage="Nothing is phasing out right now." selectedId={selectedId} onSelect={onSelect} />
      </section>
      <section className={styles.section}>
        <h2 className={styles.heading}>Overdue</h2>
        <MigrationSection rows={overdue} emptyMessage="Nothing is deprecated right now." selectedId={selectedId} onSelect={onSelect} />
      </section>
    </div>
  );
}
