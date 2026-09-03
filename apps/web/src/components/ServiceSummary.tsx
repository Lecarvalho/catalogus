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
// It renders no heading, no close button and no positioning. The caller owns
// all three, because a page wants its own answer to each and neither answer
// belongs to the facts.
import type { ViewService } from "@catalogus/cli";

import styles from "./ServiceSummary.module.css";

export interface ServiceSummaryProps {
  service: ViewService;
  dependsOn: string[];
  dependedOnBy: string[];
  labelForId: (id: string) => string;
}

export function ServiceSummary({ service, dependsOn, dependedOnBy, labelForId }: ServiceSummaryProps) {
  return (
    <div className={styles.summary}>
      <dl className={styles.facts}>
        <dt>Role</dt>
        <dd>{service.role}</dd>

        {service.kind !== "service" && (
          <>
            <dt>Kind</dt>
            <dd>{service.kind}</dd>
          </>
        )}

        {service.version && (
          <>
            <dt>Version</dt>
            <dd>{service.version}</dd>
          </>
        )}

        {service.added && (
          <>
            <dt>Added</dt>
            <dd>{service.added}</dd>
          </>
        )}

        {service.replaced_by && (
          <>
            <dt>Replaced by</dt>
            <dd>{labelForId(service.replaced_by)}</dd>
          </>
        )}
      </dl>

      {service.notes && <p className={styles.notes}>{service.notes}</p>}

      {(dependsOn.length > 0 || dependedOnBy.length > 0) && (
        <div className={styles.deps}>
          {dependsOn.length > 0 && (
            <p className={styles.depLine}>
              <span className={styles.depLabel}>Depends on</span>
              {dependsOn.map((id) => labelForId(id)).join(", ")}
            </p>
          )}
          {dependedOnBy.length > 0 && (
            <p className={styles.depLine}>
              <span className={styles.depLabel}>Depended on by</span>
              {dependedOnBy.map((id) => labelForId(id)).join(", ")}
            </p>
          )}
        </div>
      )}

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

          Drift note: `privateFlagRefusalMessage` in packages/cli's
          private-guard.ts is the sibling wording, shown when someone tries to
          *write* this data, and it names the same not-yet-real command. No
          test ties the two together -- they are different sentences in
          different packages -- so a rename of `push --private` has to be
          applied in both places by hand. */}
      {service.kind === "service" && (
        <section className={styles.overlay}>
          <h3 className={styles.overlayHeading}>Cost &amp; account</h3>
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
