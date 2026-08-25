# Catalogus — Implementation Plan & Progress

Working plan and status board. `docs/HANDOFF.md` is the specification and the source of truth for
design decisions; this file tracks *what has been built* against it and what remains.

- **Status:** Phases 0–3.6 complete, plus a **3.6.1 correction pass** (see its own section below):
  validating a manifest the skill had just written found six defects, four of them in shipped
  guidance rather than in code. The third cold run produced **26 services and 30 edges** on a real
  project, validating clean under `--strict`. The CLI has no unrecoverable state left (`remove`) and no
  uncorrectable field left (`set` now covers `project.name`, `project.slug` and
  `services.<id>.role`, `.kind` and `.version`). `--strict` is settled, detection sorts findings into
  four kinds (`service` / `component` / `stack` / `library`), and the catalog carries 57 service rows
  plus 82 stack rows on top of the original table.

  **All five 3.6 follow-ups are now closed.** The two pre-existing holes every writer shared (an
  explicit path that holds no manifest no longer edits the ancestor's; a pre-existing cycle is
  reported against the file rather than blamed on the current edit); `diff`'s delete-list wording;
  `catalogus rename`, the last missing writer, so **every correctable field now has a command behind
  it**; the `role` convention, settled by the owner as documentation rather than a schema
  constraint, with the viewer grouping on the segment before the first `-`; and the category enum,
  widened with `monitoring`, `queue` and `messaging` — **HANDOFF §4 was amended for that, and the
  document now carries an amendment log**.

  **Phase 3.7 is most of the way through.** The viewer renders — `catalogus view` serves one repo's
  manifest, grouped by rollup, with compact nodes, a URL-addressed detail panel, status colours and
  `replaced_by`. **What is left in it is one large item and one small one: the DAG layout (elkjs +
  React Flow), and the portfolio/migration/cost pages that want more than one project.** Phase 4
  stays deferred by owner decision.

  **The session after the viewer foundations spent itself on verification rather than features**,
  and that was the right trade because it found things. The two committed corpora now exist (the
  skill's shell commands checked against the live CLI surface; 65 path-traversal vectors executed
  against a live server), and the process of building them turned up **two defects nothing else
  would have caught**: a suite flake that made `pnpm test` fail half the time while every
  single-file run passed, and a live `catalogus set` bug that reported a schema error against a
  perfectly valid manifest. Both are written up below.
- **Last updated:** 2026-08-24

## Start here on a fresh session

Run `pnpm build && pnpm test` first and confirm **878 tests / 52 files**, plus `pnpm typecheck`
clean across all four packages, before trusting anything below. (Phases 0–3.6 and the 3.6.1
correction pass predate this at 549/38, and the viewer-foundations session ended at 679/50; the
number moved a long way again in the drift-and-corpus session that followed — 199 of those tests
are two committed corpora plus two components' first test files, not 199 new behaviours.)

**Run it more than once before believing it.** That session's own corpus made the suite fail on
three of six consecutive runs while every single run *of that file alone* passed, because vitest
parallelises across files and two of them were mutating the same real directory. A single green
`pnpm test` is weaker evidence than this document has historically treated it as.

### Handoff — 2026-08-24, end of the drift-and-corpus session

**What happened.** No new viewer features. This session closed the two verification gaps the
previous handoff ranked second and third, and both closures found defects on the way:

1. **The skill's shell commands are checked now** (`packages/cli/src/skill-commands-drift.test.ts`)
   and the yaml fragment's *values* are too, not just its field names. Five mutation classes
   watched red, including the two removed `set` fields that started it.
2. **The traversal corpus is committed** (`packages/cli/src/test-support/traversal-vectors.ts`,
   65 vectors, run from `view.test.ts`). Watched red twice by mutating the guard: 32 of 65 on a
   deleted containment check, 9 on the classic naive one — **and not one of those 9 is a literal
   `../` vector**, which is the case for the corpus having families rather than a pile of dots.
3. **Four stale checkboxes ticked.** Compact nodes, the detail panel, rollup labels and status
   colours were all shipped in `f256d72` and left unticked. Each tick now says what it rests on.
4. **Two defects found and fixed**, neither of them in the work being done: a **suite flake**
   (three of six full runs red, every single-file run green — two test files mutating the real
   `dist/web` in parallel workers), and **`catalogus set constructor`** taking the known-field
   branch through `Object.prototype` and blaming the user's manifest for it.

**What was deliberately not done, and why.** The five smaller viewer defects (focus, history
entries, colour-only selection cue, duplicate-vendor nodes) are still open and now have their own
checkbox rather than being hidden inside a ticked one. `App.tsx` still has no tests and is now the
largest untested surface in the repo. **The DAG is still the next real piece of work**, and the
previous handoff's warning about it stands unchanged: there is no real manifest to judge layout
against, so either onboard a project first or build against a deliberately hard synthetic one and
say plainly that that is what happened.

**One habit worth keeping from this session.** Every claim below that says "watched go red" means
the code was mutated, the test was observed failing, and the mutation was reverted — and the suite
was run repeatedly rather than once. Both defects in item 4 were invisible to a single green run.

**Still outstanding from the previous handoff, and it did not happen in this one:** the owner was
going to run `catalogus view` from a real client repo and come back with feedback. Nothing in this
document reflects such a run. **First-hand feedback outranks anything written here**, so if it has
since happened, start from that rather than from the ranked list below.

**Where this session's work lives:** branch **`phase-3.7-drift-and-corpus`**, three commits on top
of `d3b5fda`, **not merged and not pushed**. `git log --oneline main..` shows them. Ordered
fixes -> tests -> chore+docs deliberately, so every commit is independently green; tests-first
would have been a red commit, since the new `set` and `StatusPill` cases fail without their
fixes. **If `git branch --show-current` says `main`, none of what follows is in your tree.**

### Handoff — 2026-08-24, end of the viewer-foundations session

**What happened.** Phase 3.7's foundation was built and merged: the `apps/web` viewer, `catalogus
view`, the service catalog, server-side icon resolution, the workspace scanner, and a breaking
schema change. Four implementation slices, each attacked afterwards by a separate agent that did
not write it. **Those validation passes found thirteen defects, four of them critical or high**,
and every single one of the criticals was invisible to a green test suite. That loop is the reason
this phase is trustworthy; do not drop it.

**The owner's next action, and why this document may be behind.** The owner is running
`catalogus view` from a real client repo and will come back with feedback. Nothing in this document
reflects that run. Treat first-hand feedback as outranking anything written here.

**To run it from a client repo:**

```
pnpm build && pnpm run link:cli     # in this repo, once
cd <client repo>                    # the skill writes catalogus.yaml, then:
catalogus view                       # serves 127.0.0.1:4180 and opens the browser
```

`--no-open` suppresses the browser, `--port <n>` moves it. It refuses to start on a missing or
invalid manifest rather than serving a broken page.

**Five decisions taken this session that supersede older text in this file.** Each was the owner's,
each has reasoning, and none should be reversed without a new one:

1. **`catalogus view` is single-repo, not workspace-root.** It takes `[path]` like every other
   command and serves that repo's manifest. `scanWorkspace()` is built, tested and *dormant* — no
   caller until the portfolio page. Sections of Phase 3.7 below were written under the old design.
2. **`simple-icons` is not bundled into the client.** `index.mjs` is 5.2 MB and manifest-driven
   lookups tree-shake to nothing, so icons resolve server-side and the payload carries path data.
   Client bundle: 161 KB. The plan's own "bundled into the client" line predates this measurement.
3. **`project.pm`, `project.coding_agents` and `project.vcs.provider` are removed** — HANDOFF §4's
   2026-08-24 amendment. Anything with an identity and an icon is a service entry; `role` gives its
   section. The constraint that settled it: a project-level field can never be an edge target.
4. **Compact nodes plus a URL-addressed detail panel** (`#/service/<id>`), chosen over a popover
   and a sub-page because detail content is expected to grow. This is also the shape a DAG node
   needs, so the layout slice swaps the container, not the node.
5. **Rollup display labels live in the viewer**, keeping the "segment before the first `-`" rule
   mechanical and exception-free.

**The one defect class this repo keeps producing — five instances now, and the last two were found
by going looking rather than by being bitten.** A keyed lookup built as a plain object literal, read
with a key that can come from outside. `getCatalogEntry("constructor")` returned the `Object`
function; then `GLYPHS["constructor"]` blanked the entire viewer with no error UI; `ROLLUP_LABELS`
would have been the third. **`role: constructor` is schema-valid, `validate` accepts it and `graph`
prints it.** Every existing test passed each time, because the tests named keys that were *absent*
rather than *inherited* — those are different things and only one of them is a bug.

Both remaining instances are now closed, and the second was a live CLI bug rather than a
precaution:

- **`StatusPill`'s `LABELS[status]`** was recorded as reachable-but-gated — safe only because
  `status` is a schema enum and `view` refuses invalid manifests. Correct, and still a guard one
  layer away from the bug: it held because of a property of the rest of the app, not of that file.
  Now null-prototype, with `StatusPill.test.tsx` naming `constructor`, watched red first.
- **`catalogus set`'s `FIELDS`** was not gated at all. `field` comes straight off the command line,
  so `catalogus set constructor boom` took the *known-field* branch, built an edit with an undefined
  path, and reported **`[schema] / must be object` at exit 1** — pointing the caller at their
  manifest, which was the one thing that was fine — instead of `Unknown field "constructor"` at exit
  2. Same for `toString`, `valueOf`, `__proto__` and `hasOwnProperty`. **Found by auditing for the
  class after closing StatusPill, reproduced against the built binary, fixed, and re-run against the
  built binary.** Not destructive: `manifest-edit.ts` validates before it writes and that guard held
  throughout, so the cost was a wrong diagnosis, not a damaged file.

**Any new keyed lookup gets `Object.create(null)` and a test naming `constructor`.** The audit that
found the `set` bug also cleared the rest, and the reasoning is recorded at each site rather than
left to be re-derived: `ICON_OVERLAY` and `EXACT_MARKERS` are only ever iterated with
`Object.entries`, never indexed; `MIME_TYPES` is indexed with `path.extname()`, whose every return
value is `""` or starts with `"."` and so can never name a prototype member; and `ServiceNode`'s
`styles[`status-${...}`]` prefixes the manifest value, which has the same effect.

**Open, ranked by consequence.** Details in the Phase 3.7 section below.

1. **The DAG has nothing real to be judged against.** The 26-service Clapline manifest this document
   described does not exist (checked directly). Either onboard a real project first, or build the
   layout against a deliberately hard synthetic manifest and *say so* — do not declare it done on
   the 14-node example and imply otherwise.
2. ~~**`skill-drift.test.ts` has less coverage than it appears to.**~~ Closed — both halves. See the
   two ticked boxes in Phase 3.7 below for what was built and which mutations were watched go red.
3. ~~**The traversal corpus is not committed.**~~ Closed — 65 vectors now live in
   `packages/cli/src/test-support/traversal-vectors.ts`, executed against a live server by
   `view-traversal.test.ts`. See Phase 3.7 below.
4. **`App.tsx` has no tests** — every browser-only behaviour (hash routing, focus restore, Escape
   listener lifetime) lives there and is covered only by manual browser runs. **Now the largest
   untested surface in the repo**, since the two items above stopped being.
5. Smaller, all recorded below: focus drops to `<body>` when closing a deep-linked panel; every
   open and close pushes a history entry; the selected state's two visual cues are both colour; two
   entries of the same vendor in one group are indistinguishable on the node.
6. **`SKILL.md` never teaches `catalogus view` — and the obvious fix is wrong.** Surfaced while
   building the shell-command drift check, which deliberately does not fail on it: the reverse
   direction (a command the skill never teaches) is a scope decision, not a drift bug.

   **Not scheduled, and it is not a one-line addition.** `runView` returns exit 0 as soon as the
   server is listening, but the listening socket holds the event loop open — the process runs until
   Ctrl+C, which is what its own `press Ctrl+C to stop` line says. **An agent that runs
   `catalogus view` in a client repo blocks its own tool call until it times out or is killed.**
   Adding it to the skill's fenced command list, where every other line is something the agent runs
   itself, would teach exactly that.

   The shape that works is the skill telling the agent to *hand the command to the user* — the
   viewer is for the human, the way `catalogus graph` (ASCII, exits immediately) is the agent's own
   sanity check and is already taught. That is a wording decision about the skill's closing section,
   not a new command. **Owner's call; do not just add the line.**

**Read Phase 3.6.1 before touching the skill, the schema or a CLI flag.** It is the most recent
work and it changed three things a fresh session would otherwise get wrong: entries now carry
`kind` (`service` | `component` | `stack`) and an optional `version`; the rule for what earns a node
is runtime topology rather than "can it send an invoice"; and **Catalogus asks rather than guessing**
wherever a fact is not in the repo. That last one is a standing rule, not a one-off fix — four of
the six defects in that pass were a plausible default written in place of a question.

The CLI is installed: `pnpm run link:cli` has been run, so `catalogus` is on `PATH` via shims in
npm's global bin directory pointing at this checkout. `pnpm build` updates what they run. If the
repo is ever moved, re-run `pnpm run link:cli`.

**Read `CLAUDE.md`'s "How implementation work runs here" section before starting.** It is not
boilerplate: it records how this project's defects have actually been caught, which is a validation
pass by an agent that did not write the code. Every substantial item below assumes that loop.

### The next thing is Phase 3.7, the viewer

It is unblocked. Build the single-project DAG first, against a real manifest, because layout is the
part that is genuinely hard and it de-risks everything after it.

**There is no real manifest, and this document said otherwise for a while.** Everything below used
to read: the cold runs wrote `C:/Workspace/repos/Clapline/catalogus.yaml`, it holds 26 services and
30 edges, `fly-api` has fourteen outgoing edges, and that file is the layout stress test the DAG
should be judged against. **Checked directly on 2026-08-24: the directory exists, the manifest does
not.** No `catalogus.yaml` and no `stack.yaml` anywhere under it. Nobody knows when it went, because
nothing ever re-checked — this document warned that its own numbers had "already been stale once"
and then went stale again in the same section, which is the argument for checking a claim before
building on it rather than for writing the warning.

Consequences, and they are real rather than bookkeeping:

- **The only manifest that exists is `examples/reference.catalogus.yaml`**, which is synthetic and
  small — 14 entries, 14 edges. It covers every *shape* (`kind: component`, `kind: stack` with a
  version, `status: phasing_out` with `replaced_by`, one vendor under two roles, and since the
  2026-08-24 amendment a `role: coding-agent` entry) but it is not a layout stress test. Nothing on
  disk currently proves elkjs handles a fourteen-edge fan-out readably.
- **So the DAG slice cannot be judged against real topology yet.** Either onboard a real project
  first, or build the layout against a synthetic manifest deliberately shaped to be hard and say
  plainly that that is what happened. Do not declare the layout done on a 14-node example and
  imply it was tested on something harder.
- **Tests and fixtures stay synthetic regardless.** Anything committed here is public, which is the
  reasoning that made the reference example synthetic in the first place (see Phase 3.6) and is
  unaffected by any of the above.

**What the viewer has to render, beyond the DAG.** Nodes come in three kinds now and they are not
interchangeable on screen: `service` is a vendor (brand icon, and the only kind a Layer 3 cost can
ever attach to), `component` is infrastructure the owner runs themselves (no vendor, no invoice —
so a cost rollup must exclude it rather than show a zero), and `stack` is what the code is written
in, carrying a `version` that is the number a tile shows and the key an end-of-life date would hang
off. `catalogus graph` already renders all three as text — `nginx (ingress-proxy, component)`,
`dotnet (runtime-backend, stack, v10)` — which is the cheapest reference for what the web viewer
has to say too.

**Two things it does not exercise, and the viewer needs both.** It carries no `status`/`replaced_by`
entries, so nothing on disk covers status colours or the migration view — use
`examples/reference.catalogus.yaml`, which does. And it predates `kind`, so every node in it is a
`service`: the component and stack rendering has no real input yet either. Check the counts above
against the file before relying on them; the numbers in this document have already been stale once.

Phase 4 (backend) stays deferred by owner decision. Phase 6 (MCP) and Phase 5 (auth/push) are
untouched.

### Follow-ups from 3.6 — all five closed

Kept here with the evidence behind each, in the order they were originally ranked by how much they
would cost if left alone. Each has its own section below.

1. ~~**Two pre-existing holes every writer shares.**~~ Closed — see that section for what was
   fixed, how it was verified, and the six mutations that proved the new tests carry weight.
2. ~~**`role` is an unconstrained slug.**~~ Settled — a documented convention in `SKILL.md`, no
   schema change, and the viewer groups on the segment before the first `-`. See that section.
3. ~~**`diff`'s "declared but no longer detected" reads as a delete list.**~~ Closed — the heading
   now says "not visible to detection here", the list says outright that it is not a delete list,
   and `diff` names a reason where it has one.
4. ~~**The category enum has no monitoring, queue or email bucket.**~~ Closed — HANDOFF §4 amended
   (with an amendment log) and both catalogs re-bucketed into `monitoring`, `queue` and `messaging`.
   See that section.
5. ~~**`catalogus rename <old> <new>`** for service ids.~~ Closed — built, and the CLI now has a
   command behind every correctable field. See the `remove` section for what it does and what the
   mutations found.

## Phase 3.6.1 — Defects found by validating the skill's own output ✅

The owner ran the current skill against a real repo and asked whether the manifest it produced was
accurate. It was: all 26 services traced to evidence in the checkout, and the `added` dates matched
`git log --diff-filter=A` on the file that proved each one, six for six. The defects were not in the
data. Four of the six were in **shipped guidance** — the skill and the handoff telling an agent to
do the wrong thing, which it then did correctly.

The through-line, and the rule that came out of it: **where Catalogus does not know, it asks. It
never guesses.** Every defect below is a variant of writing a plausible default instead of a
question.

- [x] **`kind: service | component | stack` on every entry, and an optional `version`.**
      `SKILL.md` told the agent "if it cannot have an outage and cannot send an invoice, it is not a
      service entry; languages and frameworks belong in the architecture description". Both halves
      wrong. It excluded nginx (terminates the project's public traffic) and OpenTelemetry (carries
      its logs) — nodes with real failure modes and no vendor behind them. And it parked the stack
      in free text where nothing can render a tile or key an EOL date off it; `project.architecture`
      is the *shape*, not the stack. The line is now runtime topology, not vendor relationship.
      HANDOFF §4/§5 amended, 82 curated language/framework/runtime rows added to `mapping.ts` (each
      cited to its `@specfy/stack-analyser` rule file, read out of the installed package), and a
      `stack` category added.
- [x] **`init` no longer guesses repo visibility.** It hardcoded `visibility: private` and wrote a
      comment into the manifest admitting the guess. It was right on the repo it was written
      against, which is the worst case — a wrong default that looks correct is never revisited.
      Rejected `gh repo view` as the fix: it answers only for GitHub and fails quietly for GitLab,
      Bitbucket, Azure DevOps or a plain origin, which is a provider-shaped guess replacing a
      visibility-shaped one. `init` prompts, `--yes` takes `--visibility`, and with neither it omits
      `project.vcs` entirely and prints the `set` command that fills it.
- [x] **`agents-md` is gone and `.codex` is detected.** `AGENTS.md`/`.agents/` emitted a coding
      agent literally named `agents-md` — a file convention in the field that names agents, and
      self-confirming because it sat beside the real agents on every repo that had any. They are now
      reported as *unidentified*: proof an agent works here, no claim about which. Separately there
      was no `.codex` marker at all, so a correctly-declared `codex` entry was reported as drift by
      `catalogus diff` **on every run** — a permanent false positive against a correct manifest.
- [x] **`detect` no longer hides the two new kinds.** Its grouping filter was `kind === "service"`,
      which dropped component- and stack-kind rows out of *both* the leading list and the collapsed
      library count. Detected, and invisible.
- [x] **`set services.<id>.kind` and `.version`**, so the new fields are correctable without a
      remove-and-re-add, keeping the "every correctable field has a command behind it" property.

### Two bugs that only execution found

Both were invisible to the unit suite because both lived in the argv wiring, and both are now
covered by argv-driven tests in `cli.test.ts`:

- **`--version` was swallowed by commander.** `.version()` on the program registers `--version` on
  every subcommand by inheritance, and the inherited option beats a subcommand's own. So
  `catalogus add dotnet --kind stack --version 10 --role runtime-backend` printed `0.0.1`, added
  nothing, and **exited 0** — silent data loss, not an error. Fixed with
  `program.enablePositionalOptions()`, which scopes an option to the command it follows;
  `catalogus --version` still reports the CLI version.
- **`--kind` was silently discarded.** `add`'s commander action builds its options object field by
  field and the two new fields were never added to it, so `--kind widget` was not rejected — it was
  dropped, and the entry written without it. Validation in `runAdd` was correct and simply never ran.

**The standing lesson for anyone adding a CLI flag here:** both bugs sat between commander and the
command function, which is the one seam the unit tests do not cross — `add.test.ts` calls `runAdd`
directly. A new flag is not done when `runAdd` handles it. Drive it through `runCli([...])` in
`cli.test.ts`, and run the built binary once, because a flag that is silently dropped looks exactly
like a flag that works.

Verified by execution, not by reading: `pnpm build && pnpm test && pnpm typecheck` all green at
**549 tests / 38 files**, and the built binary run against a scratch repo and against Clapline.
`catalogus detect` on Clapline now reports `opentelemetry [component]`, `nginx [component]`, a
`stack:` section (csharp, javascript, react, typescript), and `codex` — and no `agents-md`.

**Not done, and left for the owner:** `C:/Workspace/repos/Clapline/catalogus.yaml` itself is
unchanged. It still declares `agents-md`, carries no component or stack entries, and is missing five
real edges found during validation (Fly's managed Prometheus scrapes `fly-api`; Supabase's custom
SMTP sends through Resend; and `resend`, `cloudfront` and `supabase-auth` each need DNS records at
`namecheap-dns`, which only `fly-web` currently has an edge for). Writing to another repo was not in
scope for this pass.


## How to use this file

Check a box only when the work is done *and* verified — `pnpm build && pnpm test && pnpm typecheck`
green, and for user-facing behaviour, actually run rather than assumed. Prefer leaving a box unchecked
with a note over checking it optimistically; a status board that overstates progress is worse than none.

When a phase completes, record the verified numbers (test count, exit codes observed) in its section
so a later session can tell whether something regressed.

## Verify command

```
pnpm build && pnpm test && pnpm typecheck
```

Current baseline: **549 tests, 38 files, zero skipped.** Build and typecheck both exit 0.

---

## Phase 0 — Decisions and scaffold ✅

- [x] Resolve the open decisions from HANDOFF §9 that block the schema (see Decisions below)
- [x] pnpm workspace monorepo, ESM, TypeScript strict, vitest, tsup
- [x] `packages/schema`, `packages/core`, `packages/cli` skeletons
- [x] Root config: `tsconfig.base.json`, `vitest.config.ts`, `pnpm-workspace.yaml`, `.gitignore`
- [x] `CLAUDE.md` orientation file
- [x] All dependencies installed in one pass
- [x] Repository published — published as `github.com/Lecarvalho/dagstree`, branch `main`, initial
      commit `712a8a6`; renamed to `github.com/Lecarvalho/catalogus` on 2026-08-24, which GitHub
      serves as a redirect from the old URL

Note: pnpm 11's build-approval gate blocks esbuild's postinstall, which tsup needs for its
platform-native binary. `pnpm-workspace.yaml` carries an `allowBuilds: { esbuild: true }` stanza to
permit it. Without that, tsup's build step silently lacks its native binary on Windows.

## Phase 1 — `packages/schema`, the contract ✅

The manifest schema is both the contract every other package consumes and the security boundary that
keeps Layer 3 data out of a public repo. Built first for that reason.

- [x] JSON Schema 2020-12 for `catalogus.yaml` v1 at `packages/schema/schema/catalogus.v1.json`
- [x] TypeScript types derived from the schema, with a drift test
- [x] `validateManifest` / `parseManifest`, Ajv 2020 dialect, `allErrors` on
- [x] **Private key-name rejection** — every object closed with `additionalProperties: false`, plus a
      separately-evaluated deny rule so the error message redirects to the private overlay rather than
      saying "additional property not allowed". A schema-sync test enforces that all five object types
      carry the identical deny pattern, so the closure cannot drift.
- [x] **Private value-level guard** (`src/free-text-guard.ts`) — generic recursive walk over every
      string value, two tiers. Hard hits (email, currency amount, amount tied to a billing period,
      card-length digit run, API-key shapes, credential URLs) are validation errors. Soft hits
      (billing, invoice, renewal, subscription, seat, plan tier, account, credentials) are warnings.
      Matched text is redacted in every message — first and last two characters only.
- [x] Referential integrity checks the schema itself cannot express: duplicate local ids, dangling
      dependency edge targets, unknown `replaced_by` targets
- [x] Fixture corpus under `test/fixtures/{valid,invalid}/`

Verified: the HANDOFF §5 worked example validates clean. Five adversarial key-name shapes (root
`cost`, camelCase `costAmount`, hyphenated `monthly-cost`, doubly-nested `account_ref`, uppercase
`BILLING`) all rejected. Nine value-smuggling shapes all rejected, including a YAML anchor/alias pair
and an amount inside a folded block scalar — the walk runs on the parsed object, after alias
resolution, so YAML-level indirection does not hide anything.

## Phase 2 — `packages/core`, the detection engine ✅

- [x] Spike `@specfy/stack-analyser` against real repos before designing anything —
      results recorded in `docs/detection-spike.md`
- [x] Slug mapping table (`src/mapping.ts`), derived from observed output, with category per entry
- [x] Unmapped detections preserved and flagged rather than silently dropped
- [x] Custom detectors stack-analyser lacks: coding agents (`CLAUDE.md`, `.claude/`, `AGENTS.md`,
      `.agents/`, `.cursor/`, copilot instructions), MCP servers (`.mcp.json`, `.claude/settings.json`),
      hosting (`fly.toml`, `vercel.json`, `netlify.toml`, `render.yaml`, `wrangler.toml`),
      VCS and CI provider
- [x] Every detection carries evidence naming the file that proved it
- [x] Fixture-based tests, including the four-`fly.toml`-variants deduplication case

Verified against Clapline (read-only): Fly.io reported exactly once despite four `fly.toml` variants,
Claude Code detected once, evidence lists each distinct file once.

## Phase 3 — `packages/cli`, the offline commands ✅

No network, no auth, no backend. This is the phase that makes the tool useful day to day.

- [x] `catalogus init [path] [--yes] [--force]` — `--yes` fills project name, VCS provider and
      coding agents from detection and writes **no** service entries; see Phase 3.6's
      "init and add did not compose" for why that changed
- [x] `catalogus detect [path] [--json]`
- [x] `catalogus diff [path]` — reports both directions, and does not flag Layer 2 entries that are
      undetectable by design (a registrar, a PM tool) as stale
- [x] `catalogus validate [path] [--strict]` — schema, referential integrity, private-value guard,
      and the acyclicity check
- [x] `catalogus graph [path] [--mermaid]`
- [x] `catalogus add <service> [path] --role <r> [--depends-on <id>...]` — edits via the `yaml`
      Document API so comments and the `$schema` modeline survive
- [x] `catalogus set`, `catalogus link`, `catalogus deprecate` — added in Phase 3.6 to close the
      hand-edit gap; see "CLI gaps the skill exposed" below
- [x] `catalogus remove <id> [path]` — added in Phase 3.6; the only subtractive writer, and the one
      that makes a wrong `add` recoverable. See its own section below
- [x] `catalogus rename <old> <new> [path]` — the last writer, moving every edge and `replaced_by`
      that names the id along with the entry. See the `remove` section below
- [x] Manifest resolution: walks up from the working directory, `catalogus.yaml` preferred,
      `stack.yaml` accepted as a fallback on read, always writes `catalogus.yaml`
- [x] Errors to stderr, data to stdout, so `--json` stays pipeable

**Exit code contract** (verified by direct execution, all five):

| Situation | Exit |
|---|---|
| Valid manifest | 0 |
| Hard validation failure (schema, cycle, private value) | 1 |
| Soft warning only | 0, warning on stderr |
| Soft warning under `--strict` | 1 |
| Usage error — no manifest found, unreadable | 2 |

A detected cycle prints the actual path (`svc-a -> svc-b -> svc-c -> svc-a`), not merely the fact
that one exists. Toposort is iterative, and a self-edge is caught.

## Phase 3.5 — Defect fixes from verification ✅

Found by an independent verification pass over Phases 0–3 and fixed.

- [x] **Value-level private data was not screened by `validate`.** A hand-edited manifest carrying a
      cost amount, an email and a renewal date in `services[].notes` validated clean, exit 0. The
      guard existed but lived in the CLI and was only called on the `add` write path, so it vanished
      the moment anyone edited the YAML by hand — which is an entirely ordinary thing to ask an agent
      to do. Moved into `@catalogus/schema` and called by `validateManifest` itself, so Phase 5 push
      and Phase 6 MCP inherit the same boundary rather than each needing to remember it.
- [x] Hosting evidence was not deduplicated by file when the custom detector and stack-analyser both
      flagged the same file
- [x] `pnpm typecheck` was failing on a vitest mock-typing error in `packages/cli/src/cli.test.ts`
- [x] `add` took `--path` while every other command took a positional `[path]`; because
      `--depends-on` is variadic, a trailing path was silently swallowed as a dependency id

- [x] **The high-entropy token rule fired on ordinary prose.** Closed after three attempts and two
      adversarial reviews. Worth reading before touching `packages/schema/src/free-text-guard.ts`,
      because the first two fixes each looked correct and each shipped a worse guard.

      *The bug.* `LONG_TOKEN_RE` matches `[A-Za-z0-9+/]{32,}` because `/` and `+` are base64
      alphabet characters. They are also path separators. So the first genuine manifest anyone wrote
      failed HARD, exit 1, blocking `validate` and `graph`, on
      `Domain/Application/Infrastructure/Api` — a .NET layer list in an architecture description.

      *Attempt 1* excluded tokens whose `/`- and `+`-separated segments were all purely alphabetic.
      Review measured the assumption and it was false in both directions:
      `SECRET_KEY=<token>` validated CLEAN, a key laundered behind a path prefix
      (`config/secrets/<32-char key>`) validated CLEAN, digit-free base64 leaked at 0.26%, while
      absolute paths, trailing-slash paths, `.../Api/V2` and plain documentation URLs all still
      failed HARD.

      *Attempt 2* added label precedence, segment caps and a word-shape test. Review found
      doubled-separator schemes (`s3://`, `gs://`, `rsync://`, UNC `//host`) still failed HARD,
      because only one leading empty segment was dropped.

      *Current design*, in order: a secret label attached to the token (`hasSecretLabelBefore`) is an
      unconditional HARD hit that no exclusion can override; then split on `[+/]`, drop **all**
      leading and trailing empty segments, require at least two remaining, cap segment length, and
      require each segment to be word-shaped (letters plus a bounded digit suffix, with a word-start
      ratio floor).

      *Measured leak*, independently reproduced with crypto-random sampling against the built output:

      | alphabet | 32 chars | 40 chars | 64 chars |
      |---|---|---|---|
      | general (digits included) | 0.22% | 0.04% | 0.00% |
      | digit-free | 28.1% | 21.1% | 4.8% |

      **The digit-free row is a real, structural weakness, not a rounding error.** The required-clean
      fixture `MySQL8` pins the word-start ratio floor at exactly 3.0, and a random 50/50-case letter
      sequence averages about 4, so the shape test has little power against pure letters with no
      digits. It is tolerable today because a uniformly random base64 secret is digit-free at 32
      characters only about 0.4% of the time, which is why the general row — the number that governs
      real accidental-commit risk — stays near 0.2%. It would stop being tolerable if the threat
      model ever shifted from "a helpful agent pastes a secret by accident" to "someone shapes a
      secret to evade the guard". Enforced by `packages/schema/src/free-text-guard.leak.test.ts`,
      which uses a seeded deterministic PRNG and asserts a ceiling per length.

      *If you change this predicate:* re-run the leak test and update the measured numbers in the
      module comment. Both failed attempts asserted a rate in a comment without measuring it.

## Phase 3.6 — Dogfooding and the agent skill ✅ complete

Both cold runs are done and the skill produced a manifest the owner accepted for v1. What remains
under this phase is follow-up work, listed in "Open questions this raised" and "Two pre-existing
holes every writer shares" below — none of it blocks the viewer.

Using the tool on real projects, which is the most honest test Phases 1–3 will get, and the source
material for teaching an agent to do the same.

- [x] Reference manifest at `examples/reference.catalogus.yaml` — deliberately **synthetic**, naming
      no real project. It exists to give the drift test a complete document and the skill something
      to be judged against, and it covers the shapes that matter: one provider with an entry per
      deployed app, one service in two roles as two entries, a `phasing_out` entry with its
      `replaced_by`, off-repo services no scan can find, and edges pointing depender-to-dependency.
      It replaced a manifest derived from a real private project — publishing that project's whole
      service inventory and topology in a public repo is a different thing from publishing a schema
      example, and the example does its job without it.
- [x] **Agent skill**, source of truth at `skills/catalogus/SKILL.md` in this repo. It is a shipped
      product artifact and is versioned next to the schema and CLI it documents. Teaches evidence
      gathering, the proven-versus-mentioned distinction, the gap catalog, how to ask the user well,
      the manifest format in full, and validation with or without the CLI. It must work in the harder
      of its two environments: a client repo with no Catalogus checkout, no CLI on `PATH`, and no
      backend account.
- [x] Installation is a file copy into `.claude/skills/catalogus/SKILL.md`, project-level or
      user-level — see `skills/README.md`. A dedicated installer script was written and then removed:
      one file, one destination, no transformation, so it was ceremony around `cp`. It becomes a
      `catalogus` subcommand once the CLI is published and there is a schema version worth checking
      the skill against.
- [x] **Drift check** — `packages/schema/src/skill-drift.test.ts`, 4 tests, green. Two checks,
      because a fragment and a full manifest drift differently. An unmarked ```yaml block in
      `SKILL.md` is treated as a complete manifest and run through `parseManifest` exactly as a
      client-repo agent would; none exist today (the skill is CLI-mandatory and deliberately does
      not invite hand-authoring), so the loop is a tripwire for the day one is added back. A block
      marked `<!-- catalogus:fragment -->` is deliberately partial and can never pass full
      validation, so instead every field name and enum value it uses is walked against
      `catalogusSchemaV1`'s own definitions — a renamed field or a dropped enum value fails it. The
      same file also validates every `examples/*.catalogus.yaml` end to end, with zero warnings
      required.
- [x] **CLI installed and on `PATH`.** `pnpm run link:cli` (`scripts/link-cli.mjs`) writes
      `catalogus`, `catalogus.cmd` and `catalogus.ps1` into npm's global bin directory — already on
      `PATH` on a stock Node install — pointing at this checkout's `packages/cli/dist/cli.js`.
      Verified in cmd, PowerShell and Git Bash: `catalogus --version` prints 0.0.1 at exit 0, and
      `catalogus validate` with no manifest exits 2, so exit codes propagate through every shim.
      `pnpm run unlink:cli` removes them.

      *Why shims rather than a global install.* `packages/cli` reaches `@catalogus/core` and
      `@catalogus/schema` through `workspace:*`, so `pnpm add --global ./packages/cli` tries to
      resolve two unpublished packages from the registry and fails; pnpm 11 has also dropped
      `pnpm link --global`. Running the built entrypoint in place resolves dependencies from this
      checkout's own `node_modules`. The shims therefore survive a rebuild without relinking, and
      nothing edits the user's `PATH`. This stops being the right answer once the package is
      published — then it is `pnpm add --global @catalogus/cli` and this script is deleted.
- [x] **Cold test, first run** — done, from Clapline, in a separate session. See "What the first
      cold run produced" below for the result and the two defects it found.
- [x] **Second cold run — done, and it is the best result the tool has produced.** Run by the owner
      against a real working tree with the current skill and CLI. **25 services, 31 edges, 7 notes,
      `validate` and `validate --strict` both exit 0**, against 23/28 on the first run and 21/24 on
      the clone rehearsal. Owner's verdict: good enough for v1. (A third run has since replaced that
      file with 26 services and 30 edges, no notes and no lifecycle entries — see Phase 3.6.1.)

      Measured from the transcript, not self-reported: **33 tool calls in 10 minutes**, against 58 in
      roughly 18 for the rehearsal — with a richer result. The four things the skill was changed for
      all landed:

      - **`catalogus detect` ran third**, after reading the skill and the `--version` prerequisite
        check, with no exploration before it. That was the reported defect and it is fixed.
      - **Edges were derived, and modelled better than before**: logical services separated from
        where they run (`loki -> fly-loki`, `grafana -> fly-grafana`) rather than collapsed,
        `github-actions` fanning out to all four deploy targets, `vertex-ai -> gcs-video-temp`.
      - **One question batch, four questions, none of them discoverable** — registrar/DNS, the
        CloudFront origin, off-repo services (listing what it had already found), lifecycle. The
        answers came back into the file: the CloudFront note records "confirmed by owner, wired in
        the AWS console", and the lifecycle question produced the first `phasing_out` entry any cold
        run has generated, with its `replaced_by`.
      - **`catalogus set project.name` was exercised**, an hour after it existed.

      One instruction missed its target. The batching rule produced shell-level batching (`for f in
      ...`, chained `set -e` blocks) rather than concurrent tool calls — 33 calls across 33 turns,
      never more than one per turn. The wall clock still nearly halved, and for reading files one
      round trip beats several, so the substance landed. The wording now names both forms explicitly
      rather than saying "one batch of calls" and leaving it to interpretation.

### What the first cold run produced

The agent ran against a real private project and wrote a manifest into that repo, where it stays —
it is not reproduced here, and the details of a private system are deliberately not recorded in a
public status board. What matters for this project is the shape of the result:

- **23 service entries and 28 edges**, against 10 the reference example carries.
- A note on nearly every entry, each one specific about what that instance does.
- `added` dates recovered per service from git history rather than defaulted.
- Several entries that no scan could ever have produced: the domain registrar, an uptime-check
  target, a console-configured analytics beacon, the alert contact point, and one hosting provider
  correctly split into five entries by what each deployed app runs.
- An architecture description in the owner's own words rather than inferred from directory names.
- `catalogus validate` exits 0 on it.

So the question flow works. That was the thing most at risk, it is the part no test can check, and
it needed a human to judge — the owner's assessment of the questions asked was "very accurate".

- [x] **The reference example is now synthetic.** The cold-run manifest is richer, but it belongs to
      the project it describes and stays there; `examples/reference.catalogus.yaml` covers the same
      shapes without naming anything real. A future cold run is judged on whether it produces those
      shapes — entries per deployed app, one service split across roles, lifecycle, off-repo
      services, real edges — not on matching a fixed list of services.

### Second defect the cold run found — the soft guard fires on payment-service prose ✅ decided

`catalogus validate` on the cold-run manifest exits 0 but prints two soft warnings, both on the
Stripe entry's notes: *"Checkout, Billing Portal, webhooks; subscription tiers plus credit packs"* —
flagged for `billing` and for `subscription`.

Under `--strict`, which the skill and README both name as the CI setting, that manifest **exits 1**.

The reading matters and has not been settled:

- *False positive.* "Billing Portal" is the name of a Stripe product and "subscription tiers" names
  the thing being sold. Neither is the owner's plan, price or account. SKILL.md tells the agent that
  a guard rejecting ordinary prose is a bug to report rather than reword around — this is that case,
  and the agent (correctly) did not reword it.
- *Working as intended.* The soft tier exists to make a human look, it does not block, and a note
  about subscription tiers on a payments provider is exactly where Layer 3 data would leak in.

What is not defensible is the current combination: any project that uses a payment processor and
describes it honestly cannot pass `validate --strict`, which makes the documented CI setting unusable
for that whole class of project.

- [x] **Decided: keep the behaviour, stop recommending `--strict` for CI.** No code change; the
      hard tier already fails `validate` on its own and holds the boundary in CI without a flag.

      *Why not narrow by category.* The proposal was to suppress `billing`/`subscription` inside a
      `notes` field on a `payments` entry. That patches keyword inference by adding a second
      keyword rule, and it fixes exactly one domain: an invoicing SaaS, a marketplace or a
      subscription-box store hits the identical wall, each needing its own special case. The
      ambiguity is in the word, not in the list — whether `billing` is a leak or the project's
      ordinary vocabulary depends on what the project does, which no word list can know.

      *What was actually wrong.* Decision 7 says the soft tier exists to make a human look, and that
      a guard which cries wolf gets switched off. CI is not a human looking. Promoting every soft
      warning to exit 1 made the soft tier behave like the hard tier, which erases the reason there
      are two. The comparison that settled it: GitHub push protection blocks on token *shapes* with
      known prefixes, never on the word "billing" — the same split, and we had wired the word tier
      to a failing exit code.

      Changed in three places, docs only: `skills/catalogus/SKILL.md` no longer names `--strict` as
      the CI setting and says why; `README.md`'s CI line says to run without it; and
      `packages/cli/src/commands/validate.ts`'s module comment records the reversal with the
      payments-prose evidence, so the next reader does not re-recommend it. `--strict` still works
      for anyone who wants it locally.

### Detection gap found by dogfooding — the scanner missed config-wired services ✅ closed

Measured against Clapline before the fix. Detection reported, as services: Fly.io, GitHub, GitHub
Actions, Claude Code, Slack. Clapline's `appsettings*.json` key groups show it actually uses:
Supabase, OpenAI, Anthropic, Gemini, ElevenLabs, xAI, AWS, Resend, Stripe, OTLP.

**Zero overlap.** The scanner missed the database and the payment processor on a real project.
The cause is that Clapline's backend is .NET and those services are wired through configuration,
not through npm packages — `@specfy/stack-analyser` reads dependency manifests, and a .NET config
file is not one. Any repo whose backend is not Node hits this.

- [x] **Config-key detector** — `packages/core/src/detectors/config-keys.ts`, 15 tests. Reads
      `appsettings*.json`, `.env.*` templates, `docker-compose*.yml`/`compose*.yml` and
      `config/*.yml`, walking up to four directories deep (Clapline's settings file is at
      `src/backend/Sluglin.Api/`, so a root-only scan would have missed the very thing being fixed)
      and skipping build output, since a .NET build copies `appsettings.json` into `bin/` and
      `obj/`. Key names are tokenised and matched against a brand-name catalog on **whole-token
      prefixes**, never substrings — that is what keeps `NOTIONAL_VALUE` from reading as Notion. A
      hit can be refined by the group's own child key names: `AWS` with a `Bucket` child is S3, and
      `Gemini` with a GCP `ProjectId` is Vertex AI rather than the public API — a different account
      and a different bill. Results land in `DetectionResult.configServices` and merge by slug into
      `detect`, `diff` and `init --yes`.

      *Values are never read.* The only place the module looks right of a key is the `NAME=value`
      form of an environment list, where it takes the characters before the `=` and discards the
      rest unexamined. A bare `.env` is never opened at all — reading names would be safe, but the
      cheapest way to never leak a secret is to never read the file. Two tests pin this: a sentinel
      value written into fixtures must not appear anywhere in the result, and a `.env` holding a
      would-be secret must produce no detections.

      **Verified against Clapline** by direct execution, not assumed: all ten services now detected
      — Supabase (db), OpenAI, Anthropic, Vertex AI, ElevenLabs, xAI (ai), OTLP as OpenTelemetry and
      Grafana (analytics), Resend (other), Stripe (payments), AWS S3 (storage), each with the
      settings file and key that proved it.

      Known ceiling: the catalog is brand names only. A provider it does not know leaves a key group
      nobody claims, which is a `catalogus add` — deliberately, since admitting generic words
      (`Auth`, `Cdn`, `Database`) would turn every settings file into a wall of false detections.
      Loki is the live example: Clapline runs it, but only `fly.loki.toml` and Grafana provisioning
      name it, so it arrives as Fly.io hosting and the service entry stays human-supplied.
- [x] **Category mapping widened — 57 new catalog rows.** Every row was cross-referenced against
      stack-analyser's own installed rule source (`rules/<type>/<key>.js`) rather than written from
      memory, and carries its provenance in the file's existing convention. A third tier was added
      to that convention and documented in the module comment: `verified: rules/<type>/<file>.js`,
      for real services that neither the spike nor HANDOFF.md happened to name but that match the
      breadth this item asked for. `SPECFY_TYPE_TO_CATEGORY` also widened (`cloud` → hosting,
      `network` → dns).

      Known ceiling, and it is the schema's rather than the table's: HANDOFF §4's category enum has
      13 values and no bucket for monitoring, queue or email, so Sentry, Datadog, SQS, RabbitMQ,
      Resend, SendGrid and Twilio land in `other` despite being unambiguously services. Widening
      the enum is a schema change and was not taken here.
- [x] **Libraries are now separated from services rather than suppressed.** stack-analyser already
      tags every tech with its own `type`, so the classification uses that signal instead of a
      second hand-maintained list: `DetectionKind` is `"service" | "library"`, derived from a
      denylist of 16 `type` values that name developer tooling (`framework`, `linter`, `language`,
      `runtime`, `tool`, `ui`, …). Anything with a type the table has never seen defaults to
      `service` — biased toward visibility, so an unclassifiable detection shows up rather than
      hides. Catalog rows carry an explicit `kind` that overrides the default in both directions
      (`gitlab` is a service despite its `type` being `tool`; `mcp` and `lucideicons` are libraries
      despite being catalog-worthy).

      `detect` now leads with services grouped by category and collapses libraries to a count with
      a `--all` to list them; `diff` gives the "detected but missing" list the same treatment.
      `--json` is unchanged in completeness — every record still present, now carrying `kind`.
      Verified by execution against fixpic: three services shown by category, 12 libraries
      collapsed, and `--json` still carrying all 17 records.

What no scanner can ever supply, by design (HANDOFF §3) — this is why `catalogus add` and the agent
skill's question flow exist, and it does not shrink as detection improves:

- **Roles.** That Supabase is used as database *and* auth, as two separate nodes.
- **Edges.** That `fly-api` talks to `supabase-db`. Entirely human-supplied, and it is the product.
- **Lifecycle.** What is being phased out and what replaces it.
- **Off-repo services.** Registrar, PM board, anything configured in a web console.

### The defect the first cold run found — init and add did not compose ✅ fixed

Watched live: the agent wrote the manifest, deleted it, and re-ran `init`. Reproduced on a
Clapline-shaped fixture (`src/backend/Api/appsettings.json`, two `fly.*.toml`, `.github/workflows`,
`package.json`, `CLAUDE.md`) — the skill's own steps could not be executed as written.

`init --yes` prefilled one service entry per detection, using the detection **category** where the
schema wants a **role**: `role: db`, `role: vcs`, and for Resend the meaningless `role: other`. Step
6 of the skill then says to run `catalogus add supabase --role database --id supabase-db`. Both
commands succeed, and the file ends up with three supabase entries — `supabase` (role `db`, from
init), `supabase-db` and `supabase-auth`.

There was no way back. `add` only appends, there is no `remove`, no command changes a role,
`init --yes` a second time exits 2 ("already exists"), and plain `init` needs a TTY an agent does
not have. Deleting `catalogus.yaml` and re-running `init` was the only move the CLI left, which is
exactly what happened.

Note the shape of this: `set`/`link`/`deprecate` were added and the skill was rewritten to say "there
is no hand-edit exception" without anyone checking that init → add composes. Each command worked;
the sequence did not.

- [x] **`init --yes` no longer writes service entries.** It fills project name, VCS provider and
      coding agents, counts what detection found, and prints "N service(s) detected and not yet
      declared — run `catalogus diff` to list them". `diff` was already the work list; it just was
      not being used as one. Chosen over keeping the prefill and adding `remove`, because the
      prefilled roles were wrong on every entry anyway, so the prefill created cleanup rather than
      saving it.
- [x] Skill steps 2 and 6 rewritten to match: step 2 explains why the services list is empty
      (category is not a role), step 6 starts from `catalogus diff`. Added an explicit
      **never delete `catalogus.yaml` to start over** — it is a committed file that may hold answers
      an earlier session got from the user.
- [x] Verified end to end on the fixture: `init --yes` → `diff` (6 detected, none declared) →
      seven `add`s with real roles (`hosting-api`, `hosting-web`, `database`, `auth`, `ai-models`,
      `payments`, `email`) → `link` → `set` → `validate` exit 0. No duplicates, no deletion.

### `catalogus remove <id>` — the last unrecoverable state ✅ built and audited

Every writing command is additive. Nothing takes anything out. So one wrong `add` — a typo'd role, a
service the user turns out not to use, an entry created before a contradiction was resolved — cannot
be undone by the CLI at all, and the only remaining move is to delete `catalogus.yaml` and start
over. That is the exact loop the first cold run fell into, and removing the `init` prefill only
removed the most common *cause*; it did not give anyone a way back.

`SKILL.md` currently tells the agent to stop and say so rather than clear the file. That is a
stopgap: it converts a silent corruption into a dead end. **Build this before the next cold run** —
an agent that cannot recover from its own mistake will either freeze or do something worse.

- [x] `catalogus remove <id> [path]` — delete one service entry from `services[]`.
- [x] **Cascade the edges.** Every entry in `dependencies` naming the id, in *either* direction, goes
      with it. Leaving one behind is a dangling edge, which fails referential integrity on the next
      `validate` — so a `remove` that did not cascade would trade one unrecoverable state for
      another. Report each dropped edge by name; a destructive command should say what it did.
- [x] **Refuse when another entry's `replaced_by` names the id**, listing the entries that point at
      it. `replaced_by` is a lifecycle claim someone made deliberately ("this is what replaces it"),
      not a detail to clear silently, and clearing it would quietly erase the migration from the
      Phase 7 dashboard. The message should say what to do: re-point or clear it with
      `catalogus deprecate` first, then remove. Reconsider a `--cascade` flag only if this turns out
      to be common in practice.
- [x] Route through `packages/cli/src/manifest-edit.ts` like every other writer, so the result is
      validated before it is written and the `$schema` modeline and comments survive.
- [x] Exit codes, matching `link` and `deprecate`: unknown id → 1 with the known ids listed; no
      manifest → 2; a removal that would leave the manifest invalid → 1, nothing written.

**Built, then audited twice** — the second audit ran because the first one's fixes needed checking,
and it was right to: it found that one "fixed" item was not fixed and that four of the new
assertions could be deleted with the suite still green. `remove.test.ts` is 23 tests; the full
suite is 489 across 36 files.

What the audits established, by executing the built binary against hand-written adversarial
manifests rather than by reading the source:

- The cascade is correct for both edge forms mixed in one file, both directions, ids that are
  prefixes of each other (in both list orderings), zero-edge removals, `notes` on object edges,
  removing the last remaining service, and flow-style `dependencies`. `validate` exits 0 after
  every successful removal.
- The `replaced_by` refusal leaves the file **byte-identical**, verified by checksum, and lists
  every pointing entry when more than one names the target.
- Exit codes match `link` and `deprecate` character-for-character, including the `(none yet)`
  rendering for an empty manifest.
- The private-value guard still runs on this write path, and the `$schema` modeline and hand-written
  comments survive every write.

**Comment attachment was the right thing to fear, and the first fixture got it backwards.** The
`yaml` package attaches a comment written above the *first* item in a sequence to the **sequence
node** (`seq.commentBefore`), not to that item — so splicing item 0 leaves it behind, sitting at
list-item indentation above whatever now comes first, where it reads unambiguously as that entry's
own header. That is precisely the failure this section predicted, at the one comment position the
original tests declared safe. It cannot be cleared on a guess either: several lines above the first
item are joined into one `commentBefore` string, so a genuine list header and a note about the first
entry are inseparable once parsed. So `remove` reports it instead — naming the entry the text now
sits above, or saying the list is empty when the removal emptied it. The trailing-comment hazard is
real but milder: it keeps the predecessor's key indentation, so it still reads as that entry's
trailing note rather than as a header for what follows.

**The assertions are load-bearing, proven by mutation.** Five mutations were applied one at a time
and each turned exactly one test red: dropping either half of the services conjunction, dropping the
`includes(0)` half of the dependencies conjunction, turning the entry lookup into a prefix match, and
removing the empty-list wording. Before those tests were added, all five mutations passed green —
including a prefix-match entry lookup, which would delete the wrong service and report success.

Two findings that are **not** defects in this change set, both pre-existing and shared with the
other writers, recorded below as their own items: the ancestor-walk hole and the misattributed
pre-existing cycle. Both have since been closed in `manifest-edit.ts` — see that section.

**The part most likely to break, and therefore the part to write a fixture for first:** comment
attachment. Deleting an item from a `YAMLSeq` is not like appending to one. A comment written above
an entry may be attached to that entry's node and vanish with it, or may be held as a *trailing*
comment on the previous entry and survive — now sitting above, and appearing to describe, the wrong
service. The fixture needs comments in all three positions (above an entry, inline on its `id`, and
between two entries) with assertions on which survive and where, because "comments are preserved" is
not a single behaviour here.

Considered and declined for v1: `--dry-run`. The printed report of what was removed, plus the fact
that the file is in git, covers it; a flag that exists to preview a command nobody can undo is
treating the symptom.

Then, for the same reason and once `remove` exists:

- [x] **Correct a `role` on an existing entry.** Done: `catalogus set services.<id>.role <role>`. The
      field name is dynamic, so it is matched by pattern rather than listed in the static field
      table, and `SETTABLE_FIELDS` advertises the literal placeholder `services.<id>.role` — a list
      that cannot contain every id has to show the shape instead. Both the id's slug shape and the
      role value are checked before the manifest is opened, and the id's existence is checked after
      opening but before any write, so the "a bad second pair leaves the first unwritten" property
      holds for dynamic fields too. Unknown id exits 1 with the known ids listed, matching `link`,
      `deprecate` and `remove`.
- [x] **Correct `project.name` and `project.slug`.** Found by the cold run below, which walked into
      a dead end: `init --yes` derives both from the directory name — a guess — `init` runs once, and
      `set` excluded them on the stated grounds that they "belong to `init`". That rationale only
      holds if `init`'s value is always right, so it was rewritten rather than extended: a field
      belongs to `set` when its first value was a guess only a human can correct, whichever command
      wrote it down first.

      Recorded in the code while it was cheap: changing `project.slug` is safe today because nothing
      inside a manifest references it — service ids are local — but in Phase 4/5 the slug becomes the
      project key the backend row is keyed on, so renaming after a `push` would orphan that row.
      Whoever builds `push` decides what a slug change means then.
- [x] **`init` no longer tells the user to hand-edit.** It wrote `# visibility below is a guess
      (private) -- edit if this repo is public` into the manifest, instructing the reader to do the
      one thing the skill forbids. It now names the command: `catalogus set project.vcs.visibility
      public`.
- [x] **Correct an `id`. Done: `catalogus rename <old> <new> [path]`.** Not a `set`: an id is
      referenced from three places outside the entry carrying it — both endpoints of every
      dependency edge, and any other entry's `replaced_by` — so writing only the field leaves a
      manifest that fails referential integrity on the next `validate`. It shares `remove`'s
      find-every-reference traversal, and was built after it as planned.

      Simpler than `remove` in the one place that mattered: nothing is spliced out of a sequence, so
      none of `remove`'s comment-attachment hazards apply — every reference is overwritten in place
      and the node keeping the comment is still there. Both edge shapes are handled (a `[from, to]`
      tuple and a `{from, to, notes}` object), the object edge's `notes` survives, and an inline
      comment on the id itself rides along.

      *A claim written into that module was measured and turned out false, so it was corrected
      rather than shipped.* The first draft said the scalars are mutated through their nodes because
      `doc.setIn` would replace the node and take an inline comment with it. A mutation test proved
      otherwise — an inline comment on `id: fly-api # the public API` attaches to the **pair**, not
      to the value scalar, so `setIn` keeps it. The real reason `renameScalar` exists is that it
      reports whether it found what it expected, which `setIn` cannot: `setIn` writes the new id
      whether or not the old one was there. The module comment now says that instead.

      Refusals, all matching `link`/`deprecate`/`remove` character-for-character and verified by
      executing the built binary: unknown id → 1 with the known ids listed; `<new>` already held by
      another entry → 1 in its own words rather than as "duplicate id", which would read like a bug
      in the tool; a malformed id on either side → 2 before the file is opened; no manifest → 2.
      Renaming an entry to its own id is a no-op at exit 0, matching `link`'s treatment of an edge
      that already exists. The manifest is byte-identical after all five, verified by checksum.

      11 tests plus a `cli.test.ts` case for the argv wiring — two positional ids ahead of the
      optional `[path]` is the shape most at risk of commander swallowing the directory, the bug
      `--depends-on` hit in Phase 3.5. **Six mutations, and two of them initially survived**, which
      is the reason to run them: a prefix-matching entry lookup (the defect the `remove` audits
      caught, which would rename the wrong service and report success) passed green because the
      fixture declared the shorter id first, where a prefix match happens to land correctly — the
      fixture now declares `api-worker` before `api`; and the `setIn` mutation above, which was a
      wrong claim rather than a weak test. The other four — edges not traversed, `replaced_by` not
      traversed, object-form edges ignored, collision check removed — each turned exactly the
      expected tests red.

### Rehearsal cold run on a Clapline clone — what it proved and what it cost ⬜ partial

Not the second cold run: it ran against a `git clone`, which turned out to be a materially weaker
target than the working tree, and it was driven by a subagent rather than by a person, so nobody
answered the step 5 questions. Recorded because what it found is worth keeping.

**Result: 21 services, 24 edges, `validate` and `validate --strict` both exit 0.** The `--strict`
decision above holds on a real manifest carrying a Stripe entry, which is the case that motivated it.

**The clone was missing the evidence that matters most.** `appsettings.Development.json` and
`.env.local` are gitignored, and that is where Supabase, ElevenLabs, AWS, xAI and Vertex are
configured. The committed `appsettings.json` names only OpenAi, Anthropic, Otlp, Stripe, Resend and
Cdn. So detection found ten services where the working tree would have given it more — and the
first read of that was "the detect changes regressed", which they had not. **Verify a clone carries
the ignored files before treating it as a stand-in for a repo.**

**The agent recovered the missing five anyway**, from `RequiredConfigurationGuard.cs`, the adapter
classes under `Infrastructure/ExternalSystems`, `ops/DEPLOY.md` and the team's own C4 diagram. That
is the finding worth generalising, and it is now in the skill: code names a provider whether or not
a settings file does.

**Edges came out derived rather than guessed** — `cloudfront -> aws-s3` from the distribution
origin, `github-actions -> fly-api`/`fly-web` from the deploy workflow, `grafana -> loki`/
`supabase-db`/`slack`/`healthchecks-io` from provisioning, `fly-web -> fly-api` from the frontend's
environment. Every one of those is a category previously described here as human-supplied only.

**Timing.** 58 tool calls, roughly 18 minutes, entirely serial. The corroboration reads and the
per-service `git log` calls are independent of each other, and the skill never said so. It does now,
along with an optional delegated research pass for harnesses that can run one.

- [ ] The real second cold run, on a working tree with its ignored config present, driven by a
      person who answers the questions. That is still the outstanding item at the top of Phase 3.6.

### Open questions this raised ⬜ open

- [x] **A codename is not a contradiction — decided.** The first cold run flagged the product name
      versus the .NET namespace name as an unresolved contradiction; the second silently resolved it
      and did not ask. Owner's ruling: reconciling internal and product names is not this tool's job.
      The deliverable is providers, services, external dependencies and the relationships between
      them. The skill's contradiction rule is now scoped to contradictions that change what gets
      written — two providers claimed for one job, a service in prose with no configuration, an
      environment disagreeing with the deploy config — and says so explicitly.
- [x] **`role` is an unconstrained slug — settled as a documented convention.** The schema types it
      as `$defs/slug` with examples, not an enum, and the runs produced nine granularities:
      `ai-text`, `ai-text-image`, `ai-video`, `monitoring-dashboard`, `monitoring-deadman`,
      `storage-media`, `storage-temp`, `logs-storage`, `registrar-dns`. Nothing was wrong with any
      of them in isolation, but Phase 7 makes `role` a facet and free-form granularity does not roll
      up.

      **Owner's decision: a documented convention, no schema change.** `skills/catalogus/SKILL.md`
      gained a "Naming a role" section under step 6 with three rules:

      - *Start from a base word* — a list of about twenty (`hosting`, `database`, `auth`, `storage`,
        `cache`, `queue`, `search`, `ai`, `payments`, `email`, `sms`, `monitoring`, `logs`,
        `analytics`, `dns`, `registrar`, `cdn`, `vcs`, `ci`, `pm`, `secrets`). Reusing one beats
        inventing a synonym.
      - *Qualify only to disambiguate* — write `hosting`, not `hosting-api`, until a second entry
        would also be `hosting`; then both get a qualifier (`hosting-api`/`hosting-web`,
        `storage-media`/`storage-temp`, `ai-text`/`ai-video`). A qualifier on a role nothing
        collides with is noise.
      - *The segment before the first `-` is what rollups group on.* That is the whole point of the
        base-word rule: `monitoring-dashboard` and `monitoring-deadman` both count as `monitoring`,
        `ai-text` and `ai-video` both count as `ai`. **The viewer groups on that segment.**

      A compound naming two jobs (`registrar-dns`) is explicitly not a qualifier — it groups under
      neither, so pick the primary job, or make it two entries the way Supabase is `supabase-db` and
      `supabase-auth`.

      *Roles and categories are deliberately not the same vocabulary*, and the skill says so. A
      category describes a provider in the global catalog and has to be wide enough to hold Twilio
      and Resend under `messaging`; a role describes what one instance does in one project, where
      `email` and `sms` are different jobs. The first draft of the base-word list used `messaging`
      for both and contradicted `examples/reference.catalogus.yaml`, which uses `role: email` and is
      right to.

      Reversible on purpose: nothing enforces it, so if the convention does not hold up in the next
      cold run it can be tightened into an enum or dropped without a migration.
- [x] **`diff`'s "declared in the manifest but no longer detected" read as a delete list. Fixed.**
      On the clone it named five services that were entirely real, just configured in files
      detection could not see. The skill warned against acting on it, but the wording itself invited
      the mistake — "no longer detected" is a claim about the world, and what the command knows is a
      claim about one checkout.

      The heading is now **"Declared in the manifest but not visible to detection here:"**, and a
      non-empty list is followed by three lines saying outright that it is not a delete list and
      why. Two reasons are named where the command actually knows one: an entry the manifest itself
      marks `deprecated`/`phasing_out`/`removed` is annotated `-- marked <status>, so this is
      expected`, and `detection.warnings` — a settings file that exists but would not parse — is now
      surfaced under "Detection could not read everything in this checkout" instead of being
      dropped on the floor, since "found nothing" and "could not read" are different facts and the
      second is the likeliest reason a line is on that list at all.

      The `--json` key `staleServices` was renamed `notDetectedServices` and gained `status`, with
      `detectionWarnings` alongside it. A key named "stale" makes the same wrong claim to a program
      that the old heading made to a person, and a program acting on "stale" deletes. Nothing
      consumes the old key — the CLI is unpublished and `SKILL.md` never named it — so this was the
      cheap moment to fix it.

      `skills/catalogus/SKILL.md` quotes the heading, so it changed in the same commit. Verified by
      execution against a scratch project carrying an unparseable `.mcp.json`, a `phasing_out` entry
      and an undetectable one: all four elements render, exit 1. 4 new tests, and the existing diff
      tests were updated to the new strings rather than left asserting the old ones.
- [x] **The category enum had no bucket for monitoring, queue or email — widened, with the spec
      amended.** Sentry, Datadog, New Relic, SQS, RabbitMQ, Resend, SendGrid, Mailgun and Twilio are
      unambiguously services and all landed in `other`.

      *Correction to what this item used to say.* It described widening the enum as "a schema change
      plus a skill change in the same commit, per the drift test". Checked: `category` is **not** a
      field in `catalogus.yaml` and appears nowhere in `packages/schema` or in `SKILL.md`. It is
      `ServiceCategory` in `packages/core/src/types.ts`, consumed by `mapping.ts` and by `detect`'s
      grouped output, and it was pinned by **HANDOFF §4**. So the change was core + HANDOFF, and the
      drift test was never involved.

      **Owner's decision: add `monitoring`, `queue` and `messaging`.** `messaging` rather than
      `email` because Twilio is SMS and voice, so an email-only bucket does not hold it while a
      messaging bucket holds Resend, SendGrid, Mailgun, Twilio, Slack and Discord alike.

      Done, in this order and for this reason — the spec first, since CLAUDE.md makes HANDOFF.md the
      source of truth:

      - **`docs/HANDOFF.md` §4 amended**, and the document gained an **amendment log** under its
        header saying what changed, when, why, and that the owner approved it. A source-of-truth
        document that changes silently stops being one.
      - `ServiceCategory` is now derived from an exported `SERVICE_CATEGORIES` array rather than
        being a bare type union. The union is erased at build time, so `mapping.test.ts` had
        retyped the whole enum as a second copy — which passed green while the spec moved
        underneath it. One list now, and the test reads from it.
      - Rows moved in **both** catalogs. `mapping.ts`: Sentry/Datadog/New Relic → `monitoring`,
        SQS/RabbitMQ/Supabase Realtime → `queue`, Resend/SendGrid/Mailgun/Twilio/Slack →
        `messaging`. `detectors/config-keys.ts`: OpenTelemetry/Grafana/Loki/Sentry/Datadog/
        Prometheus → `monitoring`, Resend/SendGrid/Postmark/Mailgun/Twilio/Slack/Discord →
        `messaging`, RabbitMQ → `queue`. PostHog stays `analytics` — the split is what the thing is
        *for*: observability that tells you the system is broken versus measurement of how it is
        used.
      - `SPECFY_TYPE_TO_CATEGORY` gained `monitoring`, `queue` and `notification` → `messaging`, so
        an *unmapped* detection with one of those stack-analyser types lands in the right bucket
        rather than in `other`.

      **It closed a real inconsistency on the way.** Sentry and Datadog were `analytics` in the
      config-key catalog and `other` in the mapping table — the same service arriving under a
      different category depending on which detector found it. Slack had the same split. Both
      catalogs now agree, and the code comments say to keep them that way.

      Three tests changed, each because the change made its premise false rather than because it
      broke: the two `config-keys` ordering assertions (results sort by category then slug, so the
      shape moved), and `classifyDetectionKind`'s "no category still means service" case, which used
      `monitoring` as its example of a type with no bucket — left alone it would have kept passing
      while testing nothing, so it now uses `cdn`, and a new test covers the case the widening
      created. Verified by execution: a scratch `appsettings.json` naming Sentry, Resend, Twilio,
      RabbitMQ, OTLP, PostHog and Stripe renders under six real categories with nothing in `other`.

### Two pre-existing holes every writer shares ✅ closed

Both found by the `remove` audits and both reproduced against `link` and `deprecate` on the same
files, so neither is something `remove` introduced. Both are now fixed in
`packages/cli/src/manifest-edit.ts`, which is where the property each one breaks is stated once for
all five writers, and both are pinned by `packages/cli/src/manifest-edit.test.ts` — 19 tests that run
**every writer** against the same two fixtures rather than testing `remove` alone, because covering
only the command a shared hole was noticed on is how the next writer reintroduces it.

- [x] **A path argument that exists but holds no manifest no longer edits the ancestor's.**
      `openManifestForEdit`'s doc comment promises that a path the caller actually typed never falls
      back to an ancestor directory's manifest through `findManifest`'s upward walk. It delivered
      half of that: it rejected a path that did not exist, but an existing subdirectory with no
      manifest of its own fell straight through to the walk. Observed before the fix:
      `catalogus remove fly-api <dir>/sub` removed the entry from `<dir>/catalogus.yaml` and exited 0.

      Closed with `findManifestIn` in `manifest-io.ts` — the same "is there a manifest here" question
      `findManifest` already asks at each level of its walk, minus the walk, so the
      catalogus.yaml-beats-stack.yaml precedence cannot drift between the two callers. An explicit
      path with no manifest of its own now exits 2 and **names the ancestor that was found**: the
      likeliest cause is a path typed one level off, and a message that only says the directory is
      empty leaves the user to guess what to type instead.

      Verified by direct execution of the built binary: all five writers exit 2 against `<dir>/sub`,
      the ancestor manifest is byte-identical afterwards by checksum, an explicit path to the
      directory that *does* hold the manifest still exits 0, and a directory holding only the
      `stack.yaml` fallback is still accepted.
- [x] **A pre-existing cycle is no longer reported as though the current edit caused it.** The two
      validators are not the same check: `loadValidManifest` runs `parseManifest` — schema,
      referential integrity, the private-value guard — while `commitManifestEdit` additionally runs
      `checkAcyclic`. So a manifest carrying a cycle opened cleanly and failed on write, with a
      message reading `Removing "svc-a" would make ... invalid: cyclic dependency -- svc-b -> svc-c
      -> svc-b` even though `svc-a` had nothing to do with the cycle and the cycle predated the
      command. Behaviour was safe — exit 1, nothing written — but the attribution was wrong, and it
      sent the user to fix the wrong thing.

      Closed by having `openManifestForEdit` record the cycles the file already carried and
      `commitManifestEdit` compare against them: when every cycle in the failing candidate was
      already in the file, the failure is reported in the *file's* name rather than the command's,
      and ends with what to do about it. `checkManifestObject`'s failure result now carries the
      cycles it found, because a rendered message line is the wrong thing to diff.

      **The manifest is still opened**, deliberately. `catalogus remove` on one of the cycle's own
      services is the only thing in the CLI that breaks a cycle, so refusing to open a cyclic
      manifest would have traded a misattributed message for an unfixable file — the same shape of
      dead end the `remove` section above exists to prevent. A test pins that recovery path, and the
      mutation that refuses on open turns it red.

      Verified by direct execution: `remove` and `deprecate` aimed at the innocent entry both exit 1
      naming the file, the manifest is byte-identical by checksum, `catalogus remove svc-c` — the
      advice the message itself gives — then exits 0 with `validate` exiting 0 after it, while a
      `link` that genuinely closes a cycle still exits 1 under `Linking "..." -> "..." would make`.

**The assertions are load-bearing, proven by mutation.** Six mutations, applied one at a time, each
turning exactly the expected tests red and no others: removing the `findManifestIn` guard (6 red),
dropping `findManifestIn`'s `stack.yaml` fallback (2 red, one of them a pre-existing `manifest-io`
test), forgetting the pre-existing cycles at open time (5 red), weakening `every` to `some` so an
old cycle launders a new one (1 red), stopping `cycleKey` from rotating (1 red), and refusing to
open a cyclic manifest at all (7 red, including the recovery path).

One property is defensive rather than observed, and says so in the code: `cycleKey` normalises a
cycle's rotation because `findCycles` returns a closed walk whose entry point depends on declaration
order. No writer in the CLI reorders services today, so no command can currently produce that
rotation — which is why it is tested directly as a unit rather than through a command.

### CLI gaps the skill exposed ✅ closed

Writing the skill surfaced five Layer 2 fields with no command behind them, so the skill had to
hand-edit them and then validate. All four items below are done, and `skills/catalogus/SKILL.md` no
longer contains a hand-edit exception: **the CLI is now the only writer**, which is the property the
whole design wants. Verified by direct execution — `init --yes`, `set` ×2, `add` ×3, `link`,
`deprecate`, then `validate` exit 0 — on a scratch project, with the `$schema` modeline and comments
intact afterwards.

- [x] `catalogus set <field> <value> [<field> <value> ...]` — `project.architecture`,
      `project.vcs.visibility`, and the per-entry `services.<id>.role` / `.kind` / `.version`.
      **Superseded in part by the 2026-08-24 schema amendment** (HANDOFF §4 amendment log):
      `project.pm`, `project.vcs.provider` and `project.coding_agents` were settable when this was
      written and no longer exist — the PM tool, the VCS provider and each coding agent are service
      entries now, reached through `add`, and `set` rejects the three old names with a message
      naming the replacement command. The pair-taking design below outlived its original reason.
      It took *pairs* rather than a single field because the schema then required `project.vcs` to
      carry both `provider` and `visibility`, so a one-field-per-call setter could never write vcs
      at all, in either order; `vcs` now holds only `visibility`, so that constraint is gone, but
      the variadic form stays because applying several edits as one write is worth having on its
      own. Every value is checked before the file is opened, so a bad second pair leaves the first
      unwritten. Consequence of the variadic pair list: `set` takes `--path` where every other
      command takes a positional `[path]` — a trailing directory would be swallowed as a field name,
      the same shape of bug `--depends-on` hit in Phase 3.5.
- [x] `catalogus link <from> <to> [path]` — one edge between two services that already exist. A
      duplicate edge is a no-op at exit 0 rather than a second identical line; a self-edge is
      refused in its own words rather than as `cyclic dependency: a -> a`, which reads like a bug in
      the tool; an edge that would close a cycle is refused and nothing is written.
- [x] Id derivation for `add` now prefers `<service>-<role>` once that service already appears in
      the manifest, not merely once the bare id is taken. A manifest holding supabase under the
      explicit id `supabase-db` left `supabase` free, so a second `add supabase --role auth` took
      it — legal, but `supabase` beside `supabase-db` reads as though the two were different kinds
      of thing.
- [x] `catalogus deprecate <id> [path] [--status <s>] [--replaced-by <id>]` — sets `status` and
      `replaced_by` on an existing entry. `--status` takes `deprecated` (the default) or
      `phasing_out`, because those are different claims; `active` and `removed` are deliberately not
      offered, being the absence of a phase-out and a request to delete the entry respectively.
- [x] The open-edit-validate-write cycle all four writers share lives in
      `packages/cli/src/manifest-edit.ts`, so "edits go through the yaml Document API" and "nothing
      that would fail `validate` is ever written" are each stated once rather than four times.

Findings from the first pass, worth keeping:

- Detection output is dominated by libraries — TypeScript, React, Tailwind, ESLint — which land in
  `other:` and are not services. The category mapping needs work, and the viewer needs to not render
  a wall of `other`. Still true after the config-key detector: it adds the services, it does not
  remove the libraries.
- Evidence is per-signal, not per-file, so one settings file naming four of a provider's keys
  contributes four records for it. `detect` and `diff` print the *distinct* files; `--json` still
  carries every record with its key name.
- Configuration key names are the authoritative service list. Grepping documentation produced a
  longer, wronger list: Stability and Replicate appear in Clapline's prose but have no config key.
- Clapline's directory name disagrees with its .NET namespaces and `docs/ARCHITECTURE.md`, which say
  Sluglin. Unresolved — the kind of contradiction the skill tells the agent to surface rather than
  guess past.

---

## Phase 4 — Backend ⛔ blocked on a decision

Deferred deliberately. Phases 0–3 are fully offline, so this choice is better made with real query
shapes in hand than guessed at up front.

**The decision:** Supabase was the original assumption. Alternatives under consideration, chosen for
free-tier viability:

| Option | RLS equivalent | Auth included | Dialect |
|---|---|---|---|
| Neon | native Postgres RLS | separate (Neon Auth / Better Auth / Clerk) | Postgres |
| Cloudflare D1 | app-layer only | no | SQLite |
| PocketBase (self-hosted) | per-record rules | yes | SQLite |
| Supabase | native RLS | yes | Postgres |

Neon is the least friction — HANDOFF §4's schema transfers unchanged and RLS stays enforced by the
database. D1 wins if the whole product consolidates on one Cloudflare account, at the cost of moving
the security boundary into application code, which for a table holding cost data is a real tradeoff.

Dialect matters concretely: HANDOFF §4 uses `jsonb` and a `coding_agents[]` array, and the blast-radius
query is a recursive CTE. SQLite has `WITH RECURSIVE` but neither `jsonb` nor array types, so a SQLite
target is a rewrite of the storage layer, not a port.

- [ ] Pick the backend
- [ ] Migrations for the HANDOFF §4 schema
- [ ] Row-level ownership policies, with a test proving a second user cannot read the first user's
      `user_service_accounts` — this table holds the cost data, so the policy review deserves a
      frontier model rather than a quick pass
- [ ] Views: `v_project_costs`, `v_service_blast_radius` (recursive CTE over edges), `v_phaseouts`
- [ ] Seed the global service catalog — roughly 40 services actually in use, with `simple-icons`
      slugs, category and pricing model

## Phase 5 — Auth and push ⬜

- [ ] Device flow authentication (the `gh auth login` pattern: show a code, approve in a browser)
- [ ] Token stored in the OS keychain — use `@napi-rs/keyring`; `keytar` is unmaintained
- [ ] `catalogus login`
- [ ] `catalogus push` — manifest and detection upsert
- [ ] `catalogus push --private key=value` — field allow-list, hard-reject anything outside
      `account_ref`, `plan_tier`, `cost_amount`, `cost_currency`, `billing_cycle`, `renewal_date`,
      `started_at`, `notes_private`
- [ ] Test proving the token never lands in a file an agent can read into context

## Phase 6 — MCP server mode ⬜

The agent workflow, and the differentiator. `catalogus mcp` over stdio.

- [ ] `detect_stack` — run detection, return a structured diff against the manifest
- [ ] `read_manifest`
- [ ] `propose_manifest_edit` — returns a diff for approval, never writes directly
- [ ] `push_private` — routes through the CLI's credential; the agent never sees it
- [ ] Wire into Claude Code and run the detect → diff → propose loop against a real repo

## Phase 3.7 — Viewer on manifests, no backend ⬜

Decided: the viewer comes **before** Phase 4 and reads manifests directly. Layers 1 and 2 are the
entire graph — nodes, edges, roles, status, `replaced_by`, architecture, coding agents all live in
`catalogus.yaml`, which the CLI already parses and validates. Only Layer 3 (cost, account references)
needs a store, and that is one panel. Cross-project queries do not need SQL at this scale either:
roughly fifteen projects is an in-memory graph walk over N parsed manifests.

This keeps the Phase 4 decision genuinely deferred rather than quietly pre-made, and de-risks the
parts of the viewer that are actually hard — DAG layout, icon fallback, making a multi-parent graph
readable — none of which involve a database.

#### Two decisions settled before implementation started

The checkboxes below left one thing unstated that turns out to govern everything: a browser cannot
read a filesystem, so *something* has to deliver scanned manifests to the app. Three answers were
put to the owner — a Vite dev-server plugin, a `catalogus view` command serving them, or a
`catalogus bundle` command writing one aggregate JSON file the app fetches.

**Decided: `catalogus view` serves them.** The viewer is a shipped CLI feature rather than a
repo-local dev tool, so it works in any checkout the owner points it at, behind one entry point
they already know. `bundle` was rejected on the owner's own criterion: it is the only one of the
three that duplicates data — a second copy of every manifest on disk, stale until regenerated, and
a Layer 2 aggregate that would need a gitignore rule to stay out of the repo. The Vite plugin
avoids that too but produces nothing runnable outside this checkout.

Worth recording because it was asked and is easy to re-ask: **the transport does not affect icon
rendering at all.** `simple-icons` is an npm package bundled into the client; the work is identical
under all three.

**Decided: a service catalog in `@catalogus/core`, keyed by catalogus slug.** What actually decides
whether icons render is a slug → (display name, category, icon ref) table, and nothing in the repo
was one. `SPECFY_TO_CATALOGUS` is not it: that table is keyed by **specfy** slug and answers "what
did stack-analyser just find?", and it only covers what detection can emit. Manifest slugs come
from people too — `dotnet`, `opentelemetry`, `namecheap` and `trello` all appear in
`examples/reference.catalogus.yaml` and had no row anywhere. So the catalog is a separate module
deriving its base rows from the mapping table (one source of truth for name and category) and
layering verified icon refs plus the rows detection can never produce. It is the local seed for
HANDOFF §4.1's eventual global catalog, and nothing more.

The rule that governs it is the standing one: **an icon slug is written down only after being read
out of the installed `simple-icons` package**, and a slug with no verified icon carries no icon
field, falling back to a category icon in the viewer. `namecheap` is exactly the shape of guess
this project keeps producing — plausible, unchecked, and mostly right.

#### The icon fallback is the majority path, not an edge case

Measured directly against `simple-icons` 16.28.0 (3,453 icons) before any code was written, because
the checkbox below assumed brand icons with a fallback for the exceptions. It is the other way
round.

Of the 159 distinct catalogus slugs in `SPECFY_TO_CATALOGUS`, **77 match a simple-icons slug
directly, a further 22 resolve by matching the catalog's display name against the icon's `title`,
and 60 have no icon at all.** That last group is 38% of the catalog, and it is not a tail of
obscure rows — **Slack, OpenAI, AWS (and S3, Lambda, EC2, Cognito, CloudFront, SQS), Heroku,
Twilio, SendGrid, Segment, Amplitude and Java are all absent.**

This is precisely the risk HANDOFF §7 flagged — "simple-icons has removed brand marks before under
trademark pressure, so the generic category-icon fallback needs to exist from the start rather than
being bolted on the first time a slug disappears" — except that it has already happened, at scale,
before the viewer exists. Consequences for the design:

- **The category fallback has to look deliberate.** Two nodes in five will use it. A fallback
  styled as a missing-image placeholder makes a correct render look broken.
- **A catalogus slug is not a simple-icons slug.** `fly-io` does not resolve; the icon is
  `flydotio`. Any lookup that passes the catalogus slug straight through silently loses the owner's
  primary host — a wrong render that looks like an absent one.
- The catalog stores an explicit, verified `icon` ref precisely so these two facts live in one
  table with a test behind them rather than in the viewer's guesswork.

#### What the validation pass found — four defects, all fixed

Both slices were written by implementer agents and then attacked by a separate agent that had not
written them, per `CLAUDE.md`. It executed rather than read, and it earned its keep: two of the four
defects were in mechanisms whose whole purpose was to prevent the thing they failed to prevent.

1. **A Windows junction in the workspace root vanished from all three lists** — not `manifests`,
   not `failures`, not `unmanaged`, despite its target being a real directory whose manifest read
   and validated fine through the link. `dirent.isDirectory()` returns false for a junction. This
   was the exact failure the three-way split exists to prevent, and it was caused by a brief that
   told the implementer not to follow links for cycle safety — reasoning that does not apply at
   depth 1, where there is no walk to loop. **Fixed by following links**: directory-ness is now
   decided by resolving the target, not by trusting the dirent. A Windows quirk found on the way and
   worth keeping: `stat()` on a junction whose target is a *file* throws `ENOENT`, identical to a
   genuinely broken link, so the target text is read with `readlink()` first and that path stat-ed.
2. **An `ICON_OVERLAY` key typo was silently swallowed.** Renaming the key `stripe` to `strpe` cost
   Stripe its brand icon and **all 11 tests still passed** — the tripwire checked that every icon
   which landed resolves, never that every overlay entry landed. One assertion closed it.
3. **`getCatalogEntry("constructor")` returned the `Object` function.** The catalog was a plain
   object literal, so a lookup fell through to `Object.prototype`; truthy, so a viewer would take
   its known-service branch and render a service named **"Object"**. Not hypothetical: the schema's
   slug pattern admits `constructor`, and a manifest with `service: constructor` validates clean
   under the real CLI. Now built on `Object.create(null)`.
4. **`deriveBaseCatalog` had no fallback and its comment claimed one.** With no specfy key equal to
   the catalogus slug, the winning row was decided by nothing but declaration order in `mapping.ts` —
   proven by swapping two lines and watching the catalog row change. The comment called the rule
   "generic, not a supabase-specific special case". **Now a total three-rule order** (agree ->
   bare-key wins -> **throw**, naming the slug and the competing names), and the pin list is gone:
   its trap was that the natural way to fix its red was to append the new slug, silently accepting
   an order-dependent row.

Two claims came back *stronger* than reported. The malformed-YAML discriminator matches
`@catalogus/schema`'s literal `"Could not parse YAML: "` prefix, which reads as fragile — but
changing that wording and rebuilding showed the repo degrades to `reason: "invalid"` while staying
in `failures`, and a `workspace-scan` test goes red, so the coupling cannot rot silently. And a
20-directory adversarial workspace — malformed YAML, schema-invalid, empty manifest, a manifest
that is a directory, an ACL-denied file, a `stack.yaml` fallback, non-ASCII names — came back with
every entry in exactly one list, none duplicated, none dropped.

**Verified state: 581 tests across 40 files, `pnpm build` and `pnpm typecheck` clean.** The junction
fix and the prototype fix were each re-confirmed by the orchestrator running the built `dist`
directly, and all 115 icon refs re-checked against a separately installed `simple-icons@16.28.0`.

**Known behaviour, not a defect, recorded so it is not rediscovered as one:** junctioning a repo
that already sits in the workspace root surfaces it twice, as two projects with the same slug.
Deduplicating by resolved path is a design decision nobody has needed yet; in practice a junction
points at another drive, where the case cannot arise.

#### The catalog does not carry a category — `role` already answers that

The catalog was first built as `{ slug, name, category, icon? }`, and the owner rejected the
category field on sight: *"category is something that needs to be set by the client, no? your same
question happens to AWS, azure, supabase, firebase. we can't hard category."*

That is correct, and the repo already had the answer. **A category is not a property of a vendor.**
Supabase is a database *and* auth *and* storage *and* a queue; AWS, Azure and Firebase are the
same. Which one it is depends on what a given project uses it for — a per-project fact the client
already states as **`role`**, required on every service entry. `packages/schema/src/schema.ts` says
so in its own note on the field: *"The same catalog service can appear more than once under
different roles/ids — e.g. supabase-db and supabase-auth both service: supabase."* And the viewer
was already settled to group on the segment of `role` before the first `-`. So grouping never
needed a catalog category; adding one introduced a second, weaker answer to a question `role`
already answered.

`ServiceCategory` stays exactly where it was — `mapping.ts` and the config-key detectors — because
there it buckets **detection output** for `detect` and `diff`, which is the different question
"what sort of thing did I just find?", and it never reaches the manifest. It appears nowhere in the
manifest schema.

So `CatalogEntry` is `{ slug, name, icon? }`: only what a global table can know that a project
cannot. Two consequences worth recording, because both were live problems that this deleted rather
than solved:

- The `namecheap` category question disappeared. The row keeps its verified name and brand icon and
  asserts no bucket. This is the *good* shape of "ask, never guess" — the question stopped being
  asked because it was the wrong question, not because someone answered it plausibly.
- The catalog previously coupled the two: `category` was required, so a verified icon could not be
  recorded without also asserting a category. That coupling is gone.

**The four fields that were being confused**, since the owner reasonably asked what separates
`category` from `kind` — they answer different questions, and only two are the client's:

| field | lives in | set by | answers |
| --- | --- | --- | --- |
| `role` | manifest entry (**required**) | the owner | what this project uses it for — `hosting-api`, `storage-media`. Rollup is the segment before the first `-`. **This is the grouping.** |
| `kind` | manifest entry (optional, default `service`) | the owner | vendor (`service`) / infrastructure the project runs itself (`component`) / what the code is written in (`stack`). Decides rendering, and whether a Layer 3 cost can attach at all. |
| `category` | core detection tables | Catalogus | bucket for *detection output* only. Never enters the manifest. |
| `DetectionKind` | core mapping | Catalogus | whether a detected thing earns a node at all. |

The viewer's category-icon fallback therefore keys off `role`, not off the catalog — which is the
better source anyway, since a per-usage role is exactly what a generic icon should depict: the
database node gets a database icon whoever the vendor is.

#### Scope notes found while grounding the above

- **The scan is depth 1.** `C:/Workspace/repos/` holds 19 directories as direct children (counted
  by executing the scanner against it, after an earlier hand-count said 18). Recursing would walk
  `node_modules` and every nested worktree, and a manifest inside a dependency is not a project in
  the portfolio.
- **One real manifest exists today** — `Clapline`. The portfolio page and the usage matrix have a
  single row to render until more repos are onboarded, which is the reason they were already
  ranked last.

- [x] Service catalog in `@catalogus/core`: catalogus slug -> display name and a verified
      `simple-icons` ref (**no category** — see the correction above). Names derived from
      `SPECFY_TO_CATALOGUS` rather than copied from it. **164 rows, 115 with an icon, 49 without.**
      A test fails when an icon ref does not resolve in the installed package, and a second one
      fails when an overlay key matches no row — both tripped deliberately and observed red before
      being trusted.
- [x] Manifest source: `scanWorkspace(root)` scans a workspace root for repos holding
      `catalogus.yaml` (or the `stack.yaml` fallback), depth 1, ordinal-sorted. Returns a three-way
      split: `manifests`, `failures` (with a reason — `unreadable` / `malformed-yaml` / `invalid`)
      and `unmanaged`. A repo with a broken manifest is a reported entry, not a dropped one — a
      project that vanishes from the portfolio because of a typo is the worst available failure,
      since nothing on screen says anything is wrong.
- [x] React + Vite app under `apps/web`. CSS Modules plus a `tokens.css` custom-property layer;
      every component below `App.tsx` is pure (props in, no fetch, no `window`, no node imports), so
      a hosted viewer later reuses them as a file move rather than a rewrite. Client bundle is
      **161 KB** with zero `simple-icons` bytes in it — icons resolve server-side, because
      `simple-icons`' `index.mjs` is 5.2 MB and a manifest-driven lookup tree-shakes to nothing.
- [x] **`catalogus view [path]`: serves one repo's manifest plus the built app, and opens the
      browser.** Owner decision, superseding the workspace-root design this section was written
      under: the skill runs it in the client repo after writing the manifest. `scanWorkspace` stays
      built and tested but has no caller until the portfolio page. `GET /api/project` is the whole
      API; the payload — not the CLI — is the boundary a hosted viewer reimplements from its own
      store.

      **Two validation passes, five defects between them, all fixed and re-verified.** The critical
      one is worth recording because it is the same defect this project already fixed once: a
      manifest with `role: constructor` — which `validate` accepts and `graph` prints — blanked the
      *entire* page, because the viewer's glyph table was a plain object literal and the lookup
      inherited `Object` through the prototype chain. The server-side catalog had been hardened
      against exactly this one slice earlier; the client reintroduced it, and **all 619 tests passed
      with it live**, because every existing test named a rollup that was merely absent rather than
      inherited. Also fixed: a partial `dist/web` starting a server that 500s on every page; an
      absolute-form request target bypassing `/api` routing; `stat().isFile()` passing an
      unreadable `index.html`; and a `Host` check that made `--port 80` reject every request a real
      browser sends. Bound to `127.0.0.1`, `Host` validated against DNS rebinding, traversal proven
      over raw sockets with a planted canary, `nosniff` on every response.
- [x] **Compact nodes and a URL-addressed detail panel.** Built and shipped in `f256d72`, and this
      box was left unticked by the session that wrote it rather than because anything is missing:
      `ServiceNode.tsx`, `ServiceDetailPanel.tsx`, `hash-route.ts` and `App.tsx`'s routing are in
      the repo with `ServiceNode.test.tsx` (11), `ServiceDetailPanel.test.tsx` (7) and
      `hash-route.test.ts` (11) behind them. **What the tick rests on, stated so it is not taken as
      wider than it is:** those committed tests, plus the separate validation pass whose findings
      are the five smaller defects listed below — not a fresh browser run in this session.

      As designed: a node carries an icon and a name only — plus a status colour and an
      uncatalogued marker, the two signals that must survive without a click — and everything else
      lives in a side panel addressed by `#/service/<id>`. Hover is a `title` tooltip, never the
      detail content. Chosen over a popover and over a sub-page because the detail content is
      expected to grow (edges, notes, then Layer 3 cost, EOL, blast radius): a panel scrolls, keeps
      the graph in view, and the same route renders full-page later if it outgrows the panel. This
      is also the shape a DAG node needs, so the layout slice swaps the container for a canvas
      rather than rebuilding the node.
- [x] **Rollup display labels.** Built and shipped in `f256d72` — `apps/web/src/rollup-labels.ts`,
      on `Object.create(null)`, with a test naming `constructor`, which is the third instance of
      the keyed-lookup defect class this repo keeps producing and the first one caught before it
      shipped. A viewer-side label table falling back to the raw rollup, keeping presentation in
      presentation: no schema change, no exception in the one-line rollup rule. It turned out to
      fix more than the one case this box named: `coding` was not the only rollup that reads as a
      truncation — `ingress`, `telemetry`, `ui`, `runtime` and `language` are in the same shape,
      and the viewer was rendering INGRESS and TELEMETRY as headings.
- [ ] **Five smaller viewer defects, all found by the validation pass, none fixed.** Split out of
      the two boxes above so ticking those does not quietly carry them: focus drops to `<body>`
      when a deep-linked panel is closed (`lastFocusedRef` was never set, because nothing was
      clicked to open it); every open and close pushes a history entry, because `App.tsx` assigns
      `window.location.hash` rather than calling `replaceState`, so Back walks the panel instead
      of leaving the page; the selected state's two *visual* cues are both colour (`aria-pressed`
      carries it for assistive tech, so this is a low-vision gap rather than an AT one); and two
      entries of the same vendor in one group are indistinguishable on the node, since the node
      shows the catalog display name and not the local id. **Both routing claims re-checked
      against `App.tsx` directly on 2026-08-24 rather than trusted from this file** — this
      document has gone stale on its own numbers twice.
- [x] **The skill-drift test now covers what it needs to.** Two separate holes, both closed, both
      watched go red against the real `SKILL.md` before being trusted.

      **The shell lines.** `packages/cli/src/skill-commands-drift.test.ts` — new file, in
      `packages/cli` rather than beside the yaml check because the facts it needs (which commands
      exist, which flags each registers, which fields `set` accepts) are the CLI's, and
      `packages/schema` cannot import them without inverting the dependency. **Every fact is read
      off the live commander program** via a newly-exported `createProgram()`, so there is no
      hand-copied roster of command names to drift — that would be one more artifact of exactly
      the kind under test. It extracts all **35** fenced `catalogus ...` lines and checks four
      things per line: the command exists, every flag is one that command registers, every
      mandatory option and required positional is supplied, and (for `set`) every field is in
      `SETTABLE_FIELDS`, with `services.<anything>.role` folded onto the `services.<id>.role`
      placeholder. **Five mutation classes were applied to `SKILL.md` and each observed red**,
      including the two that started this: `catalogus set project.coding_agents claude-code` and
      `catalogus set project.vcs.provider github` both fail now, naming the
      `catalogus add <slug> --role ...` line that replaced them. Also proven red: an unregistered
      command, an unknown flag, a missing `--role`, and `catalogus link` with one argument instead
      of two.

      **The fragment's values.** The yaml walk checked that every field the fragment names still
      *exists* and stopped there — `pattern`, `format`, `minLength` and `maxLength` were walked
      straight past, so `id: Board` or `added: 24/08/2026` would have shipped green. It now checks
      them, `format: date` against a real calendar (2026-02-30 fails), and a new
      "the fragment walk itself catches drift" block exercises the walk against synthetic
      fragments so the tripwire has cases that do not depend on the real file staying wrong. Both
      new checks were confirmed red by mutating the real fragment, then restored.

      **Scope stated in the file, not left to be assumed:** fenced blocks only (prose mentions
      `catalogus push --private`, a deliberate Phase 5 forward reference, and checking prose would
      demand a list of commands allowed not to exist — the shape of thing that stops being read);
      and no reverse direction, so a command `SKILL.md` never teaches does not fail it. `view` is
      one such command today — see open item 6 above.
- [x] **The traversal corpus is committed.** **65 vectors** in
      `packages/cli/src/test-support/traversal-vectors.ts`, grouped into families with a comment on
      each saying what it is testing for — literal, naive-strip bypass, encoded separators,
      backslash, double-encoding, overlong UTF-8, null byte, drive-absolute, UNC, NTFS ADS, Windows
      trailing dot/space, absolute-form, and traversal wearing an `/api` prefix. The runner is a
      nested `describe` at the end of `packages/cli/src/commands/view.test.ts` — see the
      co-location finding below for why it is not its own file — and it drives every vector
      against a live `createViewServer`, over bare sockets: node's own http client validates and
      can reject
      several of these targets before they reach the wire, and `fetch()`/WHATWG URL collapse `..`
      client-side, so either would be a test that never sent its vector.

      **The assertion is about content, not status**, because a contained vector can legitimately
      answer 200 (`/a/../index.html` resolves back inside the root). No response body may contain a
      marker of any file above the root, and **any 200 must be byte-identical to the SPA shell** —
      which catches a leak of some file nobody thought to list a marker for.

      **Two negative controls make a green run mean something.** A canary planted one directory
      above the served root, asserted readable on disk before the vectors run; and a control file
      planted *inside* the root and fetched successfully, proving the server really does hand out
      arbitrary files under it. Without those, 65 assertions would also pass against a canary that
      was never written or a server that 404s everything.

      **The corpus was watched fail, twice, by mutating `resolveStaticPath`.** Deleting the
      containment check: **32 of 65 go red**. Replacing it with the classic naive guard (a raw,
      undecoded substring test for `..` on the request target): **9 go red and not one is from the
      literal family** — six encoded, two backslash, one absolute-form. That second number is the
      argument for the corpus having families at all; a pile of literal `../` vectors passes that
      mutation green.

      **One claim in the new fixture was written from reasoning and disproved by executing it**,
      and the correction is kept in the file rather than deleted: a second `decodeURIComponent`
      pass does *not* turn the double-encoded vectors into live traversals, because containment
      runs after decoding and catches the `../` a second pass produces. All 65 stayed green under
      that mutation. The useful fact is the corrected one — containment does not depend on decode
      depth.

      **A latent flake this surfaced, and the rule that came out of it.** The corpus started as
      its own `view-traversal.test.ts` and made the full suite fail on **three of six consecutive
      `pnpm test` runs** — found by running the suite repeatedly rather than once, which is the
      only reason it was caught at all. Two tests in `view.test.ts` temporarily rename or
      overwrite the *real* `packages/cli/dist/web`, because `createViewServer` always resolves its
      web root from the real package layout and there is no way to hand it a temporary one. vitest
      runs test *files* in parallel workers but tests *within* a file sequentially, so a second
      file calling `createViewServer` raced the rename and got "Built web assets not found". **The
      hazard predates the corpus and applies to any future test file: everything that calls
      `createViewServer` has to live in `view.test.ts`.** That is now stated in the file itself,
      next to the block. Re-verified with **eight consecutive green full-suite runs** after the
      merge, not one.
- [ ] **Per-project DAG — the next real piece of work.** elkjs layout, React Flow render,
      `simple-icons` brand icons with a category-icon fallback from the start. **Group on the
      segment of `role` before the first `-`** — the convention settled in the 3.6 follow-ups.

      **What is already true, so nobody re-derives it.** `GET /api/project` already returns
      `edges: { from, to }[]` alongside `services` (see `view-payload.ts`'s `ViewPayload`), so this
      slice needs **no server change at all** — it is entirely `apps/web`. `ServiceNode` was
      deliberately shrunk to icon-plus-name for this: the plan is to swap the *container*
      (`ServiceList`/`ServiceGroup`) for a canvas, not to rebuild the node. The detail panel is
      already URL-addressed at `#/service/<id>` and works unchanged from a canvas.

      **What is not decided, and a brief has to answer before an implementer starts.** These are
      the questions that will otherwise be answered by whoever types first:

      1. **Does the DAG replace the grouped list, or sit beside it?** A toggle, a route, or a
         replacement. The list is genuinely better for "what does this project use"; the graph is
         better for "what breaks if this dies". Both are real questions the viewer exists to answer.
      2. **Which way do the arrows point?** `dependencies: [[fly-api, supabase-db]]` means fly-api
         depends on supabase-db. Drawing the arrow along that direction reads as "calls"; reversing
         it reads as "supports". Pick one and say which, because blast radius is read off it.
      3. **Does grouping survive on the canvas?** Compound/parent nodes per rollup in elk, or a flat
         layout that drops the grouping the list has. Not the same picture.
      4. **Do `kind: component` and `kind: stack` nodes render differently here?** They already do
         in `graph`'s text output and in the detail panel. A stack node hangs off whatever runs it.
      5. **Which React Flow?** `reactflow@11` and `@xyflow/react@12` are the same project under two
         names. **Neither is installed today**, nor is `elkjs` — `apps/web/package.json` has no
         graph dependency at all, so step one is a deliberate choice, not an `npm i`.
      6. **Is there a bundle budget?** The client is **161 KB** today, and that number was earned:
         `simple-icons` was deliberately kept server-side because it is 5.2 MB. elkjs alone is
         several hundred KB. Worth deciding up front whether that is fine or whether layout should
         move server-side too — the same reasoning that moved the icons already applies here.

      **And the fixture problem, restated because it is the part most likely to be skipped.** There
      is still no real manifest (see "There is no real manifest" above). `examples/reference.
      catalogus.yaml` is 14 entries and 14 edges — enough to prove every *shape* renders, not enough
      to prove the layout stays readable. **Nobody has built the deliberately-hard synthetic
      manifest this document keeps saying to build against**, so that is an artifact the DAG slice
      has to produce, not inherit. It stays synthetic regardless: anything committed here is public.
- [x] **Status colours and `replaced_by` targets.** Shipped in `f256d72`, unticked until now for
      the same reason the two boxes above were — nobody went back. `ServiceNode.module.css` carries
      a ring colour for all four statuses (`removed` included, which this box's own wording
      omitted), `StatusPill` renders the status word in the detail panel so the cue is not colour
      alone, and `ServiceDetailPanel` renders `replaced_by` resolved to the replacement's display
      label rather than its raw id.

      **One fix made while confirming it.** `StatusPill`'s `LABELS[status]` was the last surviving
      instance of the keyed-lookup defect class — a plain object literal read with a
      manifest-derived key — and the previous session recorded it as safe rather than fixing it, on
      the grounds that `status` is a schema enum and `view` refuses invalid manifests. That
      reasoning is correct and it is still a guard one layer away from the bug: it holds only for
      as long as every caller comes through a validated payload, which is a property of the rest of
      the app rather than of that file. It is now on `Object.create(null)` with an own-property
      test for the CSS Modules lookup beside it, and a new `StatusPill.test.tsx` naming
      `constructor` — **watched go red against the old literal** (`expected '' to be 'constructor'`:
      React silently drops the inherited `Object` function, so the real-world symptom would have
      been a blank pill, not the blank page `GLYPHS` caused).

      **And fixing it turned up a fifth instance that was not a precaution.** Auditing the rest of
      the repo for the same shape found `catalogus set`'s `FIELDS` table being indexed with raw
      command-line input — a live bug, reproduced against the built binary, now fixed and re-run
      against it. Details in "the one defect class this repo keeps producing" near the top of this
      file. The audit cleared everything else and recorded *why* at each site, so the next person
      checking this class reads a reason rather than re-deriving one.
- [ ] Portfolio page: project list, service usage matrix across projects
- [ ] Migration dashboard: everything `phasing_out` with its replacement
- [ ] Layer 3 cost panel present, rendering an explicit "not connected" empty state
- [x] **Unblocked, on the synthetic example only.** This box used to claim a real 26-service
      manifest existed alongside the reference example; it does not (see "There is no real
      manifest" above — checked 2026-08-24). What is actually available is
      `examples/reference.catalogus.yaml`: 14 entries and 14 edges covering status, `replaced_by`,
      `kind: component`, `kind: stack` and `role: coding-agent`. That is enough to build the
      per-project DAG, the status colours and the `replaced_by` rendering, because those are
      questions about *shape*, and every shape is present. It is **not** enough to judge whether
      the layout stays readable under a real fan-out, which is the genuinely hard part and now has
      no evidence behind it either way. The portfolio page and the usage matrix want several
      projects and have none, so they stay last.

A local Postgres container (Docker 29.4.1 is installed) remains available and is worth doing
separately, but for a different purpose: prototyping the §4 schema, RLS policies and the recursive
CTE against a real Postgres before choosing a host. It powers nothing in the viewer.

## Phase 7 — Viewer, backed by the platform ⬜

Everything below needs Layer 3 and cross-user data, so it waits on Phase 4.

- [ ] React + Vite app
- [ ] Per-project DAG: elkjs layout, React Flow render, `simple-icons` brand icons
- [ ] Status colours — active, `phasing_out`, deprecated — and `replaced_by` targets shown
- [ ] Project list and portfolio page with cost totals (private layer, owner only)
- [ ] Migration dashboard: everything `phasing_out` with its replacement
- [ ] Cross-project blast radius view
- [ ] Acceptance: all six HANDOFF §4.2 queries answerable from the UI

`simple-icons` has removed brand marks before under trademark pressure, so the generic
category-icon fallback needs to exist from the start rather than being bolted on the first time a
slug disappears.

---

## Parallel track — not code, but time-sensitive ⬜

Names get taken. None of this blocks development, and all of it blocks launch.

- [x] Domains — **`catalogus.dev` registered 2026-08-24 and owned.** It is load-bearing: the schema
      `$id` and the modeline the CLI writes both point at it. `catalogus.io` was *not* acquired —
      the $20 aftermarket figure was a minimum-offer threshold, not a price, and a $20 offer via
      Sedo drew a $7,500 counter, which was declined. `catalogus.com` was $12,000 and was declined
      too. There is no homophone spelling to redirect, and nothing here is still pending.
- [x] npm package name — `catalogus` cannot be reserved: verified against the registry on
      2026-08-24, it is an npm-owned security holding package (maintainer `npm`, repo
      `npm/security-holder`, version `0.0.1-security`). The CLI ships scoped as `@catalogus/cli`;
      the binary it installs is still `catalogus`.
- [ ] Reserve the GitHub org `catalogus` — the repo currently lives at `github.com/Lecarvalho/catalogus`;
      moving it to an org later is a redirect, not a break, so this is not urgent
- [ ] CIPO/USPTO knock-out search, Nice Class 9 + 42
- [ ] Publish the JSON Schema at `https://catalogus.dev/schema/v1.json` — the `$schema` modeline the
      CLI writes points there, so until it resolves, editor autocomplete does not work

---

## Decisions made

From HANDOFF §9, plus decisions taken during implementation. Settled — reopen only with a reason.

1. **Manifest filename** — `catalogus.yaml`. `stack.yaml` accepted as a fallback on read; writes are
   always `catalogus.yaml`.
2. **Slug taxonomy** — Catalogus's own namespace, with an explicit mapping table from the slugs
   stack-analyser emits. Adopting specfy's slugs wholesale would couple the catalog to their release
   cycle.
3. **Acyclicity enforcement** — CLI `validate` and the application layer. No database trigger.
4. **One service, multiple roles** — two entries with distinct local ids (`supabase-db`,
   `supabase-auth`).
5. **Monorepo handling inside a scanned project** — out of scope for v1.
6. **Where the private-data guard lives** — `@catalogus/schema`, not the CLI. Phase 5 push and Phase 6
   MCP both need the identical boundary, and a guard implemented in the CLI is bypassed by every other
   consumer. Exactly one copy of the patterns exists in the repo; two copies is how one of them stops
   catching things.
7. **Two-tier guard rather than one** — a heuristic that cries wolf gets switched off, and a guard the
   user has disabled is worth less than no guard. Hard tier is high precision only; soft tier warns and
   leaves exit 0 unless `--strict`.
8. **`packages/schema/schema/catalogus.v1.json` stays committed, not gitignored** — asked because
   `pnpm build` regenerates it and it looked like a build artifact. It is a *published* one, which is
   a different thing: `packages/schema/package.json`'s `files` ships `schema/`, and every manifest the
   CLI writes carries `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json`, so an
   editor fetches it over HTTP. `dist/` is ignorable precisely because nothing external fetches it by
   URL.

   **The decisive argument is what ignoring it would do to `schema-sync.test.ts`.** That test exists
   to catch a `schema.ts` edit that was never followed by `pnpm build`, and it works only because a
   *committed* copy is capable of being stale. With no committed copy it would compare a file the
   build just wrote against the source that build read — a tautology, permanently green. Ignoring the
   file would convert a real tripwire into a no-op, which is the failure shape this document already
   records three times over.
9. **Line endings are LF everywhere, pinned by `.gitattributes` (`* text=auto eol=lf`)** — the fix for
   what prompted decision 8. The generator writes LF unconditionally while `core.autocrlf=true`
   (Windows default) wants CRLF, so *every build* left that file reported as modified while being
   byte-identical to `HEAD` — confirmed by hashing both sides to the same object id. **A file that is
   permanently dirty and never actually changed is a file people learn to skip in `git status`**,
   which is how a real change to it eventually gets committed unnoticed.

   No renormalization commit was needed: zero committed blobs in this repo contain a CR, so the index
   was already LF and `git add --renormalize` is a content no-op. One `git update-index
   --really-refresh` was needed once to clear the stale stat cache; a fresh clone will not need it.
10. **No raw control characters in source.** Found while doing the above: `packages/cli/src/toposort.ts`
    held two literal NUL bytes as composite-map-key separators (`` `${from}\0${to}` ``), which made git
    classify the whole file as binary — **every change to it showed as "Binary files differ" with no
    reviewable diff.** In a repo whose review step is an agent reading a diff (see CLAUDE.md), that was
    the one file nobody could review, and nothing would ever have reported it. NUL is still the right
    separator (the schema's slug pattern cannot produce one); it is spelled `\u0000` now. Behaviour
    unchanged — `toposort.test.ts`'s 7 tests and the full suite pass — and the file is plain ASCII again.

## Non-goals

From HANDOFF §8. Worth restating because each is a plausible-sounding scope creep.

- Storing secrets or credentials. Ever. Layer 3 holds *references* to an identity, never the
  credential itself.
- Uptime monitoring — other tools do this; integrate later at most.
- Package-level dependency management — that is Renovate's job.
