// Everything known about one manifest entry, as a body with no chrome of its
// own. Pure.
//
// This was the body of `ServiceDetailPanel`, lifted out on 2026-08-25 so that
// two surfaces can render it without one of them reimplementing it: the hover
// popover, and the service page. The owner's instruction was that the panel
// *is* the popover -- "instead of showing the actual popover, show this very
// panel" -- and the way to honour that without ending up with two divergent
// renderings of the same facts is for there to be one.
//
// It renders no heading, no close button and no positioning. The caller owns
// all three, because a popover and a page want different answers to each and
// neither answer belongs to the facts.
import type { ViewService } from "@catalogus/cli";

import styles from "./ServiceSummary.module.css";

export interface ServiceSummaryProps {
  service: ViewService;
  dependsOn: string[];
  dependedOnBy: string[];
  labelForId: (id: string) => string;
  /**
   * `compact` drops the Layer 3 block and the notes paragraph.
   *
   * **Nothing passes it today.** I introduced it for the hover popover, on
   * the reasoning that a Layer 3 explanation identical on every service
   * buries the four facts a reader actually hovered for -- and the owner's
   * reference for that popover was a screenshot of the panel *including* that
   * block, so the brief won. It is kept because the argument for it is still
   * a real one and the service page may want the inverse of it later; if it
   * still has no caller when the page ships, delete it rather than leave a
   * flag nobody exercises.
   */
  compact?: boolean;
}

export function ServiceSummary({ service, dependsOn, dependedOnBy, labelForId, compact = false }: ServiceSummaryProps) {
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

      {!compact && service.notes && <p className={styles.notes}>{service.notes}</p>}

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
      {!compact && service.kind === "service" && (
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
