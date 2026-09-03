// Shared test-only builders. Not a *.test.ts file itself, so it is never
// collected as a test suite on its own -- only imported by ones that are.
import type { ViewPayload, ViewService } from "@catalogus/cli";

/**
 * `ResolvedIcon`, without importing it by name: `@catalogus/cli`'s index.ts
 * re-exports `ViewPayload`/`ViewService` but not the `ResolvedIcon` type
 * those carry, and widening that public surface is outside this pass's
 * scope (docs/icons-brief.md, Part B -- "Do not touch packages/"). Indexing
 * the field off `ViewService` names the exact same type, with nothing added
 * to @catalogus/cli's own exports.
 */
type ResolvedIconValue = NonNullable<ViewService["icon"]>;

/**
 * A simple-icons-shaped resolved icon (@catalogus/core's icons.ts,
 * resolveSimpleIconsIcon): one path, `fill="currentColor"`, a brand hex.
 * Fly.io's own path and hex, the ones every icon-bearing call-site test in
 * this app already used ad hoc as a string pair before `icon` became one
 * `ResolvedIcon` object -- centralised here so the shape is typed once
 * rather than re-typed at each call site.
 */
export const FLYIO_ICON_FIXTURE: ResolvedIconValue = {
  viewBox: "0 0 24 24",
  body: '<path d="M0 0h24v24H0z" fill="currentColor"/>',
  hex: "#24175B",
};

/**
 * A thesvg-shaped resolved icon carrying a knockout -- csharp's own shape
 * (@catalogus/core's icons.ts, THESVG_ICONS.csharp / applyKnockout): a
 * brand-coloured path, plus a second element whose fill was stripped at
 * resolve time and replaced with `data-knockout=""` because its source
 * colour is a hole cut through the mark, not a painted one. `hex: null`
 * because a `brand`-policy mark's colour form is its own fills, never a
 * single hex (ResolvedIcon's own doc comment). `viewBox` is csharp's real
 * one; the path data is a stand-in rather than the vendored file's own,
 * since a fixture only needs to be *shaped* like the real thing, not equal
 * to it.
 */
export const THESVG_ICON_FIXTURE: ResolvedIconValue = {
  viewBox: "0 -1.43 255.58 290.11",
  body: '<path d="M10 10h20v20H10z" fill="#a179dc"/><path d="M60 10h20v20H60z" data-knockout=""/>',
  hex: null,
};

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
