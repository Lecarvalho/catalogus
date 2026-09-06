# Catalogus — Implementation Plan & Progress

Status board and index. `docs/HANDOFF.md` is the specification and the source of truth for design
decisions; this file tracks *what has been built* against it and what remains. The detail lives in
`docs/plan/`, one file per phase or per run of handoffs, so a session opens the one file it is
working from rather than all of them. **This file and `docs/plan/00-open-work.md` are the only two
that summarise status; every other file under `docs/plan/` is the record and is appended to, not
rewritten.**

The board was one 4,400-line file until 2026-09-05. It was split verbatim: every section heading is
unchanged, so a code comment that says "see docs/PLAN.md's Phase 3.7 DAG decision" or "PLAN.md
decision 7" still finds its target by grepping the heading under `docs/plan/`. Those comments were
deliberately not rewritten — about forty sites across four packages, all prose.

- **Status:** Phases 0–3.7 complete, 3.7 less its portfolio page (deferred by the owner on
  2026-08-25, viewer stays single-repo). The viewer's graph view was decommissioned by the owner on
  2026-09-05 (viewer has List and Migrations; `decisions.md` 12). Phase 6 is six boxes of eight
  as of 2026-09-06: `catalogus mcp` with eight tools and an MCP-first skill, validated on the
  built binary, under decision 14 (the MCP is the agent's surface; the CLI is for people and
  CI); `push_private` waits on Phase 5, the live Claude Code wiring is the ready-now item, and
  the hosted edition is Phase 7. Phase 4 is blocked on the backend decision; 5
  and 7 wait on 4. The parallel track has three unticked items. Nothing waits on the owner. The
  full list of what is left, with what each waits on, is `docs/plan/00-open-work.md`.
- **Last updated:** 2026-09-06

## Start here on a fresh session

1. Run `pnpm build && pnpm test`, then `pnpm typecheck`, **in that order** — the direction contract
   guard compares `apps/web/index.html` against the build output, so a test run against a stale
   `dist` fails on a difference you already fixed.
2. **Expected: 1695 tests / 92 files**, green, typecheck clean across four packages (as of
   2026-09-06 late, eight MCP tools and the 250-line skill; the count fell from 1751 because the
   command drift test generates tests per fenced skill line). Two legitimate variations: `direction-contract.test.ts` derives
   its count from the contract's own sections, so a contract edit moves the total by design; and
   `workspace-scan.test.ts` skips six junction tests where Windows refuses the privilege, so
   1689 passed + 6 skipped is the same tree. A count one or two off is a reason to read that file's
   diff, not a failure. The history of how the number got here is `docs/plan/status-history.md`.
3. **Run it more than once before believing it.** vitest parallelises across files; the suite has
   flaked before on two files mutating one real directory while every single-file run passed.
4. Read `docs/plan/00-open-work.md`, pick the item, open the one phase file it points at, and read
   the newest handoff in `docs/plan/handoffs-2026-09.md` for the traps a fresh session would
   otherwise rediscover (hidden-tab viewport readings, `catalogus view` caching `index.html`,
   `btn.focus()` not being a keyboard focus, the restore-command rule for validators).

## Files

| File | Holds |
|---|---|
| `docs/plan/00-open-work.md` | Everything left, grouped by what it waits on. The list to pick from. |
| `docs/plan/handoffs-2026-09.md` | Handoffs 2026-09-02 to 09-06: shell, menus, icons, brand tile, `rename`/`remove` vs a vendored icon, recency on the board, the graph view removed, the MCP server. Newest first. |
| `docs/plan/handoffs-2026-08-26-design.md` | The design world replaced and the form chosen; `/impeccable` state; contract in the page; DAG and migrations joining the world. |
| `docs/plan/handoffs-2026-08-24-25.md` | Brand interview and shell; viewer redesign; closing 3.7; DAG; drift-and-corpus; viewer foundations. |
| `docs/plan/phases-0-3.5.md` | Phases 0–3.5 ✅ — scaffold, schema, core, CLI, defect fixes. |
| `docs/plan/phase-3.6-dogfooding.md` | Phase 3.6 ✅ and 3.6.1 ✅ — cold runs, the skill, `remove`, the five follow-ups, open questions. |
| `docs/plan/phase-3.7-viewer.md` | Phase 3.7 ✅ less the portfolio page — the viewer on manifests, its decisions, scope notes, HANDOFF §4.2 status. |
| `docs/plan/phase-4-backend.md` | Phase 4 ⛔ — the backend decision and what follows it. |
| `docs/plan/phase-5-auth-push.md` | Phase 5 ⬜ — device flow, keychain, `login`, `push`. |
| `docs/plan/phase-6-mcp.md` | Phase 6 🔶 — `catalogus mcp` over stdio; eight tools and the MCP-first skill built and validated 2026-09-06 (decision 14), `push_private`, the live wiring and the hosted edition left. |
| `docs/plan/phase-7-platform-viewer.md` | Phase 7 ⬜ — the viewer backed by the platform; the §4.2 acceptance line. |
| `docs/plan/parallel-track.md` | Names, trademark, schema URL. |
| `docs/plan/decisions.md` | The fourteen settled decisions and the non-goals. Reopen only with a reason. |
| `docs/plan/status-history.md` | The old top-of-board paragraph and the test-count history, kept for bisecting. |

Briefs that were run are kept beside this file as the record (`docs/*-brief.md`) and are not to be
run again.

## How to use these files

Check a box only when the work is done *and* verified — `pnpm build && pnpm test && pnpm typecheck`
green, and for user-facing behaviour, actually run rather than assumed. Prefer leaving a box unchecked
with a note over checking it optimistically; a status board that overstates progress is worse than none.

When a phase completes, record the verified numbers (test count, exit codes observed) in its file so a
later session can tell whether something regressed. A new session's handoff goes at the top of the
current month's handoffs file (start `handoffs-2026-10.md` when the month turns), and the item it
closed moves out of `00-open-work.md`. The main session is the only writer of these files.

## Verify command

```
pnpm build && pnpm test && pnpm typecheck
```

Current baseline: **1695 tests / 92 files** (2026-09-06, late). Build and typecheck both exit 0.
