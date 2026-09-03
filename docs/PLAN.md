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
- **Last updated:** 2026-09-03 (evening)

## Start here on a fresh session

Run `pnpm build && pnpm test` first, plus `pnpm typecheck` clean across all four packages, before
trusting anything below. **In that order**: the direction contract guard compares
`apps/web/index.html` against the build output, so a `pnpm test` run against a `dist` older than your
last edit to that file fails on a difference you created and already fixed.

**The expected total as of 2026-09-03 (evening) is 1403 tests / 77 files** (see the newest handoff; it was 1375 / 77 the same morning, before the icons slice, and 1402 before Codex and xAI joined it). The paragraph that follows is the 2026-08-26 history of why this line once named none.

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

### Handoff — 2026-09-03 (second session), five brand marks come from thesvg.org, and two defects the tests could not see

**Read this first.** One session, one brief: `docs/icons-brief.md` (kept as the record of what was
asked; run, not to be run again). It is finding 2 of the owner's first real-inventory run, listed
below the previous handoff. The design is unchanged. What is left of the component work is still
**the three shell menus** (blocked on the owner) and the portfolio page.

#### What the next session does first

The owner ran the new build on a client repo the same evening: *"Icons look good."* Then:

1. **Finding 3 — centre the board.** Owner said OK; the number (1600 or 1680) is still theirs. Ask
   once, then a small edit to the rail+board row. Do not pick one.
2. **Findings 4 + 5 — one tile per brand per band, and the service page.** A design brief, not a
   fix: the wall (`collapseByService` in `bands.ts` already collapses per band and has no caller
   since `e1f7dba`), the popover listing the entries, a brand page that lists them with each entry
   keeping its own page, the graph node, and the counts. One brief per surface. The open design
   questions to put to the owner before briefing: what the tile's second label line shows when it
   stands for several entries (the id is gone), and what the brand page is that the entry page is
   not.
3. **Owner-supplied icons — a new open item, from the owner's second look (2026-09-03 evening).**
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

**Questions for the owner, none answered yet:**

- `RankModule` paints red and has no caller: delete it, or name its ink? (Quarantined in
  `signal-red.test.ts` until answered.)
- Profile menu with no account system until Phase 5: omit the trigger, or show it with a menu that
  says so?
- ~~Settings panel: dark theme — keep or remove?~~ **Answered 2026-09-03: removed.** What a
  settings panel holds with nothing persisted is still open.
- Documentation link target in help menu and footer: there is no docs URL in the repo.
- Popover below 480px: the bottom sheet covers 115–143px of its tile. Accept, or place it elsewhere?

#### State of the tree at this handoff

**Baseline: 1317 tests / 75 files**, green on consecutive runs, `pnpm typecheck` clean across all
four packages, after the popover commit. 1284/74 at `d9001b1` (+31 for `signal-red.test.ts`, +1 for
the migrations fallback mark over the session's starting 1252/73); +33 for the popover placement
(one new pure-function test file, and `App.test.tsx`'s crash, throttle and Escape tests). Before that, 1226/72 at `e1f7dba`.

### The form is settled: candidate E, the home screen — approved 2026-08-26

**Read this before the interview section below it.** That section records how the world was chosen;
this one records that the *form* is now chosen too, so nothing about the board's shape is still open
to a fresh session's judgement.

**The owner's words: "The E home screen direction is approved!"** — after seeing six candidates
rendered in a browser against the 35-service stress fixture.

**What was approved, precisely.** Services render as a smartphone home screen: **bare icons on the
ground with their labels beneath, no card, no border, no panel around any service**, grouped under
the architecture band headings. The icon tile carries a phone-like corner radius; everything else —
sections, chrome, rails, footer — stays sharp. That radius is a **declared, contained departure**
from "sharp structure, soft transients", chosen explicitly by the owner, and it is not a repeal:
letting it spread to anything but icon tiles and transient surfaces would be a defect.

**The app shell is separately approved and frozen.** The owner: *"When I said shell, I said the icon
shell, not the app shell. Your new app shell is perfect, don't touch it."* So the top bar, the
help / settings / profile cluster and their menus, the left rail with the band index, the view rail
and the footer are settled. A later pass that "improves" them has failed, however good the
improvement. **This also closes the empty-bottom-of-the-screen gap** that has been open since
2026-08-25: the footer fills it.

**The instruction that produced E was misread once, and the correction is the useful part.** "It
doesn't need all that shell" was first read as *app* chrome and nearly produced a candidate that
stripped the thing the owner had just called perfect. They meant the *icon's* shell — the card
around each service. Both readings were plausible; only one was right; and it was caught because the
owner restated it rather than because anything in the process detected it.

**Two forms were built rather than one, because the owner declined to choose between them.** Asked
grid or list, they answered: *"We're brainstorming, we need to be open minded now."* So E (home-screen
grid) and F (app-drawer list) were built as siblings, each briefed to be its best self rather than a
strawman for the other, and E won. F remains on disk as the record of what the alternative actually
looked like.

**The six candidates all measure clean** at 1600 / 1440 / 1280 / 1024 / 768 / 390 — 35/35 services,
band counts 7/7/6/4/4/5/1/1, all nine tokens exact, no remote assets, no `@import`, no fetch, no
unexpected hexes outside brand SVGs, no search field and no editing affordance anywhere.

### The design interview ran on 2026-08-26, and the world is being replaced

**This supersedes the section directly below it**, which said the next session must ask before it
designs. It asked. `japanese-high-density-web` is retired by owner decision and a new world is being
chosen from candidates.

**What the owner said, unprompted:** *"we need something more professional look. I was looking for
Notion and Confluence and they look professional, I'd like to capture them as reference."*

**One thing was put to them before any question was asked**, because the record already held a
contradiction and this repo does not resolve those silently. `apps/web/docs/DIRECTION.md` carries
"Quality bar named by owner: Confluence and Notion" from 2026-08-25, and three lines later names as
a rut to avoid *"the airy white docs site, Inter, thin grey rules, blue links"*, with the note
"Notion/Confluence is the owner's stated bar → at most ONE candidate may read as its literal form".
So in August it was taken as a **quality** bar and its literal form was deliberately refused. The
new instruction is to take it as a **visual** reference. That is a reversal, it was named as one,
and the owner made it anyway. It stands.

**Eight questions, eight answers. These are the contract for the new world:**

| Question | Answer |
|---|---|
| Scope | **New visual world.** Not a craft pass, not a structure-only change. |
| Density | **Breathing room wins.** Scrolling is allowed. |
| Palette | **Keep cream + red.** Not Notion's cool white. |
| Reference | **Notion.** Not Confluence. |
| Search | **Still no search.** Bands and the left rail carry finding. |
| Form | **Airier boxes.** Modules stay containers, with real padding and real space. |
| Geometry | **Sharp structure, soft transients.** Radius and shadow only on popovers, menus, hover. |
| Process | **Candidates first**, then build. |

**Three of those answers are worth reading twice, because each retires something this file has
treated as settled:**

- **"Breathing room wins" retires "No search. It should fit."** — the owner's own hardest constraint,
  named on 2026-08-25 as the one that ruled out the scrolling index. Half of it survives: they
  separately confirmed **no search**, so the viewer scrolls now but still finds by architecture. The
  THESIS's whole argument — "density is the argument … no scrolling to find a thing" — does not
  survive.
- **"Keep cream + red" is the one thing that did not move**, and it is load-bearing. The 2026-08-25
  ruling that *the app follows the brand* still holds, so the reference is being taken on Notion's
  register and the brand's ground. Notion-calm surfaces on warm cream with a single red is a blend,
  not a copy, and it is the thing keeping this out of both named ruts.
- **"Airier boxes" was described to the owner as the option closer to Confluence's panels than to
  Notion**, and they picked it alongside naming Notion. Recorded as a blend they chose with that
  stated, not as an inconsistency to be resolved by whoever builds it.

**Assumed, not asked, and flagged here so it can be corrected:** the contract's unbuilt 240px left
rail is now in. "Nav is enough" requires nav to exist, and the rail is already specified in
`DIRECTION.md`'s FIRST VIEWPORT — so this is the contract's own open item being built, not a new
guess. Say so if the rail is not wanted.

**Where it is:** three static candidates of the board screen are being built against
`examples/layout-stress.catalogus.yaml` (all 35 services, real counts, no lorem) — a Notion
*document*, a Notion *grouped database table*, and a Notion *gallery*. The gallery also carries the
warning that a card grid is the named rut. Brand-icon colour rides along as a secondary axis: the
document holds the ink-only line, the other two show full-colour marks, so the owner sees once
whether brand colour costs the red its meaning.

**The shell was added to the candidates mid-flight, at the owner's request**, and it is now part of
what is being judged rather than scaffolding around the board:

> "What I also need is the shell. Header, footer, profile, settings, help, etc. Even if it's mock
> for now, that's gonna help us to get the professional state we're looking for, and help me decide
> the best direction."

So each candidate carries a top bar with a help / settings / profile cluster, a designed profile
menu, settings and help surfaces, and **a real footer — which is how the empty bottom of the screen,
recorded as an open gap since 2026-08-25, finally gets addressed**. Mock content is rendered as
though it were real: no "(mock)" labels, no placeholder greys. The menus are also where the
"sharp structure, soft transients" answer becomes visible, since they are the only surfaces allowed
a radius and a shadow.

Two things about the shell are worth keeping straight, because both are decisions rather than
drawings:

- **No project switcher, and that is the recorded decision rather than an omission.** The owner
  deferred the portfolio page on 2026-08-25 and ruled the viewer stays single-repo. Multi-project
  chrome would reverse that, so it was left out and the owner was told it is one instruction away.
  Phase 7 carries the portfolio and the cross-project blast radius, so the reversal is defensible
  whenever they want it.
- **Settings that change display are not editing affordances; anything touching manifest content
  is.** The read-only constraint still binds, so the mocked settings cover appearance, density,
  brand-icon colour, default view and the manifest path — and nothing that would write.

The shell is designing ahead of the backend on purpose: accounts and sync are Phases 4–5 and
unbuilt. That is the owner's call, made explicitly ("even if it's mock for now"), and it is recorded
here so a later reader does not mistake the mocked profile for a claim that auth exists.

**Mid-flight brief changes were handled by telling the running agents rather than letting them
discover it**, per CLAUDE.md — the addendum was appended to the shared spec and all live agents were
messaged. One of the three died on an API server error mid-response having written nothing, and was
relaunched with the shell in its brief from the start rather than bolted on.

#### The owner has approved the world, on 2026-08-26

**This is the first positive verdict this file has ever recorded**, and it is worth writing plainly
because the two before it were rejections. Shown candidates A and C rendered in a browser, the owner
said: *"Honestly, I love what I see now."*

So the world is settled: **cream ground, one red, Notion register, breathing room, no search, sharp
structure with soft transients, full application shell.** What remains open is *form* — which of the
candidates the board should take — not direction. A later session should treat a change to the world
itself as a reopening that needs its own decision, not as ordinary iteration.

**A fourth candidate was requested in the same breath**, and it is the owner's own idea rather than
one of the three the session proposed: *"a version where we have the icons only, and the name below.
Like StackShare. Then the popover shows when hover."* Candidate D is that — a wall of brand marks
under band headings, with the popover carrying everything the tile cannot.

**D's brief names the trap up front, because the fixture was built to expose it.** `host-api`,
`host-web` and `host-worker` are all Fly.io, and `db-primary` and `db-replica` are both PostgreSQL.
An icon wall labelled with the vendor name renders three identical "Fly.io" tiles and two identical
"PostgreSQL" tiles. What the label under the mark says — id, role, or vendor plus qualifier — is the
load-bearing decision in that candidate, and it was briefed as such rather than left to be
discovered. The same brief carries the two other things an icon-only form makes harder: a
`phasing_out` / `deprecated` / `removed` entry has to be findable **without hovering 35 tiles**, and
in greyscale; and `legacy-ledger`, the one entry with no brand icon, is most exposed in exactly this
form.

#### Rendering the candidates found three defects that no report caught

Every candidate agent reported its own file verified. Each verification was real — counts, tokens,
tag balance — and each was done by **reading the file rather than by rendering it**, because no agent
had a browser it could see. Driving the built pages in a real browser found things all three passes
missed, which is the same split this repo's whole review loop is built on:

- **Candidate A overflowed horizontally at 390px**, on all 35 rows. `.row-deps` takes
  `flex-basis: 100%` at the 640px breakpoint so the counts drop to their own line — but `.row` was
  never given `flex-wrap: wrap`, so instead `.row-main` (which carries `min-width: 0`) collapsed to
  zero and the deps ran 48px past the row. Fixed and re-measured: 375 against 375.
- **Candidate B overflows horizontally at 1024px** — scrollWidth 1398 against a clientWidth of 1009,
  255 elements past the edge. Its agent tested 1440 and 390 and nothing between, which is precisely
  where a seven-column table stops fitting. Returned to that agent with the measurements and the
  constraint that the *table* may scroll but the page body may not.
- **Two candidates invented a CLI version** — `v0.3.0` and `v0.4.0` — where the real one is `0.0.1`.
  Both flagged it as invented, which is the correct reporting, and both were corrected to the real
  number. `0.0.1` looks unfinished in a footer; it is unfinished, and that is a truer thing for the
  owner to be looking at than a confident fake.

**And one suspected defect was not real.** A screenshot appeared to show candidate C's cards clipped
at the right edge; measured through fixed-width iframes at 1440, 1024 and 390 it does not overflow at
any of them, and what looked like clipping was the open profile menu sitting over that corner. Worth
recording alongside the three real ones — the instrument that found the genuine defects also produced
a false positive, and the difference between them was measuring rather than looking.

**All four now measure clean at 1600 / 1440 / 1280 / 1024 / 768 / 390.** B's fix is the scrolling
container rather than dropped columns — the *table* scrolls inside `overflow-x: auto` and the page
body does not, so the shell, the rail and the footer stay put while a wide band is scanned sideways.
Its agent died to an API server error twice, the second time mid-edit; the file was checked for
structural damage (tag and brace balance, closing `</html>`) before being trusted, and the fix had
landed before the crash.

#### Candidate D solved the trap, and corrected the brief that set it

The label carries **two lines: vendor name, then the manifest `id`** — so the three Fly.io tiles read
`host-api` / `host-web` / `host-worker` and the two PostgreSQL tiles read `db-primary` /
`db-replica`. The vendor name honours the owner's literal ask ("the name below") and the id, which is
the only field that actually distinguishes them, sits right under the mark rather than being demoted
to hover.

Non-active status is carried by **two independent non-hue signals** — a worded bordered tag
(`PHASING OUT → auth-users`) plus desaturating the brand mark itself — so it survives greyscale, and
the four dying services are findable without hovering thirty-five tiles. Edge counts sit in a corner
badge on every tile with edges, in muted ink rather than red, which keeps the signal colour spent on
lifecycle alone. `legacy-ledger` renders as a sunken dashed tile with an `AL` monogram and no SVG at
all — the 38% case looking deliberate rather than broken.

**The brief said "the four" dying services and the fixture has five.** `auth-legacy` and `pay-legacy`
phasing out, `db-legacy` and `legacy-ledger` deprecated, `mail-legacy` removed. The agent rendered
five, counted them against the data, and said the brief was wrong rather than matching the number it
had been given — which is the behaviour the brief was asking for everywhere else and got here in the
one place it had not expected to need it.

**One limitation it reported honestly rather than papering over:** it could not get the shared
automation browser to report a native 1440px window — it stayed maximised — so its own 1440 figure
was a CSS-`zoom` simulation rather than a real viewport. That gap was closed independently from the
main session by the fixed-width iframe probe, which measures D clean at all six widths. Worth
recording as the pattern: the agent named the weakness of its instrument instead of letting the
number stand unqualified, which is what made it cheap to close.

**What this will cost when a candidate is picked, so it is priced before it is started:**
`apps/web/docs/DIRECTION.md`, the contract embedded in `apps/web/index.html`, and
`direction-contract.test.ts`'s 49 data-driven tests all move together — the guard pins the contract
word for word in both copies, which is exactly what makes a world change expensive and is the
feature, not the bug. The seed key `ac1ba604` and the challenger name go with the old world; what
replaces them is an owner-named direction rather than a re-roll, since a user pick beats the roll
and this one was picked in an interview.

**Unaffected by any of this, and still open:** the red hex question (`#E60012` in the contract
versus the shipped `#d40010`) survives the world change intact, because the palette answer kept the
red. It is still the owner's call. And the `/impeccable` run's last two steps are still blocked on
the mark.

### The owner has seen the viewer running, on 2026-08-26, and the design is still not it

**Answered — see the section directly above.** Kept because it is the record of what that session
found, and because its list of known gaps is still the best inventory of what the new world has to
solve.

**Read this before starting any design work, and do not start by inferring what is wrong.** The
owner ran `catalogus view` against the 35-service example on 2026-08-26, after the contract-and-
detector session, and their verdict was that the UI is *not yet what they are looking for*. They said
they would come back to it in a fresh session.

**No specifics were captured, and that is deliberate rather than an oversight** — the owner was
ending the session, and an interview conducted while someone is leaving produces answers nobody
means. So the next session's first move is to ask, not to design. In particular:

- **The 2026-08-25 verdict is a different verdict.** That one was "that app still needs more life,
  it's boring. We need a shell, a header, a mark for Catalogus", and the shell and header shipped in
  response to it. Treating this new one as a restatement of that one would be exactly the guess this
  repo's hard rule forbids — the same shape as `init` hardcoding `visibility: private` and being
  right about it.
- **Do not re-roll the direction.** `japanese-high-density-web` is the owner's own pick, seed key
  `ac1ba604`, and a user pick beats the roll permanently. A verdict of "not what I'm looking for" is
  not evidence the world is wrong; the shell complaint in August was not, either.
- **The known gaps are already written down** and any of them could be the answer: the left rail
  FIRST VIEWPORT specifies is unbuilt, the request-path spine renders as a list rather than the
  routed chain the contract asks for, MOST DEPENDED ON is off screen by the owner's own removal, the
  mark draws no glyph, and the bottom of the screen is still empty. The embedded contract's
  disclosure section names all of them, which makes it the right thing to walk the owner through
  when asking what is off.
- **The finish review is still blocked on the mark**, so this design pass does not close the
  `/impeccable` run either way.

### Handoff — 2026-08-26, the design world was replaced and the form was chosen

**Read this first. The two things a fresh session most needs to know are that the design is settled
and that the component work has not started.**

**What is settled, and is not to be reopened without the owner:**

- The **world**: Notion register, warm cream ground, one red `#d40010`, breathing room, no search,
  sharp structure with one declared exception. Approved by interview.
- The **form**: candidate E, the home screen — bare icons on the ground, no card around any service.
  Approved on sight: *"The E home screen direction is approved!"*
- The **app shell**: top bar, help / settings / profile cluster and menus, left rail with the band
  index, view rail, footer. Frozen: *"Your new app shell is perfect, don't touch it."*
- The **red**: `#d40010`, ruled by the owner on 2026-08-26. This closes a question that had been open
  for two sessions. It was decided on a measurement — against the cream ground, `#d40010` is 4.89:1
  (AA) and the old contract's `#E60012` is 4.26:1 (below AA), so the contract's original value no
  longer meets AA on the ground the owner chose. **That is not an explanation of the history**:
  `#d40010` predates the warming, so contrast-on-cream cannot have been the original reason. The
  origin stays unexplained; the ruling closes the question rather than answering it.

**Where the design lives now.** `apps/web/docs/candidates/` — all six mockups, the shared spec they
were built from, the switcher, the mechanical checker, and a `README.md` explaining what each one is
and why E won. **They were committed deliberately**: they are the specification for the component
work, and they were previously in a session-scoped scratchpad that would have been lost. A fresh
session implements E against that directory.

**What was done in this session:** the interview, six candidates, the token layer, and the direction
contract with its guard. **What was not done: any component work.** `apps/web/src/components/` still
renders the old dense world. That is the whole of the next session's job.

#### The next session's work, in the order it should be done

Each of these is its own brief. `CLAUDE.md`'s sizing rule applies hard here — the last time this
repo handed one agent a wide brief it spent 422k tokens doing serially what several agents would have
done in parallel.

1. ✅ (2026-08-31, `e1f7dba`) **The wall** — `ServiceTile`, `BandModule`, `ProjectBoard`. Bare icons on the ground, two-line
   label (vendor name then `id`), corner status badge, desaturated mark and worded status. This is
   the biggest piece and the one the owner will look at first.
2. ✅ structure (2026-09-03), ⬜ menus **The shell** — `AppShell` gains the help / settings / profile
   cluster, their menus, and the footer. Reproduce the approved mockup rather than reinterpreting it;
   the owner has already called this design finished. The top bar, rail, sticky board head and
   footer are built and measured against the mockup at eight widths; the three menus wait on the
   owner's answers (see the 2026-09-03 handoff).
3. ✅ (2026-09-02, `d9001b1`) **The service page** — `ServicePage` in the new world.
4. ✅ (2026-09-02, `d9001b1`) **Graph and Migrations** — both are already citizens of the *old* world as of earlier on
   2026-08-26. They have to move again. Do not skip this: the last time one view moved and the others
   did not, toggling between them changed the app underneath the reader, and that is written up two
   handoffs below as a defect worth avoiding twice.
5. ✅ horizontal (2026-08-31), ✅ vertical (2026-09-02) **The popover's edge behaviour** — a real defect inherited from the mockup, named below.

**A defect to fix rather than inherit.** In `candidate-e-homescreen.html`, hover popovers on icons in
the grid's **edge columns** extend past the viewport between 768 and 1280px. The mockup centres them
with CSS alone and cannot flip at an edge. In React this is an ordinary positioning problem and should
be solved, not carried over. The mockup's author found and reported it rather than letting it ship
quietly, which is why it is written down here.

**Three process notes worth carrying, because each cost something to learn:**

- **Rendering found three defects that reading had not.** Every candidate agent verified its own file
  by reading it — counts, tokens, tag balance — and every one of those checks was real. Driving the
  built pages in a browser still found a 390px overflow in A, a 1024px overflow in B, and two
  invented CLI version numbers. **A file that has been read has not been seen.**
- **The instrument that found them also produced a false positive.** A screenshot appeared to show
  candidate C clipped at the right edge; measured through fixed-width iframes it was clean at every
  width, and the "clipping" was an open menu sitting over that corner. The difference between the
  three real findings and the false one was measuring rather than looking.
- **An ambiguous instruction was misread and only the owner caught it.** *"It doesn't need all that
  shell"* was read as the app chrome; they meant the card around each icon. Both readings were
  plausible, nothing in the process detected the error, and it was caught only because they restated
  it. Where an instruction can be read two ways and the readings produce different work, ask.

#### State of the tree at this handoff

**The new baseline is 1212 tests / 72 files**, confirmed green on consecutive runs at the close of
this session, with `pnpm typecheck` clean across all four packages.

It was **1218 / 72** before this session's changes. The six that went are not a regression and not a
weakening: `direction-contract.test.ts` derives its cases from the contract's own sections, hexes and
declared departures, and it went from 49 to 43 because **`DECLARED_DEPARTURES` is now empty**. The old
contract's six departures existed because the embedded copy was written long after `DIRECTION.md` and
had drifted from it; the new contract and its embedded copy were authored together, so the two are
word-for-word identical and there is nothing to declare. The mechanism is unchanged and still fires
the moment a departure is introduced — there is simply no data in the table today.

Run `pnpm build && pnpm test` **in that order**. A count one or two off is a reason to read that
file's diff, not a failure; a failure anywhere else is.

`apps/web/docs/candidates/` is documentation and mockups only — nothing under it is imported, built,
or tested, so it cannot affect the suite.

### Handoff — 2026-08-26, the contract goes into the page and the detector runs

**Read this first, and then read the four lines under "What is still open" below — the previous
handoff records an instruction being missed twice because each new "read this first" banner buried
it, so this one carries its successor's instruction at the top rather than at the bottom.**

**What is still open, carried forward:** the `/impeccable` run has two steps left — the finish
review and `DESIGN.md` — and **both wait on the mark, which the owner has deferred indefinitely**.
Nothing else in the flow is blocked; nothing else in the flow is left. The condition lifts when the
mark exists or when the owner says the review may proceed over a `BrandMark` that deliberately draws
no glyph. Do not re-enter `/impeccable` expecting to close it before then.

**What happened.** The two steps the owner released on 2026-08-26 are done. The direction contract is
embedded in the markup the app emits, and the mechanical detector has been run over the changed
targets. Baseline confirmed first at **1169 tests / 71 files**; the session ends at **1218 / 72**,
green on consecutive runs, `pnpm typecheck` clean across four packages. One new file, one new guard,
no behaviour change to any component.

**Four validation passes ran, and every one of them paid.** The first found an invented causal claim
and a guard that guarded almost nothing. The second, over the fixes, found four ways past the
rewritten guard — including that the fix for the first pass's worst finding sat in the one region
the guard did not check. The third found four more, two of them pins shadowed by the prose
describing the very attacks they were written for. The fourth found the comment's own preamble,
where a count had already gone stale in the copy a reader of the shipped page sees. All four are
written up below. **Every pass after the first found defects in work that had just been validated**,
which is the argument for re-validating a fix rather than trusting it because it was written in
response to a finding.

**Where it stopped, and why that is a decision rather than exhaustion.** The fourth pass's own
verdict on what is left: the remaining unguarded text is bullet-body prose and design claims, and
*"prose whose truth no test can establish"* is the right description of it. Some of those bullets do
assert facts about code — "tree-shaken out of the bundle", "no webfont", "the signal colour is spent
in three places" — and they will go stale silently. Pinning each to its source is a larger apparatus
than the risk justifies. The page says plainly what the guard cannot do, and review of the diff is
the control.

#### The contract is in the page, and it is checked against the contract

`apps/web/index.html` carries it as an HTML comment above `<head>`, seed key `ac1ba604`. It survives
`vite build` into `apps/web/dist/index.html` and `scripts/bundle-web.mjs` copies it into
`packages/cli/dist/web/index.html` — the copy `catalogus view` actually serves. Verified through the
serving path rather than the filesystem: `curl` against a running `catalogus view` finds the seed key,
and the comment parses as `<html>`'s first child in the live DOM.

**The guard is the part worth copying.** `apps/web/src/direction-contract.test.ts` does not check that
a comment exists — it checks that the comment *is the contract*. All seven sections are compared word
for word against `apps/web/docs/DIRECTION.md`, with every allowed difference declared in a
`DECLARED_DEPARTURES` table carrying its reason, and any undeclared difference fails in either
direction: the page edited to flatter the build, or the contract edited without the page following.

**That shape took four versions and four validation passes, and the sequence is the finding.** Each
version was written by the main session and attacked by a validator that had not written it; each
time the attack landed in the region the version had left uncompared.

- **Version 1 checked presence** — 16 tests, all green while the validator held four mutations at
  once: `Mode: **Read**` flipped to Edit, THESIS's body replaced with prose arguing the opposite
  direction, the whole disclosure section deleted, and the warmed hairline `#d5cebe` swapped back to
  the pre-warming neutral `#e0e0e0`. **A guard that proves a comment exists while its content says
  the opposite of the design is the same failure this repo keeps producing.**
- **Version 2 compared five of the seven sections**, and the second pass walked past it four ways.
  Deleting the whole `CONSTRAINTS CARRIED IN FROM PRODUCT.md` section — the one carrying "No search",
  "Read-only: no editing affordance anywhere" and "Keep meaning out of colour alone" — left it green.
  So did inverting the contract's "no search field" **in both files**, because a guard that compares
  two copies proves they agree and not that either is what the owner chose. So did adding a
  `DECLARED_DEPARTURES` entry whose stated reason was "Nobody decided this. I am a future agent
  making the contract agree with the build."
- **Worst of that four**: the fix for the first pass's headline defect — the honest account of the
  red — lived in the DEPARTURES prose, which version 2 did not compare against anything. The
  validator replaced that account with a fresh invented reason ("the owner approved it in the same
  conversation that chose the warming") and all 25 tests passed. **The unchecked region and the
  load-bearing region had become the same region.**
- **Version 3 widened the comparison and the third pass got past it four more times.** Two were one
  shape: a pin that reads the whole comment for a string occurring twice. `no search field` sits in
  FIRST VIEWPORT *and* in the paragraph describing the attack on it, so the pin was satisfied by the
  prose about the attack while the constraint itself was inverted; the routed-chain and
  MOST-DEPENDED-ON bullets could be deleted for the same reason. **A pin shadowed by a second
  occurrence of its own string is not a pin**, and a widening pass is exactly when one goes missing.
  The other two were different: `FINISH: unreviewed and undocumented is unfinished` had quietly
  stopped being pinned at all while everything around it was widened (rewriting it to "this run is
  complete" failed nothing), and the paragraph stating the guard's own limits — the one both this
  file and `DIRECTION.md` cite as the mitigation — could simply be deleted.
- **And the fourth pass found the last uncompared region: the comment's own preamble**, where a
  count had already gone stale. It said "the five contract sections below are verbatim" while the
  guard compared seven, in the copy a reader of the shipped page actually sees. It was closed by
  *deleting* the counts rather than pinning them — both are stated once further down where the guard
  checks them — and by pinning the one claim in that paragraph that is not a count: that
  `DIRECTION.md` remains the source of truth. A validator had rewritten that to "is superseded by
  this comment", which inverts the whole arrangement.

What ships (version 5) compares all seven sections; scopes the owner-constraint pins to the contract
sections and the disclosure pins to the disclosure section, so neither can be satisfied by prose
about them; pins FINISH, the four load-bearing claims about the red, and the paragraph stating the
guard's own limits; requires every declared departure to appear in the page in the contract's own
words as well as in the table, with the stated count matching the table's length; and carries a
tripwire on claims that the red question is settled while `--color-signal` still is not `#E60012`.
It also pins the preamble's source-of-truth claim while forbidding a count in that paragraph. 49
tests. Measured against all eleven mutations from the earlier passes, applied one at a time with a
rebuild between, and independently re-measured by the validator with its own harness: every one
fails between 1 and 5 tests.

**What it still cannot do is written into the page itself, and that paragraph is now pinned too.** It
proves the two copies agree, not that either is what the owner chose: an edit made carefully across
all three copies passes. And no test can tell whether prose is truthful — the tripwire fires on the
phrasing a hurried writer uses, not on the class. Git history is the only backstop for either, this
repo has no CI, and review of the diff is the control.

#### The defect this pass produced itself, and it is the one CLAUDE.md names

The contract says the utility red is `#E60012`. The shipped `--color-signal` is `#d40010`. The first
draft of the embedded comment explained the difference as part of the 2026-08-25 warming — *"the red
moved with the rest of the ramp for the same reason and is recorded the same way"*. **That sentence
was invented.** `--color-signal` was already `#d40010` at `e92761d`, before the warming commit
`763dba3`, while the ground was still `#ffffff`; `git log --all -S E60012` returns exactly one commit,
the one that rescued `DIRECTION.md`; and that file's warming revision names only the ground and the
ink as superseded.

So the red diverged from the contract at first implementation and nobody wrote down why. It is now
recorded as an open question for the owner in three places — the embedded comment's DEPARTURES
section, `tokens.css` at the declaration itself, and `DIRECTION.md`'s revision — and **the owner's
call is: accept `#d40010` into the contract, or move the token to `#E60012` and recompute its
contrast against the cream ground.**

Worth reading as a process finding rather than a colour one: a plausible reason written where a fact
was missing, placed in the one document a reader would trust, as a comment nothing will ever
contradict. It was produced by the pass whose entire subject was honesty about what the build does,
and it was caught by validation rather than by the person who wrote it — which is the whole argument
for the split.

#### The detector found one thing, and it is not in the app

`detect.mjs` over `apps/web/index.html` and `apps/web/src` returns exactly one anti-pattern:
`side-tab` at `apps/web/src/components/RankModule.module.css:63` — `border-left: 3px solid
var(--color-signal)` on `.selected`. **Nothing was changed for it, because `RankModule` has no caller
at all**: the owner removed the "most depended on" ranking on 2026-08-25, `ProjectBoard.tsx` records
that the component was kept rather than deleted, and it is tree-shaken out of the bundle (`grep -rio
"border-left" apps/web/dist` returns one hit and it is `@xyflow`'s).

A first pass filed this under the four dead selected-state treatments the handoff below records as
the owner's open decision, and that was wrong: those four live in components that *do* render, and
their question is a design one. This is a rule in a component the owner already removed. If the
ranking ever returns, the 3px red side border is a real hit.

Running the detector over the *built* CSS adds nothing — its one hit is a 1px border inside vendored
`@xyflow/react` CSS, read out of minified text.

#### Four contract-vs-build gaps that nobody had written down

Found while making the embedded copy verbatim, and now named in the comment's own disclosure section
so a reader of the shipped page is not left to discover them:

- **The spine is a list, not a routed chain.** FIRST VIEWPORT asks for the request-path band to be
  "drawn as a routed chain rather than a list"; it renders as an ordinary `BandModule`.
- **There is no heavier face for numerals.** OWN-WORLD asks for one; the no-network constraint rules
  out a webfont, so numerals are the system face's tabular figures.
- **The band names are not the contract's.** It names five; `bands.ts` ships seven plus `Unplaced`,
  with the request-path band renamed "Runs in production" by the owner and "Calls out to" /
  "Registered at" having no counterpart in the contract at all.
- **"Red header tabs" is not what the build does.** Header bars are grey-filled; the red lands as the
  underline under the active tab. Across the whole board the signal colour appears in exactly three
  places — that underline, the module header counts, and red-outline tag marks.

#### Two traps this session hit

- **A stale `dist` fails the new guard with a 6.8KB diff that never says "rebuild".** `pnpm build &&
  pnpm test` is the verify command *in that order* for a reason, and there is no CI to enforce it —
  there is no `.github` directory in this repo at all. The byte-identical assertion now carries a
  failure message naming the likely cause instead of printing both copies.
- **Do not fence a file to a validator and then edit it.** The main session edited
  `apps/web/index.html` mid-flight while the validator was mutating it, which is precisely what
  CLAUDE.md's "parallel agents must not share files" rule exists to prevent. It was recoverable only
  because the validator was told immediately; a validator that discovers the change as a diff writes
  a confident report about a version that no longer exists.

### Handoff — 2026-08-26, the graph and the migrations board join the world

**Read this first.** It closes the last open item that needed no decision from the owner, and it
leaves three that do.

**What happened.** On 2026-08-25 the board was rebuilt into the `japanese-high-density-web` world
and the other two views were not, so toggling List → Graph or List → Migrations changed the app
underneath the reader: rounded tiles, a colour-only status ring, solid pills on every row. Both are
now citizens of the same world, `StatusPill` is deleted, and **`tokens.css`'s legacy alias block is
gone** — which is the completion test that block's own header set for itself: "deleting the last of
them is how this migration is known to be finished."

Baseline confirmed first at **1125 tests / 70 files** on a clean tree; the session ends at
**1169 / 71**, green on five consecutive runs, `pnpm typecheck` clean across four packages.

#### What is different on screen

- **The graph node lost its status ring.** It was colour-only, with one rule per status
  *including* `active` — a pre-rewrite leftover. Status is now the board tile's own 3px top bar, so
  a 35-service manifest shows **five** marks rather than thirty-five, and the four departures are
  the only marked things on the canvas. Selection and the incident-edge cue moved to ink: red is
  spent on departures in the data, not on where the cursor happens to be.
- **The migrations board became two modules**, hairline-boxed with filled header bars and counts in
  the signal colour, and it renders the design contract's own idiom for a lifecycle swap — struck
  old name, replacement in signal red for `phasing_out`, plain ink for `deprecated`. Per-row status
  marks went, because every row in a section already has the status its heading names.
- **`StatusPill` is deleted**, and this is the change with the widest reach. It marked `active` on
  31 entries in 35, and on the service page it pinned a solid red PHASING OUT block to the header's
  far edge — on a wide window, half a screen from the service it described. `service-tags.ts` and
  `Tag` are now the only status vocabulary in the app; on the page the marks sit under the name,
  and they bring recency and `kind` with them, which the pill could not say at all.

#### Two defects that a green suite could never have shown

- **A guard that guarded nothing, for the second time in this file's history.** `Tag` looked its
  tone class up with `Object.prototype.hasOwnProperty.call(styles, tone)`. Measured directly rather
  than argued: under this repo's vitest CSS-modules handling `styles["ink-solid"]` returns a class
  string, `styles["not-a-real-class"]` returns one just as happily, `hasOwnProperty` answers
  **false** for both, and `Object.keys` reports **0**. So every `Tag` in every test rendered with
  **no tone class**, and no test could notice, because none asserted one. Both `Tag` and
  `ServiceNode` use a `Map` now, and the missing assertion exists. `Tag.tsx`'s header carries the
  measurement, having absorbed the account that lived in the deleted `StatusPill.tsx`.
- **A dead-token guard that covered two stylesheets out of twenty-one.** Deleting the alias block
  means a stylesheet still naming `--color-accent` gets nothing — no error, no failing test, and in
  a screenshot it looks like a design choice. `apps/web/src/token-references.test.ts` now discovers
  every `*.module.css` and derives the forbidden set from `tokens.css`'s own declarations, so it
  catches the whole class rather than these nine names. The reproduction that motivated it —
  reintroducing `--color-surface-raised` into a stylesheet and watching the suite stay green — now
  fails red naming the file and the token.

#### What the validation pass found, and why it was worth its cost

A separate agent on the strongest model, which wrote none of the code, reproduced every claim by
execution and returned **seven defects**. Six are fixed. The three test defects are the ones worth
copying, because all three are the same shape this project keeps producing:

- Deleting `${isSelected ? styles.selected : ""}` from `ServiceNode` left the suite green. The
  `describe` block that looked like it covered this reads the *stylesheet file* and asserts the
  rule's text — it would stay green if the class never reached an element.
- Removing `kind: "service"` from `ServiceNode`'s `tagsFor` call left it green too, and its
  consequence is invisible twice over: an active `component` node grows a status bar whose tone
  class does not exist in that stylesheet, so it paints a **transparent** 3px bar. A screenshot
  would not have caught it either.
- The migrations board dropped the status *word* along with the pill, which is right for a sighted
  reader who keeps the heading in view and wrong for the common screen-reader mode of tabbing
  button to button: "phasing out" appeared nowhere on the board — not in a row's name, its
  description, or its heading. Rows carry it in the accessible name now
  (`"Auth0, auth-legacy, phasing out"`) while the board stays wordless, which is what
  `ServiceTile` already did.

The layout defect it confirmed is a good argument for reading a copied rule in its new context:
`MigrationList` inherited `align-self: start` from `BandModule`, where it sits in a multi-column
container and does nothing. In a flex *column* it becomes live on the horizontal axis, and the two
sections rendered **297px and 358px wide on a 2514px viewport**, stacked and ragged. They tile side
by side at 812/812 now, and collapse to one column below 640px.

#### Three things left open, and each is the owner's

1. **Four selected-state treatments are dead code in the shipped app.** `App.tsx` renders
   `selectedService ? <ServicePage/> : <board|graph|migrations>`, and `selectedId` comes from the
   same hash that produces `selectedService` — so a selected node is never on screen while the view
   that draws it is. `ServiceNode`'s `.selected`, `GraphCanvas`'s `.edgeIncident`,
   `MigrationList`'s `[aria-pressed="true"]` and `ServiceTile`'s `.selected` are all unreachable,
   confirmed by driving the app with both real and bogus hashes. This dates from the 2026-08-25
   "the page replaces the board" decision and is not a regression, but it means two agents spent
   part of this session restyling states nobody can see. **Whether a view should keep showing where
   you came from is a design decision, not a cleanup**, so nothing was deleted.
2. **Status is absent from the graph view entirely, for a screen reader.** The node's mark is
   colour-only by design and always was — the ring it replaced had no text either. The board tile
   solves the same problem in its `aria-label`, so the fix is cheap; whether the graph should say
   it is a judgement about how much a canvas should narrate.
3. **`.kind-stack`'s cue is invisible.** It is a 2px corner-radius delta against a 2px default,
   which at node size reads as nothing, where `.kind-component`'s dashed border reads immediately.
   `data-kind` and the visually-hidden text carry the fact regardless, so nothing is lost — but the
   shape cue is not one.

#### The `/impeccable` run is still open, and this pointer has now been missed twice

**Do not read this handoff and stop.** Two handoffs below, the 2026-08-25 redesign section carries
a heading that says *"The next session must re-enter `/impeccable`, and this is its state"*, and
`apps/web/docs/DIRECTION.md` is the contract it names. **Two sessions have since run without
doing so** — the brand interview and this one — because each new handoff was written at the top
saying "read this first" and neither carried the instruction forward. That is the failure mode, not
an oversight by either session: an instruction that only exists below three "read this first"
banners is an instruction that does not get read.

Four required steps of that flow have never run: the contract is not embedded in the emitted
markup, the finish review has not happened, `DESIGN.md` does not exist, and the mechanical detector
has not been run over the changed targets.

**One condition governs whether it can close, and it is the owner's to lift.** `DIRECTION.md`'s
2026-08-25 revision says the finish review *should still wait, because the mark is not in yet* —
and the mark is deferred indefinitely by the owner ("the logo is something I need to think on my
time"). So the run cannot close on its own terms until either the mark exists or the owner says the
review may proceed over a `BrandMark` that deliberately draws no glyph. **The rest of the flow does
not wait on that**: embedding the contract in the markup and running the mechanical detector are
both unblocked today, and the design they would review is no longer the one the owner rejected —
the shell and header shipped, and the graph and migrations views have since joined the world.

**Decided by the owner on 2026-08-26, when this was put to them directly: run the two unblocked
steps, and leave the other two waiting.** So the next session embeds the contract in the emitted
markup (an HTML comment surviving the production build, greppable by seed key `ac1ba604`) and runs
the mechanical detector over the changed targets. It does **not** run the finish review and does
**not** write `DESIGN.md`: the documenter writes that from the *built* world, and a world whose
identity is a labelled placeholder is not that world yet. The condition stands until the mark
exists or the owner lifts it — and the two options that were declined are recorded here rather than
omitted, because "closed the run over the placeholder" and "left it entirely" were both live and a
later reader should see they were weighed rather than missed.

**Both released steps ran on 2026-08-26 and are closed** — see the handoff above this one. The
contract is in `apps/web/index.html` and in both build outputs, guarded word-for-word against
`DIRECTION.md`; the detector returned one finding, in a component the owner had already removed.
The finish review and `DESIGN.md` are still waiting on the mark, and that is the only part of this
run left.

#### Two traps worth carrying forward

- **`catalogus view` reads `index.html` once at startup**, and the bundle is content-hashed, so a
  `pnpm build` under a running server leaves the cached shell pointing at filenames the build
  deleted. The symptom is a **blank page and a 404**, not the older-looking page "stale shell"
  suggests. Two people read it as "my change did not take effect" on the same day. `view.ts` says
  so at the call site now.
- **The repaint trap has a second form.** This file already records that a DOM query in an
  automated browser is not evidence until something forces a paint. It applies to
  `getComputedStyle` too: the validator's first read of the selection cue returned a zeroed
  transparent shadow, because it caught a transition at t=0.

### Handoff — 2026-08-25, the brand interview and the shell

**Read this before the redesign handoff below it.** It does not supersede that
document, but it settles three things that document left open and it reverses
one decision that document committed to.

**Baseline confirmed first:** 1131 tests / 69 files green, `pnpm typecheck`
clean across four packages, on `main` at the `phase-3.7-close` merge. Ended at
**1138 / 71**.

#### The brand interview, and what it settled

The owner asked to be interviewed rather than shown candidates, and to be handed
image-generation prompts to run themselves. Two rounds of questions, three
rounds of generated candidates. What is now decided:

- **Register: instrument, then documentation.** The first brief was "precision
  instrument, monochrome, needs a beat" and produced three minimalist marks the
  owner rejected as **"too simple"**. The second brief added density -- engraved
  technical plates with dimension lines -- and produced a theodolite the owner
  did not connect with either. The reference images the owner then sent settled
  it: an open book with lines fanning from the spine, a coffee cup, warm cream
  grounds, uniform friendly line work.
- **The diagnosis was wrong for two whole rounds, and this is the useful part.**
  "Too simple" was read as "not enough elements", and it was not: the owner's own
  references are *simpler* than the marks that were rejected -- one of them is
  four shapes. What was missing was **warmth and recognisability**, not
  complexity. Two rounds of adding density were spent solving the wrong problem.
- **Form: symbol + wordmark lockup**, primary mark plus a derived reduced
  variant for the 16px favicon and the CLI. Constraining the primary by the
  favicon case is what produced the first rejected set.
- **Subject: reference 1's fanning document.** An open document with lines
  radiating from the spine -- a page that fans into what it connects to, which
  is a page plus a topology, which is what Catalogus is. The owner accepted that
  this **reverses their own earlier anti-pattern ruling** against book imagery;
  the reversal was surfaced and asked about rather than taken silently.
- **"Dev's world" means dev *feeling*, not dev iconography.** No terminals, no
  braces, no angle brackets. Confirmed explicitly.
- **The mark is deferred by the owner**, explicitly: "the logo is something I
  need to think on my time." Nothing shipped. `BrandMark` renders the wordmark
  alone and declares itself a placeholder in the DOM.

#### Three logo directions, none chosen, and what each one taught

Recorded because each narrowed the brief and re-running them costs a day.
`PRODUCT.md`'s Brand Commitments carries the durable version.

1. **Abstract precision instruments.** Rejected as "too simple", then rejected
   again after two rounds of *adding density*. **That was my misdiagnosis and it
   cost two rounds:** "too simple" did not mean "too few elements" -- the owner's
   own references are simpler than the marks they rejected. The missing thing was
   warmth.
2. **Coffee and catalog** -- a cup holding a short list, drawn from the owner's
   references. Direction liked, execution judged "not unique", and correctly: an
   outlined cup with rules in it is near-stock. Pushing for distinctiveness (the
   list forming the cup wall; a rule that becomes the handle) traded 16px
   legibility for it every time.
3. **The board's own tiles**, the owner's idea -- "this is our distinct mark".
   Strongest of the three, because the mosaic is a shape the product already
   owns. Converged on two module bars and a tile arranged as a **C** -- the app's
   grammar forming the initial, holding to 16px. Deferred with the rest.

**A finished candidate was deleted rather than parked.** The cup had been drawn
as hand-authored SVG, given nine tests, a reduced 16px variant, a favicon and a
drift test binding the two, and was wired into the header. All of it came out on
the deferral. Keeping it "for now" is how a mark nobody chose becomes the mark.

**Two defects from that work are worth carrying even though the code is gone**,
because both are about method rather than about a logo:

- **A favicon that served HTTP 200 and never rendered.** The comment block in
  the SVG contained `--`, which is illegal inside an XML comment, and an SVG
  referenced from an `img` element is parsed as XML rather than sniffed as HTML.
  Nothing upstream complained. **The drift test did not catch it** -- it pulled
  attributes out with a regex, which is perfectly happy to read a document no
  parser would accept. Only rendering it in a browser found it.
- **Geometry that passed every test and looked wrong.** A 2.2-unit pitch against
  a 1.6-unit stroke leaves a 0.6 gap, so the interior filled in and the mark read
  as a blob below 32px. Green suite, wrong drawing. Rendering at 16/24/48/96 was
  the only thing that could have caught it.

Both are the same lesson this file keeps relearning in different clothes: a test
proves the thing you asserted, not the thing you wanted.

#### The decision that changes the app, not just the logo

**The app follows the brand.** Asked directly whether the brand should follow
the committed `japanese-high-density-web` world (bright white, ink, one utility
red) or the app should follow the warm cream of the references, the owner chose
the app. `tokens.css` is warmed: ground `#f4f1ea`, ink `#24211c`, and every grey
in the ramp carries the same warmth rather than being a neutral grey over a warm
ground -- which is the difference between warm and dirty.

**This revises a direction the owner had pinned**, so it is recorded as a
revision with its reasoning rather than as a colour edit. Nothing structural
moved: one signal colour, the same hairline mosaic, zero rounding, the same type
scale. Every pair was computed, not eyeballed, and the numbers are in
`tokens.css`'s header -- including the one that **does not pass**: `--color-text-faint`
is 3.8:1, up from 3.1:1 before the warming. Improved, not fixed, and stated as
such, because raising it to AA collapses it into `--color-text-muted` and that
trade is the owner's.

#### What shipped

- **`AppShell` + `BrandMark`** -- the app chrome that did not exist, carrying
  the wordmark and no glyph. 7 tests,
  each proved by mutation (drop the placeholder attribute, swap the lockup
  order, render the path unconditionally, pull children inside the banner --
  all four caught, all four reverted).
- **The band rename**, `serves` -> `production` / "Runs in production".
- **`docs/HANDOFF.md` §6**, transcribed from the binary rather than rewritten
  from intention.
- **The dead panel removed** -- `ServiceDetailPanel` and `EdgesList`, with their
  stylesheets and 13 tests. See open item 4 below for what was checked first and
  what was deliberately left.
- **A defect the shell introduced and a screenshot caught.** Making `.shell` a
  column flex container meant `.page`'s `margin: 0 auto` absorbed the free space
  instead of centring a full-width item, so `<main>` shrank to its content width
  and thirty-five services rendered as **a single 300px column down the middle
  of the screen**. Nothing errored. No test failed. It looked like a design
  decision. Recorded in `AppShell.module.css` because the next person to reach
  for flex there will reintroduce it.

#### Mobile: measured for the first time, and it is not what this file assumed

The redesign handoff below predicted mobile would collapse into "a very long
single stack of band modules -- the scrolling index the whole redesign exists to
replace". **Measured, that is mostly wrong.** At 388 CSS px:

- **No horizontal overflow anywhere** -- board or service page.
- The board is 1801px tall, about 2.1 screens. Band modules stack one per row,
  but tiles still tile four-across *inside* each band, so it reads as a sequence
  of band cards rather than as a 35-item list.
- The service page stacks cleanly and is readable.
- The shell bar drops the manifest path at ≤640px, as designed.

**Two caveats, and they matter more than the findings.** First, this was
measured in a **same-origin 390px iframe, not on a device and not in device
emulation** -- the CSS viewport is real, the touch input and mobile UA are not.
The popover's touch story is still unverified. Second, **every "1440px"
screenshot in the handoff below is wrong about its own width**: `resize_window`
reports success against a maximised Chrome window and silently does nothing, so
those captures were ~2514 CSS px. That is worth knowing before trusting any
width claim in this file.

### Handoff — 2026-08-25, the viewer redesign

**Read this one first.** It supersedes the two handoffs below it wherever they
disagree, and it changes what the product is understood to be, not just how it
looks.

**Start here:** `PRODUCT.md` at the repo root is new and is the record of what
the owner said this product is. It is subordinate to `docs/HANDOFF.md` and says
so. Read it before touching the viewer, because the redesign below is
downstream of it.

#### What happened

The owner ran `catalogus view` against the real Clapline manifest — **the first
time anyone has run this viewer against real data**, after three handoffs said
it had not happened — and judged it "too poor and generic", naming Confluence
and Notion as the bar. Everything else in this session followed from that.

#### What the interview changed about the product

Four things, all the owner's, all recorded in `PRODUCT.md` and amended into
`docs/HANDOFF.md`'s own log:

1. **The manifest is a skeleton; the page is the product.** What the owner wants
   to keep is the operational knowledge attached to an entry — the example given
   was a Stripe tax-registration table specific to their business — and that is a
   *page*, not a field. This is why a detail panel sized for fields always felt
   thin.
2. **Pages are Layer 3, edited in the browser.** Committed direction. It
   **un-defers Phase 4**, the viewer stops working offline, and a page acquires
   two writers. All three costs were named and accepted.
3. **The capture loop is the product.** Mid-session, an agent explains something
   and the owner says *"catalogus that please"*. Filing must cost nothing, which
   it can, because Catalogus already knows the project, the service and the
   topology. **The agent captures, the browser curates.**
4. **The manifest is authoritative for coding agents too.** "Change something in
   Supabase" becomes one file read instead of a repo-wide grep — and agents are
   obliged to keep it current, which nothing currently insists on. Both halves
   are unbuilt.

#### The viewer, rebuilt

The direction was chosen through the `impeccable` skill's roll: the assigned
grounded direction was a shipping-manifest world, and the **owner picked a
challenger — a Japanese high-density module mosaic** — which beats the roll.
Seed key `ac1ba604`. The full contract is in the scratchpad's
`direction-contract.md`; its substance is reproduced in the component headers,
which is where it will actually be read.

What is on screen now, against the real 36-service manifest:

- **Architecture bands, not an alphabet.** `apps/web/src/bands.ts`. At most eight
  bands in a fixed reading order. **Bands key on `rollup`, never on the full
  `role`**, so the grouping stays mechanical; that file records what this
  deliberately gets wrong and why the alternative is worse.
- **One tile per vendor, collapsed per band.** Four Fly.io entries were saying
  "Fly.io" four times. Collapsing is never global — Supabase is `auth` in one
  band and `database` in another.
- **Tiles are an icon and a name**, floating, after StackShare.
- **Hover shows the detail panel; click opens the page.** The panel's body is
  `ServiceSummary`, shared so the facts have one implementation.
- **One signal colour.** `active` earns no tag at all.
- **Light is the committed design**, dark derived from it, with a `data-theme`
  seam so the light palette can actually be viewed on a dark-set machine.

#### What the redesign found that no test could

- **A defect in the owner's own manifest.** `fly-prometheus` was `service: fly-io`
  — the Fly app was standing in for Prometheus itself, so Fly.io appeared under
  "Watched by" claiming to be a metrics service. The alphabetical list hid it;
  architecture grouping made it obvious. Fixed in the Clapline repo with the
  owner's approval, matching how Grafana and Loki were already modelled.
- **No `unlink` command existed.** `link` adds an edge, `remove` deletes a service
  and all its edges, and nothing removed a single edge — a manifest state the CLI
  could not reach, which is a hole in the "CLI is the only writer" guarantee.
  Built this session.
- **The catalog cannot name four services in a real project.** `grafana`, `loki`,
  `prometheus` and `healthchecks-io` render as raw slugs with generic glyphs.
  Being fixed this session.

#### Decisions taken, so they are not re-litigated

- **The portfolio page stays deferred**; the viewer stays single-repo. Its three
  open questions are recorded as *open*, not rejected, in its checkbox.
- **`catalogus view` is not being removed** and the webapp is not being moved into
  this repo. The owner proposed both; the reasons against are that `view` is the
  product's entry point and works offline in any checkout, and that copying the
  real Clapline manifest into this public repo would publish a private project's
  whole topology — which `CLAUDE.md` explicitly forbids. The dev loop already
  exists: `vite dev` proxies `/api` to a running `catalogus view` on 4180.
- **The "most depended on" ranking was removed**, by the owner: "we should first
  work on the catalog before start judging." `RankModule` and `mostDependedOn`
  are kept, tested and callerless. The hierarchy problem they solve is real and
  returns once the catalog is worth judging on.
- **Icons: monochrome on the board, colour in the popover and page.** Agreed. The
  reasoning against colouring the board is measured, not aesthetic: 60 of 159
  catalog slugs have no brand icon, so a coloured board splits into real logos
  and grey holes and makes 40% of a correct render look broken.

#### The redesign is NOT done, and this is the owner's verdict on it

**"That app still needs more life, it's boring. We need a shell, a header, a
mark for Catalogus."** Owner, 2026-08-25, on seeing the finished board, popover
and page. Do not read the commits below as a completed redesign.

What that means concretely, because "boring" is not a brief:

- **There is no app chrome at all.** No product identity, no shell, no global
  header, nothing that says this is Catalogus rather than a bare document on a
  white page. Notion and Confluence -- the owner's stated bar -- both have one,
  and this has none. The viewer currently renders straight into `<main>`.
- **There is no mark.** `docs/HANDOFF.md` §2 records this as genuinely open:
  the previous logo was a pun on a dropped name and does not carry over, and
  **nothing has been chosen to replace it.** So a shell needs a brand decision
  first, or a deliberately typographic placeholder that is labelled as one. Do
  not invent a logo and let it harden into the real one by default.
- **The board has a lot of dead space.** The whole project fits the top third
  of a 1440x800 screen, which is what "it should fit" asked for, and the
  remaining two-thirds is empty. That is the space a shell and whatever else
  earns a place would occupy.
- **Mobile is bad, and the owner has seen it.** Stated directly on 2026-08-25.
  Treat that as the finding, not as something to re-derive: **nobody on the
  building side ever looked**. Every screenshot this session was desktop at
  1440-1500px, and the board's single-column breakpoint at 640px was written
  and never rendered. First-hand feedback outranks anything in this file, and
  this is the second time that rule has earned its place in one session.

  What is most likely wrong, as leads rather than as claims: the mosaic is a
  `column-width` multi-column field that collapses to one column, so on a phone
  it becomes a very long single stack of band modules -- which is the scrolling
  index the whole redesign exists to replace. The service page's two columns
  stack at 860px. And the hover popover has no mobile story at all beyond "touch
  devices skip it and go straight to the page", which is a degradation nobody
  has watched happen on a real device.

This is the **first thing to pick up in a fresh session**, ahead of everything
in the list below.

#### The next session must re-enter `/impeccable`, and this is its state

**Yes, run it again.** The design work is not finished (the box above) *and* the
flow itself was left mid-run. `apps/web/docs/DIRECTION.md` is the contract --
rescued out of a session-scoped scratchpad and committed precisely so the seed
key and the world's grammar survive this session. **Read it before designing
anything**, and read the run-status note at its foot before assuming what is
left.

The short version:

- **`init` will not re-run**, and should not. `PRODUCT.md` exists and
  `context.mjs` resolves it.
- **The direction is settled**: the owner chose the challenger
  `japanese-high-density-web` over the assigned grounded direction, and a
  user-pinned choice beats the roll permanently. Seed key `ac1ba604`. Do not
  re-roll it because the result is "boring" -- the owner's complaint is about
  the app having no shell and no identity, not about the world.
- **Three required steps never ran**: the contract is not embedded in the built
  markup, the finish review has not happened, and `DESIGN.md` does not exist.
  **No mobile screenshot has ever been taken of this redesign** -- every capture
  this session was desktop at 1440-1500px. The owner has since looked and
  reported that mobile is bad, so this is a known defect rather than an unknown;
  see the box above.
- **Order matters**: do the shell work first, then close the run over the
  result. Running the finish review now would review a design the owner has
  already rejected.

#### Open, and what to do about each

0. **The shell, the header and the mark** -- ✅ **shell and header shipped**
   2026-08-25; the mark is still open and the dead space is untouched.
   `AppShell` + `BrandMark` render a full-bleed sticky bar carrying the product
   identity, and the absolute manifest path moved into it out of the masthead's
   foot (chrome carries the session, the document carries the project).
   **`BrandMark` deliberately draws no glyph** and says so in the DOM via
   `data-mark="placeholder"`, with a test pinning that -- the brand interview
   ran on 2026-08-25 and the mark is being generated from its brief, and an
   invented stand-in is exactly the plausible default that hardens into the
   real thing. What is still open here: the mark itself, and the bottom
   two-thirds of the screen.
1. ~~**Is "Serves requests" the right band label?**~~ ✅ **closed 2026-08-25 by
   owner decision: renamed to "Runs in production".** True of everything
   `hosting-*`, `ingress`, `cdn` and `auth` -- the tier that is deployed and
   reachable, whether or not it serves user traffic. The band *id* was renamed
   `serves` -> `production` in the same pass so the code and the label agree,
   and `bands.ts` carries why. The per-service exception stayed ruled out.
2. ~~**The service page does not exist.**~~ ✅ **it does** -- `ServicePage`
   shipped in `f2b9044`, "a service is a page, and clicking one opens it", and
   the panel this item says a click opens was deleted a commit later. **Both
   sentences were already false when this list was written**, which is the
   familiar shape: the item was drafted before the work and never re-read
   after it. Corrected 2026-08-26 rather than deleted, because the half that
   is still true is the important half -- the page ships a *shell* and an
   empty state, its **content model is still an open question in `PRODUCT.md`,
   and it must not be invented.** `ServicePage.tsx`'s header says the same
   thing to anyone about to fill it in.

   One real gap went with it, and it was closed later the same day:
   `ServicePage` had **no test file of its own** -- `App.test.tsx`'s routing
   assertions and `ServiceSummary.test.tsx`'s facts column covered everything
   except the page's own chrome, so the breadcrumb, the uncatalogued line and
   the Layer 3 empty state were asserted by nobody. `ServicePage.test.tsx`
   now covers exactly those, and the validation pass killed all eight of its
   assertions with eight separate mutations.

   *(The two sentences above were written in the past tense on 2026-08-26,
   hours after the present-tense version of them stopped being true. The
   validator caught it. Recording it because this is the third correction on
   this one item today, and the pattern is always the same: a note written
   about work that is about to happen, and never re-read once it has.)*
3. ~~**Graph and Migrations views still wear the old world.**~~ ✅ **closed
   2026-08-26.** Both rebuilt in the world's own grammar, `StatusPill` deleted
   with the last of the old vocabulary, and the completion test met on its own
   terms: `tokens.css`'s legacy alias block is empty and gone, which its
   header named as how this migration would be known to be finished. Verified
   in a real browser against the stress fixture, not only by the suite, and
   audited by a validator that wrote none of it -- seven defects, six fixed.
   The full account is in this session's handoff at the top of this file,
   including **three things it deliberately did not decide**, of which the
   first matters most: four selected-state treatments are unreachable in the
   shipped app, because the service page replaces the view rather than sitting
   beside it.
4. ~~**`ServiceDetailPanel` is dead code.**~~ ✅ **deleted 2026-08-25**, with its
   stylesheet and its 13 tests, after confirming nothing unique went with them:
   the panel's content assertions are all covered by `ServiceSummary.test.tsx`
   (the body was lifted out of it), its chrome by `App.test.tsx`, and the
   uncatalogued marker by `ServiceNode.test.tsx`. **`EdgesList` went too** --
   callerless, untested, and the panel was the last thing that had ever
   rendered it. `App.test.tsx`'s "no view renders a flat text edge list" test
   was kept and reframed: it is a statement about the design rather than about
   the component, so it should still fail if someone reintroduces one.

   **Two things deliberately left, and neither is an oversight.**
   `RankModule` / `mostDependedOn` are callerless *by owner decision* -- "we
   should first work on the catalog before start judging" -- so they are kept,
   not dead. And `ServiceList` + `ServiceGroup` **are** dead (nothing but their
   own tests imports them), but deleting them orphans `rollupLabel` and
   `groupByRollup`, and `rollup-labels.ts` is named in `PRODUCT.md` as where
   display labels live. That makes it a documented product fact rather than a
   cleanup, so it is the owner's call.
5. ~~**`docs/HANDOFF.md` §6's command list is stale**~~ ✅ **closed 2026-08-25.**
   It was worse than recorded: seven shipped commands missing (`set`, `link`,
   `unlink`, `deprecate`, `remove`, `rename`, `view`) and four listed that do
   not exist. Now transcribed from `catalogus --help` and split into built and
   specified-not-built, with an amendment-log entry. **One thing deliberately
   left:** §5's heading and §9 decision 3 still say `stack.yaml`. That is not
   the same defect -- decision 3 records the filename as *open with a leaning*,
   and what shipped is that leaning, so closing it is the owner's call rather
   than a transcription. Named in the amendment entry so it is not mistaken for
   an oversight twice.
6. **Two writers on one page**, and **what a page is made of** — both recorded as
   open in `PRODUCT.md`, neither blocking the redesign.

#### What the three parallel agents delivered, with their verification

All three reported numbers they observed rather than assumed, and each verified
its own tests by mutation. Worth reading their patterns, not just their output.

- **`catalogus unlink <from> <to> [path]`** -- the mirror of `link`, removing one
  edge without touching either entry. 11 tests; six mutations each caught by a
  named test and reverted; the real binary driven against scratch manifests with
  observed exit codes per scenario, including the object-form edge carrying
  `notes` (reported as discarded rather than dropped silently) and a stranded
  header comment (left in place, reported). Judgement calls it had to make are
  listed in its report: a no-op removal exits 0, mirroring `link`'s duplicate-add.
- **The catalog gap** -- 47 distinct slugs audited across both examples and the
  real manifest; exactly four missing. `grafana` and `prometheus` gained verified
  icons; `loki` and `healthchecks-io` genuinely have no simple-icons entry and
  correctly carry **no icon field** rather than a guess. `resolveIcon` now returns
  the brand hex: all 3,453 installed simple-icons records carry one, and 120 of
  the catalog's 120 iconned rows resolve it -- both measured against the built
  dist. Its hex test pins Stripe's known `#635BFF` rather than a format regex,
  and it proved that choice by mutating in a `#000000` fallback a regex would
  have passed. **112 tests in `packages/core` over five runs.**
- **The viewer test rewrite** -- `App.test.tsx` rewritten and ten new test files.
  Around 25 mutations run and reverted across `bands.ts`, `service-tags.ts`,
  `ServiceTile`, `App.tsx` and the module components. **It found two real source
  defects and refused to fix them**, encoding each as `it.fails` so the suite
  stayed honest rather than green-by-omission — both were mine, both are fixed
  now, and the fix was verified by re-mutating (removing the slug lookup turns
  both tests red on exactly the behaviour they name).

  **The most valuable thing it reported was a test of its own that asserted
  nothing.** Its `Tag.test.tsx` prototype-pollution guard was inert: vitest's
  CSS-modules handling fabricates a string for *any* key including `toString`,
  so the assertion passed against source with the guard deleted. It probed this
  rather than assuming it, and traced the same flaw to the **pre-existing
  `StatusPill.test.tsx`**, which it did not own. Both are fixed by mocking the
  stylesheet to a real `{}`, and both were then mutated to prove they now catch
  the defect. That matters beyond the two files: this repo's header comments
  claim the prototype defect class is closed, and one of the guards backing that
  claim could not have caught it.

**Verified by the main session, not taken on trust:** `pnpm test` at **1131
tests / 69 files, green on five consecutive full runs**, `pnpm typecheck` clean
across all four packages, and the tree confirmed test-files-only from the agent.

**One number in this file is now stale** and the catalog agent flagged it rather
than editing a file it did not own: the "60 of 159 slugs have no icon" figure in
"The icon fallback is the majority path" is off by the two icons just added.
The *argument* it supports is unchanged and was re-measured against the real
manifest during the colour decision: 25 of 36 services resolve a mark and 11 do
not.

#### How this session was run, and what to copy

Three subagents in parallel, each with an explicit list of the files the others
were touching, per `CLAUDE.md`. That worked — no collisions — and the two
mid-flight source changes I made were messaged to the affected agent rather than
discovered by it. **Copy that.** What also worked: verifying interaction in a
real browser rather than through synthetic events. An early reading of "the
popover never closes" was an artifact of React deriving `onPointerEnter` from
delegated `pointerover`, which a non-bubbling synthetic event never reaches.

### Handoff — 2026-08-25, closing Phase 3.7

**What happened.** No code. Phase 3.7's last open box was put to the owner and deferred, and this
document was corrected where it had gone stale. Baseline confirmed first: **1001 tests / 58 files
on three consecutive runs**, `pnpm typecheck` clean across four packages, on `main` at the
`viewer-small-defects` merge.

**The decision.** Three questions were open on the portfolio page and all three were the owner's —
the transport for a multi-repo viewer, whether to onboard real repos first, and whether the
portfolio is a fourth toggle mode or its own route. The answer was to defer: **the viewer stays
single-repo for now.** The portfolio checkbox carries the full text of what was asked, because the
three options are *unanswered*, not rejected, and the next person should not read the deferral as a
decision against any of them.

**The document was wrong about the one fact the whole phase was planned around.** `docs/PLAN.md`
said, with a direct-check date on it, that `C:/Workspace/repos/Clapline/catalogus.yaml` did not
exist. **It exists — 35 services, 41 edges, `catalogus validate` clean.** Nothing recorded it
coming back, exactly as nothing recorded it going. The 2026-08-24 paragraph is left unedited with a
dated correction above it, because it is the reason `examples/layout-stress.catalogus.yaml` was
written and deleting it would delete the reasoning.

**What that changes is smaller than it sounds, and one thing it does not change.** It is one
project out of nineteen directories, so the portfolio blocker is untouched. What it does do is make
the owner's run possible for the first time: three consecutive handoffs have said the owner would
run `catalogus view` against a real repo and that nothing in this file reflected such a run. The
manifest for that run now exists. **It still has not happened**, and it remains the highest-value
next action in the phase — every browser-based claim in this file is against synthetic fixtures.

**§4.2 is two of six and now says so per query.** The acceptance line had been a single unticked
checkbox, which reads the same whether one query is missing or five. Written out, it is: query 1
answered; query 4 answered for nodes and *not expressible* for edges, because Layer 2 gives an edge
no status field; query 5 unbuilt but blocked on nothing; queries 2, 3 and 6 deferred with the
portfolio. **Query 5 is the cheapest thing left in the phase** — `added` already reaches the payload
and renders per service, and what is missing is a filter across services.

**One correction made while verifying, worth copying as a habit.** A first grep for `added` in
`apps/web/src/*.tsx` found nothing and nearly went into this file as "the viewer never renders
`added`". The glob missed `components/`, where `ServiceDetailPanel.tsx` renders it. A negative
result from a search is a claim about the search, not about the repo.

### Handoff — 2026-08-25, end of the small-defects-and-DAG session

**What happened.** Two things, in this order: the five smaller viewer defects (the one Phase 3.7
item that needed no decision from the owner), and then the per-project DAG, once the six decisions
it was blocked on were put to the owner and answered. Baseline **879/52 confirmed over four runs
before touching anything**; the session ends at **951/56**.

**What is actually different on screen.** A deep-linked panel now hands focus back to a node
instead of to `<body>`; opening and closing panels no longer grows history, so Back leaves the
viewer rather than walking the last dozen clicks; a selected node's edge is 3px against every other
node's 1px, which is the first selection cue that survives greyscale; and two entries of one vendor
in one group show their local ids. Full detail, including the fifth defect that was hiding inside
the first, is in the ticked box in Phase 3.7.

**The verification is the part worth copying, not the fixes.** Seven mutations, each applied to the
fixed code and each watched go red on exactly the tests that name it — the counts are in the box.
That harness is `$CLAUDE_JOB_DIR/tmp/mutate.py`-shaped and took ten minutes to write; it is the
cheapest way to find out that a new test asserts nothing, which is the failure this file keeps
recording.

**And the browser run finally happened, twice.** Two consecutive handoffs said the owner would run
`catalogus view` from a real repo and that nothing here reflected such a run. This session ran it
against a scratch copy of `examples/reference.catalogus.yaml` and again against the new stress
fixture, in real Chrome, reading computed styles, `history.length`, node positions and edge counts
out of the live page. That is **not** the owner's run on a real client repo — it is synthetic data
in a scratch directory, and it says nothing about how the viewer reads against a real inventory.
The owner's run still outranks it and still has not happened.

**One habit this session earned the hard way.** A DOM query in an automated browser is not evidence
until something has forced a paint: three separate "the edges are missing" readings were a tab that
had not repainted between injected-JavaScript calls, and each screenshot made 48 edges appear. Two
of those readings sent a fix in the wrong direction before the pattern showed itself.

**Then the DAG, once its six decisions came back.** They had been carried for two sessions —
list-versus-graph, arrow direction, grouping on the canvas, how `component` and `stack` nodes
render, which React Flow, and whether elkjs fits the bundle budget — and they were the owner's to
make, not an implementer's. Asking took one exchange; the two sessions of not asking cost more
than that. All six are recorded with their reasoning in the DAG box, which is the part that stops
them being re-litigated by whoever would have chosen differently.

**The DAG is built and the fixture problem is closed with it.** Nobody had written the
deliberately-hard manifest this file kept naming as a prerequisite, so it was the slice's first
artifact rather than something it inherited. Three defects came out of running the result, none of
them visible to a green suite and all of them producing a graph that looks fine at a glance — the
best argument in this file for why the live run is not optional.

**One thing to know before writing more `apps/web` tests.** Under jsdom the global `URL` resolves a
relative reference against the *document* base, so `new URL("./x", import.meta.url)` returns
`http://localhost:3000/...` and `node:fs` rejects it with "The URL must be of scheme file". Derive
paths from `fileURLToPath(import.meta.url)` by string replacement instead — and not from
`process.cwd()`, which is the repo root under `pnpm test` and `apps/web` under a per-package vitest
run. `ServiceNode.test.tsx` carries the comment.

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

**What was deliberately not done, and why.** *(Both halves of this paragraph were closed on
2026-08-25 — see the handoff above. Left as written, because a dated handoff that gets edited to
stay true stops being a record of what was known when.)* The five smaller viewer defects (focus,
history entries, colour-only selection cue, duplicate-vendor nodes) are still open and now have
their own checkbox rather than being hidden inside a ticked one. `App.tsx` still has no tests and
is now the largest untested surface in the repo. **The DAG is still the next real piece of work**,
and the previous handoff's warning about it stands unchanged: there is no real manifest to judge
layout against, so either onboard a project first or build against a deliberately hard synthetic
one and say plainly that that is what happened.

**One habit worth keeping from this session.** Every claim below that says "watched go red" means
the code was mutated, the test was observed failing, and the mutation was reverted — and the suite
was run repeatedly rather than once. Both defects in item 4 were invisible to a single green run.

**Still outstanding from the previous handoff, and it did not happen in this one:** the owner was
going to run `catalogus view` from a real client repo and come back with feedback. Nothing in this
document reflects such a run. **First-hand feedback outranks anything written here**, so if it has
since happened, start from that rather than from the ranked list below.

**The drift-and-corpus session's work is merged** — PR #6, three commits, on `main` as of
2026-08-24. Nothing below is waiting on a branch. The commits were ordered fixes -> tests ->
chore+docs so each is independently green; tests-first would have been a red commit, since the new
`set` and `StatusPill` cases fail without their fixes. Worth copying if you split work the same
way.

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

1. ~~**The DAG has nothing real to be judged against.**~~ Closed the second way, and then the
   premise flipped underneath it. The DAG was built and judged against
   `examples/layout-stress.catalogus.yaml`, said plainly to be synthetic; and as of 2026-08-25 the
   Clapline manifest exists again at **35 services and 41 edges**. The layout has still never been
   seen against it — that is the owner's run, and it is now the top open item in the phase.
2. ~~**`skill-drift.test.ts` has less coverage than it appears to.**~~ Closed — both halves. See the
   two ticked boxes in Phase 3.7 below for what was built and which mutations were watched go red.
3. ~~**The traversal corpus is not committed.**~~ Closed — 65 vectors now live in
   `packages/cli/src/test-support/traversal-vectors.ts`, executed against a live server by
   `view-traversal.test.ts`. See Phase 3.7 below.
4. ~~**`App.tsx` has no tests**~~ — closed. `App.test.tsx` carries **23 tests**, and four of them
   exist because a mutation pass found the migration board swappable for a bare paragraph with the
   whole suite still green. See the two ticked boxes below.
5. ~~Smaller, all recorded below: focus drops to `<body>` when closing a deep-linked panel; every
   open and close pushes a history entry; the selected state's two visual cues are both colour; two
   entries of the same vendor in one group are indistinguishable on the node.~~ All closed, plus a
   fifth found inside the first. The focus one **regressed** on the migration board later the same
   day and was caught by that slice's validation pass — a fix is not a guarantee that the next
   surface gets it.
6. ~~**`SKILL.md` never teaches `catalogus view`.**~~ Settled and done — see decision 11. The skill
   now hands the command to the user in prose and is told never to run it, and a test keeps it out
   of the fenced blocks.

**Every item on that list is now struck through, so here is what replaced it, 2026-08-25.**
1. **Nobody has run the viewer against a real inventory.** The manifest for it exists now; the run
   does not. Every browser claim in this file is against synthetic fixtures.
2. **§4.2 query 5** — "everything added in the last N days" — is unbuilt and blocked on nothing.
3. **The portfolio page's three open questions**, deferred rather than answered. See its checkbox.

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

### Phase 3.7, the viewer — closed 2026-08-25, less its portfolio page

*(This section was headed "The next thing is Phase 3.7" and opened "it is unblocked, build the
single-project DAG first". Both were true when written and the DAG is now built; the heading is
updated and the sentence kept below, because the rest of the section is written as advice to
someone about to start it and reads wrongly without it.)*

It was unblocked. Build the single-project DAG first, against a real manifest, because layout is the
part that is genuinely hard and it de-risks everything after it.

**Superseded 2026-08-25 — `C:/Workspace/repos/Clapline/catalogus.yaml` exists again.** Counted
directly: **35 services, 41 edges**, `catalogus validate` clean. It was absent when the paragraph
below was written and it is present now, and nothing recorded it arriving. That is the second time
this one file's existence has flipped without the document noticing, which is an argument for
re-running the check rather than for reading either claim.

**The paragraph below stands unedited as the record of what was known on 2026-08-24.** The DAG was
built against a synthetic stress fixture because that was the honest option at the time, and that
decision is why `examples/layout-stress.catalogus.yaml` exists at all. Rewriting the history to
match today's disk would delete the reasoning.

**What its return unblocks is narrower than it looks.** It is *one* project. The workspace holds 19
directories and exactly one of them has a manifest, so the portfolio page and the usage matrix are
as blocked as they were — see the deferral in the portfolio checkbox below. What it does give is the
first opportunity to judge the *existing* single-project viewer against a real inventory instead of
a fixture, which is the owner's run that three consecutive handoffs have said had not happened.

**There is no real manifest, and this document said otherwise for a while.** Everything below used
to read: the cold runs wrote `C:/Workspace/repos/Clapline/catalogus.yaml`, it holds 26 services and
30 edges, `fly-api` has fourteen outgoing edges, and that file is the layout stress test the DAG
should be judged against. **Checked directly on 2026-08-24: the directory exists, the manifest does
not.** No `catalogus.yaml` and no `stack.yaml` anywhere under it. Nobody knows when it went, because
nothing ever re-checked — this document warned that its own numbers had "already been stale once"
and then went stale again in the same section, which is the argument for checking a claim before
building on it rather than for writing the warning.

Consequences, and they are real rather than bookkeeping:

- **The only manifest that existed when this was written was `examples/reference.catalogus.yaml`**,
  which is synthetic and small — 14 entries, 14 edges. (A second one exists now:
  `examples/layout-stress.catalogus.yaml`, also synthetic, written for layout rather than for
  reference — see the note two bullets down.) It covers every *shape* (`kind: component`, `kind: stack` with a
  version, `status: phasing_out` with `replaced_by`, one vendor under two roles, and since the
  2026-08-24 amendment a `role: coding-agent` entry) but it is not a layout stress test. Nothing on
  disk currently proves elkjs handles a fourteen-edge fan-out readably.
- **So the DAG slice cannot be judged against real topology yet.** Either onboard a real project
  first, or build the layout against a synthetic manifest deliberately shaped to be hard and say
  plainly that that is what happened. Do not declare the layout done on a 14-node example and
  imply it was tested on something harder.

  *Resolved the second way, 2026-08-25:* `examples/layout-stress.catalogus.yaml` is that
  deliberately-hard synthetic manifest — 35 services, 48 edges, an 18-edge fan-out hub — and the
  DAG was judged against it in a live browser. **It is still synthetic.** It says elk handles this
  topology; it says nothing about whether a real inventory reads well, and the sentence above
  about not implying otherwise still stands.
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

**Two things the Clapline manifest did not exercise, and the viewer needed both.** It carried no
`status`/`replaced_by` entries, so nothing on disk covered status colours or the migration view,
and it predated `kind`, so every node in it was a `service`.

**Rewritten 2026-08-25 to say which manifest it means, because the antecedent had come loose.**
This paragraph said "it", and the nearest manifest named above it is now
`examples/layout-stress.catalogus.yaml` — which carries five `status` entries and four
`replaced_by` targets and has every `kind`, so the sentence read as flatly false about the file a
reader would naturally attach it to. The validation pass on the migration dashboard read it exactly
that way and reported it as a stale claim about layout-stress. It was not: `git log -S` puts it in
`1d9b9cc`, where the subject was the real 26-service Clapline manifest — which has since been
**deleted** (checked 2026-08-24, see above). So both halves are now past tense, and the fixture
guidance is stated directly rather than by pronoun: **for status colours and the migration board,
`examples/layout-stress.catalogus.yaml` is the better fixture** — 2 `phasing_out`, 2 `deprecated`
(one of them with no `replaced_by` at all, which is the row the board exists to surface) and 1
`removed`, against `examples/reference.catalogus.yaml`'s single `phasing_out`. Check the counts
above against the files before relying on them; the numbers in this document have gone stale more
than once, and a pronoun with no live referent is how one of them did it.

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

## Phase 3.7 — Viewer on manifests, no backend ✅ complete, less the portfolio page

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
- [x] **Five smaller viewer defects, all fixed.** The box's title said five and its prose listed
      four; the fifth is item 2 below, found while fixing item 1 rather than by the validation
      pass. Split out of the two boxes above so ticking those did not quietly carry them, and
      closed on 2026-08-25:

      1. **Focus dropped to `<body>` when a deep-linked panel was closed** — `lastFocusedRef` is
         captured on click, and a deep link involves no click, so the restore branch had nothing to
         restore to and silently did nothing. From `<body>` the next Tab restarts at the top of the
         document and a screen reader has lost its place entirely. Fixed by giving every node a
         stable DOM id (`serviceNodeDomId`, exported from `ServiceNode.tsx` rather than duplicated
         as a template string at the call site) and falling back to the node the closed panel was
         addressing — where a click would have left focus anyway. Read back with
         `document.getElementById`, never a selector, because a service id is manifest text and a
         selector would need escaping.
      2. **The opener ref could go stale.** Not in the original list, found while fixing (1): a
         click, a close, and then a deep link to a *different* service restored focus to the first
         service's node. `lastFocusedRef` is now cleared once used — a stale ref is worse than
         none, because it moves focus somewhere confidently wrong rather than nowhere.
      3. **Every open and close pushed a history entry.** `App.tsx` assigned
         `window.location.hash`; it now calls `history.replaceState` and sets its own state, since
         `replaceState` fires no `hashchange`. The `hashchange` listener is still the only path for
         back/forward and for a hand-edited hash. Closing also leaves no bare `#` behind. The panel
         is a view of the page, not a page of its own — and the close entry was the worse half of
         this: its only content was "no panel", which Back then undid by reopening it.
      4. **The selected state's two visual cues were both colour.** Now three, of which one is not:
         an inset 2px ring stacks on the 1px border, so a selected node's edge reads as 3px against
         every other node's 1px in pure greyscale. An inset `box-shadow` deliberately, not a wider
         `border-width`, which would reflow the tile by 2px and make the row twitch as the
         selection moves.
      5. **Two entries of one vendor in a group were the same node twice.** `host-api` and
         `host-web` in `examples/reference.catalogus.yaml` are both `service: fly-io`, both roll up
         to `hosting`, and both rendered as "Fly.io" with the same icon and nothing else. The local
         id now renders under the name for exactly the names that collide — `duplicateNames()` in
         `group-services.ts`, computed per rendered group by `ServiceGroup`, never manifest-wide:
         the two Supabase entries sit under `AUTH` and `DATABASE`, are already told apart by the
         headings, and correctly show no id. `showId` is a **required** prop rather than an
         optional one defaulting to false, so the canvas slice has to answer it instead of silently
         inheriting a default that drops the disambiguation.

      **What the tick rests on.** `pnpm build && pnpm test` at **909 tests / 53 files**, run six
      consecutive times (up from 879/52; +30 tests, and the one new file is `App.test.tsx`), plus
      `pnpm typecheck` clean across all four packages. **Seven mutations applied and each watched
      go red on exactly the tests that name it** — push-instead-of-replace (2 red), the deep-link
      focus fallback deleted (2), the opener not cleared (1), the node's DOM id removed (4), the
      group never disambiguating (1), the id rendered unconditionally (5), and the non-colour
      selection cue deleted from the CSS (1).

      **And a live browser run, which this document had been missing for two sessions.**
      `catalogus view` against a scratch copy of `examples/reference.catalogus.yaml`, driven in
      real Chrome, not jsdom: both Fly.io nodes render their ids and both Supabase nodes render
      none; computed styles confirm `1px border + 2px inset ring` on the selected node against
      `1px, none` on its neighbour; `history.length` is **2 before and 2 after three
      open-then-close cycles**, with the address back to a clean `/`; and closing a panel opened by
      a deep link (hash set directly, `document.body` focused first) lands focus on
      `service-node-supabase-auth` rather than on `<body>`.

      **`App.tsx` is no longer the largest untested surface in the repo.** It had no tests at all;
      it now has 15, covering the load/error paths, the hash route, both history fixes and all four
      focus cases. One thing worth knowing before writing more of them: under jsdom the global
      `URL` resolves a relative reference against the *document* base, so
      `new URL("./x.css", import.meta.url)` returns `http://localhost:3000/...` and `node:fs`
      rejects it — `ServiceNode.test.tsx` derives its stylesheet path from
      `fileURLToPath(import.meta.url)` by string replacement instead, and says why.

      **One limit, stated rather than left to be assumed:** the greyscale claim in (4) is reasoned
      from the declared CSS and confirmed against computed styles, not measured with a contrast
      tool or checked by a low-vision reader. The test behind it is a source-level tripwire that
      fails when the non-colour cue is deleted; it cannot tell whether the result looks right.
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
- [x] **Per-project DAG — built, and judged against a manifest built to be hard.** elkjs layout in a
      worker, `@xyflow/react` render, the existing `ServiceNode` unchanged inside the canvas, and a
      List/Graph toggle with the list as default. Entirely `apps/web`, as this box predicted: no
      server change at all.

      **The fixture this box kept asking for now exists.**
      `examples/layout-stress.catalogus.yaml` — synthetic, valid under `--strict`, and shaped to
      break a layout rather than to demonstrate a manifest. Its header states each property and why;
      the numbers there were **measured off the file, not asserted**: 35 services, 48 edges, 21
      rollups, a fan-out hub with 18 outgoing edges, a fan-in hub with 6 incoming from 4 rollups, a
      longest path of 6 nodes, three entries with no edges at all, three Fly.io entries in one
      rollup, every kind, every status, and one uncatalogued slug. **46 of the 48 edges cross a
      rollup boundary — 96%** — which is the measured evidence behind decision 3's flat layout:
      compound containers would have been crossed by all but two lines on screen.

      **What the live run showed.** All 35 nodes placed across 9 ranks with no overlapping boxes,
      the 17-wide fan-out rank readable, the three orphans packed together rather than scattered,
      all 48 edges drawn, and selecting the hub highlighting **exactly its 21 incident edges** (18
      out + 3 in, matching the manifest). elk handles this topology; that question is now answered
      with a picture rather than a hope. The honest limit: 2634x1607px of graph fits a large window
      only at ~0.5 zoom, so labels are small at full-graph view and reading it means zooming. That
      is inherent to 35 nodes, not a layout defect.

      **Three defects the tests could not see, all found by running it.** Recorded because the
      pattern matters more than the fixes: every one of them renders a *plausible* graph.

      1. **No edges at all, and nothing said so.** React Flow's root is `height: 100%`, and a
         percentage height resolves against a parent's *definite* height — which the `min-height`
         this canvas started with does not provide. The container measured 921px and the element
         inside it measured 0. Nodes still painted, because they are absolutely positioned; every
         edge needs the measurement, so the graph rendered as a field of unconnected tiles. The
         library says so through `onError` and nowhere else, which is why `onError` is now wired to
         the console permanently: `[react-flow 004] The parent container needs a width and a
         height`.
      2. **A literal `undefined` in every node's class list.** `kind: service` has no `.kind-*` rule
         by design, and CSS Modules return `undefined` for a class that does not exist, which
         template-literals straight into the DOM. Invisible to every test that checks behaviour
         rather than markup.
      3. **Handle bounds discarded on every selection change.** `parseHandles` in `@xyflow/system`
         drops a node's handle bounds — the anchors edges resolve against — whenever a node object
         arrives without `measured` set, and this canvas rebuilds its node array on every
         selection. Read out of the installed library rather than reproduced end to end, and fixed
         with one line, because the failure it forecloses is a silently edgeless graph.

      **And one non-defect worth writing down, because it cost more than any of them.** Edges
      appear only after the renderer paints, and a Chrome tab driven entirely through injected
      JavaScript does not reliably paint between calls. Three separate "the edges are missing"
      readings were this artifact, not the product; each screenshot made the edges appear. **A
      DOM query in an automated browser is not evidence until something has forced a paint.**

      **Verification.** `pnpm build && pnpm test` at **951 tests / 56 files**, `pnpm typecheck`
      clean across four packages, and **16 mutations each watched go red on exactly the tests that
      name them** — including one deliberately left in the list that produced *zero* failures
      (removing the `measured` line above), which is the honest way to say that fix has no
      automated coverage rather than implying the suite covers everything. **The honesty was
      real and the count was not:** the pass below found two more shipped lines in the same
      state, which is what a mutation list assembled by the author of the code looks like — it
      covers what its author thought to doubt.

      **The independent validation pass ran (2026-08-25) and the split in its verdict is the
      point.** Every claim about *behaviour* reproduced: the suite at 951/56 on five consecutive
      runs with no sign of the shared-directory flake, typecheck clean, the layout rules, the
      id agreement between elk and React Flow, the dangling-endpoint filter, the effect stability,
      all five smaller fixes covered by tests that go red when reverted, the bundle split, every
      asset served without a 404, and the whole live-run geometry reproduced *headlessly* by
      running elkjs over the fixture directly — 9 ranks sized [1,1,1,2,3,7,17,2,1], zero
      overlapping node pairs, 2646x1619px (the claimed 2634x1607 plus elk's 12px inset), and
      `host-api` with exactly 21 incident edges.

      **What did not survive was a set of explanations.** Three comments and two numbers, and
      they failed in the same direction every time — read out of a library or carried forward
      from an older line rather than executed:

      - The `measured` comment claimed the line prevents a silently edgeless graph. Half right:
        `adoptUserNodes` really does drop handle bounds without it, and `width`/`height` do not
        substitute. But React Flow **self-heals** — `useNodeObserver` re-`observe()`s the element
        when the bounds go missing, and a spec-accurate ResizeObserver delivers a fresh callback
        whether or not the size changed. Measured: bounds gone for one frame, back ~50ms later,
        edges and all. The library's own comment three lines from the one that was read says
        exactly that. The line stays for what it does buy; the comment is rewritten.
      - "elk rejects a duplicate edge id outright" is false — real elkjs 0.12.0 lays out duplicate
        edge *and* duplicate node ids without complaint. What it does reject is a dangling
        endpoint. The uniqueness is needed by React Flow's edge registry, and the false reason
        was embedded in a test name. Both corrected.
      - `ViewToggle`'s comment claimed `role="radiogroup"` gives arrow-key navigation "for free
        from native semantics". ARIA describes, it does not implement: arrow keys moved nothing
        and both buttons sat in the tab order.
      - The fan-in hub is **4 rollups, not 5** — wrong in the fixture header, in an inline comment
        beside the edges, and in this box, in a set of numbers whose selling point was that they
        were measured. Recomputed twice, independently, off `role` rather than `id` (which is what
        `rollupOf` actually keys on).
      - The bundle baseline was stale: see the paragraph below.

      **And it found the disclosure understated.** This box said 16 mutations produced *one*
      zero-failure result. There are at least three shipped lines with no automated coverage:
      `measured`, the `onError` wiring the box calls permanent, and the incident-edge highlight —
      deleting the ternary so selecting a node highlights nothing fails no test. Two new defects
      came with them: `.node > button` in the canvas stylesheet was **dead**, because the button
      was a grandchild rather than a child, so the visible tile never filled the 216x64 box its
      handles are anchored against; and every canvas node was an **orphan `<li>`**, since
      `ServiceNode` returned a list item and the canvas wrapped it in a plain `<div>`. **All of
      that is fixed in the box below** — past tense deliberately, because the first draft of this
      paragraph shipped in the present tense alongside the commit that fixed it.

      **The lesson is narrower than "check the work" and worth stating exactly.** Nothing built
      here was wrong. What was wrong was every place a *reason* had been reached by reading rather
      than running — and each of those reasons read as more authoritative than the code it sat
      above, because it cited a library internal by name.

      **The bundle budget survived, and by a better route than the decision expected.** Decision 6
      accepted growth; the default view took none. `@xyflow/react` and elkjs are both behind
      dynamic imports, so the initial chunk is **162.23 KB** (measured after the fix pass below;
      it was 161.65 KB when the DAG landed), and the graph pulls **186.35 KB
      (React Flow) plus a 1.43 MB elk worker** only when someone switches to it. The entry chunk
      contains zero occurrences of `xyflow`, `react-flow`, `ReactFlow`, `nodeLookup` or
      `handleBounds`; all of them appear only in the lazy chunk. (`elkjs` appears in *no* built
      asset — it is a module specifier that does not survive bundling, so it was never evidence
      of anything.)

      **The comparison this originally drew was wrong, and it is the stale-number failure this
      file keeps producing.** It said "against the 161 KB it was before this slice", which was a
      figure carried forward from line 1524 rather than re-measured. The validation pass built the
      pre-slice tree in a throwaway worktree at `738d5c8` on the same vite 6.4.3 and got
      **158.64 KB**. So the DAG slice cost **+3.01 KB (+1.9%)**, not +0.65 KB, and the fix pass
      below took it to **+3.59 KB (+2.3%)** total. The conclusion holds —
      no library bytes reached the default view — but the arithmetic behind it did not. The worker is also the reason elk cannot be imported by a test: it arrives
      through a Vite `?worker` import that does not evaluate outside a browser, which is why
      `GraphCanvas` takes its layout function as a prop.

      **What is deliberately not in it.** Compound nodes per rollup (decision 3 chose flat, and the
      96% figure above is the evidence). Edge routing from elk — elk is asked for node positions
      only and React Flow draws its own lines, so there is one source of truth for where a line
      goes. Dragging, connecting and React Flow's own selection model: an edge is a fact in
      `catalogus.yaml` and the CLI is the only writer, so the canvas is strictly read-only and the
      one selection model is the `#/service/<id>` route the list already used.

- [x] **The DAG's validation pass, and the fixes it forced.** Two independent passes ran against
      the slice above (2026-08-25), neither by the session that wrote it. **963 tests / 56 files**
      on three consecutive full runs, `pnpm typecheck` clean across four packages.

      **What the first pass found is in the box above.** What matters about it is the shape: every
      claim about *behaviour* reproduced, and five *explanations* did not. Nothing built was
      wrong. Every wrong thing was a reason reached by reading a library or carrying a number
      forward, sitting in a comment that read as more authoritative than the code under it
      because it cited an internal by name.

      **Six fixes, each with the mutation that proves its test.** All six went red on exactly the
      test naming them, and every mutation was restored:

      1. **The orphan `<li>` and the dead selector, which were one bug.** `ServiceNode` now
         returns a bare `<button>` and each caller supplies its own wrapper — `<li>` in
         `ServiceGroup`'s list, React Flow's div on the canvas. That removes a list item that had
         no list around it *and* makes `.node > button` a selector that matches, since the button
         was a grandchild before and the rule had never once applied. Proved both ways by loading
         both production stylesheets into a CSSOM: the old chain computes `max-width: 220px`, the
         new one `max-width: none`.
      2. **`onError` is now asserted**, and the assertion's own footing is written down: it passes
         only because React Flow's 004 fires in an unmeasured jsdom pane, so it would go red for
         an unrelated reason if this file ever measures. Better to say that than to discover it.
      3. **The incident-edge highlight is now tested end to end** — real edges in jsdom, via a
         spec-accurate `ResizeObserver`, element-size stubs and a `DOMMatrixReadOnly` polyfill,
         each of which the second pass confirmed load-bearing by removing it.
      4. **`ViewToggle` implements the radiogroup it announces**: roving tabindex, arrow keys with
         wraparound, Home/End, and `preventDefault` so ArrowUp/ArrowDown stop scrolling the page
         out from under the user.
      5. **And a bug the second pass found in that fix.** It focused the *requested* option rather
         than the committed one, so a parent that declined `onChange` left focus on the
         `tabIndex={-1}` button while the other kept the group's only tab stop — roving tabindex's
         single invariant, inverted. `App.tsx` always honours `onChange`, so it was never live. It
         was still wrong, and a controlled component has to get that state right.
      6. **The false comments and the wrong numbers**, listed in the box above, all corrected in
         place rather than deleted — a comment that records what it got wrong is worth more here
         than one that quietly reads correctly.

      **Two limits, stated because the alternative is implying coverage that does not exist.**
      Removing `measured` still fails no test, and no browser-free test can reach it. And no test
      in this suite can see whether `.node > button` is still *in* the stylesheet — vitest's CSS
      Module proxy synthesises a class name for any key, so only the DOM shape is guarded, not the
      rule.

      **The third limit was closed by running it.** Whether the button visually fills its 216x64
      box is a layout question and jsdom does no layout, so it was cascade-derived until a live
      run measured it: `catalogus view` against the stress fixture, all **35 nodes**, every one
      with `button.getBoundingClientRect()` matching its `.react-flow__node` box to within half a
      pixel — **ratio 1.000 on both axes**, computed `max-width: none`, and **zero `<li>` elements
      anywhere on the canvas**. 48 edges drawn, clean console. The roving tabindex was driven with
      a real keyboard too: ArrowLeft from Graph moved both the selection and the visible focus
      ring to List, with `tabindex` reading `0`/`-1` on the checked and unchecked options.

      **One live-run note that is not a defect, and cost time anyway.** A click that lands on the
      already-selected option leaves `document.activeElement` on `<body>`, so the arrow key that
      follows goes nowhere and reads exactly like a broken key handler. The keyboard path is fine;
      the *click* did not focus. This is the same class as the previous session's unpainted-tab
      artifact — **in an automated browser, confirm what has focus before concluding a key did
      nothing.**

      **The pattern worth carrying forward.** The second pass found a defect in the first pass's
      own fixes, and this box's first draft described four defects in the present tense in the
      same commit that fixed them. Validation is not a gate you pass once — each pass is written
      by someone who now believes something, which is the condition the next one exists to check.

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
- [ ] **Portfolio page: project list, service usage matrix across projects — deferred by the owner,
      2026-08-25. The viewer stays single-repo.** This is the one box Phase 3.7 closes without, and
      the deferral is a decision rather than an omission, so it is recorded here rather than left as
      an unexplained empty checkbox.

      **What was put to the owner and what came back.** Three questions were open and all three were
      the owner's: how a viewer that is single-repo by design gets pointed at several projects
      (a `--workspace <root>` flag on `view`, a separate `catalogus portfolio` command, or `view`
      auto-detecting a root that holds no manifest); whether to onboard more repos first or build
      against the one real manifest plus two synthetics; and whether the portfolio is a fourth
      `ViewToggle` mode or its own route. The answer made all three moot: **skip the workspace mode
      for now, single repo is fine.** None of the three is settled, and none should be treated as
      settled by whoever picks this up — they are open questions with a deferred answer, not
      rejected options.

      **The blocker behind it is data, and it has not moved.** The owner's 2026-08-25 decision
      recorded two boxes above — *the portfolio page and the usage matrix are judged against real
      topology or not at all* — still governs. The workspace holds **19 directories and exactly one
      manifest** (`Clapline`, counted directly). A usage matrix over one project is a column, and a
      cross-project view built against two synthetic examples would be judged on topology nobody
      chose for that purpose. Onboarding more repos is what unblocks this, and that is the owner's
      call to make when they want it.

      **`scanWorkspace()` stays dormant, and that is now a deliberate state rather than a waiting
      one.** It is built, tested (`packages/cli/src/workspace-scan.test.ts`) and exported from
      `packages/cli/src/index.ts`, with no caller. The previous note said "no caller until the
      portfolio page"; the portfolio page is deferred, so the honest reading is that it is finished
      code with no consumer. Do not delete it on that basis — it is the thing the deferred work
      resumes from — but do not read its existence as evidence that the transport question was
      answered either.

      **Three of HANDOFF §4.2's six acceptance queries need this page**, so §4.2 is not met and the
      Phase 7 acceptance line stays unticked. Full status in the box below.
- [x] **Migration dashboard: everything `phasing_out` with its replacement.** Shipped as a third
      `ViewToggle` mode beside List and Graph — same one-addressable-page reasoning as DAG decision
      1, and the roving-tabindex radiogroup absorbed a third option without a line of its key
      handling changing, because it was written over `MODES` rather than over a count.
      **1001 tests / 58 files** on three consecutive runs, `pnpm typecheck` clean across four
      packages.

      **Scope widened by the owner, 2026-08-25, and this box is the record the code cites.** The
      board lists `phasing_out` *and* `deprecated`, in two sections — "In flight" and "Overdue".
      `removed` is not listed: that migration is finished. `active` never enters the conversation.
      The wording in this checkbox and in HANDOFF §4.2 query 4 both say `phasing_out` alone; the
      widening is deliberate and this line is what makes `migrations.ts`'s citation of it true.
      Against `examples/layout-stress.catalogus.yaml` that is 4 rows, and the one that argues for
      the widening is `legacy-ledger` — **deprecated with no `replaced_by` at all**, a migration
      with no destination, which the narrow reading would have hidden.

      **Half of HANDOFF §4.2 query 4 is not answerable and the code says so.** The query asks for
      "all edges/**nodes** marked `phasing_out`". An edge carries no status: the manifest's object
      edge form allows `from`, `to` and `notes` and nothing else, and by the time an edge reaches
      the viewer it is `{from, to}`. So the nodes half ships and the edges half stays uncovered
      until Layer 2 grows a field for it. `migrations.ts`'s header states that rather than letting
      a reader assume the query was met.

      **The validation pass found one live bug, and it was a regression of a bug this file already
      records as fixed.** `App.tsx` restores focus when the detail panel closes by looking up
      `serviceNodeDomId(id)`; the board's rows carried no such id, so on the migration board — and
      only there — closing a panel dropped focus to `<body>`. That is the exact state `App.tsx`'s
      own focus comment describes finding and fixing once, and `serviceNodeDomId`'s doc comment had
      already predicted the shape of it in writing: *"a focus restore that silently finds nothing is
      invisible in a passing test suite."* Two independent A/B runs pinned it to migrations mode
      alone. Fixed, and now held end to end by a test that goes red when the id is removed.

      **The more useful finding was what the green suite did not know.** Four mutations to
      `App.tsx` — swapping the board for the service list, swapping it for a bare paragraph,
      widening the page in the wrong mode, and un-suppressing the text edge list — each left all
      991 tests passing. `App.test.tsx` had not been touched by the slice; its describe block still
      read "the list/graph toggle" and it never clicked the third option. All four now fail.

      **And one assertion was inert in a way worth writing down.** The new `constructor` test —
      guarding the prototype-pollution class this repo has produced five times — seeded a service
      whose id *was* `constructor`, making the key an **own** property, which an object literal
      shadows just as a `Map` does. Swapping the `Map` for a keyed literal left all 991 tests green.
      The distinction `StatusPill.tsx` already draws is the whole point: *absent* and *inherited*
      keys are different things and only one is a bug. The test now uses an absent target, and the
      swap fails it — `constructor (function Object() { [native code] })` against the expected
      `constructor`. Worth noting that the schema's id pattern rejects `__proto__`, so `constructor`
      is the only `Object.prototype` key a manifest can express: the one reachable case was the one
      the test was not exercising.

      **Three more untested behaviours, now held:** `ViewToggle`'s `contains` focus-thief guard
      (removing it had left the suite green — the effect must follow focus, never acquire it), the
      row's `StatusPill`, and the overdue section's sort, which had been covered only in the pure
      module. Each was mutated and each mutation now goes red on the test naming it.

      **One accessibility fix the pass reasoned to rather than heard.** The replacement sits outside
      the row's button on purpose, so that clicking it cannot select the wrong service — which left
      it out of the button's accessible name entirely, reachable only in a screen reader's browse
      mode. It is now the row's `aria-describedby` target, with a visually-hidden "replaced by"
      prefix because the arrow that carries that meaning for a sighted reader is `aria-hidden`.
      **Not heard on an actual screen reader**, and that is the honest status of it.

      **Comments corrected rather than deleted.** `ViewToggle.tsx`'s header still described a
      two-option group in four places ("the *other* is `tabIndex={-1}`", "two independent buttons")
      while the component had three; the implementer had fixed one such comment ninety lines below
      and left the header. `migrations.ts` overstated the edge shape by one field. `App.tsx` still
      pointed forward to a slice that had already shipped. This is the same failure the DAG's
      validation pass named: *every wrong thing was a reason sitting in a comment that read more
      authoritatively than the code under it.*

      **Verified without a browser, and the gap is the same one as the box above.** All 14 CSS
      Module keys `MigrationList.tsx` references resolve to real selectors in the built stylesheet —
      which no test can check, because the vitest proxy answers *every* key (probed directly: an
      undefined key comes back as `_doesNotExist_<hash>`). Contrast was computed for every
      foreground/background pair the component produces: worst case 5.35:1, all AA. **Nobody has
      looked at this board.** Whether a long replacement label wraps, and whether the two sections
      read as one board rather than two lists, are open.

      **A process note, because it is the point of running two passes.** The validation agent, while
      cleaning up its own background servers, ran `taskkill /F /IM node.exe` and killed every node
      process on the machine. No repo or file damage — the tree and the suite were verified green
      afterwards — but a validator is not supposed to be the most destructive thing in the session.
- [x] **Layer 3 cost panel present, rendering an explicit "not connected" empty state.** A
      `Cost & account` section at the foot of `ServiceDetailPanel`: the state line, one paragraph
      saying what Layer 3 is and that nothing is missing from the manifest, and one naming
      `catalogus push --private` as what fills it once the overlay exists. **969 tests / 56 files**,
      `pnpm typecheck` clean across four packages, **6 mutations each red on exactly the test that
      names them** and every one restored.

      **Placement settled by the owner, 2026-08-25: the detail panel only.** HANDOFF §4.2's query 3
      also wants a per-project total, and it has no home yet — the panel is per-service, and a
      project-level Costs block was declined for now rather than invented. `ServiceDetailPanel.tsx`
      had already recorded this destination in its own header comment, and HANDOFF §7 says
      "private-overlay panel (cost/account ref)", so this is the placement the repo already named.

      **It renders only for `kind: "service"`, and that is a rule rather than a layout choice.**
      HANDOFF.md's 2026-08-23 amendment settled that only `service` rows can carry a cost or an
      account reference, so a "not connected" box under a component or a stack would promise a
      field that is never coming. Two tests hold the line, one per other kind.

      **No data shape was invented, and that is the whole design.** There is no `PrivateOverlay`
      interface, no prop, no field added to `ViewPayload`, and no runtime probe — `catalogus view`
      serves the local manifest and has no second source, so there is nothing to check and nothing
      to sign in to. An empty state offering a Connect button would be this project's own
      plausible-default failure wearing a feature's clothes; Phase 4 is still blocked on a
      decision, so the copy says the overlay does not exist *yet*. A test asserts the panel's only
      control is still its close button.

      **What was verified without a browser, and what that leaves open.** The suite covers the
      claim, not the look: the wording, the absent action, the kind rule, the `h3` that keeps the
      panel's outline unbroken, and the fact that the section adds no second ARIA region — the
      panel is the one labelled region, and a mutation to a named `<section>` was run and breaks
      *both* that new test and the pre-existing "is a labelled region" one, which is why the
      section is a plain `<div>`.

      Beyond jsdom, the built and served assets were checked directly, because this file already
      records that vitest's CSS Module proxy synthesises a class name for any key and so cannot
      see a typo: all five `overlay*` keys the component references resolve to real selectors in
      the shipped stylesheet, and `catalogus view` on the reference manifest serves an entry chunk
      carrying the heading, the state line, the command and the kind guard exactly once each.

      **The gap is visual and it is stated rather than papered over.** The Chrome extension was not
      connected in this session, so nobody has *looked* at this panel. Whether the section reads as
      quiet rather than as an error, and whether `catalogus push --private` wraps inside a 320px
      column instead of pushing the panel sideways — `.overlayCommand` sets `overflow-wrap:
      anywhere` for exactly that and it is cascade-derived, not measured — are open. The previous
      slice's live run is the precedent: it is where the dead `.node > button` selector was caught.

      **Order settled by the owner, 2026-08-25: the cost panel first.** It is the only one of the
      three blocked on nothing — single project, no new manifest, and no Layer 3 data touched,
      because the whole of it is the empty state that says the private layer is not connected.
      The migration dashboard is second and is renderable against the reference manifest today.

      **And the manifest gap closes by onboarding real repos, not by writing more synthetics.**
      Owner decision, same date, superseding this file's habit of proposing another synthetic:
      the portfolio page and the usage matrix are judged against real topology or not at all.
      What that does *not* change is `examples/` — those stay synthetic on purpose (CLAUDE.md),
      so an onboarded project's manifest lives in its own repo and never lands here.
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

#### HANDOFF §4.2 at the close of Phase 3.7 — two of six fully answerable

Phase 7's list carries "Acceptance: all six HANDOFF §4.2 queries answerable from the UI". It is not
met, and this is what each query actually stands at, so that the unticked acceptance line means
something specific rather than "not finished". Verified against the built viewer, not inferred from
the checkbox list.

1. **All services for project X, grouped by category, with icons — yes.** The List view, with the
   rollup grouping and the server-resolved icons plus the category fallback.
2. **All projects depending on service Y — no.** Cross-project by definition; deferred with the
   portfolio page. Single-project blast radius is *partly* visible in the Graph view's edges, but
   the query asks across projects and the viewer sees one.
3. **Cost across all projects — no, and doubly so.** Layer 3 has no store, so the detail panel
   renders the explicit "not connected" empty state; and "across all projects" needs the portfolio.
   The empty state is the shipped answer to *neither field is missing from your manifest*, not to
   the query.
4. **`phasing_out` nodes with `replaced_by` — the nodes half, yes; the edges half, not expressible.**
   The migration board ships both `phasing_out` and `deprecated`. An edge carries no status field in
   Layer 2, so the edges half is blocked on the schema rather than on the viewer. `migrations.ts`
   says so in its header.
5. **Everything added in the last N days — partly.** `added` reaches the payload
   (`view-payload.ts`) and renders per service in the detail panel
   (`ServiceDetailPanel.tsx`). There is no filter, sort or "last N days" view across services, so
   the date is visible one service at a time and the query as written is not answerable. **This one
   is single-project and is not blocked on anything** — it is simply unbuilt, and it is the cheapest
   remaining §4.2 item by a distance.

   *Corrected 2026-08-26, and it had gone stale in two directions at once.* The panel it names was
   deleted with the redesign, so the "renders per service" half pointed at a file that no longer
   exists. And the redesign built more of this query than anyone recorded: `service-tags.ts` has a
   named `RECENT_WINDOW_DAYS = 30` and a `new` tag, measured from the payload's server-stamped
   `readAt` rather than from `Date.now()` so every mark on a screen is measured from one instant.
   Its own header says it answers this query. **It is still not answerable, and for a reason worth
   knowing:** the mark is never on more than one service at a time. `ServiceTile` passes
   `added: undefined` deliberately — a collapsed vendor tile stands for several entries and a
   single bar cannot say "some of these are new" honestly — so the board, the one surface that
   shows every service at once, carries no recency mark at all. The answer exists per service, one
   hover or one page at a time, which is the same shape of "not answerable" the paragraph above
   describes. What is left is to surface recency somewhere scannable, not to build the recency rule.

   *Corrected again the same day, by the validation pass.* The sentence above read "the mark only
   appears in the hover popover" and "`ServicePage` renders no tag vocabulary at all". Both were
   true when written and false four hours later: retiring `StatusPill` put the full tag vocabulary
   on the service page, recency included — `#/service/<id>` on a service added inside the window
   renders `new`, and `ServicePage.test.tsx` has a test named for it. **The conclusion survives the
   correction and the reasoning did not**, which is the more useful half: "not answerable" now
   rests on the board being the only place that shows every service, not on the page showing
   nothing.
6. **Which projects use coding agent Z / architecture W / PM tool V — no.** Cross-project; deferred
   with the portfolio page. The `role`-based grouping that would answer it *within* one project is
   already there, which is why this is a transport gap rather than a modelling one.

So: **two answered (1, 4-nodes-half), one unbuilt but unblocked (5), three deferred with the
portfolio (2, 3, 6), and one not expressible in Layer 2 (4-edges-half).** Whoever resumes this
should note that 5 is the only one they can close without either a decision or a schema change.

A local Postgres container (Docker 29.4.1 is installed) remains available and is worth doing
separately, but for a different purpose: prototyping the §4 schema, RLS policies and the recursive
CTE against a real Postgres before choosing a host. It powers nothing in the viewer.

## Phase 7 — Viewer, backed by the platform ⬜

Everything below needs Layer 3 and cross-user data, so it waits on Phase 4.

**Read four of these as "backed by the platform", not as unbuilt.** The app, the DAG, the status
colours and the migration dashboard all exist as of Phase 3.7 and read manifests directly; what
Phase 7 adds is the store behind them. They are listed again here because the data path is the
whole difference. (This said "the first three" until 2026-08-25, when the migration dashboard
shipped and made it wrong — the same drift the fixture paragraph above records, and worth the
same correction rather than a quiet edit.)

- [ ] React + Vite app
- [ ] Per-project DAG: elkjs layout, React Flow render, `simple-icons` brand icons
- [ ] Status colours — active, `phasing_out`, deprecated — and `replaced_by` targets shown
- [ ] Project list and portfolio page with cost totals (private layer, owner only)
- [ ] Migration dashboard: everything `phasing_out` with its replacement
- [ ] Cross-project blast radius view
- [ ] Acceptance: all six HANDOFF §4.2 queries answerable from the UI — **two of six today**, and
      the per-query status is in Phase 3.7's "HANDOFF §4.2 at the close of Phase 3.7" box rather
      than left for a reader to re-derive.

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

11. **The skill hands `catalogus view` to the user and never runs it** — owner-confirmed
    2026-08-24. The gap was found while building the shell-command drift check, and the obvious fix
    was the wrong one.

    `runView` returns exit 0 as soon as the socket is listening, but the listening socket holds the
    event loop open, so the process runs until Ctrl+C — which is what its own `press Ctrl+C to stop`
    line says. Every other fenced command in `SKILL.md` is one the agent runs itself, so a fenced
    `catalogus view` would teach an agent to **block its own tool call**, with everything after it in
    the agent's plan silently not happening.

    So the viewer is documented in prose only, in a new `### 8. Hand the viewer to the user`
    section, plus a Common-mistakes bullet. That turned an accidental convention into a stated one:
    **fenced means the agent runs it, prose means it is for the user.** `catalogus graph` stays the
    agent's own check — it prints and exits.

    **A test enforces it**, because nothing else would. The four existing per-line checks all *pass*
    on `catalogus view --no-open`: it is a registered command, those are real options, and it needs
    no positional. It is a correct command line and still the wrong thing to teach — exactly the
    decision that gets undone by the next person who notices the viewer is missing from the skill
    and helpfully adds it. Mutation-checked: adding a fenced `catalogus view` to `SKILL.md` fails
    with a message naming the fix.

## Non-goals

From HANDOFF §8. Worth restating because each is a plausible-sounding scope creep.

- Storing secrets or credentials. Ever. Layer 3 holds *references* to an identity, never the
  credential itself.
- Uptime monitoring — other tools do this; integrate later at most.
- Package-level dependency management — that is Renovate's job.
