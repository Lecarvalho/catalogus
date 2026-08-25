// Builds the JSON payload `catalogus view`'s server hands to the browser
// (GET /api/project -- see commands/view.ts). This is the one place the
// manifest's own defaulting rules and the catalog's icon lookup are turned
// into a single flat shape a render layer can consume without importing
// @catalogus/schema or @catalogus/core itself -- the browser gets plain data,
// never ajv, and never the 5.2 MB simple-icons bundle (see @catalogus/core's
// icons.ts for why that resolution has to stay server-side).
//
// `kind` and `status` default the exact way commands/graph.ts already does
// (its descriptorText/statusText) -- this is deliberately not a second,
// independently-invented convention for "what does an omitted kind/status
// mean". If that ever needs to change, change it in both places or extract
// a shared helper; this file does not re-derive the rule from the schema
// description on its own.
import { edgeEndpoints, type CatalogusManifestV1, type ServiceEntry } from "@catalogus/schema";
import { getCatalogEntry, resolveIcon } from "@catalogus/core";

export interface ViewPayload {
  /** Absolute path of the manifest file being served. */
  manifestPath: string;
  /**
   * ISO timestamp of the moment the manifest was read -- once, at server
   * start (see commands/view.ts's own comment on why read-once is the
   * deliberate, safe choice). This field exists so the data can say it's a
   * snapshot; rendering it is the web UI's job, not this module's (G2,
   * Phase 3.7 hardening pass).
   */
  readAt: string;
  project: {
    name: string;
    slug: string;
    architecture?: string;
    /**
     * Repo visibility only, as of the 2026-08-24 schema amendment -- the VCS
     * provider is a service entry now (role: vcs), not a project field, so
     * it renders through `services`/`edges` like anything else with an
     * identity and an icon. See @catalogus/schema's schema.ts for why.
     */
    vcs?: { visibility: string };
  };
  services: ViewService[];
  edges: { from: string; to: string }[];
}

export interface ViewService {
  id: string;
  /** catalog slug exactly as written in the manifest */
  service: string;
  /** catalog display name, or the raw slug when the catalog has no row */
  name: string;
  /** false when getCatalogEntry() returned undefined */
  known: boolean;
  /** simple-icons path data (the `d` attribute), resolved server-side; null when there is no verified icon */
  icon: string | null;
  /**
   * The brand's own colour, as `#RRGGBB`, resolved server-side alongside the
   * path; null exactly when `icon` is null.
   *
   * Carried so the viewer can render a mark in colour where colour helps
   * recognition -- a service page, a hover panel -- while keeping the board
   * monochrome. That split is deliberate and measured rather than aesthetic:
   * a large fraction of catalog slugs have no verified icon at all, so a
   * fully coloured board would separate into real logos and grey fallbacks
   * and make a correct render look half-broken. Every row that has an icon
   * has a hex, so this never introduces a third state.
   */
  iconHex: string | null;
  role: string;
  /** the segment of role before the first "-" */
  rollup: string;
  kind: "service" | "component" | "stack";
  version?: string;
  status: "active" | "phasing_out" | "deprecated" | "removed";
  replaced_by?: string;
  added?: string;
  notes?: string;
}

/** The segment of `role` before the first "-" -- the rollup convention settled in the 3.6 follow-ups (docs/PLAN.md). A role with no "-" at all rolls up to itself. */
function rollupOf(role: string): string {
  const dash = role.indexOf("-");
  return dash === -1 ? role : role.slice(0, dash);
}

/**
 * Builds one ViewService, resolving its catalog row and icon. Icon
 * resolution is awaited per entry rather than batched through
 * Promise.all(manifest.services.map(...)) at the call site, so a single
 * slow or failing lookup can't be conflated with the others by a caller
 * reading this function in isolation -- buildViewPayload below is the one
 * that decides how these run.
 */
async function buildViewService(entry: ServiceEntry): Promise<ViewService> {
  const catalogEntry = getCatalogEntry(entry.service);
  const resolved = await resolveIcon(catalogEntry?.icon);

  return {
    id: entry.id,
    service: entry.service,
    name: catalogEntry?.name ?? entry.service,
    known: catalogEntry !== undefined,
    icon: resolved?.path ?? null,
    iconHex: resolved?.hex ?? null,
    role: entry.role,
    rollup: rollupOf(entry.role),
    kind: entry.kind ?? "service",
    version: entry.version,
    status: entry.status ?? "active",
    replaced_by: entry.replaced_by,
    added: entry.added,
    notes: entry.notes,
  };
}

/**
 * Builds the full view payload for one manifest. `manifestPath` is carried
 * through rather than re-derived from the manifest itself because it names
 * the file on disk `catalogus view` actually read -- information the parsed
 * manifest object has no field for. `readAt` is likewise supplied by the
 * caller rather than stamped with `new Date()` in here: the moment that
 * matters is when commands/view.ts actually read the manifest off disk,
 * not whenever this transform happens to run afterward, and threading it
 * through keeps this function a pure transform of its inputs (see
 * view-payload.test.ts, which passes a fixed value for exactly that
 * reason).
 *
 * Icon lookups run concurrently (Promise.all over services) -- there are at
 * most a few dozen services in a real manifest, each lookup is one small
 * file read, and this is built once per server start (see
 * commands/view.ts), not once per request.
 */
export async function buildViewPayload(
  manifestPath: string,
  manifest: CatalogusManifestV1,
  readAt: string
): Promise<ViewPayload> {
  const services = await Promise.all(manifest.services.map(buildViewService));
  const edges = manifest.dependencies.map((edge) => edgeEndpoints(edge));

  return {
    manifestPath,
    readAt,
    project: {
      name: manifest.project.name,
      slug: manifest.project.slug,
      architecture: manifest.project.architecture,
      vcs: manifest.project.vcs,
    },
    services,
    edges,
  };
}
