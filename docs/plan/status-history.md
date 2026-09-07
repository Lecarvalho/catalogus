# Status history — the accumulated top-of-board paragraph and the test-count history

> Split out of `docs/PLAN.md` on 2026-09-05, content verbatim. `docs/PLAN.md` is the index and the
> only place status is summarised; this file is the record. Section headings are unchanged so a
> code comment that names one still finds it by grep.

# Catalogus — Implementation Plan & Progress

Working plan and status board. `docs/HANDOFF.md` is the specification and the source of truth for
design decisions; this file tracks *what has been built* against it and what remains.

- **Status:** Phases 0–3.7 complete — 3.7 less its portfolio page, which the owner deferred on
  2026-08-25 — plus a **3.6.1 correction pass** (see its own section below):
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

  **Phase 3.7 is closed, less the portfolio page** (2026-08-25). The viewer renders — `catalogus
  view` serves one repo's manifest, grouped by rollup, with compact nodes, a URL-addressed detail
  panel, status colours, `replaced_by`, a DAG, a migration board and the Layer 3 empty state.
  **The portfolio page and the usage matrix are deferred by owner decision: the viewer stays
  single-repo.** That is the only unticked box in the phase and it has its own box explaining what
  was asked, what came back and what stays open. Phase 4 stays deferred by owner decision too.

  **Phase 3.7's last big item is done: the per-project DAG is built** (2026-08-25). elkjs in a
  worker, `@xyflow/react`, a List/Graph toggle with the list as default, and the
  deliberately-hard synthetic manifest this file kept asking for and nobody had written —
  `examples/layout-stress.catalogus.yaml`, 35 services and 48 edges with an 18-edge fan-out hub.
  The six DAG decisions the plan had carried for two sessions were put to the owner and answered.
  **Three defects came out of running it that no test could see**, all of which render a
  plausible-looking graph; they are written up in the DAG box.

  **The five smaller viewer defects are closed** in the same session — deep-link focus, a stale
  focus ref found while fixing it, history entries on every panel open and close, a selection
  state cued only by colour, and two entries of one vendor rendering as the same node twice.
  `App.tsx` went from no tests to 15.

  **Two of those three pages shipped and the third was deferred.** The migration dashboard and the
  Layer 3 cost empty state are both in; the portfolio page is the deferral above. *(This paragraph
  read "what is left is the three multi-project pages" until 2026-08-25 — it was written before any
  of them existed and went stale twice without being noticed, which is the same drift the fixture
  paragraphs below record.)*

  **`HANDOFF §4.2` is two of six**, and each query's status is written out rather than left as an
  unticked acceptance line: one answered, one half-answered, one unbuilt-but-unblocked, three
  deferred with the portfolio, and one not expressible in Layer 2 at all.

  **The session after the viewer foundations spent itself on verification rather than features**,
  and that was the right trade because it found things. The two committed corpora now exist (the
  skill's shell commands checked against the live CLI surface; 65 path-traversal vectors executed
  against a live server), and the process of building them turned up **two defects nothing else
  would have caught**: a suite flake that made `pnpm test` fail half the time while every
  single-file run passed, and a live `catalogus set` bug that reported a schema error against a
  perfectly valid manifest. Both are written up below.

  **The `/impeccable` run is down to its last two steps**, and both wait on the mark rather than on
  anyone's attention. The direction contract now ships inside the page (`apps/web/index.html`, seed
  key `ac1ba604`, in both build outputs) with a guard that compares it word-for-word against
  `apps/web/docs/DIRECTION.md`, and the mechanical detector has been run — one finding, in
  `RankModule`, a component the owner removed on 2026-08-25 and which is tree-shaken out of the
  bundle. **One open question came out of it and it is the owner's:** the contract names the utility
  red `#E60012`, the shipped token has been `#d40010` since it was first written, and nothing records
  why. The finish review and `DESIGN.md` remain open by the owner's standing condition.

  **The design is settled, and this is the first time that sentence has been true.** The world was
  replaced and the form was chosen on 2026-08-26, both by owner decision after an interview and six
  rendered candidates. `japanese-high-density-web` is retired; what replaces it is a Notion-register
  world on the same warm cream ground, with the board as a smartphone home screen — bare icons, no
  card. The app shell is separately approved and frozen. The mockups are committed at
  `apps/web/docs/candidates/` and are the specification for the component work, **which is built
  and validated as of 2026-09-03 except the three shell menus and the portfolio page**. See the
  newest handoff, directly under "Start here".
- **Last updated:** 2026-09-04 (evening)

## Start here on a fresh session

Run `pnpm build && pnpm test` first, plus `pnpm typecheck` clean across all four packages, before
trusting anything below. **In that order**: the direction contract guard compares
`apps/web/index.html` against the build output, so a `pnpm test` run against a `dist` older than your
last edit to that file fails on a difference you created and already fixed.

**The expected total as of 2026-09-06 (later) is 1778 tests / 92 files** (+66 on the night figure: the `style` hoist and `findIconRenderRisks` in core with their CLI and MCP surfaces, then eight validator rounds on the built binary each adding failing-test-first regressions to `packages/core/src/icons.test.ts` and, for the `set` commit-ordering finding, `set.test.ts`; see the 2026-09-06 (later) handoff). Before that, **the expected total as of 2026-09-06 (night) was 1712 tests / 92 files** (+17 on the late figure: three tests per writer for the CRLF-preserving `commitManifestEdit`, CRLF kept, LF kept, one stray CRLF ignored, across five writers, plus two for `dominantLineEnding`). Before that, **the expected total as of 2026-09-06 (late) was 1695 tests / 92 files** (1751 / 91 with
`apply_manifest_edit` and the four command tools, then −58 when the skill went from 594 to 250
lines: `skill-commands-drift.test.ts` makes three tests per fenced `catalogus` line and one per
`set` line, 40 lines → 21; +5 for `skill-tools-drift.test.ts`; +2 regression tests for the
validation fixes). Before that, **the expected total as of 2026-09-06 (midday) was 1724 tests / 89 files** (1680 / 84 after the graph view
went on 2026-09-05 late; +44 tests and +5 files for `catalogus mcp`: `server.test.ts`,
`read-manifest.test.ts`, `detect-stack.test.ts`, `propose-edit.test.ts`, `commands/mcp.test.ts`,
plus two spawned-binary cases in `cli-binary.test.ts` and one in `detect-stack.test.ts` from the
validation fixes). Before that: **the expected total as of 2026-09-05 (end of day) was 1701 tests / 86 files** (1637 / 81 after the icon-following `rename` and `remove`; 1623 / 80 after `RankModule` went; 1701 / 86 with the three menus, the binary test and the preferences module. The 1637 was +16 for `rename` and `remove` following the vendored icon; see the newest handoff. Before that, 1621 on 2026-09-04 evening: 1617 after the brand-tile slice and its two validation passes, +4 for the evening's three owner requests; +214 across the owner-supplied-icons slice and the brand-tile slice — 1606 before the four D1–D4 fixes and their eleven tests; it was 1403 / 77 on the evening of 2026-09-03, 1375 / 77 that morning before the thesvg icons slice, and 1402 before Codex and xAI joined it). The paragraph that follows is the 2026-08-26 history of why this line once named none.

**The expected total moved on 2026-08-26 and this line no longer names one.** It said **1218 tests /
72 files**, which was correct at the start of that session and is the number to compare against if
you are bisecting into it. The design world was then replaced wholesale, and
`direction-contract.test.ts` derives its cases from the contract's own sections, hexes and declared
departures — so replacing the contract moved that file's contribution by design. The newest handoff
says to take your first green run as the new baseline and record it. Do that rather than hunting for
a number this file no longer knows.

**49 of those are `direction-contract.test.ts`, and its count is data-driven** — it derives cases
from the contract's own sections, hexes and declared departures, so a legitimate edit to the
embedded contract moves the total. Treat a number one or two off as a reason to read that file's
diff, not as a failure; the file count and a green run are the gate. (1169/71 before that file
existed. 2026-08-26 took it there from 1125/70:
the graph and migrations views moving into the design world, `ServicePage`'s first test file, one
new cross-cutting guard file, and the tests the validation pass demanded. The 1125/70 it replaces
was 2026-08-25's, which added 7 for `AppShell` and `BrandMark` and removed 13 with the dead
`ServiceDetailPanel`; the 1131/69 before that was the viewer redesign.)

**One number here is legitimately not fixed, and it is worth knowing before you distrust the
rest.** `packages/cli/src/workspace-scan.test.ts` guards six junction/symlink tests behind
`describe.skipIf(!canCreateDirLinks)`, probed at module load by trying to create a directory
junction. Where Windows refuses the process that privilege, those six skip and the summary says so
— a run reporting 1163 passed and 6 skipped is the same tree as one reporting 1169. Five
consecutive runs on 2026-08-26 all reported 1169; an agent working the same tree concurrently saw
both figures and read it as a flake, which is how this got noticed.
The pre-redesign figure this paragraph carried was **1001 tests / 58 files**, and the rest of the
parenthesis below is the history of how it got there. (Phases 0–3.6 and the 3.6.1
correction pass predate this at 549/38, the viewer-foundations session ended at 679/50, and the
drift-and-corpus session that followed ended at 879/52 — 200 of those tests are two committed
corpora plus two components' first test files, not 200 new behaviours. The 30 added on 2026-08-25
are the five smaller viewer defects and `App.tsx`'s first test file, and the 42 after that are the
DAG slice: `graph-layout.test.ts`, `GraphCanvas.test.tsx`, `ViewToggle.test.tsx`, the kind cues on
the node, and one more example manifest for the schema drift test to validate. Then 6 for the
Layer 3 empty state, which adds no file — it is a section of `ServiceDetailPanel`. The last 32 are
the migration dashboard: 22 from the slice itself in two new files, and 10 more added by its
validation pass, which is the more interesting number of the two.)

**Run it more than once before believing it.** That session's own corpus made the suite fail on
three of six consecutive runs while every single run *of that file alone* passed, because vitest
parallelises across files and two of them were mutating the same real directory. A single green
`pnpm test` is weaker evidence than this document has historically treated it as.

