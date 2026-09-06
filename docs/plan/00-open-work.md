# Open work — everything left, by what it waits on

Compiled 2026-09-05 from the phase files and the handoffs; each item names the file that holds its
detail. Nothing here is new — it is the unticked boxes and the "next session does first" lists,
gathered into one place. When an item closes, remove it here and record the evidence in its phase
file or the handoff.

## Ready now — no decision needed

1. **`add --help`'s id-derivation sentence** in `packages/cli/src/program.ts`. It says the id is
   "derived from service+role when omitted"; `deriveLocalId` uses the bare slug first. One line.
   (`handoffs-2026-09.md`, 2026-09-05.)
2. **HANDOFF §4.2 query 5 — "everything added in the last N days", surfaced somewhere scannable.**
   The recency rule exists (`service-tags.ts`, `RECENT_WINDOW_DAYS`, the `new` tag on the page and
   popover); the board carries no recency mark because a collapsed tile stands for several entries.
   Single-project, unblocked, the cheapest §4.2 item by a distance. (`phase-3.7-viewer.md`,
   "HANDOFF §4.2 at the close of Phase 3.7".)
3. **A stale box in Phase 3.6.** The rehearsal cold run section still carries `[ ] The real second
   cold run …`, while the phase's own list ticks the second cold run as done by the owner
   (25 services / 31 edges). Reconcile: tick it with a pointer, or say why it is still open.
   (`phase-3.6-dogfooding.md`.)

## Waiting on the owner — ask once, then a small edit

The 2026-09-05 handoff's list, plus the older items that are still the owner's call:

- **Density row in Settings.** Omitted; the owner has the screenshot of the built panel. Add the
  row or record "no density".
- **Do the graph's nodes join the Monochrome switch?** Today only the board's tiles do.
- **`?` inside the open Settings panel** closes it and opens Help. Not obviously wrong; noted.
- **The utility red.** The direction contract names `#E60012`, the shipped token has been `#d40010`
  since first written, and nothing records why. (`handoffs-2026-08-26-design.md`.)
- **Board-in-colour contrast.** Real brand palettes on `--color-surface` measure down to 1.57:1
  (Vertex AI). Options recorded: a mono board, or the colour toggle defaulting off — the switch
  now exists and defaults to Monochrome, so re-check whether this is answered.
  (`handoffs-2026-09.md`, 2026-09-03.)
- **thesvg.org licence basis** for the five vendored marks — `packages/core/icons/thesvg/LICENSES.md`
  says what it rests on; the owner reads it once and decides.
- **The service page's fallback glyph inset** (Loki fills its 46px tile edge to edge; the popover
  keeps 2px). A number for the owner or the mockup to name.
- **Three graph-view items from 2026-08-26**: four selected-state treatments are dead code (design
  decision, not cleanup); status is colour-only for a screen reader on the graph; `.kind-stack`'s
  shape cue is invisible. (`handoffs-2026-08-26-design.md`, "Three things left open".)
- **The mark.** The logo is deferred by the owner indefinitely. The `/impeccable` finish review and
  `DESIGN.md` wait on it or on the owner lifting the condition. Do not invent a mark.

## Portfolio page — Phase 3.7's one open box

Deferred by owner decision 2026-08-25: the viewer stays single-repo. Blocked on **data** (the
workspace holds one real manifest; the owner ruled the page is judged against real topology or not
at all) and on three unsettled questions: how `view` gets pointed at several projects
(`--workspace`, a `portfolio` command, or auto-detect), whether to onboard more repos first, and
whether the portfolio is a fourth view mode or its own route. `scanWorkspace()` is built, tested
and dormant — it is what this resumes from. Three of HANDOFF §4.2's six queries need this page
(2, 3, 6). (`phase-3.7-viewer.md`.)

## Phase 4 — Backend ⛔ blocked on one decision

- [ ] Pick the backend (Neon / D1 / PocketBase / Supabase — the comparison is in the phase file)
- [ ] Migrations for the HANDOFF §4 schema
- [ ] Row-level ownership policies, with a test that a second user cannot read the first's
      `user_service_accounts`
- [ ] Views: `v_project_costs`, `v_service_blast_radius`, `v_phaseouts`
- [ ] Seed the global service catalog

A local Postgres container is available for prototyping the §4 schema, RLS and the recursive CTE
before choosing a host. (`phase-4-backend.md`.)

## Phase 5 — Auth and push ⬜ (after 4)

Device flow, `@napi-rs/keyring`, `catalogus login`, `catalogus push`, `push --private` with the
field allow-list, and the test that the token never lands in a file an agent can read.
(`phase-5-auth-push.md`.)

## Phase 6 — MCP server mode ⬜

`catalogus mcp` over stdio: `detect_stack`, `read_manifest`, `propose_manifest_edit`,
`push_private`, wired into Claude Code. The first three read and diff only and do not need a
backend; `push_private` needs Phase 5. (`phase-6-mcp.md`.)

## Phase 7 — Viewer backed by the platform ⬜ (after 4)

Four of its seven boxes already exist as Phase 3.7 reading manifests directly; Phase 7 puts the
store behind them and adds the portfolio with cost totals and the cross-project blast radius. The
§4.2 acceptance line stands at two of six. (`phase-7-platform-viewer.md`.)

## Parallel track ⬜ — blocks launch, not development

- [ ] Reserve the GitHub org `catalogus`
- [ ] CIPO/USPTO knock-out search, Nice Class 9 + 42
- [ ] Publish the JSON Schema at `https://catalogus.dev/schema/v1.json` — until it resolves, the
      `$schema` modeline the CLI writes gives editors nothing

Plus two things that become due on publish, recorded in `phase-3.6-dogfooding.md`: the skill
installer becomes a `catalogus` subcommand, and the `link:cli` shims give way to
`pnpm add --global @catalogus/cli`.

## Not to do

Recorded across the handoffs so they are not re-proposed: re-derive the entry page's width, the
phone grid's numbers or the popover's tap rule; re-investigate the graph's fit-to-view (a hidden tab,
not a defect); re-run any `docs/*-brief.md`; re-roll the design direction; add a fenced
`catalogus view` to the skill.
