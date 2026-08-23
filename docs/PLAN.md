# Dagstree — Implementation Plan & Progress

Working plan and status board. `docs/HANDOFF.md` is the specification and the source of truth for
design decisions; this file tracks *what has been built* against it and what remains.

- **Status:** Phases 0–3.5 complete and verified. Phase 3.6 (dogfooding + agent skill) in progress —
  the config-key detector is built and the detection gap it was written for is closed, and the CLI
  now owns every Layer 2 field (`set`, `link`, `deprecate`), so the skill has no hand-edit path
  left. The first cold run happened and succeeded — 23 services, 28 edges on a real project — and
  found that `init` and `add` did not compose (fixed) plus a soft-guard false positive (open). Next
  is `dagstree remove`, the one unrecoverable state remaining, then a second cold run on a different
  repo. Phase 4 deferred by owner decision.
- **Last updated:** 2026-08-23

## Start here on a fresh session

Phases 0 through 3.5 are complete and verified. Nothing is broken; the working tree is clean of
known defects. Run the verify command first and confirm 454/35 before trusting anything below.

**The repository is committed at `712a8a6` (initial commit) and everything since is UNCOMMITTED.**
Run `git status` for the current list rather than trusting one written here — a hand-maintained file
list goes stale within a session and then misleads the next one.

The CLI is installed: `pnpm run link:cli` has been run, so `dagstree` is on `PATH` via shims in
npm's global bin directory pointing at this checkout. `pnpm build` updates what they run. If the
repo is ever moved, re-run `pnpm run link:cli`.

**The first cold run has happened** — see "What the first cold run produced" below. It worked, and
it found two defects, one fixed and one open. The next three things:

1. **Build `dagstree remove <id>`** — see its own section under Phase 3.6. It is the last state the
   CLI cannot get out of: every writer is additive, so one wrong `add` leaves deleting the manifest
   as the only move, which is the loop the cold run fell into. Do this before another cold test, or
   the agent hits a dead end the moment it makes a mistake.
2. **Decide what to do with `examples/clapline.dagstree.yaml`**, which the cold run has made stale —
   the manifest sitting in Clapline is materially better than the reference it was supposed to be
   judged against.
3. **Second cold run, on a different repo.** Clapline is no longer a clean target (it now has a
   manifest and an installed skill). `waymark`, `Pomegr`, `fixpic` and `trello-cli` are the
   candidates the detection spike already covered.

The config-key detector and the `set`/`link`/`deprecate` commands that used to sit above this are
built and measured — see the detection gap and CLI gaps sections below.

Phase 4 (backend) stays deferred by owner decision. Phase 3.7 (viewer on manifests) needs real
manifests first, so it waits on step 2.

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

Current baseline: **454 tests, 35 files, zero skipped.** Build and typecheck both exit 0.

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

## Phase 3.6 — Dogfooding and the agent skill 🔶 in progress

Using the tool on real projects, which is the most honest test Phases 1–3 will get, and the source
material for teaching an agent to do the same.

- [x] Reference manifest for Clapline at `examples/clapline.dagstree.yaml` — 18 service entries,
      19 edges, derived from `appsettings*.json` key names and the four `fly.*.toml` app definitions
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
- [ ] Second repo. Clapline is no longer a clean target: the run left `dagstree.yaml` there, plus
      the skill installed at `.claude/skills/dagstree/` and `.agents/skills/dagstree/`, all
      uncommitted. Use `waymark`, `Pomegr`, `fixpic` or `trello-cli` — all four were covered by the
      detection spike, so there is a baseline to compare against.

### What the first cold run produced

The agent worked from Clapline and wrote `C:/Workspace/repos/Clapline/dagstree.yaml`
(uncommitted, alongside the two installed skill copies). **It is good** — better than the reference
manifest it was meant to be judged against:

|  | `examples/clapline.dagstree.yaml` | cold-run output |
|---|---|---|
| services | 18 | 23 |
| edges | 19 | 28 |
| notes | on some entries | on nearly every entry, specific |
| `added` dates | all 2025-11-02 / 2026-01-15 | per-service, recovered from git |

It captured things no scan can reach: Namecheap as registrar and DNS, Healthchecks.io as the
deadman target, Cloudflare Web Analytics as a console-configured beacon, Slack as Grafana's alert
contact point, and the Fly apps split into five entries by what each one actually runs
(`fly-api`, `fly-web`, `fly-grafana`, `fly-loki`, `fly-prometheus`). The architecture description is
the owner's own words, not inferred from directory names. `dagstree validate` on it exits 0.

So the question flow works. That was the thing most at risk, and it is the part that needed a human
to judge — the owner's assessment of the questions asked was "very accurate".

- [ ] **Reconcile `examples/clapline.dagstree.yaml`.** It is now the weaker of the two and is still
      what the drift test validates and what a future cold run would be compared against. Either
      replace it with the cold-run output (it will need re-checking for anything Layer 3 first, and
      it currently trips the soft guard — see below), or state explicitly that the example is a
      minimal illustration and the cold-run output is the benchmark. Leaving both without saying
      which is which is how the next session compares against the wrong one.

### Second defect the cold run found — the soft guard fires on payment-service prose ⬜ open

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

- [ ] Decide, then either narrow the soft patterns (e.g. do not fire on `billing`/`subscription`
      inside a `notes` field on an entry whose category is `payments`), or change what `--strict`
      means, or keep the behaviour and stop recommending `--strict` for CI. Do not "fix" it by
      rewording the manifest.

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
- [ ] Category mapping is thin: most detections land in `other`, so the viewer would render a wall
      of uncategorised entries and `detect` output buries the services among the libraries. The
      config-key catalog carries its own category per entry and is not affected; this is about
      `mapping.ts` and the unmapped stack-analyser pass-throughs.
- [ ] Consider suppressing pure libraries from `detect`'s default output, or grouping them under a
      collapsed heading — a service is something that can have an outage and send an invoice.

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

### `dagstree remove <id>` — the last unrecoverable state ⬜ next

Every writing command is additive. Nothing takes anything out. So one wrong `add` — a typo'd role, a
service the user turns out not to use, an entry created before a contradiction was resolved — cannot
be undone by the CLI at all, and the only remaining move is to delete `dagstree.yaml` and start
over. That is the exact loop the first cold run fell into, and removing the `init` prefill only
removed the most common *cause*; it did not give anyone a way back.

`SKILL.md` currently tells the agent to stop and say so rather than clear the file. That is a
stopgap: it converts a silent corruption into a dead end. **Build this before the next cold run** —
an agent that cannot recover from its own mistake will either freeze or do something worse.

- [ ] `dagstree remove <id> [path]` — delete one service entry from `services[]`.
- [ ] **Cascade the edges.** Every entry in `dependencies` naming the id, in *either* direction, goes
      with it. Leaving one behind is a dangling edge, which fails referential integrity on the next
      `validate` — so a `remove` that did not cascade would trade one unrecoverable state for
      another. Report each dropped edge by name; a destructive command should say what it did.
- [ ] **Refuse when another entry's `replaced_by` names the id**, listing the entries that point at
      it. `replaced_by` is a lifecycle claim someone made deliberately ("this is what replaces it"),
      not a detail to clear silently, and clearing it would quietly erase the migration from the
      Phase 7 dashboard. The message should say what to do: re-point or clear it with
      `dagstree deprecate` first, then remove. Reconsider a `--cascade` flag only if this turns out
      to be common in practice.
- [ ] Route through `packages/cli/src/manifest-edit.ts` like every other writer, so the result is
      validated before it is written and the `$schema` modeline and comments survive.
- [ ] Exit codes, matching `link` and `deprecate`: unknown id → 1 with the known ids listed; no
      manifest → 2; a removal that would leave the manifest invalid → 1, nothing written.

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

- [ ] **Correct a `role` on an existing entry.** Natural home is `dagstree set`, extending its field
      table from project-level paths to `services.<id>.role` — the path/validate/commit machinery is
      already there and this is one more row plus id resolution.
- [ ] **Correct an `id`.** Not a `set`: it is a rename, and every edge and `replaced_by` naming the
      old id has to move with it or the manifest breaks. That is `dagstree rename <old> <new>`, and
      it should be built after `remove`, since it shares the "find every reference to this id"
      traversal.

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
      category-icon fallback from the start
- [ ] Status colours — active, `phasing_out`, deprecated — and `replaced_by` targets shown
- [ ] Portfolio page: project list, service usage matrix across projects
- [ ] Migration dashboard: everything `phasing_out` with its replacement
- [ ] Layer 3 cost panel present, rendering an explicit "not connected" empty state
- [ ] Blocked until enough real manifests exist to be worth looking at — see Phase 3.6

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
