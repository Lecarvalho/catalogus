// The brand page: what a multi-entry tile on the wall opens, in place of a
// single entry's own page. Pure, same shape as ServicePage.tsx.
//
// Owner decisions, 2026-09-04 (docs/PLAN.md, "Owner decisions -- 2026-09-04",
// findings 4 and 5 of 2026-09-03, and docs/brand-tile-brief.md, Part B): a
// band collapses repeated entries of one vendor into one tile (bands.ts's
// `collapseByService`, given a caller again by this slice); clicking that
// tile opens this page rather than an entry's own, because "Fly.io" standing
// for five deployments is not one document to read, it is an index of five.
// A single-entry tile still opens its entry's own page directly and never
// reaches this component at all.
//
// The mockup is the specification for what it draws:
// apps/web/docs/candidates/candidate-e-brandpage.html, artboard 2, approved
// 2026-09-04. The shape is the entry page's own frame (ServicePage.tsx) with
// the two per-entry things removed: breadcrumb, bare mark, name, catalog
// slug, then Kind / Band / Entries once as a fact grid in the header --
// and, below, an "Entries" section listing every entry as a link to its own
// page (id, role, status, version). No document column and no facts aside:
// there is no per-brand writing to hold (Layer 3 is per entry, ServicePage's
// own job). No Layer-3 cost/account block either -- HANDOFF.md's 2026-08-23
// amendment settled that only a service *entry* row can carry a cost or an
// account reference, so that block lives on each entry's own page
// (ServiceSummary.tsx) and never here (mockup's own comment, artboard 2:
// "no facts aside... the Layer 3 block is per entry").
//
// What the mockup leaves silent, and the convention this file follows for
// each:
//
//   - **Kind, shown once.** `VendorGroup` carries no `kind` of its own --
//     `bands.ts`'s own `collapseByService` comment guarantees only name,
//     icon and rollup are identical across a group's entries ("the first
//     entry is not a sample, it is any of them"), not `kind`, which is a
//     per-entry manifest field. The mockup's own comment (artboard 2) says
//     the brand page draws the "once" form because every entry in its
//     fixture shares one kind, and leaves a group whose entries *differ* in
//     kind as an explicitly open question with no fixture to build against.
//     This file takes the first entry's kind, the same convention
//     `collapseByService` already applies to name and icon, and states the
//     assumption here rather than resolving the open question silently
//     (CLAUDE.md, "ask, never guess").
//   - **"Not tracked" for a missing version.** The brief's own prose says
//     this reads the way `ServiceSummary` does it; `ServiceSummary.tsx`
//     actually *omits* the Version row outright when it is absent, and it is
//     `ServicePopover.module.css`'s `.dim` treatment -- a cell always
//     present, dimmed when empty -- that the mockup's own markup draws for
//     this page (`<span class="dim">not tracked</span>` on every entry
//     row). Built to what the mockup draws, per this brief's own opening
//     rule, and this discrepancy is named rather than left to be found
//     later.
//   - **The Status column is always stated, including "Active".** Unlike
//     the tile and the popover, where the norm earns no mark at all
//     (service-tags.ts's whole point), this is a labelled table column with
//     a header -- the mockup's own comment (artboard 2, decision 5) draws
//     the line: "a column with a header is a labelled fact", the same
//     reasoning that already keeps this column in ink rather than the
//     signal colour.
import type { Ref } from "react";
import type { ViewService } from "@catalogus/cli";

import type { BandDefinition, VendorGroup } from "../bands.js";
import { hashForServiceId } from "../hash-route.js";
import { Icon } from "./Icon.js";
import { STATUS_WORDS } from "./ServiceStatus.js";
import styles from "./BrandPage.module.css";

export interface BrandPageProps {
  group: VendorGroup;
  band: BandDefinition;
  /** Project name, for the breadcrumb back to the board. */
  projectName: string;
  /**
   * Server-stamped moment the manifest was read, from the payload --
   * accepted for shape parity with `ServicePageProps` (both read off the
   * same payload) but not consulted by this component: candidate E's
   * brand-page mockup draws no recency mark anywhere on this page, the same
   * silence `ServiceTile.tsx` already notes for its own identical prop.
   */
  readAt: string;
  /** Back to the board. */
  onBack: () => void;
  /** Opens one entry's own page, at #/service/<id> (hash-route.ts). */
  onOpenEntry: (id: string) => void;
  /**
   * Imperative focus handle for App.tsx, the same mechanism and the same
   * reason as `ServicePage`'s own `pageRef`: it moves focus into the page
   * when one opens and needs a target this file's own markup supplies.
   */
  pageRef?: Ref<HTMLElement>;
}

const headingId = (service: string) => `brand-page-heading-${service}`;

/**
 * The status word, ink, for the entries table's Status column -- always
 * present, unlike the tile and the popover. `STATUS_WORDS`
 * (ServiceStatus.tsx) covers the three non-active statuses only, because
 * every other surface that reads it treats the norm as unworded; "Active"
 * is supplied here, once, for the one surface on this page that must still
 * say it.
 */
function statusLabel(status: ViewService["status"]): string {
  return status === "active" ? "Active" : STATUS_WORDS[status];
}

export function BrandPage({ group, band, projectName, onBack, onOpenEntry, pageRef }: BrandPageProps) {
  // Every entry in a group resolves the same catalog row for the same
  // reason `known` is uniform across it: both come from one server-side
  // lookup keyed on `group.service`, the slug every entry shares -- see the
  // file header for the one field (`kind`) that lookup does not cover.
  const [firstEntry] = group.entries;

  return (
    <article className={styles.page} aria-labelledby={headingId(group.service)} tabIndex={-1} ref={pageRef}>
      {/*
        A real back control, not just the browser's -- this page is
        reachable by deep link (#/brand/<band>/<service>), so a reader can
        arrive here with no history to go back through. Same control as
        ServicePage's own breadcrumb.
      */}
      <nav className={styles.breadcrumb}>
        <button type="button" className={styles.back} onClick={onBack}>
          <span aria-hidden="true">&larr;</span> {projectName}
        </button>
      </nav>

      <header className={styles.header}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon icon={group.icon} rollup={group.rollup} label={group.name} colour />
        </span>

        <div className={styles.identity}>
          <h1 id={headingId(group.service)} className={styles.name}>
            {group.name}
          </h1>
          {/*
            The catalog slug: the group's own identity (bands.ts's
            VendorGroup.service), mono because it is the literal a
            `catalogus add`/`catalogus set` command names -- the same reason
            ServicePage's own .id line is mono.
          */}
          <p className={styles.slug}>{group.service}</p>

          {/*
            An uncatalogued slug is stated rather than hidden, exactly as
            ServicePage does it for one entry: the display name is the raw
            slug and there is no verified brand mark, which is a gap in the
            catalog the owner can close, not a property of their project.
          */}
          {!firstEntry.known && <p className={styles.uncatalogued}>No catalog entry for this slug.</p>}

          <dl className={styles.facts}>
            <div>
              <dt>Kind</dt>
              <dd>{firstEntry.kind}</dd>
            </div>
            <div>
              <dt>Band</dt>
              <dd>{band.label}</dd>
            </div>
            <div>
              <dt>Entries</dt>
              <dd>{group.entries.length}</dd>
            </div>
          </dl>
        </div>
      </header>

      {/*
        D3, 2026-09-04: `.doc` carries the mockup's own `.page-doc` measure
        (68ch, artboard 2) -- see BrandPage.module.css's own comment on that
        rule for the validator's numbers. Without it this section had no
        width of its own and stretched to the page's full measure.
      */}
      <section className={styles.doc}>
        <h2 className={styles.entriesHeading}>Entries</h2>
        <div className={styles.rows}>
          <div className={`${styles.row} ${styles.rowHead}`}>
            <span>Id</span>
            <span>Role</span>
            <span>Status</span>
            <span>Version</span>
          </div>
          {group.entries.map((entry) => (
            <a
              key={entry.id}
              className={styles.row}
              href={hashForServiceId(entry.id)}
              onClick={(event) => {
                // A real link -- reachable by Tab, carries a real href a
                // reader can copy or open in a new tab -- but this app's own
                // navigation goes through App.tsx's `handleSelect`
                // (history.replaceState, not a pushed entry -- see App.tsx's
                // own comment on why), so the default navigation is stopped
                // and routed through the same callback prop every other
                // click-to-open control in this app already uses.
                event.preventDefault();
                onOpenEntry(entry.id);
              }}
            >
              <span className={styles.id}>{entry.id}</span>
              <span>{entry.role}</span>
              <span>{statusLabel(entry.status)}</span>
              <span>{entry.version ?? <span className={styles.dim}>not tracked</span>}</span>
            </a>
          ))}
        </div>
      </section>
    </article>
  );
}
