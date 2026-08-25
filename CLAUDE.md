# Catalogus

Catalogus is a project operations registry: an app + CLI that catalogs, for each of the owner's
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

- `packages/schema` (`@catalogus/schema`) — the JSON Schema for `catalogus.yaml` and its validator.
- `packages/core` (`@catalogus/core`) — the detection engine, built on `@specfy/stack-analyser`.
- `packages/cli` (`@catalogus/cli`) — the offline CLI: `init`, `detect`, `diff`, `add`, `set`, `link`,
  `unlink`, `deprecate`, `remove`, `rename`, `validate`, `graph`. Depends on `@catalogus/schema` and
  `@catalogus/core`. Every command that writes goes through `src/manifest-edit.ts`, which edits the
  parsed YAML Document (comments and the `$schema` modeline survive) and refuses to write anything
  that would fail `validate`. The CLI is the only writer: there is no supported hand-edit path.
- `skills/catalogus` — the agent skill, a shipped artifact installed into client repos by copying
  `SKILL.md` to `.claude/skills/catalogus/SKILL.md`. It treats the CLI as a hard prerequisite and
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

**Subagents here are user-requested.**

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
it produces a confident report about a version that no longer exists. When the main session changes
a file mid-flight that a running agent depends on, it *tells* that agent rather than letting it
discover the change — a brief is a snapshot, and a stale one produces confident work against a
version that no longer exists just as surely as a shared file does.

**Sizing the brief is the orchestrator's job, and a brief that holds many independent pieces should
have been many briefs.** This is the primary discipline; everything in the paragraph after it is a
fallback for when it fails. On 2026-08-25 the main session handed one agent "rewrite the viewer's
tests" — seven-plus files, several independent modules — and that single agent spent **422k tokens**
grinding through serially what three or four agents would have done in parallel. The brief was the
defect, not the agent.

Cutting the work finer is not only cheaper. Three things get better:

- **Quality.** An agent whose context fills with eight files' worth of detail is a worse agent by the
  eighth file than it was on the first. Long briefs degrade exactly where care matters most.
- **Verification.** A narrow brief produces a claim that can be checked. "All the tests pass" from an
  agent that wrote thirty of them is a claim nobody can usefully audit; "these four tests cover this
  module, and here are the mutations that proved them" is.
- **Recovery.** When one narrow brief comes back wrong, one narrow brief is re-run. When a wide one
  does, everything in it is suspect.

The test: if a brief names more than a handful of files, or contains the word "every", it is probably
two or more briefs. Split it before spending the tokens, not after.

**A subagent may still delegate to its own subagents** — for width that only becomes visible from
inside the work, which is the case the rule above cannot catch. Two things bind a delegating agent,
and both exist because delegation is where verification quietly goes missing:

- **It owns the file partition for its children, and can only hand out files from its own
  allocation.** The main session's list of who-touches-what stops at its direct children, so a
  grandchild editing a file outside its parent's allocation is invisible to the only party who could
  have caught the collision.
- **It verifies its children's claims rather than relaying them.** "The tests pass" arriving from a
  child is an unverified claim until the parent has run them itself, and a parent that forwards it
  upward has laundered it through one extra layer — which is precisely the failure this project's
  whole review loop exists to catch. The rule that a validator did not write the code it validates
  survives delegation too: a parent cannot validate its own children's work by reading their
  reports.

## Hard rule: ask, never guess

Where a fact is not in the repo, ask the owner — or record nothing and name the command that fills
the gap. Never write a plausible default.

This is not a style preference, it is the defect class this project keeps producing. `init`
hardcoded `visibility: private` and wrote a comment into the manifest admitting the guess. It was
*right* on the repo it was written against, which is the worst outcome available: a wrong default
that looks correct is one nobody goes back and checks. In the same pass, a detector invented a
coding agent named `agents-md` after the instruction file it found — a file convention answering a
question about agents, and self-confirming, because it appeared beside the real agents on every repo
that had any. Four of the six defects in Phase 3.6.1 were this same shape.

Two corollaries, both learned the same way:

- **Do not swap one guess for another.** `gh repo view` was rejected as the fix for visibility: it
  answers only for GitHub and fails quietly for GitLab, Bitbucket, Azure DevOps or a plain origin,
  which is a provider-shaped guess standing in for a visibility-shaped one. Prefer a
  provider-agnostic question over a provider-specific inference.
- **An absent field reads as "not answered yet"; a filled one reads as an answer.** When the CLI
  cannot know, omitting the field and printing the `catalogus set ...` line that fills it is the
  correct behaviour, not a degraded one.

The same rule governs the agent skill: `skills/catalogus/SKILL.md` tells the agent to ask rather than
infer, and `catalogus detect` reports what it cannot identify instead of naming it.

## Hard rule: no secrets, ever

Catalogus must never store secrets, credentials, API keys or passwords anywhere. `catalogus.yaml`
(Layer 2) is committed to the repo and must stay safe in a public repo — the schema rejects
private-looking keys (`cost`, `price`, `account`, `token`, `key`, `password`, `billing`,
`renewal`, etc.) on write. Cost and account-reference data (Layer 3) exists only in a private
backend overlay, never in this repo, never in any file an agent writes. When in doubt, leave the
field out of `catalogus.yaml` and route it to the private channel instead.
