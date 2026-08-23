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
  `deprecate`, `remove`, `validate`, `graph`. Depends on `@dagstree/schema` and `@dagstree/core`. Every
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

## How implementation work runs here: orchestrate, delegate, validate

Work in this repo runs as three roles rather than as one agent doing everything. The main session
orchestrates; substantial implementation goes to a subagent; verification goes to a *different*
subagent that did not write the code. The reason is in this project's own history: the
failure mode here has not been bad code, it has been plausible code. `set`, `link` and `deprecate`
each worked, and the `init` → `add` sequence did not, and that went unnoticed because whoever wrote
them was whoever checked them. A reviewer who already believes the design is the weakest reviewer
available.

**The main session orchestrates.** It reads `docs/PLAN.md`, picks the next item, writes the brief,
and spends its context on judgment rather than on file contents. It is the only writer of
`docs/PLAN.md`, and it ticks a checkbox only after the work is verified — a status board recording
what was written rather than what was verified is the thing that file exists to prevent.

**It also does the small edits itself.** A change that is bounded and already understood — a
handful of files, a wording fix, a comment that records a decision, a one-line correction — is
faster and clearer done directly than briefed out, and writing a brief for it costs more context
than doing it. Delegate when the change has to be *designed* rather than merely applied: new
behaviour, a new command, anything spanning packages, anything needing a test strategy rather than
one more assertion. The test is whether the work needs judgment the brief would have to contain
anyway. Small edits still get verified — the verify command runs, and a change to behaviour still
earns a validation pass.

**Implementation goes to a subagent, on a smaller model.** The brief carries the section of
`docs/PLAN.md` that is the specification, the sibling files whose structure and comment register the
work must match, the non-goals the plan already declined, and the verify command with the current
baseline test count. A brief that says what to build without saying what to match produces code that
works and reads like it came from somewhere else.

**Validation goes to a separate subagent, on the strongest model available, and it reports rather
than fixes.** It is told to find defects rather than confirm the work, and to treat every claim in
the implementer's report as unverified until reproduced. It verifies by executing the built binary
against adversarial inputs it writes itself — not by reading the source, because reading the source
is how the implementer already convinced themselves. Where the implementer claims something is
impossible or unfixable, the brief names that claim and asks for it to be tested directly.

**Every claim of completion is a claim of execution.** "The tests pass" means the suite was run and
the numbers are in the report. "The command works" means it was run end to end against a scratch
project and the observed exit codes are in the report. Behaviour that was assumed is reported as
assumed, or not reported at all.

**Parallel agents must not share files.** Each brief carries the explicit list of files the other
running agents are touching, and says not to edit them. An audit of a file that changes underneath
it produces a confident report about a version that no longer exists.

## Hard rule: no secrets, ever

Dagstree must never store secrets, credentials, API keys or passwords anywhere. `dagstree.yaml`
(Layer 2) is committed to the repo and must stay safe in a public repo — the schema rejects
private-looking keys (`cost`, `price`, `account`, `token`, `key`, `password`, `billing`,
`renewal`, etc.) on write. Cost and account-reference data (Layer 3) exists only in a private
backend overlay, never in this repo, never in any file an agent writes. When in doubt, leave the
field out of `dagstree.yaml` and route it to the private channel instead.
