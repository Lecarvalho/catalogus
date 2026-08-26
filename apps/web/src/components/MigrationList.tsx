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
//
// ---------------------------------------------------------------------
// Brought into the dense-module world on 2026-08-26, a day after the board
// (ProjectBoard/BandModule/ServiceTile) was. Two decisions worth recording
// because the brief that asked for this left them to judgement rather than
// spelling them out:
//
// 1. No per-row *visual* status mark. The previous row rendered `StatusPill`
//    -- solid, on every row -- and `service-tags.ts`'s whole reason for
//    existing is the same complaint about the old board: "the previous
//    viewer rendered a status pill on every entry... tagging the norm spends
//    the reader's attention on the norm." That argument applies here with
//    force: `migrations.ts` filters `inFlight` to exactly `phasing_out` and
//    `overdue` to exactly `deprecated`, so *every* row in a section already
//    has the status its heading names -- there is no row in "In flight" that
//    could be anything else. A status mark here would not be tagging the
//    exception, it would be tagging the guaranteed case, which is a stricter
//    version of the defect `service-tags.ts` was written to fix, not an
//    exception to it. (See the 2026-08-26 addendum below for the half of
//    this that was wrong.)
// 2. No recency ("new") or `kind` (component/stack) tag either, and for a
//    narrower reason than judgement: both live behind `tagsFor(service,
//    readAt)`, and `readAt` is not a prop this component receives -- App.tsx,
//    which owns the only call site, was out of this slice's file list, so
//    threading it through would mean guessing at a default `readAt` (the
//    thing CLAUDE.md's "ask, never guess" rule exists to stop) or adding a
//    required prop the call site cannot supply, which fails the build rather
//    than the review. A migration decision does not turn on when a service
//    was added or what kind it is, so the honest scope for this view is
//    status and replacement only, and that is what it renders.
//
// What replaces the pill is the direction contract's own idiom for this
// exact fact (docs/DIRECTION.md, "Mapped from the world's own grammar, not
// invented"): "struck old price + red new price -> `phasing_out` with its
// `replaced_by`". A `phasing_out` row's name renders struck through and its
// replacement, if one is on record, in the signal colour -- the same visual
// grammar a price tag uses for "this is going away, that is what to buy
// instead" -- see MigrationList.module.css's `.superseded` and
// `.replacementNew`. `deprecated` rows keep their name intact and their
// replacement in ink rather than red: DIRECTION maps `deprecated` to a solid
// *black* tag, not the signal colour, and a `deprecated` service is not
// mid-swap the way a `phasing_out` one is -- "should not be used, still
// present" is a different claim from "is being replaced right now."
//
// Neither classed lookup below indexes `styles` (or anything else) by a
// manifest-derived string -- the `phasing_out` check is a strict-equality
// branch against a closed schema enum, not a keyed read -- so there is no
// `Object.prototype` fall-through surface here for CLAUDE.md's standing
// keyed-lookup rule to guard. `migrations.ts`'s own `buildLabelForId` still
// keys off manifest ids and still does that through a `Map`.
//
// ---------------------------------------------------------------------
// 2026-08-26 addendum: the status word belongs in the accessible name.
//
// Decision 1 above is right for a sighted reader, who keeps the section
// heading in view while scanning its rows. It is wrong for the common
// screen-reader mode of tabbing button to button: heard one at a time, a row
// announced nothing but "Auth0 auth-legacy" and its description nothing but
// "replaced by auth-users (Clerk)" -- the words "phasing out", "deprecated"
// and "removed" appeared *nowhere* on this board, not in a row's name, not
// in its description, not even in the section headings read out of context.
// Found by a validation agent driving the built app, not by this test suite
// -- an accessible name is exactly the kind of fact jsdom's assertions never
// force a browser's accessibility tree to compute.
//
// The fix is confined to the row's `aria-label`; nothing changes on screen.
// Putting the word back as visible text would undo decision 1 and rebuild
// the "thirty-five identical pills" problem service-tags.ts exists to
// prevent -- the strike-through and signal colour already carry the fact
// for a sighted reader, and every row in a section still shares its status,
// so a printed word would repeat what the heading already says, on every
// row, with no exception. `ServiceTile.tsx` already drew this exact
// boundary for the board proper: it renders `aria-label="Auth0, auth-legacy,
// phasing out"` while painting an identical wordless bar, and its comment
// makes the same argument decision 1 makes here. Two surfaces drawing the
// same bar should not disagree about whether the fact is announced, so this
// row's `aria-label` is built the same way, from the same vocabulary.
//
// `tagsFor` needs a `readAt` to decide the recency tag, and this component
// is not given one -- threading it through would mean touching App.tsx's
// only call site, which is out of this slice's file list, for a component
// that has no recency mark to show anyway (decision 2 above). The way
// around that is `ServiceNode.tsx`'s own technique, not a new one: pass
// `kind: "service"` and `added: undefined` so the kind and recency tags
// never fire, which makes `readAt` genuinely unused rather than merely
// unthreaded -- `isRecentlyAdded` returns `false` the moment `added` is
// `undefined`, before it ever reads its second argument -- so any string
// satisfies the parameter honestly, and the only tag `tagsFor` can produce
// is the status one this addendum needs.
import type { ViewService } from "@catalogus/cli";

import { buildMigrationDashboard, type MigrationRow } from "../migrations.js";
import { tagsFor } from "../service-tags.js";
import { serviceNodeDomId } from "./ServiceNode.js";
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
  /** DOM-id suffix and `aria-labelledby` anchor for this section's heading -- mirrors BandModule.tsx's `band-${band.id}` pattern. */
  sectionId: string;
  title: string;
  rows: MigrationRow[];
  emptyMessage: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function MigrationSection({ sectionId, title, rows, emptyMessage, selectedId, onSelect }: MigrationSectionProps) {
  const headingId = `migration-section-${sectionId}`;

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <header className={styles.header}>
        <h2 className={styles.title} id={headingId}>
          {title}
        </h2>
        <span className={styles.count} aria-hidden="true">
          {rows.length}
        </span>
      </header>

      {rows.length === 0 ? (
        <p className={styles.sectionEmpty}>{emptyMessage}</p>
      ) : (
        <ul className={styles.rows}>
          {rows.map((row) => {
            // The only branch in this file that reads `service.status`, and
            // it is a strict-equality check against a closed schema enum,
            // not a lookup keyed by manifest text -- see the file header.
            const isPhasingOut = row.service.status === "phasing_out";

            // The status word for the accessible name only -- see the file
            // header's 2026-08-26 addendum. `[0]` is always the status tag
            // here (never recency or `kind`, both suppressed above), but
            // typed as possibly absent regardless: `tagsFor` returns an
            // array, and reading past a real status would be a silent typo
            // in the vocabulary rather than a crash, which is worse.
            // `.filter(Boolean)` is what keeps a hypothetical missing label
            // from leaving a dangling ", " in the name a screen reader would
            // read aloud.
            const [statusTag] = tagsFor({ ...row.service, kind: "service", added: undefined }, "");
            const accessibleName = [row.service.name, row.service.id, statusTag?.label].filter(Boolean).join(", ");

            return (
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
                    name entirely, audible only in a screen reader's browse mode.

                    `aria-label` is the status word's carrier -- see the file header's
                    2026-08-26 addendum. It overrides the button's text content for
                    accessible-name purposes, which is why the name is rebuilt in full
                    (`name, id, status`) here rather than appended to it; the visible
                    spans below are unchanged and still carry the name and id for a
                    sighted reader. */}
                <button
                  type="button"
                  id={serviceNodeDomId(row.service.id)}
                  className={styles.service}
                  aria-pressed={row.service.id === selectedId}
                  aria-label={accessibleName}
                  aria-describedby={replacementDomId(row.service.id)}
                  onClick={() => onSelect(row.service.id)}
                >
                  <span className={`${styles.name} ${isPhasingOut ? styles.superseded : ""}`}>{row.service.name}</span>
                  <span className={`${styles.id} ${isPhasingOut ? styles.superseded : ""}`}>{row.service.id}</span>
                </button>
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
                {row.replacementLabel ? (
                  <span
                    id={replacementDomId(row.service.id)}
                    className={`${styles.replacement} ${isPhasingOut ? styles.replacementNew : ""}`}
                  >
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
            );
          })}
        </ul>
      )}
    </section>
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
      <MigrationSection
        sectionId="in-flight"
        title="In flight"
        rows={inFlight}
        emptyMessage="Nothing is phasing out right now."
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <MigrationSection
        sectionId="overdue"
        title="Overdue"
        rows={overdue}
        emptyMessage="Nothing is deprecated right now."
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  );
}
