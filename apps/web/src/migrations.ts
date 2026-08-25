// Pure derivation of the migration dashboard's two sections, kept out of any
// component so it's testable without jsdom or React at all -- same shape as
// group-services.ts, and for the same reason.
//
// The dashboard lists the lifecycle tail that still needs a decision:
// `phasing_out` (in flight) and `deprecated` (overdue). `removed` is not
// listed -- that migration is finished, there is nothing left to decide --
// and `active` never enters a migration conversation at all (docs/PLAN.md's
// Phase 3.7, scope widened 2026-08-25).
//
// HANDOFF.md section 4.2 query 4 asks for "all edges/nodes marked
// phasing_out, with their replaced_by targets". Only the nodes half is
// answerable from a manifest: an edge carries no status. The manifest's
// object edge form allows `from`, `to` and `notes` and nothing else
// (@catalogus/schema's dependencyEdgeObject), and by the time an edge
// reaches this app it is `{from, to}` (ViewPayload in @catalogus/cli's
// view-payload.ts), so there is nothing to read the HANDOFF DB model's
// `service_dependencies.status` off of. This module derives rows for nodes
// only; it does not invent an edge status to cover the other half of the
// query, and the other half stays uncovered until Layer 2 grows a field for
// it.
import type { ViewService } from "@catalogus/cli";

export interface MigrationRow {
  service: ViewService;
  /**
   * The label of the `replaced_by` target, in the same "id (name)" -- or
   * bare-id-on-a-dangling-reference -- form App.tsx's `deriveEdgeMaps`
   * builds for the rest of the app. Built locally from the same services
   * list rather than by threading that function in, so this module stays
   * dependency-free and testable the way group-services.ts is; the format
   * matches on purpose, not by coincidence.
   *
   * `null` is not an error and not "not found" -- it is the explicit case
   * where the manifest records no replacement at all, which is the most
   * important row on the board: a migration with no destination
   * (CLAUDE.md: "an absent field reads as 'not answered yet'; a filled one
   * reads as an answer").
   */
  replacementLabel: string | null;
}

export interface MigrationDashboardData {
  /** Everything `status: phasing_out`, ordinal-sorted by id. */
  inFlight: MigrationRow[];
  /** Everything `status: deprecated`, ordinal-sorted by id. */
  overdue: MigrationRow[];
}

/** Ordinal compare (plain `<`), not a locale-aware collation -- matches the sort @catalogus/cli's workspace-scan.ts already uses, for the same reason: stable regardless of the host's ICU data. */
function ordinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * `id -> name` for every service in the manifest, so a `replaced_by` value
 * resolves to a label the same way App.tsx's `deriveEdgeMaps` resolves an
 * edge endpoint. A Map, not a keyed object literal: `replaced_by` is
 * manifest text, and a service id of `constructor` must not resolve through
 * Object.prototype -- the defect class this repo keeps producing
 * (group-services.ts's `duplicateNames` names it; CLAUDE.md records it).
 * Built once per call and threaded through, not rebuilt per row.
 */
function buildLabelForId(services: readonly ViewService[]): (id: string) => string {
  const nameById = new Map(services.map((service) => [service.id, service.name]));
  return (id: string) => {
    const name = nameById.get(id);
    return name ? `${id} (${name})` : id;
  };
}

function toRow(labelForId: (id: string) => string, service: ViewService): MigrationRow {
  return {
    service,
    replacementLabel: service.replaced_by ? labelForId(service.replaced_by) : null,
  };
}

/**
 * Splits the manifest's services into the two sections the migration
 * dashboard renders, each ordinal-sorted by id (see group-services.ts's
 * `groupByRollup` for why id, not name or role, is the stable sort key: it
 * is the one field @catalogus/schema guarantees unique).
 */
export function buildMigrationDashboard(services: readonly ViewService[]): MigrationDashboardData {
  const labelForId = buildLabelForId(services);
  const inFlight = services.filter((service) => service.status === "phasing_out").sort((a, b) => ordinal(a.id, b.id));
  const overdue = services.filter((service) => service.status === "deprecated").sort((a, b) => ordinal(a.id, b.id));

  return {
    inFlight: inFlight.map((service) => toRow(labelForId, service)),
    overdue: overdue.map((service) => toRow(labelForId, service)),
  };
}
