// Bands: the architecture-shaped grouping the project page reads on.
//
// The viewer used to render one heading per rollup, ordinal-sorted. Against
// the reference example that looked fine; against a real manifest it does
// not. Clapline's 35 services carry 32 distinct roles that produce **21
// rollup groups, 15 of them holding exactly one service** -- an alphabetical
// index where AI sits above AUTH above CDN above CI, an ordering that is
// `sort()` and nothing more. The owner's verdict on seeing it was that the
// viewer reads as poor and generic, and the diagnosis was that it answers
// "what is in this project, alphabetically" when the job is "what shape is
// this project" (PRODUCT.md's three jobs: orienting, handing over, portfolio).
//
// So a band is a coarse answer to *where a thing sits in the system*, and
// there are seven of them rather than twenty-one.
//
// **Bands key on `rollup`, never on the full `role`.** This is the load-
// bearing decision in this file and it is a deliberate refusal to be
// cleverer. The rollup is the documented, mechanical grouping key -- the
// segment of `role` before the first "-" (skills/catalogus/SKILL.md, "Naming
// a role"; computed server-side in @catalogus/cli's view-payload.ts, never
// re-derived here). Keying on it means the band follows the base word the
// manifest's author actually chose, and that a reader can predict which band
// an entry lands in without consulting this file.
//
// The cost is visible and accepted: Clapline's `hosting-monitoring` and
// `hosting-logs` are Fly apps that run Grafana and Loki, so a human would
// file them under WATCHED BY, and they land in SERVES REQUESTS because their
// base word is `hosting`. That is the *author's* categorisation showing
// through, which is the correct failure. The alternative -- a per-service
// table, or inferring the band from edges -- is a guess about intent wearing
// the costume of precision, and this project's standing rule (CLAUDE.md,
// "ask, never guess") is that a plausible-looking wrong answer is the worst
// outcome available. If the banding is wrong for an entry, the fix is
// `catalogus set services.<id>.role`, which corrects the manifest rather
// than teaching the viewer an exception.
//
// **The rollups below are copied from SKILL.md's base-word list, not
// invented.** Every service base word (`hosting` ... `coding-agent`) and
// every stack/component base word (`runtime`, `language`, `ui-framework`,
// `ingress-proxy`, `telemetry-transport`) has exactly one band. A rollup
// outside that list falls to `unplaced` and is rendered, labelled as
// unplaced, rather than being assigned a plausible band -- the same choice
// rollup-labels.ts makes when it renders an unknown rollup's raw text
// instead of printing "Other".
import type { ViewService } from "@catalogus/cli";

export type BandId =
  | "production"
  | "holds"
  | "calls"
  | "runs"
  | "watched"
  | "shipped"
  | "registered"
  | "unplaced";

export interface BandDefinition {
  id: BandId;
  /** Module header text. Reads as a sentence about the system, not as a taxonomy label. */
  label: string;
  /**
   * Shown under the header when the band has entries. One line, and only
   * where the band's membership is not self-evident from its own name --
   * an empty string renders nothing rather than a decorative subtitle.
   */
  note: string;
}

/**
 * Reading order, and it is the argument of the page: front door, then what
 * it keeps, then what it reaches for, then what it is made of, then what
 * watches it, then what builds it, then the paperwork. Someone who reads
 * top to bottom has been told how the system works in the order they would
 * ask.
 *
 * `unplaced` is last on purpose. It is empty for any manifest whose roles
 * follow the base-word convention, so it costs nothing on a well-formed
 * project and is impossible to miss on a malformed one.
 */
export const BANDS: readonly BandDefinition[] = [
  // Was `serves` / "Serves requests" until 2026-08-25. Renamed by the owner
  // after the real manifest showed what the rule actually collects: every
  // `hosting-*` role lands here, including the three Fly apps that run the
  // monitoring stack, and none of those serves a request. A per-service
  // exception was ruled out in the same decision -- the banding rule is
  // mechanical and stays that way, so the label has to be true of everything
  // deployed and reachable rather than of the common case.
  { id: "production", label: "Runs in production", note: "" },
  { id: "holds", label: "Holds data", note: "" },
  { id: "calls", label: "Calls out to", note: "Third-party capabilities this project invokes." },
  { id: "runs", label: "Runs on", note: "" },
  { id: "watched", label: "Watched by", note: "" },
  { id: "shipped", label: "Built and shipped by", note: "" },
  { id: "registered", label: "Registered at", note: "" },
  {
    id: "unplaced",
    label: "Unplaced",
    // States the mechanism rather than apologising: the reader needs to know
    // this is a vocabulary miss they can fix, not a bug in the viewer.
    note: "These roles are not in SKILL.md's base-word list, so this view has no band for them.",
  },
];

/**
 * rollup -> band. Null-prototype, and every keyed lookup in this repo now is,
 * for the reason recorded at CATALOGUS_CATALOG, GLYPHS, ROLLUP_LABELS and
 * StatusPill's LABELS: the schema's slug pattern admits `constructor` as a
 * legal role, so a plain object literal would resolve `BAND_OF["constructor"]`
 * through Object.prototype to the `Object` function -- truthy, so a naive
 * `?? "unplaced"` fallback would never fire. That exact shape blanked this
 * viewer once already (see fallback-icons.tsx).
 */
const BAND_OF: Record<string, BandId> = Object.assign(Object.create(null) as Record<string, BandId>, {
  // The front door, the tier that answers it, and anything else deployed.
  ingress: "production",
  cdn: "production",
  hosting: "production",
  auth: "production",

  // What the project keeps. `secrets` sits here rather than under RUNS ON
  // because a secrets manager is a store the app reads at runtime, which is
  // the same relationship `database` has.
  database: "holds",
  storage: "holds",
  cache: "holds",
  search: "holds",
  queue: "holds",
  secrets: "holds",

  // Capabilities the code calls rather than infrastructure it stands on.
  ai: "calls",
  payments: "calls",
  email: "calls",
  sms: "calls",

  // What the code is written in and runs inside -- mostly `kind: stack`.
  runtime: "runs",
  language: "runs",
  ui: "runs",

  // Observability, including the transport that carries it.
  monitoring: "watched",
  logs: "watched",
  analytics: "watched",
  telemetry: "watched",

  // Everything between a keystroke and production, agents included: SKILL.md
  // fixes every coding agent at `coding-agent`, which rolls up to `coding`.
  vcs: "shipped",
  ci: "shipped",
  coding: "shipped",
  pm: "shipped",

  // The paperwork that makes the front door reachable by name.
  dns: "registered",
  registrar: "registered",
});

/** The band a rollup belongs to, or `unplaced` when the base-word list has no row for it. */
export function bandOf(rollup: string): BandId {
  return BAND_OF[rollup] ?? "unplaced";
}

export interface BandGroup {
  band: BandDefinition;
  services: ViewService[];
}

/** Ordinal compare (plain `<`), not a locale-aware collation -- matches group-services.ts and @catalogus/cli's workspace-scan.ts, for the same reason: stable regardless of the host's ICU data. */
function ordinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Groups services into bands, in BANDS order, dropping bands nothing lands
 * in. Entries within a band sort by `id` -- the one field @catalogus/schema
 * guarantees unique within a manifest, so the order is stable even when two
 * entries share a role or a display name (Clapline's two Supabase entries
 * both render as "Supabase").
 *
 * Empty bands are dropped rather than rendered empty: a project with no
 * queue should not be shown a hole where a queue would go. That is the same
 * reasoning as omitting an unanswered field rather than writing a plausible
 * default (CLAUDE.md) -- an absent band says "not applicable here", a
 * rendered empty one would say "you are missing this".
 */
export function groupIntoBands(services: readonly ViewService[]): BandGroup[] {
  const byBand = new Map<BandId, ViewService[]>();
  for (const service of services) {
    const id = bandOf(service.rollup);
    const existing = byBand.get(id);
    if (existing) {
      existing.push(service);
    } else {
      byBand.set(id, [service]);
    }
  }

  return BANDS.flatMap((band) => {
    const list = byBand.get(band.id);
    if (!list || list.length === 0) return [];
    return [{ band, services: [...list].sort((a, b) => ordinal(a.id, b.id)) }];
  });
}

export interface VendorGroup {
  /** The catalog slug every entry in this group shares -- the group's identity. */
  service: string;
  /** Catalog display name, taken from the first entry; every entry in a group shares it. */
  name: string;
  /** simple-icons path data, or null. Shared for the same reason. */
  icon: string | null;
  /** The brand's own colour, or null. Non-null exactly when `icon` is. */
  iconHex: string | null;
  /** Rollup of the first entry, used only to pick a fallback glyph. */
  rollup: string;
  /**
   * Every manifest entry this tile stands for, in stable id order.
   *
   * Typed as a non-empty tuple rather than an array with a comment promising
   * it is non-empty. A group is only ever built from at least one entry --
   * it is keyed off entries that exist -- and the tuple is what lets
   * `entries[0]` be read without a guard that could never fire. With
   * `noUncheckedIndexedAccess` on, the array version made four call sites
   * test for an absence the data model forbids, which is exactly the kind of
   * defensive branch nobody can ever write a test for.
   */
  entries: [ViewService, ...ViewService[]];
}

/**
 * The four statuses in ascending order of "a reader needs to know about
 * this". A collapsed tile takes the most consequential status among the
 * entries it stands for, so a Fly.io tile covering three live apps and one
 * deprecated one is marked deprecated rather than silently reading as fine.
 *
 * Ranking the wrong way round -- taking the *majority* status, or the first
 * entry's -- would let a board hide exactly the entry a reader opened it to
 * find, which is the failure mode the whole tag vocabulary exists to avoid.
 */
const STATUS_SEVERITY = new Map<string, number>([
  ["active", 0],
  ["removed", 1],
  ["phasing_out", 2],
  ["deprecated", 3],
]);

/**
 * Collapses a band's entries so one vendor renders as one tile.
 *
 * Owner decision, 2026-08-25: the board is "a collection of icons", and
 * repeating a vendor is not the right approach -- Clapline runs four Fly.io
 * entries and rendering four identical marks says "Fly.io" four times to
 * say one thing. One tile per vendor; the entries behind it are what the
 * popover and the page show.
 *
 * **Collapsing is per band, never global**, and that is the constraint that
 * makes it correct rather than merely tidier. Supabase is `supabase-auth`
 * (role `auth`, so band "Runs in production") and `supabase-db` (role
 * `database`, so band "Holds data"). Collapsing across bands would render
 * one Supabase tile and force it into one band, which would state that
 * Supabase does one job in this project when the manifest says it does two.
 * Two tiles in two bands is the truth, and each collapses only what is
 * genuinely the same job.
 *
 * Keyed on `service` -- the catalog slug -- rather than on the display name,
 * because the slug is the identity and the name is a rendering of it. Two
 * different slugs that happen to share a display name are two vendors.
 *
 * A Map, not a keyed object literal: `service` is manifest-derived and
 * `service: constructor` is schema-valid. Fifth instance of that class in
 * this repo; see StatusPill.tsx.
 */
export function collapseByService(services: readonly ViewService[]): VendorGroup[] {
  const byService = new Map<string, ViewService[]>();
  for (const service of services) {
    const existing = byService.get(service.service);
    if (existing) {
      existing.push(service);
    } else {
      byService.set(service.service, [service]);
    }
  }

  const groups = [...byService.entries()].map(([slug, list]): VendorGroup => {
    const sorted = [...list].sort((a, b) => ordinal(a.id, b.id));
    // The Map only ever holds keys that were created by pushing an entry, so
    // `sorted` is non-empty by construction; this narrows it to the tuple the
    // type declares rather than asserting past the checker.
    const [first, ...rest] = sorted as [ViewService, ...ViewService[]];
    // Every entry sharing a slug resolves the same catalog row, so name, icon
    // and fallback glyph are identical across the group -- the first entry is
    // not a sample, it is any of them.
    return { service: slug, name: first.name, icon: first.icon, iconHex: first.iconHex, rollup: first.rollup, entries: [first, ...rest] };
  });

  // Sorted on the slug rather than the display name: stable, and it matches
  // every other ordering in this app, which sorts on identity not on label.
  groups.sort((a, b) => ordinal(a.service, b.service));
  return groups;
}

/**
 * The status a collapsed tile shows: the most consequential among its
 * entries. For a single-entry group this is just that entry's status.
 */
export function groupStatus(group: VendorGroup): ViewService["status"] {
  let worst: ViewService["status"] = group.entries[0].status;
  for (const entry of group.entries) {
    if ((STATUS_SEVERITY.get(entry.status) ?? 0) > (STATUS_SEVERITY.get(worst) ?? 0)) {
      worst = entry.status;
    }
  }
  return worst;
}

/**
 * Inbound edge count per service id -- how many things depend on it.
 *
 * This is the number the list view had no way to show, and its absence is
 * why 35 services all looked equally important: Clapline's `fly-api` is
 * depended on by fourteen entries and `namecheap-registrar` by none, and the
 * old compact node rendered them identically. Counted from the payload's
 * flat edge list rather than stored, because the manifest has no such field
 * and inventing one would be a schema change to hold a derived number.
 *
 * A Map, not a keyed object literal, for the `constructor` reason above --
 * and here it genuinely bites, because these keys are service ids straight
 * out of the manifest and `id: constructor` is schema-valid.
 */
export function dependentCounts(edges: readonly { from: string; to: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  }
  return counts;
}

/**
 * The most depended-on services, descending, at most `limit` of them, and
 * never anything with no dependents at all -- a rank list padded with zeroes
 * would imply an ordering the data does not support.
 *
 * Ties break on `id` so the order is reproducible; without it, two services
 * with four dependents each would swap places between renders depending on
 * Map iteration order, which is insertion order, which is edge order.
 */
export function mostDependedOn(
  services: readonly ViewService[],
  edges: readonly { from: string; to: string }[],
  limit: number,
): { service: ViewService; count: number }[] {
  const counts = dependentCounts(edges);
  return services
    .map((service) => ({ service, count: counts.get(service.id) ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => (b.count - a.count) || ordinal(a.service.id, b.service.id))
    .slice(0, limit);
}
