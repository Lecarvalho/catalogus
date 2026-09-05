# Brief: the app shell, part B — the three menus (help / settings / profile)

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first:
"ask, never guess" and "no secrets" are hard rules; the comment register of neighbouring files is
the register you write in. Then read `docs/shell-brief.md` (part A, run 2026-09-03) so this reads
as its continuation, and the top of `docs/PLAN.md` for the 2026-09-05 handoff.

## What this is

The shell's structure is built and frozen (`AppShell.tsx`, `Rail`, `Footer`, the sticky board-head).
The three triggers in the top bar's cluster — Help, Settings, the avatar disc — render with no
surface behind them; `AppShell.tsx`'s cluster comment names this brief as the follow-up. The mockup
is `apps/web/docs/candidates/candidate-e-homescreen.html`: markup lines ~447–507, CSS lines
~153–201 (`.surface`, `.menu*`, `.panel*`, `.segmented`, `.help-*`), and the under-480px rule at
~405–425 (menus pin under the topbar as sheets). Reproduce the mockup's values; do not reinterpret
them. The contract is FIRST VIEWPORT and OWN-WORLD in `apps/web/docs/DIRECTION.md`.

## The owner's answers, 2026-09-05 — these settle what the repo could not

Every one of these was an open question in `docs/PLAN.md`'s 2026-09-02 handoff. They are answered
now; build exactly this and nothing the answers do not cover.

1. **Profile: show the trigger, and the menu says there is no account.** The avatar disc stays
   empty (no initials — there is no person to name; nothing in the code may carry a name or an
   email). The menu's account block (name / email / plan in the mockup) is replaced by one short
   note in the same slot: there is no account yet; sign-in arrives with `catalogus login`
   (Phase 5). Items: **Preferences** (opens the settings panel, closing this menu), **Keyboard
   shortcuts** (see Help), **Documentation** (link below). No "Account", no "Sign out" — both
   would announce things that do not exist.
2. **Settings: preferences live in `localStorage`.** The owner: Catalogus will run from a server
   and keep these under user preferences in the app's database; for now, `localStorage`. One key,
   one JSON object, versioned (`catalogus.preferences.v1` or similar — name it once in a small
   pure module, `apps/web/src/preferences.ts`, with a parser that tolerates garbage, a missing
   key, and a browser that throws on access — every read and write in try/catch, and the app
   renders correctly with no stored value). Panel title and rows per the mockup, **minus two rows**:
   - **Appearance** — omitted. The dark theme was removed by the owner on 2026-09-03; a row whose
     only remaining choice is "Light" is not a setting.
   - **Density** — omitted for now, by the owner on 2026-09-05: the mockup names Comfortable /
     Compact but gives Compact no values, and the owner could not see it to decide. Leave a
     comment at the panel naming the row as deferred, so it is not re-proposed as new.
   Rows that ship, each a segmented control as the mockup draws it (a `radiogroup` of `radio`
   buttons, the selected segment ink-filled):
   - **Brand icons: Colour / Monochrome.** Default **Monochrome** — that is the board today and a
     measured decision (PLAN.md, "monochrome on the board, colour in the popover and page").
     "Colour" renders the board tiles' marks in colour, the way the popover and the brand page
     already do. Find how the tile is made monochrome today (`ServiceTile.tsx` / its stylesheet)
     and switch that one mechanism; do not add a second one. Sub-label per the mockup ("Full
     colour, or ink to match the UI").
   - **Default view: List / Graph / Migrations.** Default **List**. Applies on load: `App.tsx`'s
     `mode` state starts from the preference instead of the literal `"list"`. It does not change
     the view the user is on when toggled; it says what the next load opens.
   - The manifest path line at the bottom of the panel (`.panel-manifest`), from the payload.
3. **Help.** Items per the mockup:
   - **Documentation** → `https://github.com/Lecarvalho/catalogus#readme` (the owner's choice
     until a docs site exists).
   - **Manifest format reference** →
     `https://github.com/Lecarvalho/catalogus/blob/main/docs/user/manifest-format.md`. That page
     is being written by a parallel agent under `docs/user/`; the URL is fixed by this brief, so
     link it now.
   - **Keyboard shortcuts**, with the `?` key shown as the mockup does — and `?` must then actually
     open this Help panel (a shortcut the panel advertises but the app ignores is a lie). Its
     content: the shortcuts the app really handles today and no others — read `App.tsx`'s peek
     keydown effect (ArrowDown / ArrowUp into a group tile's popover rows, Escape back to the tile
     and to close) and whatever else `grep -rn "event.key"` finds. Render it as a small list inside
     the help panel (an expanding section or a second state of the panel — decide; keep it in the
     mockup's vocabulary). Do not invent shortcuts.
   - The **catalogus CLI** block: the command names, from the payload, not typed here. Add
     `cliCommands: string[]` to `ViewPayload` (`packages/cli/src/view-payload.ts`), filled from the
     one list `packages/cli/src/cli.ts` uses to register its commands — export that list (or
     derive it from the commander program) so the viewer and `--help` cannot disagree; extend the
     payload test and the `apps/web/src/test-support/` fixture. Cross-package: `pnpm typecheck`.
     Render the names in the mockup's mono block, dot-separated, in the CLI's own order.
   - **Version**: `catalogus <cliVersion>` from the payload (already there).
4. **The footer's Documentation link** now has a target (the README URL above): render it where
   the mockup draws it, and rewrite `Footer.tsx`'s header, which says at length why it was omitted.
   Put every external URL in one small module (`apps/web/src/links.ts`) with a test that each is
   `https://` and names the repo; the help panel, the profile menu and the footer read from it.

## Behaviour (the mockup only draws hover/focus states; the app needs real menus)

- Click toggles a surface; one open at a time; **Escape** closes and returns focus to the trigger;
  a click outside closes; the triggers gain real `aria-haspopup` / `aria-expanded` (the cluster
  comment explains why they carry none today — rewrite it). Menus are `role="menu"` with
  `menuitem`s (links are `menuitem` links); the settings panel is a `dialog`-free popover region
  with a heading, its rows are radiogroups. Focus moves into an opened surface (first item, or the
  first selected radio) and Tab stays inside it while open (`AppShell`'s popover already has a
  focus-bridge pattern in `App.tsx` — read it, do not copy it blindly).
- Surfaces are transient: shadow and 6px radius as the mockup (OWN-WORLD allows radius and shadow
  on transients only). Widths 272 / 340 / 300px — `tokens.css`'s shell block (~line 557) says these
  three widths are deliberately absent until the menus exist; add them there now and fix that
  paragraph.
- Below 480px each surface pins under the topbar as the mockup's rule says (position fixed,
  full width, under the 60px bar). Above, anchored under its own trigger, right-aligned.
- Nothing here writes to the manifest or fetches anything. `localStorage` only, per answer 2.

## Disclosure and guards

- `apps/web/index.html` ~lines 174–195 says the three menus have no surface, and
  `apps/web/src/direction-contract.test.ts` ~line 285 pins that string. When the menus exist,
  rewrite the bullet to what is still open (Density, deferred; dark theme, removed; the account,
  Phase 5) and move the pin to a string naming that. Read the test's comment first.
- `apps/web/src/signal-red.test.ts` scans every stylesheet: the menus spend no red.
- `apps/web/src/token-references.test.ts` scans raw stylesheet text: see `GraphCanvas.module.css`'s
  header for the trap of naming a token inside a comment.

## Files you own

`apps/web/src/components/AppShell.tsx|.module.css|.test.tsx`; new `HelpMenu`, `SettingsPanel`,
`ProfileMenu` component files (+ css modules + tests) under `apps/web/src/components/`; new
`apps/web/src/preferences.ts|.test.ts` and `apps/web/src/links.ts|.test.ts`;
`Footer.tsx|.module.css|.test.tsx`; `App.tsx`, `App.test.tsx`; `ServiceTile.tsx|.module.css|.test.tsx`
only for the colour/monochrome switch; `apps/web/src/tokens.css`; `apps/web/index.html`;
`apps/web/src/direction-contract.test.ts`; `apps/web/src/test-support/*`;
`packages/cli/src/view-payload.ts|.test.ts`, `packages/cli/src/cli.ts` (export the command list only —
no behaviour change; `packages/cli/src/skill-commands-drift.test.ts` reads the program, keep it green).
Nothing else. **Another agent is writing `docs/user/**` and may touch `README.md` — do not open
either.** No edits to `docs/PLAN.md`, `DIRECTION.md`, the mockups, or any tile/popover/graph/
migrations file beyond the one named above.

## Tests

Match `AppShell.test.tsx` register (testing-library, role queries). Cover: each surface opens on
click and closes on Escape (focus back on the trigger) and on outside click; one at a time; `?`
opens Help; profile menu has no name/email and says there is no account; settings radios reflect
and write the preference; a stored preference survives a re-render and a garbage value falls back;
default view applied at load; brand-icon colour switches the tile's mechanism; help lists exactly
the payload's `cliCommands` and the version; footer renders the Documentation link with the README
URL; every link in `links.ts` is https and points at the repo. Mutation-check at least three of
these (disable the guard, see red, restore).

## Verify

`pnpm build && pnpm test` in that order, then `pnpm typecheck` (four packages). Baseline: **1623 tests /
80 files** at the commit that deleted `RankModule` (2026-09-05); confirm it on your first run
before editing. Run the suite twice. Report
exact numbers, files changed with reasons, every open question, and anything left undone. A
separate validator will drive the built app in Chrome at 1600/1280/900/480/390 and read
`document.visibilityState` beside every measurement; do not claim a measurement you did not make.
