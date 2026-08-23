# Dagstree

Dagstree is a project operations registry: an app + CLI that catalogs, for each of the owner's
projects, its service providers, infrastructure, dependencies and stack metadata, rendered with
brand icons, dependency graphs and cost visibility.

The specification lives at `docs/HANDOFF.md`. Read it before making design decisions — sections
3, 4, 5, 6 and 8 are the parts that govern implementation. This file is orientation only; the
handoff document is the source of truth and should not be re-derived or contradicted.

## Package layout

pnpm workspace monorepo, ESM throughout, TypeScript strict.

- `packages/schema` (`@dagstree/schema`) — the JSON Schema for `dagstree.yaml` and its validator.
- `packages/core` (`@dagstree/core`) — the detection engine, built on `@specfy/stack-analyser`.
- `packages/cli` (`dagstree`) — the offline CLI: `init`, `detect`, `diff`, `add`, `validate`,
  `graph`. Depends on `@dagstree/schema` and `@dagstree/core`.

## Verify

```
pnpm build && pnpm test
```

Also run `pnpm typecheck` when touching type signatures across package boundaries.

## Hard rule: no secrets, ever

Dagstree must never store secrets, credentials, API keys or passwords anywhere. `dagstree.yaml`
(Layer 2) is committed to the repo and must stay safe in a public repo — the schema rejects
private-looking keys (`cost`, `price`, `account`, `token`, `key`, `password`, `billing`,
`renewal`, etc.) on write. Cost and account-reference data (Layer 3) exists only in a private
backend overlay, never in this repo, never in any file an agent writes. When in doubt, leave the
field out of `dagstree.yaml` and route it to the private channel instead.
