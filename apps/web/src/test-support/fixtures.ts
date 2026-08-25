// Shared test-only builders. Not a *.test.ts file itself, so it is never
// collected as a test suite on its own -- only imported by ones that are.
import type { ViewService } from "@catalogus/cli";

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
