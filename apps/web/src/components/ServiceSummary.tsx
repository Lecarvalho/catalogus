// Everything known about one manifest entry, as a body with no chrome of its
// own. Pure.
//
// This was the body of `ServiceDetailPanel`, lifted out on 2026-08-25 so that
// two surfaces could render it without one of them reimplementing it: the
// hover popover, and the service page. The owner's instruction was that the
// panel *is* the popover -- "instead of showing the actual popover, show
// this very panel" -- and the way to honour that without ending up with two
// divergent renderings of the same facts was for there to be one.
//
// **That sharing did not survive candidate E.** ServicePopover.tsx's header
// records the ruling: candidate E's own six-fact popover (Role, Kind,
// Version, Status, Dependents in, Dependencies out) is a different
// arrangement of a different subset of facts from this component's, built
// directly in ServicePopover.tsx rather than through this one. ServicePage
// is this component's only caller now.
//
// **`compact` is gone as of 2026-08-31, following this file's own standing
// instruction below it while it still had the prop:** "if it still has no
// caller when the page ships, delete it rather than leave a flag nobody
// exercises." A grep across apps/web/src at the time ServicePage moved into
// candidate E found exactly one caller passing it -- this file's own test --
// so the flag was never exercised by production code and is deleted rather
// than migrated. Notes and the Layer 3 block render unconditionally now,
// governed only by `service.notes` and `service.kind === "service"`.
//
// It renders no chrome of its own -- no heading, no close button, no
// positioning, no outer padding -- because the caller owns all of that, and a
// page wants its own answer to each rather than one this file bakes in.
//
// ---
//
// **Redesigned 2026-09-04** for the entry page's side panel
// (docs/candidates/candidate-e-brandpage.html, artboard 3, decision 6 of the
// file's leading comment: "the summary's sections stacked top to bottom under
// rail-style headings and dividers, the facts inside set in the popover's own
// grid, the Layer 3 block sunken"). Three structural changes, none of them a
// content change -- every fact this file showed before it still shows, the
// same guards govern the same rows (Kind and Version still omit rather than
// state "not tracked", ServiceSummary's own behaviour, kept on the mockup's
// own instruction: "Kind and Version keep ServiceSummary's own
// omit-when-default behaviour"):
//
//   1. Every section now carries a heading -- "Facts", "Notes", "Depends
//      on · N", "Depended on by · N", "Cost & account" -- styled and spaced
//      exactly as Rail.module.css's own `.heading` (11px bold caps, 0.04em,
//      10px under), because the mockup's own words are "rail-style headings".
//      "Cost & account" used to be this file's only heading, an `<h3>`; it is
//      a plain `<div>` now, demoted to match the four new ones rather than
//      left the odd one out -- the panel has one heading style, the rail's,
//      not two.
//   2. The Facts grid moves from a label-left, 84px-column single-column list
//      (this file's own invention, ServiceSummary.module.css's now-deleted
//      comment on where the 84px came from) to the popover's own two-column,
//      label-above-value grid -- ServicePopover.module.css's `.facts` /
//      `.facts > div` / `.facts dt` / `.facts dd`, read and reused rather than
//      imported (CSS Modules hash per file). The mockup's own markup makes
//      the source explicit: the panel's Facts section is literally
//      `<dl class="pop-facts">`.
//   3. The two edge lists move from one comma-joined paragraph each to one
//      line per entry, and each section is now independently gated and
//      independently headed -- "Depends on" and "Depended on by" no longer
//      share one wrapping guard, because each now owns its own divider and
//      its own count in its own heading, and a shared guard would draw a
//      divider in front of an empty section.
//
// **What the mockup draws that this does not reproduce, and why.** Every
// `.facts-list a` in the mockup is a link, mono id then dimmed name in two
// spans, to that dependency's own page. This component cannot draw that: it
// receives `dependsOn` / `dependedOnBy` as raw ids and `labelForId`, which
// resolves an id to one combined string, `"<id> (<Name>)"` (App.tsx's
// `deriveEdgeMaps`) -- there is no id and name apart to put in two spans, and
// splitting the combined string back apart by parsing App.tsx's own template
// literal is reconstructing data this component was not given, which is the
// defect class CLAUDE.md names. What ships is one line per entry, in the
// note's own type (--text-pop-note / --leading-pop-note, "the edge lists one
// per line at the same size" is the mockup's own phrase for reusing it),
// plain text -- not a link -- with the choice named here rather than guessed
// at. Turning these into real links is a follow-on pass that changes what
// `labelForId` returns or adds a second, id-preserving callback; neither is
// this file's prop shape to invent, and Part A's own App.tsx is out of this
// brief's scope to edit for it.
import { Fragment, type ReactNode } from "react";
import type { ViewService } from "@catalogus/cli";

import styles from "./ServiceSummary.module.css";

export interface ServiceSummaryProps {
  service: ViewService;
  dependsOn: string[];
  dependedOnBy: string[];
  labelForId: (id: string) => string;
}

/** One heading-and-body section of the panel, in render order. */
interface Section {
  heading: string;
  body: ReactNode;
}

export function ServiceSummary({ service, dependsOn, dependedOnBy, labelForId }: ServiceSummaryProps) {
  // "Facts" is always first and always present -- Role has no guard, unlike
  // every other row in it -- so it never needs to ask whether it is the
  // section before it: it never is one.
  const sections: Section[] = [
    {
      heading: "Facts",
      body: (
        <dl className={styles.facts}>
          <div>
            <dt>Role</dt>
            <dd>{service.role}</dd>
          </div>

          {service.kind !== "service" && (
            <div>
              <dt>Kind</dt>
              <dd>{service.kind}</dd>
            </div>
          )}

          {service.version && (
            <div>
              <dt>Version</dt>
              <dd>{service.version}</dd>
            </div>
          )}

          {service.added && (
            <div>
              <dt>Added</dt>
              <dd>{service.added}</dd>
            </div>
          )}

          {service.replaced_by && (
            <div>
              <dt>Replaced by</dt>
              <dd>{labelForId(service.replaced_by)}</dd>
            </div>
          )}
        </dl>
      ),
    },
  ];

  // Quoted the way ServicePopover.module.css's own `.note` quotes the same
  // field on the same entry -- the two surfaces state one fact and now agree
  // on how they punctuate it, where before this file stated it bare.
  if (service.notes) {
    sections.push({ heading: "Notes", body: <p className={styles.note}>&ldquo;{service.notes}&rdquo;</p> });
  }

  if (dependsOn.length > 0) {
    sections.push({
      heading: `Depends on · ${dependsOn.length}`,
      body: (
        <div className={styles.list}>
          {dependsOn.map((id) => (
            <p key={id} className={styles.edge}>
              {labelForId(id)}
            </p>
          ))}
        </div>
      ),
    });
  }

  if (dependedOnBy.length > 0) {
    sections.push({
      heading: `Depended on by · ${dependedOnBy.length}`,
      body: (
        <div className={styles.list}>
          {dependedOnBy.map((id) => (
            <p key={id} className={styles.edge}>
              {labelForId(id)}
            </p>
          ))}
        </div>
      ),
    });
  }

  return (
    <div className={styles.summary}>
      {sections.map((section, index) => (
        <Fragment key={section.heading}>
          {/* No divider above the first section -- the panel's own outer
              padding (ServicePage.module.css's `.panel`) already supplies the
              air above it, the same way the rail's identity block sits
              directly on its own padding with no rule above it. */}
          {index > 0 && <div className={styles.divider} />}
          <div className={styles.heading}>{section.heading}</div>
          {section.body}
        </Fragment>
      ))}

      {/* Layer 3, and the whole of it for now is the absence. Cost, plan,
          renewal and account reference live in a private per-user overlay
          that never touches this repo (HANDOFF.md section 3); `catalogus
          view` serves the local manifest and has no other source, so there
          is no runtime check to make and nothing to sign in to. The wording
          deliberately says the overlay does not exist *yet* rather than
          offering a connect action -- Phase 4 is blocked on a decision, and
          an empty state that implies a button somewhere is the same class of
          plausible default this project keeps correcting.

          Only for `kind: "service"`. That is not a layout choice: HANDOFF.md's
          2026-08-23 amendment settled that only service rows can carry a cost
          or an account reference, so rendering this under a component or a
          stack would promise a field that is never coming. It is the mirror of
          the kind row above, which hides itself for exactly the default this
          one requires.

          No divider above it either -- its own top rule stands in for one
          (the mockup's own words: "the sunken block's own top rule stands in
          for a divider ... so two rules never sit 20px apart"), and it bleeds
          to the panel's own side edges rather than sitting inset with
          everything above it, because the panel stretches to fill the shell
          row and there is no foot for it to sit on (ServiceSummary.module.css's
          `.overlay`).

          Drift note: `privateFlagRefusalMessage` in packages/cli's
          private-guard.ts is the sibling wording, shown when someone tries to
          *write* this data, and it names the same not-yet-real command. No
          test ties the two together -- they are different sentences in
          different packages -- so a rename of `push --private` has to be
          applied in both places by hand. */}
      {service.kind === "service" && (
        <section className={styles.overlay}>
          <div className={styles.overlayHeading}>Cost &amp; account</div>
          <p className={styles.overlayState}>Not connected</p>
          <p className={styles.overlayBody}>
            Cost, plan, renewal and account reference are Layer 3: a private, per-user overlay that never touches this repo. Nothing is missing from the
            manifest -- the schema refuses this data on write.
          </p>
          <p className={styles.overlayBody}>
            The overlay does not exist yet. Once it does, <code className={styles.overlayCommand}>catalogus push --private</code> is what fills this.
          </p>
        </section>
      )}
    </div>
  );
}
