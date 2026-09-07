# Open work — everything left, by what it waits on

Compiled 2026-09-05 from the phase files and the handoffs; each item names the file that holds its
detail. Nothing here is new — it is the unticked boxes and the "next session does first" lists,
gathered into one place. When an item closes, remove it here and record the evidence in its phase
file or the handoff.

## Ready now — no decision needed

- **Phase 5** — device flow, keychain, `catalogus login`, `catalogus push`, against the local
  Supabase stack (`supabase start`); GitHub OAuth needs a real OAuth app even locally, email or
  magic link work offline through Inbucket. (`phase-5-auth-push.md`.)

- ~~Run the MCP loop interactively once~~ — **closed 2026-09-07.** The owner ran it on Clapline
  and observed the agent stop at the proposal diff before `apply_manifest_edit`.

- ~~Re-copy the trimmed skill to Clapline~~ — **closed 2026-09-07.** The owner re-copied the
  trimmed skill to Clapline, reran it and validated the result. The eight parser edge cases the
  2026-09-06 (later) handoff records as deliberately not fixed stay recorded; none blocks anything.

## Waiting on the owner — nothing open

The 2026-09-05 list was answered in one batch on 2026-09-05 (evening). The answers, recorded in
`decisions.md` (12 and 13) and the 2026-09-05 late handoff in `handoffs-2026-09.md`:

- Recency mark's slot and window edge: **OK as built.**
- Density row: **removed** — "users don't need to choose the density."
- Graph nodes and the Monochrome switch: **moot** — the graph view is decommissioned (decision 12).
- `?` inside the open Settings panel: **OK as is.**
- The utility red: **`#d40010` is the red** (decision 13); the `#E60012` question is closed.
- Board-in-colour contrast: **Monochrome default stands**; the reader can switch in Settings.
- thesvg.org marks: **keep them**; the item is closed.
- Service page fallback glyph inset: **OK as is.**
- Three graph-view items from 2026-08-26: **gone with the graph.**
- The mark: **still deferred, indefinitely.** Do not invent a logo; do not block on it.

## Portfolio page — Phase 3.7's one open box

Deferred by owner decision 2026-08-25: the viewer stays single-repo. Blocked on **data** (the
workspace holds one real manifest; the owner ruled the page is judged against real topology or not
at all) and on three unsettled questions: how `view` gets pointed at several projects
(`--workspace`, a `portfolio` command, or auto-detect), whether to onboard more repos first, and
whether the portfolio is a fourth view mode or its own route. `scanWorkspace()` is built, tested
and dormant — it is what this resumes from. Three of HANDOFF §4.2's six queries need this page
(2, 3, 6). (`phase-3.7-viewer.md`.)

## Phase 4 — Backend ✅ (Supabase, decision 15) — local stack running

All four boxes built and validated 2026-09-07; the local Supabase stack (`supabase start`) runs
the migrations and seed on Supabase's own Postgres 17, and the suite is green against it
(`phase-4-backend.md`, "The local Supabase stack"). Nothing here waits on an account: the hosted
project (`supabase link`, `db push`) is a launch item and moved to the parallel track below. Two
things for the owner to confirm or veto: the `services` table has no `category` column
(decision 15), and the seed leaves `pricing_model` and `vendor_url` null.

## Phase 5 — Auth and push ⬜ — ready now, against the local stack

Device flow, `@napi-rs/keyring`, `catalogus login`, `catalogus push`, `push --private` with the
field allow-list, and the test that the token never lands in a file an agent can read.
(`phase-5-auth-push.md`.)

## Phase 6 — MCP server mode 🔶 first class for agents (decision 14)

`catalogus mcp` over stdio with eight tools, and the skill MCP-first at 250 lines; all shipped and
validated 2026-09-06; the live loop ran on Clapline the same night. Left: `push_private` (needs
Phase 5) and the hosted edition served by the web platform against an account (Phase 7; the
recorded constraint is that `detect_stack` needs repo access the hosted server does not have).
(`phase-6-mcp.md`, `decisions.md` 14.)

## Phase 7 — Viewer backed by the platform ⬜ (after 5)

Four of its seven boxes already exist as Phase 3.7 reading manifests directly; Phase 7 puts the
store behind them and adds the portfolio with cost totals and the cross-project blast radius. The
§4.2 acceptance line stands at two of six. (`phase-7-platform-viewer.md`.)

## Parallel track ⬜ — blocks launch, not development

- [ ] Create the hosted Supabase project, `supabase link`, `supabase db push`, seed as `service_role`
- [ ] Reserve the GitHub org `catalogus`
- [ ] CIPO/USPTO knock-out search, Nice Class 9 + 42
- [ ] Publish the JSON Schema at `https://catalogus.dev/schema/v1.json` — until it resolves, the
      `$schema` modeline the CLI writes gives editors nothing
- [ ] Publish `@catalogus/schema`, `@catalogus/core`, `@catalogus/cli` to npm — the owner's
      2026-09-06 ruling: a client installs the MCP server without the source, so the README
      documents `npx -y @catalogus/cli mcp` as the procedure, marked pending. The five publish
      steps are in `parallel-track.md`. Blocked on nothing but the owner's npm account.

Plus two things that become due on publish, recorded in `phase-3.6-dogfooding.md`: the skill
installer becomes a `catalogus` subcommand, and the `link:cli` shims give way to
`pnpm add --global @catalogus/cli`.

## Not to do

Recorded across the handoffs so they are not re-proposed: re-derive the entry page's width, the
phone grid's numbers or the popover's tap rule; re-propose the graph view (deferred by the owner on 2026-09-05, decision 12); re-run any `docs/*-brief.md`; re-roll the design direction; add a fenced
`catalogus view` to the skill.
