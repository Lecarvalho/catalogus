// One service, as a destination. Pure.
//
// This is what clicking a tile opens, and it replaces the board rather than
// sitting beside it. That is the whole difference between a panel and a page,
// and it is the difference the owner has been describing since the interview:
// a service is a thing you *go to* and read, not a set of fields that slides
// in over a list.
//
// It exists because leaving `ServiceDetailPanel` on the click path produced a
// visible defect once the same content became the hover popover -- hovering a
// tile and then clicking it showed the identical panel twice, once floating
// and once docked on the right. Two renderings of the same facts, on screen
// simultaneously.
//
// **What is deliberately not here: the page's actual content.** The Layer 3
// document -- the Stripe tax table, the reason an ingress is wired a
// particular way -- is the point of the product and it does not exist yet.
// Its storage is settled (Layer 3, edited in the browser, un-defers Phase 4)
// and its *content model* is explicitly an open question in PRODUCT.md. So
// this ships the shell and an empty state that says what is coming and what
// fills it, and invents nothing. An empty state that guessed at a structure
// would be the plausible default this project keeps correcting.
//
// ---
//
// Moved into candidate E (docs/candidates/candidate-e-homescreen.html,
// approved 2026-08-26) on 2026-08-31 -- see ServicePage.module.css's own
// header for what changed and why. This file's own JSX did not: the
// breadcrumb, header and two-column shape are the same structure, because
// candidate E's approved mockup shows the List view only and there is no
// service-page artifact to redesign against -- this is a move into an
// existing world's rules and tokens, not a new information architecture.
//
// ---
//
// **Split in two, 2026-09-04**, for the approved brand-page mockup
// (docs/candidates/candidate-e-brandpage.html, artboard 3, decision 6 of the
// file's leading comment): the facts move from a column beside the document
// to a panel docked to the right edge of the *shell row* -- a sibling of the
// board, not of this component's own document column, full row height, the
// rail's own mirror. A component cannot render a sibling of its own parent,
// so the facts left this component's JSX entirely: `ServicePage` now renders
// the breadcrumb, header and document column alone, and `ServicePagePanel`
// (below) renders the panel App.tsx mounts through `AppShell`'s new
// `sidePanel` slot. Both read the same `ViewService`, so they cannot
// disagree; App.tsx renders them as two calls rather than one, which is why
// this file's own props shed `dependsOn`, `dependedOnBy` and `labelForId` --
// `ServicePagePanel` takes those now, and this component never touched their
// values for anything but the facts column that just left it.
//
// This file does not wire that App.tsx call -- Part A owns App.tsx, and this
// brief is not the one editing it. ServicePage.test.tsx proves the split
// composes by rendering both halves together itself; the exact lines App.tsx
// needs are in the brief's own report.
import type { Ref } from "react";
import type { ViewService } from "@catalogus/cli";

import { tagsFor } from "../service-tags.js";
import { Icon } from "./Icon.js";
import { ServiceSummary } from "./ServiceSummary.js";
import { Tag } from "./Tag.js";
import styles from "./ServicePage.module.css";

export interface ServicePageProps {
  service: ViewService;
  /** Project name, for the breadcrumb back to the board. */
  projectName: string;
  /**
   * Server-stamped moment the manifest was read, from the payload. Every
   * recency mark on a screen measures from the same instant rather than from
   * whenever each component happened to render -- see service-tags.ts, which
   * takes it for exactly that reason and never calls `Date.now()`.
   */
  readAt: string;
  onBack: () => void;
  /**
   * Present only for an entry of a multi-entry group in its band -- the
   * shared contract three parallel briefs fixed on 2026-09-04. When set, the
   * breadcrumb gains a second crumb naming the brand and linking to `href`
   * (the mockup's own example: "Layout Stress / Fly.io"). `entryCount`
   * arrives in this shape but the crumb does not read it -- the mockup's own
   * crumb just names the brand ("Fly.io", not "Fly.io (5)") -- and it stays
   * in the type because the shared contract fixes one shape for both the
   * brief building the group and the one consuming it to agree on, not
   * because this component has a use for the number.
   */
  brand?: { name: string; entryCount: number; href: string };
  /**
   * Imperative focus handle for App.tsx: it moves focus into the page when
   * one opens (click or deep link) and needs a target. Keeping the choice of
   * target here rather than having App.tsx reach into this component's DOM
   * keeps App.tsx's job "own the selection", not "know this markup".
   */
  pageRef?: Ref<HTMLElement>;
}

const headingId = (id: string) => `service-page-heading-${id}`;

export function ServicePage({ service, projectName, readAt, onBack, brand, pageRef }: ServicePageProps) {
  const tags = tagsFor(service, readAt);

  return (
    <article className={styles.page} aria-labelledby={headingId(service.id)} tabIndex={-1} ref={pageRef}>
      {/*
        A real back control, not just the browser's. The page is reachable by
        deep link -- `#/service/<id>` is the address the CLI's own output and
        a copied URL both use -- so a reader can arrive here with no history
        to go back through.
      */}
      <nav className={styles.breadcrumb}>
        <button type="button" className={styles.back} onClick={onBack}>
          <span aria-hidden="true">&larr;</span> {projectName}
        </button>

        {/*
          The brand crumb, added 2026-09-04. A real link, not a button --
          unlike `onBack`, which asks App.tsx to restore board state, this is
          plain navigation to `brand.href`, the address `hashForBrand`
          builds, and the existing `hashchange` listener in App.tsx already
          knows how to route it. Same type as `.back` (--text-pop-label /
          --track-pop-label / --weight-bold, muted, ink on hover) -- the
          mockup's `.crumbs` states that styling on the whole crumb row, both
          crumbs alike, and this restates it on the second crumb rather than
          moving `.back`'s own rule, which stays the lower-risk edit.
        */}
        {brand && (
          <>
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <a className={styles.crumbBrand} href={brand.href}>
              {brand.name}
            </a>
          </>
        )}
      </nav>

      <header className={styles.header}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon icon={service.icon} rollup={service.rollup} label={service.name} colour />
        </span>

        <div className={styles.identity}>
          <h1 id={headingId(service.id)} className={styles.name}>
            {service.name}
          </h1>
          <p className={styles.id}>{service.id}</p>
          {/*
            An uncatalogued slug is stated rather than hidden: the display
            name is the raw slug and there is no verified brand mark, which
            is a gap in the catalog the owner can close, not a property of
            their project.
          */}
          {!service.known && <p className={styles.uncatalogued}>No catalog entry for this slug.</p>}

          {/*
            The marks sit with the name they describe, not opposite it. This
            was a `StatusPill` pinned to the header's far edge, which on a
            wide window put a solid red "PHASING OUT" block a thousand pixels
            away from the service it was about -- and put an "ACTIVE" block on
            the thirty-one entries in three that are simply normal.
            `service-tags.ts` settles both: one vocabulary, and the norm earns
            no mark. Recency and `kind` arrive with it, which is more than the
            pill could say and is the same set the popover already shows.
          */}
          {tags.length > 0 && (
            <p className={styles.tags}>
              {tags.map((tag) => (
                <Tag key={tag.id} tag={tag} />
              ))}
            </p>
          )}
        </div>
      </header>

      <div className={styles.document}>
        <h2 className={styles.documentHeading}>Documentation</h2>
        <p className={styles.documentEmpty}>Nothing written yet.</p>
        <p className={styles.documentBody}>
          This is where what you know about {service.name} in {projectName} lives — the things that took a day to work out and should
          never be worked out twice.
        </p>
        <p className={styles.documentBody}>
          Pages are Layer 3: private, per-user, and never committed to this repo. The store does not exist yet, so nothing here is
          editable and nothing is missing from your manifest.
        </p>
      </div>
    </article>
  );
}

export interface ServicePagePanelProps {
  service: ViewService;
  dependsOn: string[];
  dependedOnBy: string[];
  labelForId: (id: string) => string;
}

/**
 * The entry page's own facts, docked to the right edge of the rail-plus-board
 * row -- a flex sibling of `.board`, mounted through `AppShell`'s `sidePanel`
 * slot rather than nested inside `ServicePage`'s own article. See this file's
 * header for why the split exists and ServicePage.module.css's `.panel` for
 * the chrome (width, background, the rail's own inset, the left hairline)
 * that makes this read as the rail's mirror; `ServiceSummary` supplies the
 * content, unchanged in its own props from before the split.
 */
export function ServicePagePanel({ service, dependsOn, dependedOnBy, labelForId }: ServicePagePanelProps) {
  return (
    <aside className={styles.panel}>
      <ServiceSummary service={service} dependsOn={dependsOn} dependedOnBy={dependedOnBy} labelForId={labelForId} />
    </aside>
  );
}
