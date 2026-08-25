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
import type { Ref } from "react";
import type { ViewService } from "@catalogus/cli";

import { Icon } from "./Icon.js";
import { ServiceSummary } from "./ServiceSummary.js";
import { StatusPill } from "./StatusPill.js";
import styles from "./ServicePage.module.css";

export interface ServicePageProps {
  service: ViewService;
  /** Project name, for the breadcrumb back to the board. */
  projectName: string;
  dependsOn: string[];
  dependedOnBy: string[];
  labelForId: (id: string) => string;
  onBack: () => void;
  /**
   * Imperative focus handle for App.tsx: it moves focus into the page when
   * one opens (click or deep link) and needs a target. Keeping the choice of
   * target here rather than having App.tsx reach into this component's DOM
   * keeps App.tsx's job "own the selection", not "know this markup".
   */
  pageRef?: Ref<HTMLElement>;
}

const headingId = (id: string) => `service-page-heading-${id}`;

export function ServicePage({
  service,
  projectName,
  dependsOn,
  dependedOnBy,
  labelForId,
  onBack,
  pageRef,
}: ServicePageProps) {
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
      </nav>

      <header className={styles.header}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon iconPath={service.icon} rollup={service.rollup} label={service.name} />
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
        </div>

        <StatusPill status={service.status} />
      </header>

      <div className={styles.columns}>
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

        <aside className={styles.facts}>
          <ServiceSummary service={service} dependsOn={dependsOn} dependedOnBy={dependedOnBy} labelForId={labelForId} />
        </aside>
      </div>
    </article>
  );
}
