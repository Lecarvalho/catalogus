# Handoffs — 2026-08-26, the design world and the form (candidate E, /impeccable, contract, DAG and migrations)

> Split out of `docs/PLAN.md` on 2026-09-05, content verbatim. `docs/PLAN.md` is the index and the
> only place status is summarised; this file is the record. Section headings are unchanged so a
> code comment that names one still finds it by grep.

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

