// Pure. `status` is always one of the four schema values (ViewPayload
// already defaults it -- see view-payload.ts) so this never has to guess
// what an omitted status means; it only has to render one.
//
// Both lookups below are keyed by a value that originates in a manifest,
// which in this repo is the defect class with the worst record: a plain
// object literal read with a manifest-derived key resolves through
// Object.prototype, so a key like "constructor" comes back as the `Object`
// function -- truthy, so every `??` fallback is skipped, and React is handed
// a function to render. It has landed three times already
// (getCatalogEntry, then GLYPHS, which blanked the entire viewer with no
// error UI, then ROLLUP_LABELS, caught just before shipping), and every
// existing test passed each time, because the tests named keys that were
// *absent* rather than *inherited* -- those are different things and only
// one of them is a bug.
//
// This one was the last instance left and was recorded as safe rather than
// fixed, on the grounds that `status` is a schema enum and `catalogus view`
// refuses to serve an invalid manifest. That reasoning is correct and it is
// still a guard one layer away from the bug rather than an absence of it:
// it holds only for as long as every caller of this component comes through
// a validated payload, which is a property of the rest of the app, not of
// this file. CLAUDE.md's standing rule after the third instance was that any
// keyed lookup gets Object.create(null) and a test naming "constructor", so
// it gets both, and stops depending on an argument.
import styles from "./StatusPill.module.css";

export interface StatusPillProps {
  status: "active" | "phasing_out" | "deprecated" | "removed";
}

const LABELS: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, {
  active: "active",
  phasing_out: "phasing out",
  deprecated: "deprecated",
  removed: "removed",
});

export function StatusPill({ status }: StatusPillProps) {
  // `styles` is a CSS Modules object produced by the bundler, not a literal
  // written here, so it is not this file's to rebuild on a null prototype --
  // hence the explicit own-property test rather than a bare `styles[status]`,
  // which would inherit from Object.prototype exactly as LABELS used to.
  const statusClass = Object.prototype.hasOwnProperty.call(styles, status) ? styles[status] : "";
  return <span className={`${styles.pill} ${statusClass ?? ""}`}>{LABELS[status] ?? status}</span>;
}
