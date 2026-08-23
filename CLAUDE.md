# Dagstree

Dagstree is a project operations registry: an app + CLI that catalogs, for each of the owner's
projects, its service providers, infrastructure, dependencies and stack metadata, rendered with
brand icons, dependency graphs and cost visibility.

The specification lives at `docs/HANDOFF.md`. Read it before making design decisions — sections
3, 4, 5, 6 and 8 are the parts that govern implementation. This file is orientation only; the
handoff document is the source of truth and should not be re-derived or contradicted.

`docs/PLAN.md` is the status board: the phases, what is done, what is left, and the decisions
already settled. Start there to find the current state of the work, and update it as phases
complete — check a box only when the work is verified, not merely written.

## Package layout

pnpm workspace monorepo, ESM throughout, TypeScript strict.

- `packages/schema` (`@dagstree/schema`) — the JSON Schema for `dagstree.yaml` and its validator.
- `packages/core` (`@dagstree/core`) — the detection engine, built on `@specfy/stack-analyser`.
- `packages/cli` (`dagstree`) — the offline CLI: `init`, `detect`, `diff`, `add`, `set`, `link`,
  `deprecate`, `validate`, `graph`. Depends on `@dagstree/schema` and `@dagstree/core`. Every
  command that writes goes through `src/manifest-edit.ts`, which edits the parsed YAML Document
  (comments and the `$schema` modeline survive) and refuses to write anything that would fail
  `validate`. The CLI is the only writer: there is no supported hand-edit path.
- `skills/dagstree` — the agent skill, a shipped artifact installed into client repos by copying
  `SKILL.md` to `.claude/skills/dagstree/SKILL.md`. It treats the CLI as a hard prerequisite and
  documents the manifest format, so it changes in the same commit as the schema. A drift test
  (`packages/schema/src/skill-drift.test.ts`) enforces that. See `skills/README.md`.
- `examples/` — reference manifests the skill's output is checked against. Deliberately synthetic:
  an example derived from a real project would publish that project's whole service inventory and
  topology in a public repo, which is not the same thing as publishing a schema example.

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
