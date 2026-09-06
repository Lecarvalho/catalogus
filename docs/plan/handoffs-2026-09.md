# Handoffs — 2026-09-02 to 2026-09-06 (menus, icons, brand tile, shell, rename/remove, MCP)

> Split out of `docs/PLAN.md` on 2026-09-05, content verbatim. `docs/PLAN.md` is the index and the
> only place status is summarised; this file is the record. Section headings are unchanged so a
> code comment that names one still finds it by grep.

### Handoff — 2026-09-06 (late), decision 14: the MCP is the agent's surface

**Read this first.** After the morning's three tools, the owner ran the skill from a client
session and the agent used Bash for everything with the tools connected and unloaded. The owner
ruled (decision 14, in their words in `decisions.md`): the MCP is first class for agents, the CLI
is for people and CI, and the end state is the same tools served by the web platform against an
account so a client installs only the skill. Same day, same session: `apply_manifest_edit`,
`init_manifest`, `validate_manifest`, `render_graph`, `list_icons` (one implementer,
`docs/mcp-apply-brief.md`), the skill rewritten MCP-first and cut to 250 lines on the owner's
"needs to be concise" rule (a second implementer, `docs/skill-mcp-first-brief.md`), one validator
on the strongest model (`docs/mcp-apply-validation-brief.md`), six findings fixed by the main
session with two regression tests. **1695 tests / 92 files**, twice, build and typecheck exit 0.
The record is in `phase-6-mcp.md` under "Decision 14, the same day". Not committed by this
session: the tree holds everything for the owner to commit.

Traps for a fresh session:
- **The skill instructs; it never narrates.** The owner's rule, 2026-09-06: no session history,
  no dated asides, nothing specific to this repo's story in `SKILL.md`. Background goes to
  `skills/README.md`.
- **Wrapping a command function in a tool inherits its path rule.** `runValidate` walks up; the
  tool must not. Check the named directory first (`command-tools.ts`).
- **The SDK runs tool calls concurrently.** Anything that writes needs the per-server queue in
  `server.ts`, or two pipelined calls both succeed and one write is lost.
- **A field the skill names must exist on the wire.** `staleBase` lived only inside
  `apply-edit.ts`; the server dropped it. Read the JSON the client gets, not the TypeScript type.
- The test count went *down* with more coverage; the accounting is in `status-history.md`.

**Next:** the live wiring (ready-now item), the npm publish (parallel track), and D4.

### Handoff — 2026-09-06, `catalogus mcp` and its three read-only tools (Phase 6, boxes 1–3)

**Read this first.** The board had no ready-now item and nothing waiting on the owner, so the
session took the one phase with no blocker: Phase 6's three tools that need no backend. Two
implementers on a smaller model ran in parallel on disjoint files (`docs/mcp-server-brief.md`:
server, `read_manifest`, `detect_stack`, the `mcp` command, the `computeDiff` extraction;
`docs/propose-edit-brief.md`: `propose_manifest_edit` as a standalone function). The main session
wired the third tool into the server, made `detect_stack` refuse to walk up past an explicit path
(the implementer had left the two read tools disagreeing on that), and added `mcp` to the skill's
prose-only rule. One validator on the strongest model drove the built binary
(`docs/mcp-validation-brief.md`), found three defects, and re-validated the fixes clean.
**1724 tests / 89 files**, twice, build and typecheck exit 0. Not committed by this session: the
tree holds the change and this board for the owner to commit.

The record of what was built, the three defects and what was recorded but not changed is in
`phase-6-mcp.md` under "What was built on 2026-09-06". Traps for a fresh session:

- **The in-memory MCP tests cannot see stdio lifecycle bugs.** D1 (tool calls dropped at stdin
  EOF) was invisible to every `InMemoryTransport` and `PassThrough` test and to the SDK client,
  which waits for each reply before hanging up. Only a spawned `dist/cli.js` fed newline-delimited
  JSON-RPC with stdin closed immediately reproduces it, and only that test catches the mutation.
  Anything touching `commands/mcp.ts` earns a raw-pipe check.
- **Quoting is not enough for a positional that starts with `-`.** The shell strips the quotes
  before commander sees the token. `--` is the fix, and it has to sit after the options.
- **The SDK's `StdioServerTransport` (1.30.0) never listens for stdin `end`.** `runMcp` does it
  itself; the reason is in the file's header.
- **A brief that says "same as the commands" hides a fork.** `diff` walks up from an explicit
  path, `add` does not; the two implementers each copied a different one. Say which.
- The mutation checks had to restore untracked files from backups rather than `git checkout`.
  Validators of untracked work should be told that up front.

**Not done, and where it goes:** the live wiring into Claude Code (box 5) is the board's one
ready-now item; `push_private` waits on Phase 5.

### Handoff — 2026-09-05 (late), the owner's batch answered and the graph view decommissioned

**Read this first.** The owner answered every item on the "Waiting on the owner" list in one
batch, and one answer was a removal: the viewer's graph view is gone. Two implementers on a
smaller model ran in parallel on disjoint files (`docs/graph-removal-brief.md` for the code,
`docs/graph-removal-contract-brief.md` for the contract page), one validator on the strongest
model drove the built app. **1680 tests / 84 files**, build and typecheck exit 0. Committed at the
owner's request at the end of the session.

#### The answers (all recorded in `00-open-work.md` and `decisions.md` 12 and 13)

Recency slot and window edge: OK. Density: removed — "users don't need to choose the density."
Graph nodes under Monochrome: moot. `?` inside Settings: OK. The red: `#d40010`, in the owner's
words. Board contrast: Monochrome default stands, the reader can switch. thesvg marks: keep.
Fallback glyph inset: OK. The logo: still deferred; keep going without one.

#### The graph view, removed

Deleted: `GraphCanvas.tsx` / `.module.css` / `.test.tsx`, `graph-layout.ts` / `.test.ts`,
`elk-layout.ts`; `@xyflow/react` and `elkjs` out of `apps/web/package.json` and the lockfile.
`ViewMode` and `DefaultViewPreference` are `"list" | "migrations"`; a stored `"graph"` preference
falls back to the default without a throw (a test names the case). `App.tsx` lost its lazy graph
import, the elk layout thunk and the graph branch. `tokens.css` lost the two `--graph-*` tokens
and kept every `--*node*` token `ServiceNode` still reads — `ServiceNode` stays: it is the list's
node and `serviceNodeDomId` keys the migration board and the close-focus return. The Settings
panel's Density comment now records the ruling. Comments that stated the graph as a present
surface were corrected; historical ones got a one-sentence dated append.

The contract moved with it: `apps/web/docs/DIRECTION.md` and the embedded copy in `index.html`
name "List, Migrations", drop "density" and — the main session's own edit, on the 2026-09-03
dark-theme removal — "appearance" from the settings sentence; the Density and Appearance
disclosure bullets go because the build and the contract agree again. `DIRECTION.md` carries a
dated revision in the owner's words. No `DECLARED_DEPARTURES` entry: both copies moved together.
The guard stays at 43.

**Test accounting:** −14 (`GraphCanvas.test.tsx`), −20 (`graph-layout.test.ts`), −2
(`App.test.tsx`, the two graph-mode cases), +1 (`preferences.test.ts`), −1
(`token-references.test.ts`: its per-stylesheet `it.each` row for `GraphCanvas.module.css` went
with the file). The implementer's sum missed the last one; the validator found it by running the
HEAD tree in a worktree and diffing test names per file.

**Validation** (Chrome, the built app on a CLI-written scratch project): rail shows List and
Migrations only, arrow keys wrap both ways, Settings offers the two views and no Density or
Appearance row, a stored `defaultView: "graph"` falls back to List with the sibling `iconColour`
honoured and no console message, the Help shortcut text names two tabs, the served bundle has no
`xyflow` / `elkjs` / `reactflow` / `Graph`, the guard is 43 / 43, one mutation (re-adding
`"graph"` to the preference values) turns one named test red. Two prose defects it found were
fixed by the main session before the commit: `DIRECTION.md`'s Density entry contradicted the
sentence it described, and `HelpMenu.tsx`'s header still counted three tabs.

**Not the graph and untouched:** `catalogus graph`, the CLI command; the payload's `edges`; the
popover's and the page's depends-on lists.

#### What the next session does first

1. **The portfolio page** is the only Phase 3.7 box left, still on the owner's data condition.
   Otherwise Phase 4's backend decision is the next thing that unblocks anything.
2. `00-open-work.md` has no "ready now" and no "waiting on the owner" items. That is new.

### Handoff — 2026-09-05 (evening), the three ready-now items close

**Read this first.** Three bounded items, all from `00-open-work.md`'s "Ready now" list. Two were
main-session edits; the third (the board's recency mark, HANDOFF §4.2 query 5) went to an
implementer on a smaller model from `docs/recency-brief.md` and to a separate validator on the
strongest model, who drove the built app in Chrome. **1716 tests / 86 files**, twice, build and
typecheck exit 0. Nothing committed by the session that did this work; the tree holds the change
and this board for the owner to commit.

1. **`add --help`'s id sentence** in `packages/cli/src/program.ts` now reads "defaults to the
   service slug, then service-role, then a numbered suffix", which is what `deriveLocalId` does.
2. **The stale Phase 3.6 box** for the real second cold run is ticked with a pointer to the
   phase list's own entry (25 services / 31 edges).
3. **Recency on the board.** The tile's third label line — the slot the status word uses —
   renders `New` for a single recent entry and `<n> new` for a group with recent entries, in ink,
   with the status word taking the slot when there is one. No badge, no desaturation: those are
   status signals. `countRecentlyAdded` joins `service-tags.ts`. The validator measured five tile
   shapes on the built page, ran the adversarial dates (29 / 30 / 31 days, future, every-entry
   recent, recent beside `removed`), mutated the count and saw four tests go red, and confirmed
   `.recency` is off the signal-red allow-list with the guard green.

**Recorded for the owner, not changed:**
- **The slot is a choice the mockup does not make.** Candidate E carries no recency mark. The
  third label line was picked because it exists, and because the board is the only surface that
  shows every service; reversible in `ServiceTile.tsx` alone.
- **The window edge.** `added` is a date and `readAt` a timestamp, so `isRecentlyAdded`'s
  inclusive `<= 30` excludes day 30 for all but its first instant. Pre-existing, shared by the
  popover and the page. Fix would be a calendar-day comparison; the owner decides whether "30
  days" means that.
- `validate` accepts a future `added` without comment. Noted, not in scope.

#### What the next session does first

1. The owner's list in `00-open-work.md` ("Waiting on the owner") — ask once, in one batch.
2. The portfolio page, if the owner lifts the data condition.

### Handoff — 2026-09-05, rename and remove follow the vendored icon, and the graph "defect" was a hidden tab

**Read this first.** One bounded change, done by the main session and validated by a separate
agent against the built binary, and one open item closed without code because it did not
reproduce. The three shell menus stay blocked on the owner's 2026-09-02 questions; the portfolio
page is untouched.

**State of the tree at this handoff: 1701 tests / 86 files** at the end of the day (1637 / 81 when the morning's icon change landed), green, `pnpm typecheck` clean across
four packages. Commits: the CLI and skill change together (they change in the same commit by
CLAUDE.md's rule), then this board.

#### The owner answered the 2026-09-02 questions, later the same day

Asked once, in one batch, when the owner said "help, settings, profile, how can I help?":

1. **`RankModule`: delete it.** The owner did not remember the component; told what it was (the
   "most depended on" ranking they took off the board on 2026-08-25), they chose deletion over
   naming its ink. Done the same hour (`1cca6ec`): component, stylesheet, test, `mostDependedOn`
   and its tests, and the quarantine list in `signal-red.test.ts`; `dependentCounts` stays.
   1623 tests / 80 files after it.
2. **Profile: show the trigger; the menu says there is no account.** No name, no email, no
   initials anywhere in the code; sign-in arrives with `catalogus login` (Phase 5).
3. **Settings: `localStorage` for now.** The owner's framing: Catalogus will run from a server
   and keep these under user preferences in the app's database; `localStorage` stands in.
   **Density is omitted** — the owner did not remember the row, the mockup gives Compact no
   values, and the owner was away from the PC: *"add a note for later when I'll be available to
   check and decide."* So: a comment at the panel, this line here, and a screenshot of the built
   panel sent to the owner once it exists. **Appearance is omitted** too: with the dark theme
   removed on 2026-09-03, "Light" alone is not a setting.
4. **Documentation → the GitHub README** (`https://github.com/Lecarvalho/catalogus#readme`)
   until a docs site exists. The footer's Documentation link comes back with it.
5. **"Manifest format reference" → a new user-docs folder.** *"Create a user docs folder and
   let's start creating docs there."* `docs/user/` starts with `manifest-format.md`, written from
   the schema, the examples and the skill; the help menu links its GitHub URL.

Two briefs, run in parallel on disjoint files: `docs/menus-brief.md` (the three menus, the
`cliCommands` payload field, the footer link, the preferences module) and
`docs/user-docs-brief.md` (the first page). Both kept as the record; not to be run again.

#### The three menus — built, validated, landed the same day

`docs/menus-brief.md`, one implementer on a smaller model, one validator on the strongest driving
the built app in Chrome. **State: 1701 tests / 86 files**, typecheck clean, `Phase 3.7` now closed
less the portfolio page.

**What is built.** Real menus behind the three triggers: click toggles, one open at a time, Escape
closes and returns focus to the trigger, outside click closes, Tab cycles inside the surface, `?`
opens Help (not from inside a text field). `HelpMenu`: Documentation and Manifest format reference
(both from `links.ts`), an expanding Keyboard shortcuts list of the shortcuts the app really has
(`?`, Escape, ArrowDown/Up, ArrowLeft/Right on the view rail), the CLI block from a new
`cliCommands` payload field, the version. `SettingsPanel`: Brand icons (Colour / Monochrome,
default Monochrome, switching the `Icon` component's one existing `colour` mechanism on the board's
tiles) and Default view (List / Graph / Migrations, applied at load); the manifest path line;
Appearance and Density omitted with a comment. `ProfileMenu`: empty disc, a note that there is no
account yet, Preferences (opens Settings), Keyboard shortcuts (opens Help on the list),
Documentation. Preferences in `localStorage` under `catalogus.preferences.v1` through
`preferences.ts` (tolerant parser, every access in try/catch, a context so the tile and the panel
share one value). The footer's Documentation link is back. `tokens.css` carries the three widths
and the menu shadow; the `index.html` disclosure names what is still open.

**The defect the implementer found and fixed, worth more than the menus:** the first cut had
`view-payload.ts` import the command list from `cli.ts`. That compiled, passed every test, and
**silently turned the shipped binary into a no-op** — tsup code-split `cli.ts` into a shared chunk,
the `isMainModule` guard moved into the chunk where it is never true, and `catalogus <anything>`
exited 0 printing nothing. The in-process CLI suite could not see it; the docs validator noticed
because its binary stopped answering. Fix: `packages/cli/src/program.ts` holds the program
builder and the command list, `cli.ts` is the bin entry only, and a new `cli-binary.test.ts`
spawns `dist/cli.js` as a child process — the only kind of test that sees this class of break;
it was proven red against the mutation. **Rule: nothing in `packages/cli/src` imports `cli.ts`.**

**Validation** (Chrome, the built app, `visibilityState` reported hidden throughout and
compensated for): triggers, one-at-a-time, Escape focus return, outside click, `?` on body and
not in an input, both help hrefs exact, every listed shortcut executed and no unlisted one found,
CLI block equal to `--help`'s fourteen commands in order, version equal to `--version`, the two
settings rows and no others, colour switch measured on three marks (`rgb(36,33,28)` to the brand
colour and back), popover and brand page staying colour, default view applied on reload,
localStorage JSON after each change, garbage and blocked storage rendering normally, no name /
email / initials in the DOM or the bundle (grep), footer link placement, widths 300 / 340 / 272,
6px radius, 8px below the trigger, right-aligned at 2311 / 1600 / 1280 / 900, pinned sheets at
390 and 480 and anchored again at 481, no horizontal scrollbar at eight widths, zero red in any
surface, focus inside on open and Tab / Shift+Tab cycling within, console clean, binary answering.
**Two defects, both fixed by the main session:** the profile menu's "Keyboard shortcuts" opened
Help with the list folded (a second click for what the item promised — `HelpMenu` takes
`initialShortcutsExpanded`, set only by that route and reset by the trigger and `?`); and
outside-click closing was tested for Profile only (now each surface). `Icon.tsx`'s header, which
said the monochrome rule had no live caller, corrected.

**Recorded for the owner, not changed:**
- **The graph's nodes stay in colour under Monochrome.** The brief said "the board tiles' marks";
  the row says "Brand icons". Whether the graph joins the switch is the owner's call.
- **`?` pressed inside the open Settings panel closes it and opens Help.** Not obviously wrong;
  noted.
- **Density**: the screenshot of the built panel went to the owner on 2026-09-05; the row waits
  on their look.
- The Help panel's `role="menu"` holds two non-item blocks (the CLI list, the version) — valid
  enough in practice, noted.
- `add --help` says the id is "derived from service+role when omitted"; `deriveLocalId` uses the
  bare slug first. The docs page states the real rule; the `--help` string is one line in
  `program.ts` to fix.

#### What the next session does first

1. **The Density row and the graph-in-colour question** — the owner has the screenshot; ask
   once, then a small edit either way.
2. **The portfolio page** (Phase 3.7's one open item; HANDOFF §4.2).
3. **`add --help`'s id-derivation sentence** in `program.ts` — one line, see above.
4. **Not to do:** re-investigate the graph's fit-to-view; see below, and read
   `document.visibilityState` before believing any viewport number from an automated tab.

#### `rename` and `remove` versus a vendored icon — built, validated

The 2026-09-04 handoff's item 2. `catalogus set services.<id>.icon` vendors the mark under
`.catalogus/icons/<id>.svg`; `rename` left that file under the old id's name and `remove`
orphaned it. Now:

- **`rename <old> <new>`** — when the entry's `icon` is exactly `.catalogus/icons/<old>.svg`, the
  file is moved to `.catalogus/icons/<new>.svg` *before* the manifest is written and moved back if
  the write is refused or throws (the same order `set` keeps with a staged icon); the field
  follows the id; an inline `# fetched from …` comment survives because it sits on the pair. A
  pointer to any other name is left alone, file and field both, and the report says so — guessing
  it "should" be named after the id is the plausible default this repo refuses. A file already at
  the new name refuses at exit 1 with nothing touched. A stale pointer (no file) still follows the
  id, and the report says no file moved. `vendoredIconRelativePath` in `icon-fetch.ts` is now the
  one place the `<id>.svg` convention is spelled as a path.
- **`remove <id>`** — after the manifest write succeeds, the entry's icon file is deleted, and
  `.catalogus/icons/` then `.catalogus/` are removed when that leaves them empty
  (`removeIconsDirIfEmpty`, exported for it). Kept, and the report names who, when another
  surviving entry names the same file (the schema allows any `<name>.svg`, so two entries can
  share one). Never reaches outside `.catalogus/icons/` (`isWithinIconsDir`, exported for it —
  unreachable through the CLI's own writes, but this is the one unlink in the package). A missing
  file is exit 0 with a line saying so; any other unlink error is exit 0 with the entry removed and
  the file named on stderr.
- **Skill and `--help`** say both, and the skill now tells the agent never to move or delete a
  file the manifest points at under `.catalogus/icons/` by hand (a stray file no entry names is
  the one thing `rename`'s refusal does tell the user to move or delete themselves).

**Validation, by an agent that wrote none of it,** against the built binary with its own scratch
projects: the first pass reproduced every claim in the brief clean and found nine items, three of
them real. `rename` consulted only the filesystem: it moved a file another entry still named
(D1), adopted another entry's stale pointer to the new name and so bound that entry to this one's
mark (D2), and its refusal claimed "no entry names that file" while one did, with advice that
would have destroyed the other entry's icon (D3). All three are hand-edited states (`set` always
vendors to `<id>.svg`), but the schema allows them and `remove` already guarded the shared case.
Now the manifest is consulted before the filesystem, both ways: a file another entry names stays,
pointer and all, and the report names the entry; a path another entry names refuses at exit 1
whether or not a file is there yet. The rest: the file move sat outside the try, so a filesystem
refusal escaped as a bare `EPERM` (D4, reproduced with an `icacls` deny on the directory; framed
now); `remove`'s already-missing branch left an emptied `.catalogus/icons/` standing (D6); a
directory at the destination was called a file (D7); the skill's new "never by hand" rule
contradicted the refusal's "delete or move it by hand" (D8 — the skill now says "a file the
manifest points at", the refusal says "not one this CLI vendored"); one stray period (D9).
**D5, recorded and not fixed:** the `isWithinIconsDir` floor in `remove` survives a mutation
dropping it, because no input reaches it through `runRemove` (the schema refuses an escaping path
at open); it stays as a floor under a schema change, and its comment now says so and records the
one boundary the validator measured — it is lexical, so `.catalogus/icons` replaced by a junction
to elsewhere deletes the file the manifest points at through that junction. Fourteen tests at that point
(eight `rename`, six `remove`); mutations dropping the restore-on-refusal, the shared-file guard
and the destination check each go red.

**The second pass, on the fixes,** reproduced all eight byte-for-byte on the message text
(including the `icacls` refusal for D4, the shared-and-claimed-at-once case where the shared rule
wins, three entries sharing one file, round trips, `rename` then `remove`) and found nothing in
scope. Four items under the bar, three taken: the D4 fix had no test (a mutation hoisting the move
back out of the try stayed green — pinned now through a `vi.mock` of `node:fs/promises`'s
`rename`, since a real refusal needs an ACL); `those entries' icon` is `icons` now; a *directory*
at the source was moved and reported as an icon (left where it is now, and said so). The fourth
was this board's own wording of D8, corrected above. What it could not reach: `restoreIcon`'s own
failure (every way to deny the directory also blocks the forward move), and `remove`'s
non-`ENOENT` unlink branch (`attrib +R` and an `icacls` deny on the directory both still let
Node unlink the file on Windows). Sixteen tests in the end (ten `rename`, six `remove`).

**A process note from the first pass, worth more than any of the nine:** the brief told the
validator to restore a mutated file with `git checkout -- <file>`. The change under test was
uncommitted and unstaged, so that command would have reverted the implementation to `HEAD` and
the validator would have validated nothing. The agent noticed, backed up with `cp` and restored
from the copy, md5-verified. **A brief that names a restore command must say what the working
tree holds; `cp` to scratch and back is the only restore that is safe against an uncommitted
change.**

**A pre-existing quirk seen while writing the tests, recorded and not changed:** renaming a node of a pre-existing cycle reports the
refusal under the command's prefix (`Renaming … would make … invalid`) rather than the file's
(`already contained a cyclic dependency`), because `cycleKey` is built from the ids and the rename
changes the key. Harmless — exit 1, nothing written either way — but the message blames the
rename for a cycle it did not create.

#### The graph fits to view; the 2026-09-04 finding was a hidden tab

Item 3 of the previous handoff — "the React Flow viewport stays at `translate(0,0) scale(1)`
while the node extent spans about 2630px at every width" — **does not reproduce in a visible
tab, on the committed build.** What was measured, on `examples/layout-stress` served by the built
CLI: with the Chrome tab in the background (`document.visibilityState === "hidden"`, which is
what the extension's tab group gives every automated tab, and what the 2026-09-04 iframes had),
the viewport reads identity indefinitely, even with `requestAnimationFrame` polyfilled onto
`setTimeout`; the moment the tab is made visible (a screenshot does it) the transform becomes
`translate(62.8px, 105.99px) scale(0.4336)` and all 35 nodes sit inside the 1278×919 pane. A
hidden tab runs no rendering steps — no rAF, and no ResizeObserver delivery, which is what React
Flow's queued initial fit waits on — so any measurement of "did it fit" taken from a hidden tab
reads identity for a reason that has nothing to do with the app. It is the same class as the
"scrollTo plus rAF hangs in that iframe" note above.

**A fix was written, run, and dropped.** Reading the installed store suggested `measured` on each
node let the queued fit resolve before the pan/zoom controller existed; an `onInit` fit was
added, and it did fit ~1s sooner *in the hidden tab*. Then the control — the build without it —
was run the same way and fitted too, once visible. The reading predicted a defect that execution
did not show, which is this repo's signature failure, so the change was discarded rather than
kept as harmless. **Rule for the next validator: report `document.visibilityState` beside any
viewport, scroll or animation measurement, and treat a reading from a hidden tab as a reading of
the tab, not the app.**

Two dev-loop things found on the way, neither a product defect: `catalogus view` reads
`index.html` once at startup, so a rebuild that changes the entry chunk's hash leaves a running
server handing out an index whose script 404s (blank page, no console error) — restart the server
after a build; and a root `pnpm build` running concurrently with a served viewer produces
"Unable to preload CSS" for the graph chunk while `tsup` has wiped `dist/web` and
`scripts/bundle-web.mjs` has not yet recopied it (the landmine `packages/cli/tsup.config.ts`
already documents).

### Handoff — 2026-09-04 (evening), the brand tile is on a real inventory and the owner's three fixes are in

**Read this first.** Two sessions in one day. The first (morning) ran three briefed slices, each
implemented on a smaller model and validated by a separate agent against the built artifact:
`docs/custom-icon-brief.md` (two parts, run), `docs/brand-tile-brief.md` (three parts, run), and
the board cap as a small edit. The second (evening) closed the brand-tile validation (four
defects plus one born of a fix), committed everything, and then took the owner's first look at
it on Clapline: three requests, each a bounded edit by the main session, each validated in the
browser, each committed. Both briefs are kept as the record and are not to be run again.

**Commits, in order, all on `main`:** `719a718` (icons: `packages/*`, `skills/`), `72ef00d`
(viewer: shell cap and brand tile together — both live in `apps/web` and were not separable by
path), `2cacbf5` (docs), `92f4cf6` (the evening's three fixes: entry-page width, four tiles to a
phone line, no popover on a tap, plus two side findings), `6da7294` (the entry-page width revised
after the owner saw it on Clapline: panel docked, board keeps the wall's left edge).

**State of the tree at this handoff: 1621 tests / 81 files**, green on consecutive runs, `pnpm
typecheck` clean across four packages, working tree clean at `6da7294`. The owner's last words on
the build: *"I see that now, it's better."*

#### What the next session does first

1. **The three shell menus** (help / settings / profile) — still blocked on the owner's
   2026-09-02 questions below (`RankModule`, profile with no account, what a settings panel holds
   with nothing persisted, the Documentation URL). Ask once, then one brief.
2. **`rename` and `remove` versus a vendored icon** — `rename` leaves the file under the old
   `<id>.svg` name (the pointer stays valid, so nothing breaks, but the `<id>.svg` convention
   `icons` and the skill teach no longer holds) and `remove` orphans it. A small edit to move or
   delete the file through the same `manifest-edit` transaction, plus a test each.
3. **The graph does not fit to view** (recorded under the decisions below; pre-existing).
4. **The portfolio page** (Phase 3.7's one open item; HANDOFF §4.2).
5. **Not to do:** re-derive the entry page's width geometry, the phone grid's numbers, or the
   popover's tap rule — each was drawn, chosen by the owner, validated and recorded below, and
   the CSS comments carry the declined alternatives so they are not re-proposed.

#### Things a fresh session would otherwise rediscover

- **Chrome's resize tool is a no-op in this environment** (the window stays at whatever width the
  owner left it: 2326 in the morning, 368 in the evening). Every width measurement this day was
  made by loading the built app in a same-origin iframe sized to the exact CSS width; media
  queries and `documentElement.clientWidth` both see the iframe's viewport, `document.activeElement`
  reads through `contentDocument`, and real key and pointer events reach it. The validator's
  brief should say so up front rather than let it be discovered again.
- **`btn.focus()` is not a keyboard focus for validation purposes.** A control that would pass
  without the fix is not a control: the tap-guard's first browser check used it and read "no
  popover" for a wrong reason. Dispatch `focusin` explicitly (React's `onFocus` listens to it)
  and report the popover's *header name* after every dispatched event, not a boolean, so a stale
  popover is distinguishable from a new one.
- **`scrollTo` plus `requestAnimationFrame` hangs in that iframe** — the window reports
  `visibilityState: "hidden"` and rAF is paused, so the popover's scroll-tracking path cannot be
  driven there at all. Nobody has re-validated it since 2026-09-03; it is untested, not broken.
- **The popover mounts after the whole board in the DOM**, so Tab from a tile never reaches its
  rows; ArrowDown/ArrowUp are the keyboard path in, Escape from a row returns focus to the tile,
  and a row that holds focus holds the popover against a pointer brushing a neighbour. All in
  `App.tsx`'s peek keydown effect and `handlePeek` / `handlePeekEnd`.
- **A tap focuses a button on Chrome for Android, not on Safari.** That is why the popover
  appeared on a phone though `onPointerEnter` already skipped touch, and why the guard lives on
  focus (`usePeekHandlers`, `ServiceTile.tsx`), not on the pointer.
- **`layout-stress` hides shrink-to-fit defects** because its bands always exceed a phone's
  width; the validator's own small (eight-service) fixture is what found the board hugging the
  left edge below 720px. Keep using a small fixture alongside it.
- **Entry-page width, final:** panel docked at the window's edge; board cap 1360 − 300 beside a
  panel, own auto margins, so its left edge equals the wall's at every width. Two other
  geometries were built, seen by the owner, and declined (item 1 below and the comment on
  `.withPanel > .board` in `AppShell.module.css`).

#### The owner's evening look, 2026-09-04 — three requests, done the same evening

The owner ran the committed build (`72ef00d`) and asked for three things, in this order. Each
was a bounded edit by the main session, each carries a test that was seen red with the change
reverted, and each was driven in the browser by the same validator that ran the two passes above.

1. **"Make sure the pages are always the same size"** — settled in two steps, the second on the
   owner's own inventory. On a wide window the wall sat in its 1600px column but the entry page's
   board, at the wall's full 1360 cap, nearly filled the room between the rail and the docked
   panel, so its left edge jumped 150px left of the wall's and the page read as full-width. The
   first fix capped board-plus-panel to the wall's span and centred the pair; the owner ran it on
   Clapline and wanted the panel docked at the window's edge again ("I saw that dock a few minutes
   ago"), "but keep the centred content not stretched". Three geometries were drawn side by side
   and the owner chose the docked panel with a centred board. **What is built** (`AppShell.module.
   css`, `.withPanel > .board`, one declaration): with a panel the board's cap is the wall's less
   the panel's 300, and it keeps its own auto margins — so it centres between rail and panel, and
   the arithmetic makes its left edge equal the wall's board's at every width (`rail + (W − rail −
   1360) / 2` against `rail + (W − rail − 300 − 1060) / 2`); the panel, a margin-less flex sibling,
   docks on the edge on its own; at 1600 the margins are zero and the page is artboard 3 unchanged;
   below it the board shrinks and the panel keeps 300. The declined third option — the board exactly
   where the wall's is at full width, the panel overlapping its empty right side below ~2200px — is
   recorded in the CSS comment so it is not re-proposed. `AppShell.test.tsx` holds the rule's text
   and that nothing re-centres the pair. Validated at 3000 / 2326 / 2000 / 1700 / 1615 / 1600 / 1415 / 1280 / 900: the entry board's
   left edge equals the wall's at every width (595.5 at 2326, 432.5 at 2000, 240 once the room is
   the constraint), the panel's right edge is the window's, the crossover at 1615 has no seam, the
   document column is 549.84 throughout, no horizontal scrollbar; the brand page's board is the
   wall's to the pixel. On a wide window the board and the panel no longer touch — at 2326 there is
   355px of ground between them — which is the chosen geometry, not a defect.

2. **"On mobile the icons and names take too much space; four items in the same line"** — below
   480px the grid is now `repeat(4, minmax(0, 1fr))` (`--icon-grid-columns-narrow`), not the
   mockup's auto-fill at 92px, which gave three per line on a 390 phone and two on a 360. The tile
   comes down to 54px (32px mark, 14px radius, the board tile's own 0.6 ratio), the name to 12px,
   id and count to 10px, gaps to 10 / 26; `tokens.css` derives every number from the 75.5px column
   a 360px phone leaves. Validated at 480 / 390 / 360 (four per line in every band, columns
   101.75 / 79.25 / 71.75, nothing overlapping the row below, no scrollbar) and unchanged at 481
   and 768. **Two side findings from that pass, both fixed:** a small manifest's board hugged the
   left edge below 720px with a wide gutter (App.module.css's `.body` column rule lacked
   `align-items: stretch`, pre-existing and invisible on `layout-stress`, whose bands always
   exceed a phone's width); and an unbroken "OpenTelemetry" measured 83px in a 72px column at 360
   (`overflow-wrap: anywhere` on `.name` below 480, since `break-word` does not shrink
   min-content). Both re-validated: the eight-service fixture's content column equals the board's inner
   width at 720 / 481 / 480 / 390 / 360 (shortfall 0, was up to 242px), `layout-stress` bit-identical
   at 720 and 768, graph and migrations views at 480 without a scrollbar; the obs-trace label box
   equals its column at 360 and 390 (71.75 / 79.25, was 83.39), broken over two lines, nothing
   clipped, no label on the board wider than its column.

3. **"On mobile the popover should not open — there is no hover, only tap"** — `onPointerEnter`
   already skipped touch; what opened it was the tile's `onFocus`, because a tap focuses the button
   (Chrome on Android) and focus peeked for keyboard parity without asking where it came from.
   `usePeekHandlers` in `ServiceTile.tsx` now serves both tile shapes: a pointerdown raises a flag
   the next focus consumes instead of peeking, cleared on click and pointercancel so a Tab after a
   press that never focused still peeks. Three tests in `ServiceTile.test.tsx`, two seen red with
   the guard disabled. This also answers the open question below ("popover below 480px: the bottom
   sheet covers 115–143px of its tile"): on a phone it does not open. Validated on the built bundle at 390 by dispatching what a phone tap
   produces (pointerdown touch, focusin, pointerup, click): no popover at any step on a single tile
   or the group tile, the click still navigating; focusin alone on the same tile afterwards peeks
   (the flag is consumed, not stuck); pointerdown then pointercancel then focusin peeks; real Tab,
   real hover and real click at 1280 unchanged. A process note worth keeping: the validator's first
   tap run used `btn.focus()` and read "no popover" for a wrong reason (a flag left set by its own
   earlier dispatches), and its first explanation of that reading was itself wrong; the second run
   reported the popover's header name after every dispatch instead of a boolean, which is what made
   a stale popover distinguishable from a new one. A control that would pass without the fix is
   not a control.

#### Owner decisions, asked once at the start of the session and once more mid-way

1. **Finding 3, board width: 1600px, and the cap is the board's, not the row's.** The mockup's
   own width, over the old `.page` measure of 1680. The first cut capped and centred the
   rail-plus-board row; the owner saw it within the hour and rejected it — *"We're centralizing
   the side panel as well, this is wrong. We should only centralize the page right side
   content."* So the rail keeps the window's left edge and `.board` alone carries
   `max-width: var(--board-max-width)` (1600px less `--rail-width`) with auto inline margins,
   which centre it in the room the rail leaves because it is a bounded flex item of a *row*
   container — not the `.page` defect, which was a column. Small edit by the main session;
   browser validation follows.
2. **Owner-supplied icons: build now, and not the shape the 2026-09-03 handoff sketched.** The
   owner: *"Let user point on the web. I don't want to couple with thesvg."* No `thesvg:` refs in
   the manifest, no registry search. Mechanism confirmed on a second question: **the CLI fetches
   once and vendors locally** — `catalogus set services.<id>.icon <https-url|path>` fetches or
   copies the SVG one time, runs the sanitiser, writes `.catalogus/icons/<id>.svg` beside the
   manifest and records that repo-relative path in the entry; the viewer stays offline. A URL in
   the manifest that the viewer fetches at runtime stays refused; the schema pattern makes it
   unrepresentable. Then, mid-session, a third decision: **the skill's agent searches the web for
   a missing mark itself and asks the user only when it finds nothing** — *"the agent needs to
   know which brands don't have an icon, so the agent needs to go fetch on the web; when they
   don't find, they can ask user to provide."* That gives the CLI a read-only `catalogus icons`
   command (one line per entry: id, service, source, detail) so the agent can know which entries
   lack one without running the viewer. It is the one place the skill lets an agent act on a web
   search before asking, and the skill says so. The brief is `docs/custom-icon-brief.md`, two
   parts, contract layer first.
3. **Finding 4, the tile's second line when it stands for several entries: the entry count.**
4. **Finding 5, the brand page: brand summary plus entry list** — mark, name, kind and catalog
   facts once, then the entries as rows (id, role, status, version) each linking to its own
   entry page.
5. **The graph stays per entry for v1.** Edges are between entries, so a per-brand node would
   have to merge them and lose which entry depends on which; the owner took the recommendation
   to leave the graph alone and revisit if it repeats too much.
6. **Mockup first for the brand page and the breathing entry page.** A static candidate in
   candidate E's vocabulary (`apps/web/docs/candidates/candidate-e-brandpage.html`: the
   multi-entry tile with its popover, the brand page, the reworked entry page), approved on
   sight before anything is built — the way the shell went.

Recorded by the first finding-3 validator, against the reversed row cap but independent of it:
**the graph does not fit to view** — the React Flow viewport stays at `translate(0,0) scale(1)`
while the node extent spans about 2630px at every width, so roughly half the nodes sit off-canvas
until the reader pans. Pre-existing, not caused by anything this session; open. Also: the popover
clamps against the *window*, not the board, so with the board capped on a wide window a popover
may legitimately overhang the board's side margin — transient, dismissable, acceptable until
someone says otherwise.

#### Finding 3 — built and validated

`--board-max-width: calc(1600px - var(--rail-width))` on `.board`. A validator drove the built app
through same-origin iframes at thirteen widths from 2326 down to 480: rail at x=0 and 240 wide at
every width above 900; the board 1360 wide and centred to within the 0.5px auto-margin rounding
above a 1616px window (the cap engages at 1616, not 1600, because the 15px scrollbar is part of
the window and not of the room); fills the room exactly at and below; top bar and footer full
width throughout; no horizontal overflow in list, graph, migrations or service page; sticky head
sticks and all eight rail anchors land 40px clear of it; the popover clamps inside the window at
1300 and 1024 where the tile is flush with the board's inner edge. The first cut (the row capped,
rail floating) was also measured before the owner rejected it, and that table is in the
validator's transcript, not here.

#### Owner-supplied icons — built, validated, defects fixed, re-validated

**The contract.** `services[].icon` is a repo-relative path matching
`^\.catalogus/icons/(?!.*\.\.)[a-z0-9][a-z0-9_.-]*\.svg$` — one directory, never a URL, never
absolute; the viewer reads the file and never the network. `catalogus set services.<id>.icon
<https-url|path>` fetches (15 s timeout, https only, redirects followed but never off https,
body counted against `MAX_ICON_BYTES` = 256 KB rather than trusting content-length) or copies
the bytes, runs them through the same sanitiser the vendored thesvg files pass (now
`parseIconMarkup`, which also refuses any `url(` that is not a same-document `#fragment`),
stages them as a temp file under `.catalogus/icons/`, and renames to `<id>.svg` only after
`commitManifestEdit` succeeds; any failure on any path discards every staged file and removes an
empty directory it created. The YAML comment on the node records **origin and filename only**
(`# fetched from https://host (logo.svg) on 2026-09-04`) — the first cut stripped query and
fragment and a validator put a token in the path. The private-text guard runs on URL values
before any fetch (a presigned or userinfo URL is refused outright, which is the safe outcome) and
not on path values, which are never written anywhere. `catalogus icons [path]` is the read-only
report — `<id>  <service>  <source>  <detail>`, sources `local | simple-icons | thesvg | none`,
`(missing file)` vs `(refused: …)` on a stale pointer, and `<n> service(s) of <total> has/have no
icon.` — and `add` prints one hint line when the entry it added has none. `view` serves the
catalog fallback for a stale pointer and prints one stderr line per such entry, saying missing or
refused. `validate` does not check the file exists. The same resolution step
(`icon-resolution.ts`) serves `icons` and `view`, so they cannot disagree.

**The skill** (`skills/catalogus/SKILL.md`, step 7b) tells the agent to run `catalogus icons`,
search the web for each `none` row's official mark, set it, and ask the user only when nothing
turns up — the owner's procedure, and the one place the skill lets an agent act on a web search
before asking; the summary must list every icon set and its URL. The drift test now ties the
skill's four source names to the CLI's `ICON_SOURCES`.

**Validation, by an agent that wrote none of it,** against the built binary with local http and
https servers (self-signed, trusted via `NODE_EXTRA_CA_CERTS`) and some fifty inputs: every
sanitiser refusal, both cap edges, redirect on/off https, 404, stall before and after headers,
lying content-length, path tokens, userinfo, hashed absolute paths, `..`, directories, the
destination itself, unknown ids, the containment floor bypassing the schema, hand-edited manifests
for `validate`. Four defects found and fixed (two temp-file leaks on throw paths, `icons` calling a
refused file missing, an empty directory left behind), two no-secrets gaps closed (path tokens,
the guard on paths), then re-validated clean apart from two wording items the main session fixed
(a doubled "the sanitiser refused it", and `set` surfacing a read-only manifest as the bare EPERM;
it is `could not update <path>: …` at exit 1 now). One claim of the brief turned out unreachable:
"vendor succeeds, then a sibling field fails schema validation at commit" — every sibling value is
pre-checked before the manifest opens, so the only post-stage failures are the two leaks, both
fixed. `style="fill:url(...)"` was the validator's design question and is refused now.

#### Brand tile — built to an approved mockup, validated

**The mockup first.** `apps/web/docs/candidates/candidate-e-brandpage.html`, three artboards in
candidate E's own CSS: the wall with a Fly.io ×5 tile and its popover; the brand page; the entry
page reworked to breathe. The owner approved 1 and 2 on sight; 3 went through two revisions —
first the facts as a sidebar stack, then *"place it dock on the right as a side panel"* — and was
approved as the left rail's mirror: a 300px panel docked at the row's right edge, full row height,
hairline on its left, stacking under the document below 900px. The mockup's comments record every
decision including the ones it does not make (a group whose entries differ in `kind`).

**What is built.** `BandModule` collapses per band through `collapseByService` (its first caller
since `e1f7dba`); a multi-entry tile shows "N entries" (not mono) in the id's slot, the group's
worst status as badge and red word (`<id> phasing out`, no arrow), and keeps its mark in colour;
its popover lists the entries as real links with a focus bridge so Tab keeps it open; clicking it
opens `#/brand/<band>/<service>` (`hash-route.ts`), a new `BrandPage` (facts once, then entry rows
as links); `ServicePage` is split into the document and `ServicePagePanel`, mounted through a new
`sidePanel` slot on `AppShell` (`.withPanel` only when a panel is passed, so the frozen shell's
board views render byte-identically); an entry of a multi-entry group gets a second breadcrumb
crumb. Counts stay entry counts everywhere; graph and migrations untouched. The group tile's DOM
id is `service-tile-<band>-<service>` because the same slug can collapse in two bands.

**Validation of the viewer slice — two passes, five defects, all fixed.** The first pass (a
separate agent driving the built app in Chrome against the three artboards, at 1280 and 1024, with
its own five-entry fixture spanning all four statuses) confirmed the collapse, the popover, the
brand page, the split entry page and the counts, and found four defects: **D1** no keyboard path
from a group tile into its popover rows (the popover mounts after the whole board, so Tab from the
tile lands on the next tile; the "tabbing into the rows" test focused a row directly and so proved
the focus bridge while hiding that nothing could reach it); **D2** the entry page's document column
not rebuilt to artboard 3; **D3** the brand page's Entries block spanning the full page instead of
the 68ch measure (1280px rows, ~310px columns); **D4** the crumb separator inheriting `body`'s 12px
and computing 18px, pushing the header 3px down. D2–D4 were fixed by one agent (`ServicePage.
module.css`, `BrandPage.module.css`, comments tagged `D2`/`D3`/`D4, 2026-09-04`). D1 was the main
session's edit: `App.tsx`'s peek keydown effect now walks **ArrowDown/ArrowUp** from a focused
group tile into its rows (first/last), wraps through them, and **Escape from a row hands focus back
to the tile** before closing; six tests in `App.test.tsx`, each seen red with the arrow branch
disabled.

The second pass reproduced all four clean, to the digit where a number was claimed (D2's column and
type identical to the mockup's computed values; D3's grid `126.95px ×4`, gap 14; D4's row 15px and
header at y=141 — the mockup's 15.5 / 141.5 is its body leading of 1.55 against this app's 1.5, a
0.5px the CSS comment now records rather than claims away). It found **one real new defect, born of
the D1 fix**: with focus on a row, a pointer brushing a neighbouring tile replaced the peek,
unmounted the row and dropped focus to `<body>`, where neither the arrows nor Escape had anything to
act on. Fixed the same hour: a row that holds focus holds the popover — `handlePeek` refuses a peek
while focus is inside the popover (only a pointer can ask from there), and `handlePeekEnd`'s timer
re-checks at fire time so the neighbour's pointer-leave cannot close it either. One test, seen red
with the guard removed; re-checked in the browser by the same validator (hover two neighbours, pointer through the popover
and out, click on empty board, Escape with the pointer resting on another tile: focus and popover
correct at every step; a click on a neighbouring tile wins over the guard, since focus leaves the
row on mousedown, and opens that tile's page — the sane outcome; one transient, inherent to any
refuse-the-peek design: a tile the pointer is already resting on when Escape fires does not peek
until the pointer leaves and re-enters it). Also from that pass:
the brand page's "Entries" heading got the mockup's 1.55 leading (it inherited body's 1.5, 28.5px
against 29.45). **Recorded, not changed:** the entry page's `.document` is `flex: 0 1 auto` where the
mockup's is `1 1 auto; min-width: 0` (inert, the article is not a flex row); a Tab that leaves the
browsing context altogether closes the popover only when the browser's throttled timers fire
(~1.5s), which is the browser, not the app; Chrome's resize tool is still a no-op at 2326px, so
every width was produced by a same-origin iframe of that width, and scroll-tracking of an open
popover could not be driven at all there (`visibilityState: "hidden"` pauses `requestAnimationFrame`).
Group-status severity ranks `deprecated` above `removed`, by design (`bands.test.ts`).

**One flake seen and not chased:** `App.test.tsx`'s "swaps the list for the canvas, and back" failed
once at ~1035ms (a `waitFor` timeout while the lazy graph chunk loaded under a parallel run) and
passed on the next three consecutive runs of the file. It is the same shape as the flakes recorded
under "Run it more than once" above.

### Handoff — 2026-09-03 (second session), five brand marks come from thesvg.org, and two defects the tests could not see

**Read this first.** One session, one brief: `docs/icons-brief.md` (kept as the record of what was
asked; run, not to be run again). It is finding 2 of the owner's first real-inventory run, listed
below the previous handoff. The design is unchanged. What is left of the component work is still
**the three shell menus** (blocked on the owner) and the portfolio page.

#### What the next session does first

The owner ran the new build on a client repo the same evening: *"Icons look good."* Then:

1. ✅ (2026-09-04, see the newest handoff) **Finding 3 — centre the board.** Owner said OK; the number (1600 or 1680) is still theirs. Ask
   once, then a small edit to the rail+board row. Do not pick one.
2. ✅ (2026-09-04, mockup approved, built, see the newest handoff) **Findings 4 + 5 — one tile per brand per band, and the service page.** A design brief, not a
   fix: the wall (`collapseByService` in `bands.ts` already collapses per band and has no caller
   since `e1f7dba`), the popover listing the entries, a brand page that lists them with each entry
   keeping its own page, the graph node, and the counts. One brief per surface. The open design
   questions to put to the owner before briefing: what the tile's second label line shows when it
   stands for several entries (the id is gone), and what the brand page is that the entry page is
   not.
3. ✅ (2026-09-04, built in a different shape than sketched here — no thesvg refs, no registry search; see the newest handoff) **Owner-supplied icons — a new open item, from the owner's second look (2026-09-03 evening).**
   Loki and Healthchecks.io are on neither simple-icons nor thesvg.org, so no source this repo can
   check will ever fill them. The owner asked, without asking for it to be built: let the user set
   a specific icon when the app cannot find one, or look one up from the app. The shape that fits
   this repo's rules: an `icon:` field on a service entry accepting a source ref (`thesvg:<slug>`)
   or a repo-relative path to an SVG (`./.catalogus/icons/loki.svg`), written only through
   `catalogus set <id> icon ...` so it goes through `manifest-edit` and validation, with local
   files passing the same sanitiser and fill policy as the vendored ones. **Not a remote URL** — a
   public manifest naming a URL that the viewer fetches SVG from is the one variant to refuse.
   Lookup belongs in the CLI (`catalogus icon <id> --search <text>` against thesvg's static
   registry, showing the per-icon licence, writing the ref on the owner's pick), not in the viewer:
   FIRST VIEWPORT says nothing writes until Phase 4, and the viewer has no network. Schema change,
   skill drift test, `set` command, a third source in `resolveIcon` — a brief of its own. Not
   started.
4. The three menus, once the owner answers the 2026-09-02 questions.

**Codex and xAI joined the vendored set in the same evening** (`codex.svg` from thesvg's
`codex-openai` row — Codex's own mark, not the OpenAI logo the morning had reverted; `xai.svg`
from its `xai` row; both MIT-labelled, both one currentColor path, both with `hex: null` because
thesvg's manifest hex for each is `fff`, a dark-ground white and not a brand colour). Verified by
the suite and by serving a scratch manifest through the built CLI: both resolve, Loki stays null.
`LICENSES.md` has the two records.

**What is built and verified.** `packages/core/icons/thesvg/` holds five SVGs vendored
byte-for-byte from github.com/glincker/thesvg at commit `9e7c56e6` — aws (every `aws-*` row),
csharp, openai, slack, googlevertexai (`google-vertex-ai`) — with `LICENSES.md` recording per file
the source URL at that commit, thesvg's manifest `license` and `hex`, the fetch date and a sha256
that `icons.test.ts` recomputes (a validator flipped a byte and watched it fail). **The licence
finding, which is the part the owner asked for:** thesvg's codebase is MIT; every one of the five
icons carries `license: MIT` in thesvg's own manifest; but that is thesvg's label on a file it
redistributes, not a licence from Amazon, Microsoft, OpenAI, Slack or Google — thesvg's `LEGAL.md`
rests the marks on nominative fair use "for identification and development purposes", the same
basis simple-icons already ships under in this tree. `LICENSES.md` says exactly that, and the
owner should read it once and decide whether that basis is acceptable to them; nothing here decided
it for them. **Loki is not on thesvg.org either** (only `grafana`); it keeps the fallback, and its
row comment now records both checks. **Codex has no icon**: the implementer had given it the
OpenAI mark ("same company"), and the orchestrator reverted that as a brand inference nobody
verified — an OpenAI product does not carry the OpenAI logo unless someone checks that it does.

**The mechanism.** A catalog icon ref is either a simple-icons slug or `thesvg:<slug>`;
`resolveIcon` returns one shape for both, `{ viewBox, body, hex }`, where `body` is sanitised
inner markup (the sanitiser refuses `<script`, `<foreignObject`, `on*=`, `href`, `<style>`, a
nested `<svg`, a missing viewBox — all reproduced against the built `dist` by a validator writing
hostile bytes over a vendored file) and `hex` is non-null only for a single-ink mark. thesvg files
are multi-path and multi-fill, unlike simple-icons' one path, so each carries a recorded fill
policy in `icons.ts`: `ink` (openai — every fill becomes currentColor), `brand` (aws, slack,
vertexai — fills kept), `brand` with a knockout list (csharp — the white letters lose their fill
and gain `data-knockout`). `ViewService.icon` is that shape or null and `iconHex` is gone.
`Icon.tsx` renders the body with `dangerouslySetInnerHTML` and says why that is safe; the
monochrome rule in `Icon.module.css` is CSS overriding presentation attributes.

**Two defects a validator found by measuring the running app, neither visible in 1402 passing
tests, both fixed by the main session and re-measured:**

1. **Every brand mark on the board and the service page rendered 32×46, not 46×46** — and had
   since before this slice. `Icon.module.css` gave its span a fixed 2rem box; the surfaces size the
   svg by descendant rule; a flex item shrinks to its container on the main axis. So the mark was
   drawn at 32px, 30% under `--icon-mark-size`, visibly smaller than the monogram fallbacks beside
   it, and nobody had measured it. The span is now 100% of whatever box the surface gives it.
2. **The knockout painted the wrong ground on four of five surfaces.** The rule said "the ground
   behind the mark is `--color-bg`" and the comment asserted it; measured, the tile, node and
   popover paint `--color-surface` and a desaturated tile paints sunken. Now `--icon-knockout` is a
   token (page ground by default) that each surface re-declares beside the background it paints.
   `token-references.test.ts` caught the first attempt, which defined it in a component.

**One claim in the brief was stale, and the validator caught it rather than the code.** The brief
said "the board is monochrome"; it has been in colour since candidate E (2026-08-26,
`ServiceTile.tsx`'s header), and `Icon.tsx`'s own doc comment still said otherwise. The comment is
corrected. The monochrome rule has no live caller today and stays for the settings panel's
brand-icon-colour toggle. **Consequence for the owner:** the contrast re-check they asked for is
answered in colour, not mono, and the answer is not good — on `--color-surface` the measured
ratios are openai 20:1, aws wordmark 15:1, slack red 4.4:1, nginx 3.7:1, vertexai `#4285F4` 3.4:1,
csharp purple 3.2:1, and below 3:1: vertexai `#669DF6` 2.6, slack green 2.5, aws orange 2.0, slack
blue 1.9, supabase 1.9, slack yellow 1.8, **vertexai `#AECBFA` 1.57:1** — Vertex AI reads as a
pale-blue smudge at board size. That is the board-in-colour decision meeting real brand palettes,
and it is the owner's to revisit (a mono board, or a brand-icon-colour toggle defaulting off).

**Smaller things, recorded and not fixed:** with the span now filling its box, the service page's fallback glyph (Loki) fills its tinted 46px tile edge to edge where the popover's keeps a 2px inset — a number for the owner or the mockup to name, not this session; the `ink` policy rewrites `fill="none"` to
currentColor too, harmless on openai's one path but wrong for a future single-ink mark with a
hole (`icons.ts` should special-case `none` when that mark arrives); the knockout matcher does not
match the keyword `white`, only hex; `#/graph` is not a route (view tabs are in-app state, a
deep link to the graph lands on the list); Chrome's resize tool is still a no-op at 2326px, so the
popover's right-edge clamp was not re-stressed this session (it was validated at 1280 and 1024
on 2026-09-03 morning, before any of this).

**State of the tree at this handoff: 1403 tests / 77 files**, green, `pnpm typecheck` clean across
four packages; 1402 was green on three consecutive runs by the validator and two by the main
session before the Codex/xAI addition (+1 test). Committed at the close of the session, including
`packages/core/icons/`.

### Handoff — 2026-09-03, the shell's structure is built, and one defect the mockup could not show

**Read this first.** One session, one brief: `docs/shell-brief.md` (kept as the record of what was
asked; it has been run and is not to be run again). The design is unchanged. What is left of the
component work is **the three shell menus**, blocked on the owner, and the portfolio page.

**What is built and verified.** The top bar (60px, relative, not sticky), the 240px left rail
(identity block, visibility chip only when the payload has one, band index as plain anchors), the
view rail moved into a sticky board head, and the footer (manifest path, "read <relative time>",
service / dependency / rollup counts, `catalogus <version>`, schema URL) — all in `apps/web/src`
as `AppShell`, `Rail`, `Footer`, `ViewToggle`, with `relative-time.ts` as a pure helper.
`ViewPayload` gained `cliVersion` (from the CLI's own `package.json`, the same mechanism as
`--version`) and `schemaUrl` (from `catalogusSchemaV1.$id`, because the web app cannot import the
schema package without bundling ajv — a validator confirmed ajv is absent from `apps/web/dist`).
`ProjectHeader.*` is deleted; identity lives in the rail. A validator that did not write it drove
the built app and the mockup side by side at **1600 / 1440 / 1280 / 1024 / 900 / 768 / 480 / 390**
(same-origin iframes, because Chrome's resize tool reports success and leaves the window at 2326px
— record that before trusting a "resized to" line again) and found every shell value identical to
the mockup at every width, both breakpoints firing together, no horizontal overflow anywhere, and
the popover unclipped and off its tile with the rail and sticky head around it at 1280×720 and
1024×768.

**The one defect, and why no test or mockup could show it.** Clicking a rail anchor scrolled the
band to y=0, where the 84px sticky head sits, so every heading a reader clicked landed 44px behind
the view rail and the page read as if it had not scrolled. The mockup cannot reproduce it: its own
`overflow-x: hidden` on `html, body` stops its head from ever sticking, so the mockup's head is
sticky in name only. jsdom has no layout, so the 1379 passing tests are no evidence either way.
Fixed with `--board-head-height` in `tokens.css` (a calc of the head's own tokens, 84px) and
`scroll-margin-top` on the band section; re-validated at 1280 and 1024 — all eight anchors land the
heading 40px clear of the head. **The lesson is the standing one, in a new shape: a static mockup
is a specification for what it draws, not for what it does, and "sticky" is a behaviour.**

**Two files were edited outside the brief's allocation, both necessarily.** `BrandMark.module.css`
(the wordmark rule the brief asked to match lives only there; CSS Modules hash per file) and
`App.module.css` (`.page`'s 1680px max-width would have absorbed the rail row's free space, the
defect the old `AppShell` comment warned about; `.page` and `.wide` are gone with the wiring that
applied them).

**Deliberate deviations from the mockup, all small and all recorded in code:** singular forms at a
count of one (the mockup can only show 35/48/21); `cursor: pointer` on the cluster triggers; the
avatar disc is empty (no account until Phase 5); **no Documentation link is rendered** anywhere,
because no URL exists, and the `index.html` disclosure names that as an open item with a pinned
string in `direction-contract.test.ts` so it cannot be closed by guessing.

**Two observations, not defects, for the owner:** a popover that flips above its tile in the last
band covers the view rail while open (unclipped, dismissable; a design call); and below about 480px
the project is named nowhere on the page — the rail is gone and the cluster takes the bar's width,
which the mockup does identically at 390. The architecture sentence has no home below 900px, as
before.

**State of the tree at this handoff: 1375 tests / 77 files**, green on consecutive runs,
`pnpm typecheck` clean across four packages. 1379 / 77 after the shell; four fewer after the dark
palette left (the per-licence and per-block cases in `signal-red.test.ts` that guarded it).
Uncommitted at the time of writing; the previous baseline was 1317 / 75 at `cfefea7`.

**What the next session does first:** the three menus, once the owner answers the questions in the
2026-09-02 handoff below (plus the Documentation URL, which now blocks the footer as well as the
help menu). Nothing else in the shell is open.

#### The owner's first run against a real inventory — 2026-09-03, six findings, in the order to take them

The owner ran `catalogus view` on Clapline (36 services) — the first real-inventory run, closing
open item 1 of the 2026-08-25 list. Their screenshots were **dark**: the OS is dark and `tokens.css`
still carries the old world's `prefers-color-scheme: dark` block, so the approved cream world has
never been what the owner saw in the app. That one fact explains two of the six findings. Order:

1. ✅ **Cream only** (2026-09-03, same session). The owner: *"Remove dark for now, the approved was
   light."* Both dark blocks and the `data-theme` seam are gone from `tokens.css`; the two dark
   licences left `signal-red.test.ts`'s self-cleaning list with them. Expected to fix finding 3
   for free: Anthropic's brand hex is `#191919`, invisible on near-black and ink-strength on cream.
   Re-check icon contrast on cream *after* this, not before — nobody has seen the icons on cream
   against a real inventory yet.
2. ✅ (2026-09-03, second session, see the newest handoff; Loki stays a fallback, thesvg.org has no mark for it either) **Missing icons — AWS, C#, OpenAI, Slack, Loki, Vertex AI.** Not a bug: `simple-icons@16.28`
   carries none of the first four (trademark removals) nor Loki, and Vertex AI has no row; the
   initials tile is the designed fallback. **Owner's answer:** the source is https://thesvg.org/
   — check its licence terms per icon before bundling any, record the licence beside each, and
   route the six named brands through it first. Hand-drawn brand-shaped marks stay forbidden
   (`fallback-icons.tsx`).
3. **Board width on wide screens.** Owner asked whether to centre. Recommendation recorded in the
   session reply: cap the rail+board row at a max width and centre it (the old `.page` did 1680px;
   the mockup was only ever drawn at 1600). **Owner said OK** to centring; the number is still
   theirs (1600 or 1680) — ask once, then a small edit.
4. **One tile per brand.** Fly.io ×5, Vertex AI ×2, Namecheap ×2 in one band; Supabase across two
   bands. Tile per brand, popover lists the entries briefly, the brand's page lists them, each
   entry keeps its own page. **Owner's answer: per band, for v1** — Supabase keeps a tile in each
   of its two bands; "if it repeats too much we improve later." This changes the wall, the popover,
   the service page, the graph node and the counts — a brief per surface, not one brief.
5. **The service page needs to breathe.** Design work; brief it together with 4, since the brand
   page and the entry page become two pages.

### Handoff — 2026-09-02, the three views join the world, and the red rule is finally guarded

**Read this first.** It covers two commits: `e1f7dba` (2026-08-31, the wall, made without a
handoff here) and `d9001b1` (2026-09-02). The design is settled and unchanged — see the sections
below. What is left of the component work is **the shell** and **the popover's vertical placement**.

**What is built and verified.** Candidate E's board, tile, popover, service page, graph and
migrations board are all in `apps/web/src`, measured against the mockup by a validator that did
not write them: grid, mark, badge, label stack, popover grid and shadow all match the mockup's
literal values; the graph node and the migration row reuse the tile's and popover's numbers rather
than a second vocabulary. `active` + `replaced_by` shows on the tile/popover and on the service page
(owner's ruling, 2026-08-31); the graph node deliberately does not, and `ServiceStatus.tsx` says so.

**The red rule, third time.** OWN-WORLD licenses signal red in two places, the status badge and the
status word. The 2026-08-31 tree recorded the correction as done in `DIRECTION.md` and in
`ServicePage.module.css`'s own header, and had made it in one of four named sites. A validator
driving the built app found the view rail's underline, the tag tones (`--tag-new-*`,
`--tag-phasing-*`, `.signal-solid`) and the service page's "no catalog entry" line still red, and no
guard. This session moved all of them onto ink and added `apps/web/src/signal-red.test.ts`: a source
scan of every stylesheet under `apps/web/src`, comments stripped, `@media`-nested rules attributed
to their own selector, custom-property aliases resolved transitively, hex / 8-digit hex / `rgb()`
spellings, licensed by `{file, selector, property}` with a self-cleaning allow-list (a licensed rule
that stops being red fails too). Eight mutations by a second validator all failed the suite. **The
lesson is the one this file keeps relearning: a stylesheet header saying a fix was made is not the
fix, and a file that has been read has not been seen.**

**One red site is quarantined, and it is the owner's call.** `RankModule.module.css` paints
`.selected` and `.top` red; the component has no caller (removed from the board 2026-08-25, kept on
disk) and is tree-shaken out of the build. The contract says "not red" without saying what instead,
so the guard holds those two rules in a dated quarantine list rather than the allow-list. **Ask the
owner: delete `RankModule` outright, or name its ink.** Either answer removes the quarantine.

**Smaller things from the same validation, all fixed:** the migrations row's no-icon mark now has
the dashed sunken 6px tile the mockup gives the popover's; `html { overflow-y: scroll }` stops the
page shifting 15px when toggling to the one view that does not scroll (`scrollbar-gutter: stable`
measured inert on the viewport scroller in Chrome 152, on both `body` and `html`); the disclosure in
`index.html` was rewritten twice because it kept counting the gap wrong rather than missing it — it
had said the shell was "the last surface still in the retired world" while `ViewToggle` is the old
world's component too. The three pinned strings in `direction-contract.test.ts` now each name a gap
open today.

**The popover, vertical half — fixed and validated (second commit of 2026-09-02).** The flip
had tested the stylesheet's 60vh ceiling instead of the box's measured height, so at 1280×720 every
first-band tile's popover ran past the bottom edge and in a short viewport the flip could cover half
the tile it described. `apps/web/src/popover-placement.ts` is now a pure function (below if the
whole box fits, else above if it fits, else the side with more room, near edge pinned 12px from the
tile, overflow away from the tile); `App.tsx` measures the rendered box in a layout effect before
paint. A validator's own sweep of 2.76M tile/box/viewport combinations found zero overlaps. The
validator also found — and the implementer then fixed — an intermittent React #185 crash (the layout
effect chased a moving anchor on momentum scroll; now it reacts only to the box's own size, and
scroll/resize re-place once per animation frame), Escape not closing a peek (pre-existing since
`d9001b1`), and an asymmetric fits-above test. **One limit stays, stated in the disclosure:** a box
that fits on neither side overflows on its far edge, and below 480px the bottom sheet covers part of
its tile by 115–143px — that last one is a design question for the owner.

**Facts the shell needs that the repo does not have — do not guess them.** The mockup's profile menu
shows a name, an email and a plan; there is no account system until Phase 5. The settings panel
(appearance, density, brand-icon colour, default view) implies persisted preferences; nothing here
persists anything, and FIRST VIEWPORT says "nothing that writes". The help menu and footer link to
"Documentation" with no URL anywhere in the repo. The footer's CLI version is not in `ViewPayload`
yet (add `cliVersion` from the CLI's own `package.json`). The shell brief is split: structure first
(top bar, rail, view rail in a sticky board-head, footer — all derivable), the three menus second,
once the owner answers what a settings toggle does and what the profile menu holds with no account.

#### Where this session stopped, and what the next one does first

The owner stopped the session near the 5-hour limit with the shell brief just launched; the agent
was killed before it edited anything, and the tree is clean at `cfefea7` plus this file and the brief.

1. ~~**Run `docs/shell-brief.md`.**~~ ✅ done 2026-09-03, see the handoff above. It is the shell's *structure* — top bar, left rail with the band
   index, the view rail moved into a sticky board-head, the footer — every value derivable from the
   mockup and the payload. One opus agent, allowed to fan out; its file allocation is in the brief.
   Then one validator driving the built app against `candidate-e-homescreen.html` at
   1600/1440/1280/1024/900/768/480/390; that validator also covers the popover placement in the
   new layout (the popover fix at `cfefea7` was validated by property sweep and browser, but not yet
   with a rail and a sticky board-head around it).
2. **The three menus** (help / settings / profile) are a second brief, blocked on the owner's
   answers below.
3. Then tick item 2 in the 2026-08-26 list below, and Phase 3.7 is closed less the portfolio page.

**Questions for the owner — all answered on 2026-09-05 (see that handoff at the top):**

- ~~`RankModule` paints red and has no caller: delete it, or name its ink?~~ **Deleted.**
- ~~Profile menu with no account system until Phase 5: omit the trigger, or show it with a menu that
  says so?~~ **Show it; the menu says there is no account.**
- ~~Settings panel: dark theme — keep or remove?~~ **Answered 2026-09-03: removed.** ~~What a
  settings panel holds with nothing persisted is still open.~~ **`localStorage`; Density deferred.**
- ~~Documentation link target in help menu and footer: there is no docs URL in the repo.~~ **The
  GitHub README; the manifest reference goes to a new `docs/user/` folder.**
- ~~Popover below 480px: the bottom sheet covers 115–143px of its tile. Accept, or place it elsewhere?~~
  **Answered 2026-09-04: on a phone it does not open at all** — no hover, only tap (the evening
  handoff above, item 3).

#### State of the tree at this handoff

**Baseline: 1317 tests / 75 files**, green on consecutive runs, `pnpm typecheck` clean across all
four packages, after the popover commit. 1284/74 at `d9001b1` (+31 for `signal-red.test.ts`, +1 for
the migrations fallback mark over the session's starting 1252/73); +33 for the popover placement
(one new pure-function test file, and `App.test.tsx`'s crash, throttle and Escape tests). Before that, 1226/72 at `e1f7dba`.

