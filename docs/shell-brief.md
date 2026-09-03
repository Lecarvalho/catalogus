# Brief: the app shell, part A — top bar, left rail, view rail, footer (no menus)

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first:
"ask, never guess" and "no secrets" are hard rules; the comment register of neighbouring files is
the register you write in.

## What this is
The viewer `apps/web` is candidate E (mockup: `apps/web/docs/candidates/candidate-e-homescreen.html`,
read its header comment and lines ~100–260 for the shell CSS and ~437–530 and ~1467–1484 for the
shell markup). The owner approved the shell on sight and froze it: *"Your new app shell is perfect,
don't touch it."* Reproduce it; do not reinterpret it. The contract is FIRST VIEWPORT and OWN-WORLD
in `apps/web/docs/DIRECTION.md`. The board, tile, popover, service page, graph and migrations are
already built in this world; the shell is the last piece.

This brief is the shell's STRUCTURE. The three menus (help / settings / profile) are a separate
brief and are NOT in scope: render the three trigger buttons exactly as the mockup does (`Help`,
`Settings`, the `LC`-style avatar is NOT knowable — see "facts the repo lacks"), but with no menu
surface behind them yet. Leave a one-line comment at the cluster naming the follow-up.

## Build, matching the mockup's values exactly
1. **Top bar** (`AppShell.tsx` / `.module.css`): 60px tall, `padding: 0 28px`, `--color-header-fill`
   ground, hairline bottom, `position: relative` (NOT sticky — the current `.bar` is sticky, and the
   mockup's sticky element is the board-head, not the topbar). Left: `BrandMark` wordmark (keep the
   component; match `.wordmark` 16.5px/700/-0.01em), `/` separator (15px), project name (14.5px,
   muted, ellipsis). Right: the cluster, `gap: 4px`, `.tb-btn` 7px 12px padding, 13.5px, muted,
   hover → text. The manifest path leaves the top bar (the mockup never shows it there; it lives in
   the rail and the footer).
2. **Left rail** (new `Rail.tsx`? — decide, but keep it inside `AppShell`'s file allocation):
   240px, `flex: 0 0 240px`, `padding: 26px 20px 20px`, hidden below 900px. Content top to bottom:
   project name 17px/700; visibility chip (10.5px/600 uppercase 0.04em, bordered) — ONLY when
   `project.vcs.visibility` is present in the payload, omitted otherwise (an absent field is "not
   answered yet"); architecture sentence 12.5px / line-height 1.6 — only when present; manifest path
   11px mono; divider; "Bands" heading 11px/700 uppercase; then one anchor per band that has
   services, `<a href="#band-<id>">` with the label and a count — reuse `groupIntoBands` from
   `apps/web/src/bands.ts` / the same grouping `ProjectBoard.tsx` uses, and the ids `BandModule.tsx`
   already emits (`band-production`, `band-holds`, … — the app's ids, not the mockup's literal hrefs).
   Plain anchor-jump; the mockup has NO scroll-spy and no current-band highlight, so build none.
   On the graph and migrations views the band anchors have no target: decide what the rail shows
   there by reading the mockup and FIRST VIEWPORT, and if neither says, keep the rail's identity
   block and hide the band index rather than inventing a graph index.
3. **View rail**: move `ViewToggle` into a sticky `board-head` (`position: sticky; top: 0;
   background: var(--color-bg); z-index: 5`, padding tokens `--board-head-padding-top/bottom`
   already exist), `gap: 26px`, tabs 14px/600 with a 2px ink underline on the active one (already
   ink after today's fix). Keep `ViewToggle`'s radiogroup semantics and its tests; only its
   placement and its visuals change to the mockup's. Rewrite its header comment (it still says
   "rebuilt 2026-08-25 for the dense-module world").
4. **Footer**: `padding: 16px 28px`, header-fill ground, hairline top. Left group: manifest path,
   dot, "read <relative time>" from payload `readAt` (write a small pure helper with tests; "just
   now" under a minute, then minutes/hours/days — no library). Right group: `<n> services`,
   `<n> dependencies` (edges), `<n> rollups` (distinct `rollup` values across services), dot,
   `catalogus <version>`, dot, Documentation link, dot, schema URL.
   - **Version**: not in `ViewPayload`. Add `cliVersion: string` to `ViewPayload` in
     `packages/cli/src/view-payload.ts`, filled from the CLI's own `package.json` at the one place
     the payload is built (find it; there is a test file beside it — extend it). Cross-package: run
     `pnpm typecheck`. If the payload is also built by a test helper in `apps/web/src/test-support/`,
     extend that too.
   - **Documentation link** and **schema URL**: the schema URL is the `$schema` modeline value the
     CLI writes (grep `packages/schema` / `packages/cli` for `catalogus.dev/schema`); use that
     constant, do not retype it. The Documentation href: the repo has no docs URL. Do NOT invent
     one. Render the word as the mockup does only if you can point it somewhere real; otherwise
     omit the link and report that it needs the owner.
5. **Breakpoints**: 900px (rail hidden, board padding tightens) and 480px (topbar/board/footer
   padding shrink) exactly as the mockup's two media queries.
6. **`ProjectHeader`**: the mockup has no masthead on the board — identity lives in the rail. Remove
   `ProjectHeader` from `App.tsx`'s board render. Below 900px the rail is hidden and the project
   name survives in the top bar; the architecture sentence is then not shown anywhere — that is
   what the mockup does, so do that, and record it in a comment. Delete `ProjectHeader.*` only if
   nothing else imports it (grep); otherwise leave it and say so.
7. **Tokens**: `tokens.css`'s 2026-08-26 comment says the shell's geometry was deliberately left out
   "unchanged from before" — that is no longer true once you build it. Add the shell's values as
   tokens beside their kin (a `shell` block: topbar height/padding, rail width/padding, footer
   padding, cluster button padding/type, the three widths are for the menus brief — leave those
   out), with the register of the surrounding comments, and fix that comment. Never round onto the
   old `--space-*` ramp; the last commit's message explains why.
8. **Disclosure**: `apps/web/index.html` ~lines 174–195 says the shell is unbuilt, and
   `apps/web/src/direction-contract.test.ts` ~line 258 pins strings from it. When the structure is
   built, rewrite that bullet to what is still open (the menus) and move the pin to a string naming
   that. Read the test's comment first; it explains why the pin exists.

## Facts the repo lacks — do not guess
- The avatar initials, account name, email, plan: there is no account system (Phase 5 is unbuilt).
  Render the profile trigger without initials — e.g. an empty avatar disc — and NO menu; record
  in a comment that the account is a Phase 5 fact. Do not put any name or email in the code.
- Documentation URL: see above.

## Files you own
`apps/web/src/components/AppShell.tsx|.module.css|.test.tsx`, new rail/footer component files under
`apps/web/src/components/` (name them; add tests), `ViewToggle.tsx|.module.css|.test.tsx`,
`ProjectHeader.*` (removal), `App.tsx`, `App.test.tsx`, `apps/web/src/tokens.css`,
`apps/web/index.html`, `apps/web/src/direction-contract.test.ts`, `apps/web/src/test-support/*`,
`packages/cli/src/view-payload.ts` and its test, and whatever builds the payload in
`packages/cli/src/commands/view*.ts`. Nothing else. No edits to `docs/PLAN.md`, `DIRECTION.md`,
the mockups, or any tile/popover/graph/migrations file. `apps/web/src/signal-red.test.ts` scans
every stylesheet for signal red outside the badge and status word: your shell must spend none.

## Tests
Match `AppShell.test.tsx` / `ViewToggle.test.tsx` register (testing-library, role queries). Cover:
rail hidden state is CSS so test content not layout; band anchors and counts from a synthetic
payload; visibility chip present/absent; footer counts including rollups; relative time helper
edge cases; version appears; `App.test.tsx` updated for the moved toggle and removed masthead.

## Verify
`pnpm build && pnpm test` in that order, then `pnpm typecheck` (four packages). Baseline: 1317 tests / 75 files at `cfefea7`.
Run the suite twice. Report exact numbers, files changed with reasons, every open question, and
anything left undone. A separate validator will drive the built app against the mockup at
1600/1440/1280/1024/900/768/480/390 and measure; do not claim a measurement you did not make.
