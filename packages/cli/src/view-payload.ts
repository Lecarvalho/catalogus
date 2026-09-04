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
//
// Icon resolution itself (added 2026-09-04, docs/custom-icon-brief.md) is
// not re-derived here either: buildViewService calls icon-resolution.ts's
// resolveServiceIcon, the one place that also answers `catalogus icons`'
// question, so the two commands can never disagree about which tiles end
// up rendering initials.
import { createRequire } from "node:module";
import { dirname } from "node:path";

import { catalogusSchemaV1, edgeEndpoints, type CatalogusManifestV1, type ServiceEntry } from "@catalogus/schema";
import { getCatalogEntry } from "@catalogus/core";
import type { ResolvedIcon } from "@catalogus/core";

import { resolveServiceIcon } from "./icon-resolution.js";

/**
 * This CLI's own version, read from its package.json rather than repeated
 * here -- the same reason and the same mechanism as cli.ts's
 * `packageVersion()`, which exists because a hardcoded copy had already
 * drifted (`--version` said 0.1.0 while the package said 0.0.1). Two readers
 * of one file, not two answers.
 *
 * `"../package.json"` resolves correctly from both layouts this module runs
 * in: `src/view-payload.ts` under vitest and the tsup bundle sitting directly
 * under `dist/`. package.json is package root's, and `src/` and `dist/` are
 * both one level below it -- the same fact commands/view.ts's
 * `findPackageRoot()` relies on from the other direction.
 *
 * Read once at module load, not per call: it is a property of the binary that
 * is running, and it cannot change while the process lives.
 */
const CLI_VERSION: string = (() => {
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version?: string };
  return pkg.version ?? "0.0.0";
})();

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
  /**
   * The version of the `catalogus` CLI serving this payload, from its own
   * package.json (see CLI_VERSION below).
   *
   * It is here rather than fetched or guessed by the browser for the reason
   * this whole module exists: the viewer is served *by* the CLI and has no
   * other way to learn anything about it. The footer states it beside the
   * schema URL so a reader looking at a screenshot, or filing a bug against
   * the viewer, can say which binary drew it.
   */
  cliVersion: string;
  /**
   * The `$schema` URL this manifest is written against -- `catalogusSchemaV1`'s
   * own `$id`, which is the same string `catalogus init` writes into the
   * modeline at the top of every manifest.
   *
   * Carried in the payload rather than imported by the viewer because
   * `@catalogus/schema`'s entry point pulls ajv in with it, and the sentence
   * at the top of this file -- the browser gets plain data, never ajv -- is
   * the reason this module exists at all. A literal typed into a stylesheet
   * or a component would be a third copy of a string that already has one
   * source of truth.
   */
  schemaUrl: string;
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
  /**
   * The resolved icon, from either source @catalogus/core's resolveIcon
   * knows about (simple-icons or a vendored thesvg.org file), or null when
   * there is no verified icon for this slug.
   *
   * Carries `hex` (the brand's own colour, `#RRGGBB`, or null for a
   * multi-colour mark -- see ResolvedIcon's own doc comment) so the viewer
   * can render a mark in colour where colour helps recognition -- a service
   * page, a hover panel -- while keeping the board monochrome. That split
   * is deliberate and measured rather than aesthetic: a large fraction of
   * catalog slugs have no verified icon at all, so a fully coloured board
   * would separate into real logos and grey fallbacks and make a correct
   * render look half-broken.
   */
  icon: ResolvedIcon | null;
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
 *
 * `manifestDir` is the manifest's own directory, needed only to resolve an
 * entry's own `icon` field (a repo-relative `.catalogus/icons/<name>.svg`
 * path) to an absolute one -- see icon-resolution.ts's resolveServiceIcon,
 * which tries that first and falls back to the catalog ref exactly as it
 * did before this entry-level field existed.
 */
async function buildViewService(entry: ServiceEntry, manifestDir: string): Promise<ViewService> {
  const catalogEntry = getCatalogEntry(entry.service);
  const resolution = await resolveServiceIcon(manifestDir, entry);

  return {
    id: entry.id,
    service: entry.service,
    name: catalogEntry?.name ?? entry.service,
    known: catalogEntry !== undefined,
    icon: resolution.icon,
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
 *
 * `manifestDir` is derived from `manifestPath` (dirname) rather than taken
 * as its own parameter: it is a fact about the same file `manifestPath`
 * already names, not new information a caller has to supply, and every
 * existing call site keeps working unchanged.
 */
export async function buildViewPayload(
  manifestPath: string,
  manifest: CatalogusManifestV1,
  readAt: string
): Promise<ViewPayload> {
  const manifestDir = dirname(manifestPath);
  const services = await Promise.all(manifest.services.map((entry) => buildViewService(entry, manifestDir)));
  const edges = manifest.dependencies.map((edge) => edgeEndpoints(edge));

  return {
    manifestPath,
    readAt,
    cliVersion: CLI_VERSION,
    schemaUrl: catalogusSchemaV1.$id,
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
