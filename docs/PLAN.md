# Dagstree — Implementation Plan & Progress

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
  `dagstree rename`, the last missing writer, so **every correctable field now has a command behind
  it**; the `role` convention, settled by the owner as documentation rather than a schema
  constraint, with the viewer grouping on the segment before the first `-`; and the category enum,
  widened with `monitoring`, `queue` and `messaging` — **HANDOFF §4 was amended for that, and the
  document now carries an amendment log**.

  **Next is Phase 3.7, the viewer on manifests**, with nothing left in front of it: a real manifest
  exists, the role convention it groups on is settled, and every category it renders has a real
  bucket. Phase 4 stays deferred by owner decision.
- **Last updated:** 2026-08-24

## Start here on a fresh session

Phases 0 through 3.6 are complete, plus the 3.6.1 correction pass. Nothing is broken. Run the verify
command first and confirm **549 tests / 38 files** before trusting anything below.

**Read Phase 3.6.1 before touching the skill, the schema or a CLI flag.** It is the most recent
work and it changed three things a fresh session would otherwise get wrong: entries now carry
`kind` (`service` | `component` | `stack`) and an optional `version`; the rule for what earns a node
is runtime topology rather than "can it send an invoice"; and **Dagstree asks rather than guessing**
wherever a fact is not in the repo. That last one is a standing rule, not a one-off fix — four of
the six defects in that pass were a plausible default written in place of a question.

The CLI is installed: `pnpm run link:cli` has been run, so `dagstree` is on `PATH` via shims in
npm's global bin directory pointing at this checkout. `pnpm build` updates what they run. If the
repo is ever moved, re-run `pnpm run link:cli`.

**Read `CLAUDE.md`'s "How implementation work runs here" section before starting.** It is not
boilerplate: it records how this project's defects have actually been caught, which is a validation
pass by an agent that did not write the code. Every substantial item below assumes that loop.

### The next thing is Phase 3.7, the viewer

It is unblocked. Build the single-project DAG first, against a real manifest, because layout is the
part that is genuinely hard and it de-risks everything after it.

**Where the real manifest is, and why it is not in this repo.** The cold runs wrote
`C:/Workspace/repos/Clapline/dagstree.yaml`. As of the third run it holds **26 services and 30
edges**, all `kind: service`, with off-repo entries — and, unlike the second run's file, **no
lifecycle entries and no notes**. It stays there. Copying it in would publish a private project's entire service
inventory and topology in a public repo, which is the same reasoning that made
`examples/reference.dagstree.yaml` synthetic (see Phase 3.6). So:

- The viewer reads manifests by **scanning a workspace root**, which is Phase 3.7's design anyway.
  Point it at `C:/Workspace/repos/` to develop against something real.
- **Tests and fixtures use synthetic manifests only.** Anything committed here is public.

**What makes that manifest a good layout stress test**, and worth checking before declaring the DAG
done: `fly-api` has fourteen outgoing edges, `grafana` has six, and `supabase-db` has three incoming
from different directions. A naive layout renders that as spaghetti. If elkjs handles this one
readably, it will handle most projects.

**What the viewer has to render, beyond the DAG.** Nodes come in three kinds now and they are not
interchangeable on screen: `service` is a vendor (brand icon, and the only kind a Layer 3 cost can
ever attach to), `component` is infrastructure the owner runs themselves (no vendor, no invoice —
so a cost rollup must exclude it rather than show a zero), and `stack` is what the code is written
in, carrying a `version` that is the number a tile shows and the key an end-of-life date would hang
off. `dagstree graph` already renders all three as text — `nginx (ingress-proxy, component)`,
`dotnet (runtime-backend, stack, v10)` — which is the cheapest reference for what the web viewer
has to say too.

**Two things it does not exercise, and the viewer needs both.** It carries no `status`/`replaced_by`
entries, so nothing on disk covers status colours or the migration view — use
`examples/reference.dagstree.yaml`, which does. And it predates `kind`, so every node in it is a
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
5. ~~**`dagstree rename <old> <new>`** for service ids.~~ Closed — built, and the CLI now has a
   command behind every correctable field. See the `remove` section for what it does and what the
   mutations found.

## Phase 3.6.1 — Defects found by validating the skill's own output ✅

The owner ran the current skill against a real repo and asked whether the manifest it produced was
accurate. It was: all 26 services traced to evidence in the checkout, and the `added` dates matched
`git log --diff-filter=A` on the file that proved each one, six for six. The defects were not in the
data. Four of the six were in **shipped guidance** — the skill and the handoff telling an agent to
do the wrong thing, which it then did correctly.

The through-line, and the rule that came out of it: **where Dagstree does not know, it asks. It
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
      `dagstree diff` **on every run** — a permanent false positive against a correct manifest.
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
  `dagstree add dotnet --kind stack --version 10 --role runtime-backend` printed `0.0.1`, added
  nothing, and **exited 0** — silent data loss, not an error. Fixed with
  `program.enablePositionalOptions()`, which scopes an option to the command it follows;
  `dagstree --version` still reports the CLI version.
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
`dagstree detect` on Clapline now reports `opentelemetry [component]`, `nginx [component]`, a
`stack:` section (csharp, javascript, react, typescript), and `codex` — and no `agents-md`.

**Not done, and left for the owner:** `C:/Workspace/repos/Clapline/dagstree.yaml` itself is
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
- [x] Repository published — `github.com/Lecarvalho/dagstree`, branch `main`, initial commit `712a8a6`

Note: pnpm 11's build-approval gate blocks esbuild's postinstall, which tsup needs for its
platform-native binary. `pnpm-workspace.yaml` carries an `allowBuilds: { esbuild: true }` stanza to
permit it. Without that, tsup's build step silently lacks its native binary on Windows.

## Phase 1 — `packages/schema`, the contract ✅

The manifest schema is both the contract every other package consumes and the security boundary that
keeps Layer 3 data out of a public repo. Built first for that reason.

- [x] JSON Schema 2020-12 for `dagstree.yaml` v1 at `packages/schema/schema/dagstree.v1.json`
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

- [x] `dagstree init [path] [--yes] [--force]` — `--yes` fills project name, VCS provider and
      coding agents from detection and writes **no** service entries; see Phase 3.6's
      "init and add did not compose" for why that changed
- [x] `dagstree detect [path] [--json]`
- [x] `dagstree diff [path]` — reports both directions, and does not flag Layer 2 entries that are
      undetectable by design (a registrar, a PM tool) as stale
- [x] `dagstree validate [path] [--strict]` — schema, referential integrity, private-value guard,
      and the acyclicity check
- [x] `dagstree graph [path] [--mermaid]`
- [x] `dagstree add <service> [path] --role <r> [--depends-on <id>...]` — edits via the `yaml`
      Document API so comments and the `$schema` modeline survive
- [x] `dagstree set`, `dagstree link`, `dagstree deprecate` — added in Phase 3.6 to close the
      hand-edit gap; see "CLI gaps the skill exposed" below
- [x] `dagstree remove <id> [path]` — added in Phase 3.6; the only subtractive writer, and the one
      that makes a wrong `add` recoverable. See its own section below
- [x] `dagstree rename <old> <new> [path]` — the last writer, moving every edge and `replaced_by`
      that names the id along with the entry. See the `remove` section below
- [x] Manifest resolution: walks up from the working directory, `dagstree.yaml` preferred,
      `stack.yaml` accepted as a fallback on read, always writes `dagstree.yaml`
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
      to do. Moved into `@dagstree/schema` and called by `validateManifest` itself, so Phase 5 push
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

- [x] Reference manifest at `examples/reference.dagstree.yaml` — deliberately **synthetic**, naming
      no real project. It exists to give the drift test a complete document and the skill something
      to be judged against, and it covers the shapes that matter: one provider with an entry per
      deployed app, one service in two roles as two entries, a `phasing_out` entry with its
      `replaced_by`, off-repo services no scan can find, and edges pointing depender-to-dependency.
      It replaced a manifest derived from a real private project — publishing that project's whole
      service inventory and topology in a public repo is a different thing from publishing a schema
      example, and the example does its job without it.
- [x] **Agent skill**, source of truth at `skills/dagstree/SKILL.md` in this repo. It is a shipped
      product artifact and is versioned next to the schema and CLI it documents. Teaches evidence
      gathering, the proven-versus-mentioned distinction, the gap catalog, how to ask the user well,
      the manifest format in full, and validation with or without the CLI. It must work in the harder
      of its two environments: a client repo with no Dagstree checkout, no CLI on `PATH`, and no
      backend account.
- [x] Installation is a file copy into `.claude/skills/dagstree/SKILL.md`, project-level or
      user-level — see `skills/README.md`. A dedicated installer script was written and then removed:
      one file, one destination, no transformation, so it was ceremony around `cp`. It becomes a
      `dagstree` subcommand once the CLI is published and there is a schema version worth checking
      the skill against.
- [x] **Drift check** — `packages/schema/src/skill-drift.test.ts`, 4 tests, green. Two checks,
      because a fragment and a full manifest drift differently. An unmarked ```yaml block in
      `SKILL.md` is treated as a complete manifest and run through `parseManifest` exactly as a
      client-repo agent would; none exist today (the skill is CLI-mandatory and deliberately does
      not invite hand-authoring), so the loop is a tripwire for the day one is added back. A block
      marked `<!-- dagstree:fragment -->` is deliberately partial and can never pass full
      validation, so instead every field name and enum value it uses is walked against
      `dagstreeSchemaV1`'s own definitions — a renamed field or a dropped enum value fails it. The
      same file also validates every `examples/*.dagstree.yaml` end to end, with zero warnings
      required.
- [x] **CLI installed and on `PATH`.** `pnpm run link:cli` (`scripts/link-cli.mjs`) writes
      `dagstree`, `dagstree.cmd` and `dagstree.ps1` into npm's global bin directory — already on
      `PATH` on a stock Node install — pointing at this checkout's `packages/cli/dist/cli.js`.
      Verified in cmd, PowerShell and Git Bash: `dagstree --version` prints 0.0.1 at exit 0, and
      `dagstree validate` with no manifest exits 2, so exit codes propagate through every shim.
      `pnpm run unlink:cli` removes them.

      *Why shims rather than a global install.* `packages/cli` reaches `@dagstree/core` and
      `@dagstree/schema` through `workspace:*`, so `pnpm add --global ./packages/cli` tries to
      resolve two unpublished packages from the registry and fails; pnpm 11 has also dropped
      `pnpm link --global`. Running the built entrypoint in place resolves dependencies from this
      checkout's own `node_modules`. The shims therefore survive a rebuild without relinking, and
      nothing edits the user's `PATH`. This stops being the right answer once the package is
      published — then it is `pnpm add --global dagstree` and this script is deleted.
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

      - **`dagstree detect` ran third**, after reading the skill and the `--version` prerequisite
        check, with no exploration before it. That was the reported defect and it is fixed.
      - **Edges were derived, and modelled better than before**: logical services separated from
        where they run (`loki -> fly-loki`, `grafana -> fly-grafana`) rather than collapsed,
        `github-actions` fanning out to all four deploy targets, `vertex-ai -> gcs-video-temp`.
      - **One question batch, four questions, none of them discoverable** — registrar/DNS, the
        CloudFront origin, off-repo services (listing what it had already found), lifecycle. The
        answers came back into the file: the CloudFront note records "confirmed by owner, wired in
        the AWS console", and the lifecycle question produced the first `phasing_out` entry any cold
        run has generated, with its `replaced_by`.
      - **`dagstree set project.name` was exercised**, an hour after it existed.

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
- `dagstree validate` exits 0 on it.

So the question flow works. That was the thing most at risk, it is the part no test can check, and
it needed a human to judge — the owner's assessment of the questions asked was "very accurate".

- [x] **The reference example is now synthetic.** The cold-run manifest is richer, but it belongs to
      the project it describes and stays there; `examples/reference.dagstree.yaml` covers the same
      shapes without naming anything real. A future cold run is judged on whether it produces those
      shapes — entries per deployed app, one service split across roles, lifecycle, off-repo
      services, real edges — not on matching a fixed list of services.

### Second defect the cold run found — the soft guard fires on payment-service prose ✅ decided

`dagstree validate` on the cold-run manifest exits 0 but prints two soft warnings, both on the
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

      Changed in three places, docs only: `skills/dagstree/SKILL.md` no longer names `--strict` as
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
      nobody claims, which is a `dagstree add` — deliberately, since admitting generic words
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

What no scanner can ever supply, by design (HANDOFF §3) — this is why `dagstree add` and the agent
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
6 of the skill then says to run `dagstree add supabase --role database --id supabase-db`. Both
commands succeed, and the file ends up with three supabase entries — `supabase` (role `db`, from
init), `supabase-db` and `supabase-auth`.

There was no way back. `add` only appends, there is no `remove`, no command changes a role,
`init --yes` a second time exits 2 ("already exists"), and plain `init` needs a TTY an agent does
not have. Deleting `dagstree.yaml` and re-running `init` was the only move the CLI left, which is
exactly what happened.

Note the shape of this: `set`/`link`/`deprecate` were added and the skill was rewritten to say "there
is no hand-edit exception" without anyone checking that init → add composes. Each command worked;
the sequence did not.

- [x] **`init --yes` no longer writes service entries.** It fills project name, VCS provider and
      coding agents, counts what detection found, and prints "N service(s) detected and not yet
      declared — run `dagstree diff` to list them". `diff` was already the work list; it just was
      not being used as one. Chosen over keeping the prefill and adding `remove`, because the
      prefilled roles were wrong on every entry anyway, so the prefill created cleanup rather than
      saving it.
- [x] Skill steps 2 and 6 rewritten to match: step 2 explains why the services list is empty
      (category is not a role), step 6 starts from `dagstree diff`. Added an explicit
      **never delete `dagstree.yaml` to start over** — it is a committed file that may hold answers
      an earlier session got from the user.
- [x] Verified end to end on the fixture: `init --yes` → `diff` (6 detected, none declared) →
      seven `add`s with real roles (`hosting-api`, `hosting-web`, `database`, `auth`, `ai-models`,
      `payments`, `email`) → `link` → `set` → `validate` exit 0. No duplicates, no deletion.

### `dagstree remove <id>` — the last unrecoverable state ✅ built and audited

Every writing command is additive. Nothing takes anything out. So one wrong `add` — a typo'd role, a
service the user turns out not to use, an entry created before a contradiction was resolved — cannot
be undone by the CLI at all, and the only remaining move is to delete `dagstree.yaml` and start
over. That is the exact loop the first cold run fell into, and removing the `init` prefill only
removed the most common *cause*; it did not give anyone a way back.

`SKILL.md` currently tells the agent to stop and say so rather than clear the file. That is a
stopgap: it converts a silent corruption into a dead end. **Build this before the next cold run** —
an agent that cannot recover from its own mistake will either freeze or do something worse.

- [x] `dagstree remove <id> [path]` — delete one service entry from `services[]`.
- [x] **Cascade the edges.** Every entry in `dependencies` naming the id, in *either* direction, goes
      with it. Leaving one behind is a dangling edge, which fails referential integrity on the next
      `validate` — so a `remove` that did not cascade would trade one unrecoverable state for
      another. Report each dropped edge by name; a destructive command should say what it did.
- [x] **Refuse when another entry's `replaced_by` names the id**, listing the entries that point at
      it. `replaced_by` is a lifecycle claim someone made deliberately ("this is what replaces it"),
      not a detail to clear silently, and clearing it would quietly erase the migration from the
      Phase 7 dashboard. The message should say what to do: re-point or clear it with
      `dagstree deprecate` first, then remove. Reconsider a `--cascade` flag only if this turns out
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

- [x] **Correct a `role` on an existing entry.** Done: `dagstree set services.<id>.role <role>`. The
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
      one thing the skill forbids. It now names the command: `dagstree set project.vcs.visibility
      public`.
- [x] **Correct an `id`. Done: `dagstree rename <old> <new> [path]`.** Not a `set`: an id is
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

      **Owner's decision: a documented convention, no schema change.** `skills/dagstree/SKILL.md`
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
      for both and contradicted `examples/reference.dagstree.yaml`, which uses `role: email` and is
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

      `skills/dagstree/SKILL.md` quotes the heading, so it changed in the same commit. Verified by
      execution against a scratch project carrying an unparseable `.mcp.json`, a `phasing_out` entry
      and an undetectable one: all four elements render, exit 1. 4 new tests, and the existing diff
      tests were updated to the new strings rather than left asserting the old ones.
- [x] **The category enum had no bucket for monitoring, queue or email — widened, with the spec
      amended.** Sentry, Datadog, New Relic, SQS, RabbitMQ, Resend, SendGrid, Mailgun and Twilio are
      unambiguously services and all landed in `other`.

      *Correction to what this item used to say.* It described widening the enum as "a schema change
      plus a skill change in the same commit, per the drift test". Checked: `category` is **not** a
      field in `dagstree.yaml` and appears nowhere in `packages/schema` or in `SKILL.md`. It is
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
      `dagstree remove fly-api <dir>/sub` removed the entry from `<dir>/dagstree.yaml` and exited 0.

      Closed with `findManifestIn` in `manifest-io.ts` — the same "is there a manifest here" question
      `findManifest` already asks at each level of its walk, minus the walk, so the
      dagstree.yaml-beats-stack.yaml precedence cannot drift between the two callers. An explicit
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

      **The manifest is still opened**, deliberately. `dagstree remove` on one of the cycle's own
      services is the only thing in the CLI that breaks a cycle, so refusing to open a cyclic
      manifest would have traded a misattributed message for an unfixable file — the same shape of
      dead end the `remove` section above exists to prevent. A test pins that recovery path, and the
      mutation that refuses on open turns it red.

      Verified by direct execution: `remove` and `deprecate` aimed at the innocent entry both exit 1
      naming the file, the manifest is byte-identical by checksum, `dagstree remove svc-c` — the
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
hand-edit them and then validate. All four items below are done, and `skills/dagstree/SKILL.md` no
longer contains a hand-edit exception: **the CLI is now the only writer**, which is the property the
whole design wants. Verified by direct execution — `init --yes`, `set` ×2, `add` ×3, `link`,
`deprecate`, then `validate` exit 0 — on a scratch project, with the `$schema` modeline and comments
intact afterwards.

- [x] `dagstree set <field> <value> [<field> <value> ...]` — `project.architecture`, `project.pm`,
      `project.vcs.provider`, `project.vcs.visibility`, `project.coding_agents`. Takes *pairs*, not
      a single field, because the schema requires `project.vcs` to carry both `provider` and
      `visibility`: a strictly one-field-per-call setter could never write vcs at all, in either
      order. Every value is checked before the file is opened, so a bad second pair leaves the first
      unwritten. Consequence of the variadic pair list: `set` takes `--path` where every other
      command takes a positional `[path]` — a trailing directory would be swallowed as a field name,
      the same shape of bug `--depends-on` hit in Phase 3.5.
- [x] `dagstree link <from> <to> [path]` — one edge between two services that already exist. A
      duplicate edge is a no-op at exit 0 rather than a second identical line; a self-edge is
      refused in its own words rather than as `cyclic dependency: a -> a`, which reads like a bug in
      the tool; an edge that would close a cycle is refused and nothing is written.
- [x] Id derivation for `add` now prefers `<service>-<role>` once that service already appears in
      the manifest, not merely once the bare id is taken. A manifest holding supabase under the
      explicit id `supabase-db` left `supabase` free, so a second `add supabase --role auth` took
      it — legal, but `supabase` beside `supabase-db` reads as though the two were different kinds
      of thing.
- [x] `dagstree deprecate <id> [path] [--status <s>] [--replaced-by <id>]` — sets `status` and
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
- [ ] `dagstree login`
- [ ] `dagstree push` — manifest and detection upsert
- [ ] `dagstree push --private key=value` — field allow-list, hard-reject anything outside
      `account_ref`, `plan_tier`, `cost_amount`, `cost_currency`, `billing_cycle`, `renewal_date`,
      `started_at`, `notes_private`
- [ ] Test proving the token never lands in a file an agent can read into context

## Phase 6 — MCP server mode ⬜

The agent workflow, and the differentiator. `dagstree mcp` over stdio.

- [ ] `detect_stack` — run detection, return a structured diff against the manifest
- [ ] `read_manifest`
- [ ] `propose_manifest_edit` — returns a diff for approval, never writes directly
- [ ] `push_private` — routes through the CLI's credential; the agent never sees it
- [ ] Wire into Claude Code and run the detect → diff → propose loop against a real repo

## Phase 3.7 — Viewer on manifests, no backend ⬜

Decided: the viewer comes **before** Phase 4 and reads manifests directly. Layers 1 and 2 are the
entire graph — nodes, edges, roles, status, `replaced_by`, architecture, coding agents all live in
`dagstree.yaml`, which the CLI already parses and validates. Only Layer 3 (cost, account references)
needs a store, and that is one panel. Cross-project queries do not need SQL at this scale either:
roughly fifteen projects is an in-memory graph walk over N parsed manifests.

This keeps the Phase 4 decision genuinely deferred rather than quietly pre-made, and de-risks the
parts of the viewer that are actually hard — DAG layout, icon fallback, making a multi-parent graph
readable — none of which involve a database.

- [ ] React + Vite app under `apps/web`
- [ ] Manifest source: scan a workspace root for repos containing `dagstree.yaml`
- [ ] Per-project DAG: elkjs layout, React Flow render, `simple-icons` brand icons with a
      category-icon fallback from the start. **Group on the segment of `role` before the first
      `-`** — that is the convention settled in the 3.6 follow-ups, and the viewer is the first
      consumer of it.
- [ ] Status colours — active, `phasing_out`, deprecated — and `replaced_by` targets shown
- [ ] Portfolio page: project list, service usage matrix across projects
- [ ] Migration dashboard: everything `phasing_out` with its replacement
- [ ] Layer 3 cost panel present, rendering an explicit "not connected" empty state
- [x] **Unblocked.** A real manifest now exists — 26 services, 30 edges, off-repo services, but no
      lifecycle entries and no notes — alongside `examples/reference.dagstree.yaml`, which is the
      one that covers status, `replaced_by`, `kind: component` and `kind: stack`. That is enough to build and
      judge the per-project DAG, the status colours and the `replaced_by` rendering, which are the
      genuinely hard parts. The portfolio page and the usage matrix want several projects, so they
      are the parts to build last, against whatever manifests exist by then.

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

- [ ] Register `dagstree.com`, `dagstree.ca`, `dagstree.dev`
- [ ] Register `dagstry.com`, 301 redirect (homophone)
- [ ] Reserve the npm package name `dagstree`
- [ ] Reserve the GitHub org `dagstree` — the repo currently lives at `github.com/Lecarvalho/dagstree`;
      moving it to an org later is a redirect, not a break, so this is not urgent
- [ ] CIPO/USPTO knock-out search, Nice Class 9 + 42
- [ ] Publish the JSON Schema at `https://dagstree.dev/schema/v1.json` — the `$schema` modeline the
      CLI writes points there, so until it resolves, editor autocomplete does not work

---

## Decisions made

From HANDOFF §9, plus decisions taken during implementation. Settled — reopen only with a reason.

1. **Manifest filename** — `dagstree.yaml`. `stack.yaml` accepted as a fallback on read; writes are
   always `dagstree.yaml`.
2. **Slug taxonomy** — Dagstree's own namespace, with an explicit mapping table from the slugs
   stack-analyser emits. Adopting specfy's slugs wholesale would couple the catalog to their release
   cycle.
3. **Acyclicity enforcement** — CLI `validate` and the application layer. No database trigger.
4. **One service, multiple roles** — two entries with distinct local ids (`supabase-db`,
   `supabase-auth`).
5. **Monorepo handling inside a scanned project** — out of scope for v1.
6. **Where the private-data guard lives** — `@dagstree/schema`, not the CLI. Phase 5 push and Phase 6
   MCP both need the identical boundary, and a guard implemented in the CLI is bypassed by every other
   consumer. Exactly one copy of the patterns exists in the repo; two copies is how one of them stops
   catching things.
7. **Two-tier guard rather than one** — a heuristic that cries wolf gets switched off, and a guard the
   user has disabled is worth less than no guard. Hard tier is high precision only; soft tier warns and
   leaves exit 0 unless `--strict`.

## Non-goals

From HANDOFF §8. Worth restating because each is a plausible-sounding scope creep.

- Storing secrets or credentials. Ever. Layer 3 holds *references* to an identity, never the
  credential itself.
- Uptime monitoring — other tools do this; integrate later at most.
- Package-level dependency management — that is Renovate's job.
