// Viewer-side display labels for a rollup heading. `rollup` (the segment of
// `role` before the first "-", computed server-side -- see @catalogus/cli's
// view-payload.ts) is presentation-neutral by design: it groups a real
// manifest's roles, nothing more. Almost every rollup already reads fine as
// a heading on its own -- "hosting", "database" -- but `coding-agent` is the
// one two-word base word in SKILL.md's role vocabulary, and it rolls up to
// `coding`, which reads as a truncation rather than a word ("CODING" where
// every other heading is a whole one). This table exists to fix that one
// case, not to reinvent every heading; an entry whose label equals its
// rollup verbatim is here only because it is in-vocabulary, not because it
// needed changing.
//
// Deliberately not a schema change and not an exception to the one-line
// rollup rule (@catalogus/cli's rollupOf) -- presentation stays in
// presentation. And deliberately not exhaustive: seeded from the rollups
// examples/reference.catalogus.yaml actually uses plus the base-word
// vocabulary skills/catalogus/SKILL.md's "Naming a role" section documents
// (services and the stack/component base words alike). A rollup outside
// both lists renders its own raw text -- see rollupLabel below -- which is
// the correct behaviour for a role nobody has used yet, not a gap in this
// table.
//
// Built on a null-prototype record, not a plain `{}` literal, for the exact
// reason CATALOGUS_CATALOG (packages/core/src/catalog.ts) and GLYPHS
// (./fallback-icons.tsx) are: `rollup` is derived from `role`, and the
// schema's slug pattern (`^[a-z0-9]+(?:[_-][a-z0-9]+)*$`) admits
// "constructor" as a legal role. On a plain object literal,
// `ROLLUP_LABELS["constructor"]` resolves through Object.prototype to the
// `Object` function -- truthy, so a naive `?? rollup` fallback would never
// fire, and the heading would try to render a function instead of a
// string. Read fallback-icons.tsx's top comment for the fuller account of
// how this exact shape blanked the page once already.
const ROLLUP_LABELS: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, {
  // Service base words, examples/reference.catalogus.yaml plus SKILL.md's
  // "Naming a role" list.
  hosting: "Hosting",
  database: "Database",
  auth: "Auth",
  storage: "Storage",
  cache: "Cache",
  queue: "Queue",
  search: "Search",
  ai: "AI",
  payments: "Payments",
  email: "Email",
  sms: "SMS",
  monitoring: "Monitoring",
  logs: "Logs",
  analytics: "Analytics",
  dns: "DNS",
  registrar: "Registrar",
  cdn: "CDN",
  vcs: "VCS",
  ci: "CI",
  pm: "PM",
  secrets: "Secrets",
  // The rollups this table actually exists to fix: base words that are
  // themselves two words, so the "segment before the first -" rule cuts
  // mid-base-word and the key reads as a truncation rather than a name.
  // `coding-agent` was the one that prompted this table, but it is not the
  // only one and an earlier version of this comment claimed it was --
  // examples/reference.catalogus.yaml alone carries three more, and the
  // viewer rendered INGRESS and TELEMETRY, which is the same defect the
  // "coding" fix was written to prevent. The rule stays mechanical (see
  // SKILL.md's "the part before the first -"); the label is where the word
  // is made whole again.
  coding: "Coding agent",
  ingress: "Ingress proxy",
  telemetry: "Telemetry transport",
  ui: "UI framework",
  runtime: "Runtime",
  language: "Language",
});

/** A rollup's display label, or the raw rollup itself when this table names nothing for it -- never a placeholder like "Other" or "Unknown", which would claim knowledge this table doesn't have. */
export function rollupLabel(rollup: string): string {
  return ROLLUP_LABELS[rollup] ?? rollup;
}
