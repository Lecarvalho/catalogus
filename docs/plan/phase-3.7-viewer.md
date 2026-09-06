# Phase 3.7 — the viewer on manifests, no backend

> Split out of `docs/PLAN.md` on 2026-09-05, content verbatim. `docs/PLAN.md` is the index and the
> only place status is summarised; this file is the record. Section headings are unchanged so a
> code comment that names one still finds it by grep.

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

