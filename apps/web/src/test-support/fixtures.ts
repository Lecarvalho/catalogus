// Shared test-only builders. Not a *.test.ts file itself, so it is never
// collected as a test suite on its own -- only imported by ones that are.
import type { ViewService } from "dagstree";

export function makeViewService(overrides: Partial<ViewService> & Pick<ViewService, "id" | "role">): ViewService {
  return {
    id: overrides.id,
    service: overrides.service ?? "some-service",
    name: overrides.name ?? "Some Service",
    known: overrides.known ?? true,
    icon: overrides.icon ?? null,
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
