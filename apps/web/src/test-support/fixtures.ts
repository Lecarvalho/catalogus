// Shared test-only builders. Not a *.test.ts file itself, so it is never
// collected as a test suite on its own -- only imported by ones that are.
import type { ViewPayload, ViewService } from "@catalogus/cli";

export function makeViewService(overrides: Partial<ViewService> & Pick<ViewService, "id" | "role">): ViewService {
  return {
    id: overrides.id,
    service: overrides.service ?? "some-service",
    name: overrides.name ?? "Some Service",
    known: overrides.known ?? true,
    icon: overrides.icon ?? null,
    // Defaults to null rather than deriving from `icon`, so a fixture that
    // sets a path without a hex is expressible. The payload guarantees the
    // two arrive together (view-payload.ts), but a test that wants to prove
    // the viewer degrades to `currentColor` on a missing hex needs to be able
    // to construct the pair the payload will not produce.
    iconHex: overrides.iconHex ?? null,
    role: overrides.role,
    rollup: overrides.rollup ?? overrides.role.split("-")[0]!,
    kind: overrides.kind ?? "service",
    status: overrides.status ?? "active",
    version: overrides.version,
    replaced_by: overrides.replaced_by,
    added: overrides.added,
    notes: overrides.notes,
  };
}

/**
 * A whole payload, for the shell -- the top bar, the rail and the footer each
 * read a different corner of one, so a test that builds them field by field is
 * mostly ceremony.
 *
 * It exists as much as a compile-time tripwire as a convenience: every field
 * @catalogus/cli's `ViewPayload` declares is required, so adding one to that
 * interface fails typecheck *here*, in one place, rather than in whichever
 * tests happened to construct a payload inline. `cliVersion` and `schemaUrl`
 * arrived on 2026-09-03 for the footer and this is where the suite learned
 * about them.
 *
 * The defaults are deliberately not a real project's: a synthetic name, a
 * scratch path, and a version that is *not* the CLI's own, so a test asserting
 * the footer states the payload's version cannot pass by accidentally matching
 * the one the package happens to carry.
 */
export function makeViewPayload(overrides: Partial<ViewPayload> = {}): ViewPayload {
  return {
    manifestPath: overrides.manifestPath ?? "C:/scratch/project/catalogus.yaml",
    readAt: overrides.readAt ?? "2026-08-24T00:00:00.000Z",
    cliVersion: overrides.cliVersion ?? "9.9.9",
    schemaUrl: overrides.schemaUrl ?? "https://catalogus.dev/schema/v1.json",
    project: overrides.project ?? { name: "Scratch", slug: "scratch" },
    services: overrides.services ?? [],
    edges: overrides.edges ?? [],
  };
}
