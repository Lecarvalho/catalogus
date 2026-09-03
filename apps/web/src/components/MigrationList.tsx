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
// renders what buildMigrationDashboard returns. That derivation is
// unchanged by everything below: only how a row is drawn moved.
//
// ---------------------------------------------------------------------
// Moved into candidate E, the home screen, on 2026-08-31 -- five days after
// the board (ProjectBoard/BandModule/ServiceTile/ServicePopover) made the
// same move. docs/PLAN.md records the defect the gap between those two
// dates produces: a view left behind changes the app underneath the reader
// the moment they toggle to it. This pass closes that gap for Migrations,
// the last dense-world holdout.
//
// It replaces two things that were never candidate E's, not just a
// palette:
//
// 1. **The section chrome.** `.section`/`.header`/`.title`/`.count` used to
//    duplicate BandModule.module.css's *retired* mosaic chrome verbatim (a
//    hairline box, a filled header bar) -- a deliberate copy at the time,
//    because another agent owned BandModule.tsx mid-flight. BandModule has
//    since been rebuilt for candidate E into a plain heading over an
//    unboxed stack (no card, no header fill, single-column, full width --
//    see BandModule.module.css's own header for why the mosaic's box
//    argument does not survive one column). This file now copies *that*
//    chrome instead, for the same reason it copied the old one: sharing a
//    literal import would couple two components whose props do not match,
//    and another agent owns BandModule.tsx while this slice is built.
//
// 2. **The row's own vocabulary.** The struck-through name and the red
//    "new price" replacement were mapped from the *retired* contract's own
//    "Mapped from the world's own grammar" section: "struck old price + red
//    new price -> `phasing_out` with its `replaced_by`" (docs/DIRECTION.md,
//    the retired-contract quote at the file's foot). Candidate E's own
//    grammar section carries no such mapping -- it maps status to a corner
//    badge, glyph-shaped per state, plus the word spelled out under the
//    label, and nothing else. Keeping the price-tag idiom after the board
//    stopped using it would be exactly the defect this pass exists to
//    close, just moved from the component layer to the vocabulary layer:
//    the same view, still speaking a retired world's language.
//
//    What replaces it is literally instructed rather than invented (the
//    brief for this pass, quoting docs/DIRECTION.md): where a row shows the
//    same three facts a tile shows -- mark, name, status -- take the
//    treatment from the tile. So the mark, the name/id pair and the status
//    (badge + word) below are drawn with ServiceTile's own tokens and
//    wording, not a fresh design. `STATUS_WORDS` and `StatusBadgeGlyph` were
//    a deliberate, narrowed duplicate of ServiceTile.tsx's own private
//    versions at the time this file was built, because ServiceTile.tsx kept
//    them unexported and was off this slice's file list to edit; both now
//    come from ServiceStatus.tsx, the shared module the three copies were
//    lifted into once every owning slice had settled (see the
//    `MigrationStatus` comment below for that move's own account).
//    `monogramFor` and `serviceNodeDomId` were imported from the start,
//    because both were already exported for exactly this kind of
//    cross-component reuse.
//
//    The replacement fact has no counterpart on the tile -- a tile never
//    shows what replaces it, only that it is being replaced -- so it takes
//    its shape from the other place the brief points at instead: the
//    popover's `.facts` grid, "the closest thing in the world to a row of
//    labelled facts". A `<dl>` of one fact, captioned "Replacement", styled
//    with ServicePopover.module.css's own label/value/mono/dim tokens.
//
// **The "exactly two places" discipline, held rather than relaxed.** This
// view's whole subject is lifecycle, which is exactly why it is tempting to
// spend red on more of it -- a count of how many need attention, an arrow
// showing the swap, the replacement itself. Candidate E spends red in
// exactly two places, the status badge and the status word, and nowhere
// else (docs/DIRECTION.md, OWN-WORLD). Below: the section count is styled
// like BandModule's own (`--color-text-faint`, not signal) for the identical
// reason BandModule's header gives -- tagging the norm spends the reader's
// attention on the norm, and every row in a migrations section already
// shares the section's status, so a red count would tag the guaranteed
// case. The replacement fact is ink, not signal, on every row regardless of
// status -- dropping the retired mapping's red "new price" along with the
// strike-through it paired with.
//
// **No radius survives the move, including the one the board keeps.**
// docs/DIRECTION.md declares exactly one exception to "no radius anywhere",
// the icon tile's own phone-like corner square, and says plainly it "does
// not license a radius on anything else -- a migration row is not a
// transient surface". So the mark below is bare -- no squircle, no
// background tile -- sized and positioned like ServicePopover's own
// `.glyph` (26px, no radius) rather than ServiceTile's `.squircle`, and the
// row's button carries no `border-radius` at all (the old version's
// `var(--radius-md)` is gone, not replaced). The selected-row cue that used
// to pair a border colour with a background tint now uses `outline` instead
// -- the exact mechanism ServiceTile.module.css's own `.selected` uses on
// its squircle, for the same reason: an outline reads as a ring in
// greyscale and never reads as the "card border" DIRECTION.md rules out for
// a service.
//
// ---------------------------------------------------------------------
// 2026-08-26 addendum, carried forward: the status word belongs in the
// accessible name.
//
// This is the one piece of the pre-candidate-E design that survives
// unchanged in mechanism, only in wording. A row announced only "Auth0
// auth-legacy" to a screen reader tabbing button to button, with the status
// word nowhere in its accessible name or description -- found by a
// validation agent driving the built app, not by this test suite. The fix
// was, and remains, `aria-label` built explicitly from name/id/status word
// rather than left to the button's rendered content, because the button's
// rendered content is no longer just name+id now that the mark and the
// status sit inside it too, and `aria-label` overrides all of it for
// accessible-name purposes regardless. What changed is only the word's
// casing: it now reads "Phasing out"/"Deprecated" (`STATUS_WORDS` below,
// ServiceTile.tsx's own Title Case) rather than service-tags.ts's lower-case
// tag label ("phasing out"), because the word is printed on screen now too
// (decision 2 above reversed decision 1's old "no visual status mark") and
// a screen-reader user should hear the exact word a sighted reader sees, not
// a second vocabulary invented for the same fact. `tagsFor` has no caller
// left in this file as a result -- the status word comes from this file's
// own `STATUS_WORDS`, the same source the visible text uses, so the two can
// never drift apart.
//
// The replacement stays out of the accessible name, in `aria-describedby`
// instead, for the reason recorded when this was first built: it is not
// part of the control, so it does not belong in the control's name. That
// reasoning does not turn on which world drew the row, so it is kept rather
// than revisited.
import type { ViewService } from "@catalogus/cli";

import { buildMigrationDashboard, type MigrationRow } from "../migrations.js";
import { Icon } from "./Icon.js";
import { serviceNodeDomId } from "./ServiceNode.js";
import { STATUS_WORDS, StatusBadgeGlyph } from "./ServiceStatus.js";
import { monogramFor } from "./ServiceTile.js";
import styles from "./MigrationList.module.css";

/**
 * The two statuses migrations.ts ever hands this component -- `inFlight` is
 * always `phasing_out`, `overdue` is always `deprecated`. Narrower than
 * ServiceStatus.tsx's own `NonActiveStatus` on purpose: a `MigrationSection`
 * renders one status for every row it holds, so the status is a
 * section-level fact, not a per-row branch. It is still a subset of
 * `NonActiveStatus`, so a value typed this way indexes `STATUS_WORDS` and
 * passes to `StatusBadgeGlyph` without a cast.
 *
 * **2026-08-31: `STATUS_WORDS` and the badge glyph moved to
 * ServiceStatus.tsx.** Both used to be a narrowed duplicate of
 * ServiceTile.tsx's own private versions, kept as a copy rather than an
 * import because ServiceTile.tsx was off this slice's file list to edit and
 * exported neither. That is no longer true -- both are exported from the
 * shared module now, so this file imports rather than redraws them; the
 * `removed` case simply never reaches this component (migrations.ts's own
 * filter), so `MigrationStatus` stays the narrower two-value type it always
 * was.
 */
type MigrationStatus = "phasing_out" | "deprecated";

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
  /** Every row in this section shares this status -- migrations.ts's own split (`inFlight`/`overdue`), stated once here rather than re-derived per row. */
  status: MigrationStatus;
  rows: MigrationRow[];
  emptyMessage: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function MigrationSection({ sectionId, title, status, rows, emptyMessage, selectedId, onSelect }: MigrationSectionProps) {
  const headingId = `migration-section-${sectionId}`;
  const statusWord = STATUS_WORDS[status];

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 className={styles.title} id={headingId}>
          {title}
        </h2>
        {/* aria-hidden for the same reason BandModule.module.css's `.count` is: the heading beside it already names the section, and the rows below carry the real information. Coloured like BandModule's count now, not the signal colour -- see the file header's "exactly two places" note. */}
        <span className={styles.count} aria-hidden="true">
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className={styles.sectionEmpty}>{emptyMessage}</p>
      ) : (
        <ul className={styles.rows}>
          {rows.map((row) => {
            // The status word for the accessible name -- see the file
            // header's addendum. Built from this file's own STATUS_WORDS,
            // the same source the visible badge+word below reads, so the
            // two can never say different things.
            const accessibleName = [row.service.name, row.service.id, statusWord].filter(Boolean).join(", ");
            const isFallback = row.service.icon === null;

            return (
              <li key={row.service.id} className={styles.row}>
                {/* A real button, like ServiceTile: keyboard operability and the
                    accessible name come from native semantics, not a hand-rolled
                    click handler. Only the row's own service is selectable here --
                    the replacement is a fact beside it, not a second selection
                    target, so the row keeps the single onSelect(id) contract every
                    other view uses.

                    It carries `serviceNodeDomId` for the same reason it always
                    has: App.tsx restores focus on panel close by looking that id
                    up, and a row without one drops focus to `<body>` in this view
                    and only this view -- the regression docs/PLAN.md already
                    records once. Only one view renders at a time, so the id stays
                    unique across the page.

                    `aria-label` is the status word's carrier -- see the file
                    header's addendum. It overrides the button's rendered content
                    for accessible-name purposes, which is why the mark and the
                    status glyph inside it are aria-hidden: nothing in the button
                    needs to announce itself a second time. */}
                <button
                  type="button"
                  id={serviceNodeDomId(row.service.id)}
                  className={styles.service}
                  aria-pressed={row.service.id === selectedId}
                  aria-label={accessibleName}
                  aria-describedby={replacementDomId(row.service.id)}
                  onClick={() => onSelect(row.service.id)}
                >
                  {/* The mark: bare, no squircle -- see the file header's "no
                      radius survives the move" note. Every row here is
                      non-active by construction (migrations.ts's own filter),
                      so the desaturation ServiceTile applies conditionally is
                      unconditional in this file's stylesheet instead. */}
                  {/* D6: `styles.markFallback` only when there is no verified icon --
                      ServiceTile.tsx's own `squircleClassName` combines its `.fallback`
                      the same conditional way, for the same reason: the dashed/sunken
                      treatment belongs to the no-icon case alone, not to the mark in
                      general. */}
                  <span className={`${styles.mark} ${isFallback ? styles.markFallback : ""}`} aria-hidden="true" data-testid="mark">
                    {isFallback ? (
                      <span className={styles.monogram}>{monogramFor(row.service.service)}</span>
                    ) : (
                      <Icon icon={row.service.icon} rollup={row.service.rollup} label={row.service.name} colour />
                    )}
                  </span>

                  <span className={styles.identity}>
                    <span className={styles.name}>{row.service.name}</span>
                    <span className={styles.id}>{row.service.id}</span>
                  </span>

                  {/* Status signal, both halves: the badge glyph and the word,
                      the same two places DIRECTION.md licenses red for. */}
                  <span className={styles.status} aria-hidden="true" data-testid="status">
                    <StatusBadgeGlyph status={status} />
                    <span className={styles.statusWord}>{statusWord}</span>
                  </span>
                </button>

                {/* The replacement, as its own labelled fact -- geometry from
                    ServicePopover.module.css's `.facts` (dt caption, dd value),
                    the shape the brief points at for "a row of labelled
                    facts". Ink, never the signal colour, on every row
                    regardless of status -- the retired price-tag mapping's red
                    "new price" is gone along with the strike-through it paired
                    with (file header). */}
                <dl className={styles.fact}>
                  <dt className={styles.factLabel}>Replacement</dt>
                  <dd id={replacementDomId(row.service.id)} className={styles.factValue}>
                    {row.replacementLabel ? (
                      <>
                        {/* srOnly prefix so the description reads as a full
                            sentence on its own -- the caption beside it is
                            visible-only context, not part of what
                            aria-describedby exposes. Same device the previous
                            version of this file used, kept because the reasoning
                            for it (a bare name in the description has no
                            relationship attached) does not depend on which world
                            drew the row. */}
                        <span className={styles.srOnly}>replaced by </span>
                        <span className={styles.mono}>{row.replacementLabel}</span>
                      </>
                    ) : (
                      // Explicit and plain, not blank -- an absent replaced_by is
                      // an unanswered question, not an error (CLAUDE.md's "ask,
                      // never guess"; migrations.ts's own comment on
                      // `replacementLabel`).
                      <span className={styles.dim}>no replacement recorded</span>
                    )}
                  </dd>
                </dl>
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
        status="phasing_out"
        rows={inFlight}
        emptyMessage="Nothing is phasing out right now."
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <MigrationSection
        sectionId="overdue"
        title="Overdue"
        status="deprecated"
        rows={overdue}
        emptyMessage="Nothing is deprecated right now."
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  );
}
