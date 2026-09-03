<!--
  Rescued from a session-scoped scratchpad on 2026-08-25 and committed here so
  it survives. The Impeccable flow writes this contract during a run and expects
  DESIGN.md to be written from the *built* world at finish; that finish step has
  not run, so this file is the contract, not the design system. See the note at
  the foot of this file for exactly what is left.
-->

# Direction contract — Catalogus viewer

Seed key: ac1ba604 · direction: **candidate E, the home screen** — owner-named, chosen directly in
an interview on 2026-08-26, with no roll behind it. This run's original direction, challenger
`japanese-high-density-web` (user-chosen; a user pick beats the roll), is retired by owner decision
the same day. The seed key is unchanged: it names the run, which is still open, not the direction,
which changed — see the revision at the foot of this file for the full account. Mode: **Read**.

## THESIS

A project's whole operational reality on one screen you scroll rather than one you must fit into,
calm enough to read without hunting for anything in it. It refuses the category default this app
once shipped — the dark dashboard of evenly-weighted cards under alphabetical headings — and refuses
Notion's own literal form too: a cream ground and one red keep it from becoming the airy white docs
page with thin grey rules and a blue link. Breathing room wins over density now: 35 services, 48
edges, eight architecture bands, given real space rather than packed to fit one viewport.

## OWN-WORLD

Warm cream ground (#f4f1ea), warm charcoal ink (#24211c), one utility red (#d40010) and nothing else
chromatic. Services carry no card, border or panel: each is a bare brand-mark icon on the ground, a
two-line label beneath it — vendor name, then the manifest `id`, because the vendor name alone
renders three Fly.io tiles and two PostgreSQL tiles identically. Hairline grey (#d5cebe) and light
grey (#e9e4d8) move off the services entirely and onto the shell — the topbar, the footer, a rail
divider, a popover's own rule — which is where this world's Notion-calm surfaces actually live now.
Sharp structure, soft transients: no radius or shadow anywhere except the popovers and menus that are
this world's only transient surfaces, plus one declared, contained exception the owner approved — a
phone-like corner radius on the icon tile alone. It does not license a radius on anything else.
Compact sans, airier than the world it replaces: no heavier face for numerals, no webfont —
`catalogus view` has no network to fetch one from. Status carries no hue requirement: a corner badge
with a distinct pictogram per state, the mark itself desaturated, and the state spelled out in words
under the label, so the signal colour is never the only way to read it — verified under a full-page
greyscale filter. Signal red is spent in exactly two places, the status badge and the status word,
and nowhere else: not a view, not a count. Recognizable with all content removed by: the bare icon
grid, the phone-like tile radius, the three-way greyscale-safe status mark.

## STORY

The reader opens a project they have not touched in six months, or hands it to someone who has never
seen it. Reading down through the bands, they understand the shape — what serves requests, what it
runs on, what holds the data, what watches it, what builds it. They click one and land on its page.

## FIRST VIEWPORT

A top bar: product identity left, a help / settings / profile cluster right, each opening its own
menu — help lists the docs and the CLI's own command surface, settings covers appearance, density,
brand-icon colour and the default view and nothing that writes, profile covers the account. Left
rail (240px, collapses below 900px): project identity and its architecture sentence, the manifest
path, then the band index with counts, no search field. Main field: a view rail — List, Graph,
Migrations — then the icon grid, grouped under band headings: Runs in production, Holds data, Calls
out to, Runs on, Watched by, Built and shipped by, Registered at, and Unplaced for anything the
mapping cannot place. A footer: the manifest path and read time, the service/dependency/rollup
counts, the CLI version, a documentation link, the schema URL. No primary action — this is Read
mode; the action is hovering a tile for its popover or clicking it for its page.

## FORM

A smartphone home screen: bare brand-mark icons on the ground, a two-line label beneath each one, no
card, border or panel around any service. Candidate E of six built to compare against the same
35-service fixture — a Notion document, a grouped database table, a gallery, a bordered icon wall,
this home screen, and an app-drawer list — chosen by the owner outright, in the interview that
produced all six, over the other five. No roll behind this direction: the owner named it, rather
than drawing it from a hand.

## Mapped from the world's own grammar, not invented

- a phone's own home-screen icon, its background square, and its caption -> the bare brand mark, the
  icon tile's own fill, and the two-line label beneath it
- a phone icon's status dot -> a corner badge, glyph-shaped per status: an hourglass for
  `phasing_out`, an archive box for `deprecated`, a cross for `removed`
- a phone icon with no artwork on file -> a dashed, sunken tile and an ink monogram (`AL`, from the
  raw slug `acme-ledger`) in place of a missing-image icon
- `active` carries no badge and no status word: tagging the norm is what produced thirty-five
  identical marks before
- the owner's own reference, an icon wall with the name below and a hover popover for the rest
  ("Like StackShare") -> the grid itself, and this world's popover

## Constraints carried in from PRODUCT.md

- No search. Bands and the left rail carry finding. (owner)
- Organize by architecture, not alphabet. (owner)
- Hover -> popover near the item; click -> the service page. (owner, supersedes
  viewer-foundations decision 4)
- Read-only: no editing affordance anywhere. Editing arrives with Phase 4.
- 38% of services have no brand icon; the category fallback must look deliberate.
- Keep meaning out of colour alone — greyscale must survive.

## Open, to solve honestly during the build

The approved mockup centres a hover popover under its icon with CSS alone. On an icon in the grid's
outermost columns that can push the popover past the viewport edge, measured between 768px and
1280px. A static mockup cannot flip it to stay on screen; the React implementation can, with real
edge detection, and should solve it rather than inherit it.

## FINISH

unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and
DESIGN.md
# Owner design decisions, captured live 2026-08-25

## Interaction: hover vs click  (owner, unprompted)
- **Hover an item -> popover near the item.** Quick peek, no navigation.
- **Click an item -> open the doc page.** The page is a destination.

**Supersedes viewer-foundations decision 4**, which chose "compact nodes plus a
URL-addressed detail panel ... over a popover and a sub-page". Both rejected
options are now the design. Reason it changed: the detail panel was sized for
fields, and the product's unit turned out to be a document.

Open sub-questions this raises (ask before building):
- Does the popover appear in every view (list, graph, migrations) or only the graph?
- Touch devices have no hover -- what replaces the popover there?
- Does the page keep the URL-addressable behaviour the panel had (#/service/<id>)?

## Settled earlier in the same session
- Audience: the indie product's ICP (solo devs / small agencies, 5-15 projects).
- Jobs: orienting in a project; handing a project over; reviewing the portfolio.
  NOT an incident tool -- "something broke" was offered and not selected.
- A service is a PAGE, not a row. Manifest = skeleton, page = the product.
- Pages are Layer 3, edited in the browser. Un-defers Phase 4. Committed direction.
- Page scope: per project + service.
- Sequencing: page-centric redesign ships first, read-only; editing arrives with Phase 4.
- Quality bar named by owner: Confluence and Notion.

## Structure decisions (owner, 2026-08-25)
- **Organize by architecture, not alphabet.** ~5 bands (request path / runs on /
  watched by / built and shipped by / ...) instead of 21 alphabetical role headings.
- **First screen = the shape of the system.** Orientation before inventory.
- **No search. "It should fit."** Everything visible, well organized. Hardest
  constraint of the three; rules out the scrolling index.

Implementation consequence to solve honestly: the manifest does NOT encode
"on the request path". `role` is a free-form slug, rollup is mechanical. A
role->band mapping must be authored (follow rollup-labels.ts: seed from
SKILL.md's documented vocabulary, unmapped roles land in a clearly-named band
rather than being guessed into one).

## The capture loop (owner, 2026-08-25)
"Working on Clapline, agent gives me the Stripe info, I say 'catalogus that please'."
- CLI/MCP is a CAPTURE tool used mid-coding-session, not a documentation chore.
- Filing must cost ~nothing; Catalogus already knows project + service + topology.
- Agent captures, browser curates. Different moments -> two-writers problem shrinks.

## Category ruts to avoid (named before candidate generation)
- The rut: dark dashboard, neon accent, card grid, sidebar, status pills. (= what exists now)
- Its predictable opposite: airy white docs site, Inter, thin grey rules, blue links.
- Notion/Confluence is the owner's stated bar -> at most ONE candidate may read as its literal form.


---

## Status of the Impeccable run: INCOMPLETE

Recorded so a fresh session knows what state it is resuming, rather than
re-deriving it or starting over.

**Done:**

- `init` -- `PRODUCT.md` exists at the repo root and holds the confirmed product
  record. A new session's `context.mjs` will find it, so **init will not and
  should not re-run.**
- Direction chosen. The roll assigned a grounded direction (a shipping-manifest
  world); the owner picked a challenger, `japanese-high-density-web`, which beats
  the roll. Seed key `ac1ba604`. The telemetry ping for the chosen challenger was
  sent.
- The build, substantially: token layer, bands, tiles, hover panel, service page,
  masthead, tab rail.

**Not done, and each is a required step of the flow rather than a nicety:**

1. **The contract is not in the emitted markup.** The flow requires it as an HTML
   comment surviving the production build, greppable by seed key. It lives only
   in this file and in the component headers.
2. **The finish review has not run.** `impeccable-finish-reviewer` is meant to be
   spawned fresh -- never inheriting the build thread's context, because a
   reviewer that inherits the transcript inherits its optimism -- with the
   artifact paths, desktop and mobile screenshots, this contract, and the
   craft-floor reference. **No mobile screenshot has ever been taken of this
   redesign.** Every screenshot in this session was desktop at 1440-1500px.
3. **`DESIGN.md` does not exist.** It is written at finish by the shipped
   documenter, from the built world rather than from intention. A new world
   shipped without it is an incomplete run.
4. **The mechanical detector has not been run** over the changed targets.

**And the owner's verdict is that the design is not finished anyway:** "that app
still needs more life, it's boring. We need a shell, a header, a mark for
Catalogus." So the next session has new design work *and* an unfinished run to
close. Do the work first, then finish the run over the result -- running the
finish review now would review something the owner has already rejected.

**One thing that is a question before it is a task:** Catalogus has no mark.
`docs/HANDOFF.md` §2 records the logo as open, because the previous one was a pun
on a dropped name. A shell needs something to be built around. Ask; do not invent
one and let it harden into the real thing by default.


---

## Revision — 2026-08-25: the ground is cream, and the mark is being drawn

Recorded here rather than edited into the contract above, because the contract
is what the owner chose and a silent rewrite of it would erase the fact that it
changed.

**OWN-WORLD's first line is superseded.** It says "Bright white ground
(#FFFFFF), ink (#111111)". The ground is now warm cream `#f4f1ea` and the ink a
warm charcoal `#24211c`, with the whole grey ramp warmed to match. Everything
else in OWN-WORLD stands: one utility red and nothing else chromatic, hairline
rules, sharp corners with no radius above 2px, no shadow, no gradient, compact
sans at 11-13px.

**Why:** the owner's brand references -- collected in an interview on the same
day, after two rounds of generated marks were rejected -- were uniformly warm
cream with soft charcoal line work. Asked directly whether the brand should
follow the app's committed world or the app should follow the brand, the owner
chose **the app follows the brand**. The seed key and the direction are
untouched: `ac1ba604`, challenger `japanese-high-density-web`. This is a
temperature change inside that world, not a new one.

The computed contrast for every pair is in `apps/web/src/tokens.css`'s header,
including the one that does not reach AA and why it was left.

**FIRST VIEWPORT gained a shell it did not specify.** `AppShell` renders a
full-bleed sticky bar above everything -- product identity left, manifest path
right. The contract's left rail (240px, project identity plus a band index) is
**still unbuilt**, and the bottom two-thirds of the screen is still empty; both
remain open.

**The mark is deferred**, by the owner, after three directions were explored and
none chosen: abstract precision instruments, a coffee cup holding a catalog, and
the board's own tiles arranged as a C. `PRODUCT.md`'s Brand Commitments carries
what each attempt taught. `BrandMark` sets the wordmark and renders no glyph,
marked `data-mark="placeholder"` in the DOM with a test pinning it.

What survived the exploration as settled: **ink only** -- the utility red stays a
signal colour and is never spent on the brand -- a **primary mark plus a derived
reduced variant** rather than one asset constrained by the favicon case, and the
drawing register of the owner's references: uniform stroke weight, rounded caps,
no fill, warm charcoal on cream.

### Run status, updated

Of the four steps recorded as not done above, none has been completed, and one
has changed shape:

1. The contract is still not embedded in the emitted markup.
2. The finish review still has not run -- and should still wait, because the
   mark is not in yet.
3. `DESIGN.md` still does not exist.
4. The mechanical detector still has not been run.

**Mobile has now been looked at**, which the note above said had never happened.
It was measured in a 390px same-origin iframe rather than on a device: no
horizontal overflow on the board or the service page, and the board is about 2.1
screens tall. That is a weaker instrument than a real device and the popover's
touch behaviour is still unverified, but it is no longer true that nobody has
looked.

---

## Revision -- 2026-08-26: two steps closed, two still waiting on the owner

Recorded as a revision rather than by editing the list above, for the same reason
the cream revision was: the list is the record of what a session found, and
overwriting it erases the fact that it changed.

**The owner was asked directly on 2026-08-26 and released two of the four steps.**
The condition blocking the other two is unchanged and is theirs: the finish
review waits on the mark, which they have deferred ("the logo is something I need
to think on my time"). Two options were live and both were declined -- closing
the run over the labelled placeholder, and leaving the run entirely -- and they
are written down here so a later reader can see they were weighed rather than
missed.

### Step 1 -- the contract is now embedded in the emitted markup. DONE.

It lives in `apps/web/index.html`'s opening comment, above `<head>`, and it
survives `vite build` into `apps/web/dist/index.html` and from there into
`packages/cli/dist/web/index.html` -- the copy `catalogus view` actually serves.
Verified through the serving path rather than the filesystem: `curl -s
http://127.0.0.1:<port>/ | grep -c ac1ba604` returns 2 against a running
`catalogus view`, and the comment parses as `<html>`'s first child in the live
DOM.

`apps/web/src/direction-contract.test.ts` pins all three copies. An HTML comment
has no failure mode a human notices -- nothing renders differently and no warning
fires if a future Vite, an added minifier, or a routine edit to the script tag
takes it away.

**The embedded copy is verbatim, and that is a decision the guard enforces.** All
seven contract sections match this file word for word, with six declared
departures listed in the comment's own DEPARTURES section -- in this file's own
words -- and in the test's `DECLARED_DEPARTURES` table. Any *undeclared* wording
difference fails the suite, in either direction: the embedded copy edited to
flatter the build, or this file edited without the page following. A contract
quietly rewritten to match what got built is worth less than no contract, because
the gap it should have exposed is exactly what the rewrite removes.

**That shape took five versions and four validation passes, and each attack
landed in whatever the previous version had left uncompared.** Presence-only
checks passed all sixteen of their assertions while a validator held the mode
flipped to Edit, THESIS replaced with prose arguing the opposite direction, the
disclosure section deleted, and the warmed hairline swapped back to the
pre-warming neutral -- all at once. The version that replaced it compared five of
the seven sections, and a second pass walked past *that* four ways: deleting the
whole CONSTRAINTS section (the one carrying "No search" and "Read-only: no
editing affordance anywhere"), inverting "no search field" in *both* files,
declaring an undecided rewording in the departures table, and -- worst --
rewriting the red's honest account into a fresh invented reason, because the
DEPARTURES prose was the one region the comparison did not reach. The unchecked
region and the load-bearing region had become the same region.

The third pass got past it four more times. Two were one shape, and it is about
*scope* rather than coverage: a pin that reads the whole comment for a string
occurring twice, so `no search field` was satisfied by the paragraph describing
the attack on it while the constraint itself was inverted. **A pin shadowed by a
second occurrence of its own string is not a pin.** The other two were plainer:
`FINISH: unreviewed and undocumented is unfinished` had stopped being pinned at
all while everything around it was widened, and the paragraph stating the guard's
own limits could simply be deleted. The fourth pass found the last uncompared
region, the comment's preamble, where a count had already gone stale -- it
claimed five contract sections while the guard compared seven. That one was
closed by deleting the counts rather than pinning them, since both are stated
further down where they are checked.

What ships compares all seven sections, scopes each pin to the region it is about,
pins FINISH and the paragraph stating the guard's own limits, requires every
declared departure to appear in the page in this file's words, keeps this file
named as the source of truth in the preamble, and trips on a claim that the red
question is settled while `--color-signal` is not `#E60012`. All eleven mutations
from the earlier passes now fail between 1 and 5 tests, applied one at a time with
a rebuild between, re-measured independently by the validator. **What it still cannot do is stated in the
page itself**: it proves the two copies agree, not that either is what the owner
chose, and no test can tell whether prose is truthful. Git history is the only
backstop, this repo has no CI, and review of the diff is the control.

Five of the six departures are the 2026-08-25 warming (ground, ink, hairline,
header fill) plus one tense change in THESIS. **The sixth is a defect this pass
found rather than a decision anyone made** -- see below.

### The red was never `#E60012`, and nobody recorded why

OWN-WORLD names `#E60012`. The shipped `--color-signal` is `#d40010`, and the
first draft of the embedded contract explained that as part of the warming:
"the red moved with the rest of the ramp for the same reason and is recorded the
same way". **That explanation was invented, and validation caught it.**

What the history actually shows:

- `--color-signal` was `#d40010` at `e92761d`, *before* the warming commit
  `763dba3`, while the ground was still `#ffffff` and the ink `#111111`.
- `git log --all -S E60012` returns exactly one commit: `45be40f`, the one that
  rescued this document. `#E60012` has never appeared in a stylesheet here.
- This file's warming revision names only the ground and the ink as superseded,
  and says "everything else in OWN-WORLD stands: one utility red". `tokens.css`
  listing `signal #d40010 4.9:1 AA` among the warming's pairs is a
  *recomputation of contrast against a new ground*, not evidence the hex changed.

So the red diverged from the contract at first implementation, unexplained. **It
is the owner's to rule on** -- accept `#d40010` into the contract, or move the
token to `#E60012` and recompute its contrast against the cream ground. The
embedded copy carries the shipped value, because a contract inside the page must
describe the page, and says plainly that the divergence is unexplained.
`tokens.css` carries the same note at the declaration itself, which is where
someone changing the red would look.

This is worth reading twice as a process finding rather than a colour one: a
plausible reason written where a fact was missing, placed in the one document a
reader would trust, as a comment nothing will ever contradict. `CLAUDE.md` names
that defect class, and the pass that produced it was the pass whose whole subject
was honesty about what the build does.

### Step 4 -- the mechanical detector has now been run. DONE, one finding, no change.

`node <impeccable>/skill/scripts/detect.mjs apps/web/index.html apps/web/src`
returns exactly one anti-pattern: `side-tab` at
`apps/web/src/components/RankModule.module.css:63` --
`border-left: 3px solid var(--color-signal)` on `.selected`.

**It is not in the shipped app, and the reason is stronger than "unreachable".**
`RankModule` has no caller anywhere under `apps/web/src`: the owner removed the
"most depended on" ranking on 2026-08-25, and `ProjectBoard.tsx` records that the
component and `bands.ts`'s `mostDependedOn` were kept rather than deleted. The
component and its stylesheet are tree-shaken out -- `grep -rio "border-left"
apps/web/dist` returns one hit and it is `@xyflow`'s, and "Most depended" appears
in no bundle chunk. Driving the live app through no hash, a real service hash, a
bogus one and a malformed one never renders it.

**A first pass filed this under the four dead selected-state treatments the
2026-08-26 handoff records as open, and that was wrong.** Those four --
`ServiceNode.selected`, `GraphCanvas.edgeIncident`, `MigrationList`'s
`[aria-pressed="true"]`, `ServiceTile.selected` -- live in components that do
render, and their open question is a design one: should a view show where you
came from. This one is a rule in a component the owner already removed. Different
item, different remedy: if the ranking ever returns, the 3px red side border is a
real hit and should be redrawn in the world's own grammar.

Running the detector over the *built* CSS adds nothing: its single hit is inside
vendored `@xyflow/react` CSS, a 1px border read out of minified text. The source
scan is the signal.

### What the contract still does not describe, now written into the page

The disclosure section of the embedded comment names each place the build and the
contract disagree, so a reader of the shipped page is not left to discover them
as discrepancies. Three of them were found by this pass and are recorded here for
the first time:

- **The spine is a list, not a routed chain.** FIRST VIEWPORT asks for the
  request-path band to be "drawn as a routed chain rather than a list"; it
  renders as an ordinary `BandModule`.
- **There is no heavier face for numerals.** OWN-WORLD asks for one; there is no
  webfont, by the no-network constraint in `tokens.css`'s header, so numerals are
  the system face's tabular figures.
- **The band names are not the contract's.** It names five; `bands.ts` ships
  seven plus `Unplaced`, with the request-path band renamed "Runs in production"
  by the owner and "Calls out to" / "Registered at" having no counterpart in the
  contract at all.

The two already known are there too: the left rail is still unbuilt and the mark
is still deferred. And "red header tabs" describes a filled tab where the build
spends the red on the active tab's underline -- across the whole board the signal
colour appears in three places: that underline, the module header counts, and
red-outline tag marks.

### Steps 2 and 3 remain open, unchanged

The finish review has not run and `DESIGN.md` does not exist. Both wait on the
mark, by the owner's standing condition -- the documenter writes `DESIGN.md` from
the built world, and a world whose identity is a labelled placeholder is not that
world yet. The condition lifts when the mark exists or when the owner says the
review may proceed over a `BrandMark` that deliberately draws no glyph.

---

## Revision -- 2026-08-26 (later the same day): the world changes to candidate E, and the contract above becomes history

This is a third kind of change to this file. The 2026-08-25 warming revised two
values inside the same direction; the "two steps closed" revision above embedded
the contract and ran the detector without changing it at all. This one replaces
the direction itself: `japanese-high-density-web` is retired by owner decision,
and what stands at the top of this file now is candidate E, the home screen --
see `docs/PLAN.md`, "The form is settled: candidate E, the home screen" and "The
design interview ran on 2026-08-26" for the interview, the six candidates built
to compare, and the render-and-measure pass that found real defects in three of
them before any was chosen.

### Why the seed key stayed and the direction did not

`ac1ba604` names the Impeccable run, which is still open -- it has not finished,
and finishing is what would close it. The *direction* inside that run is what
the owner replaced, by picking outright from six built candidates rather than by
rolling again. Minting a new seed key for the replacement would make it look
like the output of a roll that never happened, which is the same shape of
invention CLAUDE.md names for a coding-agent guess; not minting one, and simply
retiring the old direction's name while keeping the run's key, records what
actually happened instead.

### What did not carry forward, and why

"First screen = the shape of the system" is not in the new CONSTRAINTS section.
It asserted the whole shape fits without scrolling, which is exactly what
"breathing room wins" retires -- the two cannot both be true, and the more
recent owner instruction is the one that stands. Nothing replaces it: dropping a
constraint the owner's own later answer contradicts is not the same as inventing
a new one to fill the gap.

### The red, ruled

The "two steps closed" revision above left the red as an open question: OWN-WORLD
named `#E60012`, `--color-signal` had been `#d40010` since before either the
warming or this world change, and nothing in the repo recorded why. **The owner
ruled the same day: accept `#d40010`.** Measured against the cream ground
`#f4f1ea`, `#d40010` gives 4.89:1 (AA) and `#E60012` gives 4.26:1 (below AA) --
the old contract's own value no longer clears AA on the ground the owner chose
the day before, which this direction change did not touch. OWN-WORLD above
states `#d40010` directly now, so this is no longer a divergence to depart from;
it is closed.

**The ruling closes the question, it does not answer it.** It settles which
value ships, not why `--color-signal` was implemented as `#d40010` on day one,
while the ground was still `#ffffff` and neither temperature change had happened
yet. `git log --all -S E60012` still returns exactly one commit -- the one that
rescued this document -- and no commit anywhere records a decision to diverge.
That remains true regardless of the ruling above, and this file says so rather
than letting one answered question read as though it answered the other.

### What is open now

Everything the previous revision listed as unbuilt against the old world is
moot: the old FIRST VIEWPORT's routed-chain spine, its MOST DEPENDED ON rank
module and its five band names described a world that no longer has a contract.
What replaces them is a single, larger fact: **none of candidate E -- the icon
grid, the corner badges, the two-line labels, the rail, the footer, the help /
settings / profile cluster -- has been built into `apps/web/src` yet.**
`tokens.css` carries its geometry as additive tokens only, lifted from the
approved mockup; no component consumes them. Rebuilding against this contract is
separate, tracked work, and `apps/web/index.html`'s disclosure section says so
plainly rather than leaving a reader to discover it by comparing the page to the
mockup themselves.

One limitation is real and carried over from the mockup rather than invented for
this file: a hover popover on an icon in the grid's outermost columns can push
past the viewport edge between 768px and 1280px, because the mockup centres it
with CSS alone. The React build should solve this with real edge detection
rather than inherit it.

The finish review and `DESIGN.md` are still waiting on the mark, unchanged by
any of this -- see the "two steps closed" revision above for the condition.

### The retired contract, for the record

Quoted here rather than deleted, because a contract nobody can read again is not
much of a record. Headings below are bolded rather than marked `##` so nothing
here is mistaken by the guard for a live section.

**Seed key: ac1ba604 · direction: challenger `japanese-high-density-web`**
(user-chosen; a user pick beats the roll). Mode: **Read**.

**THESIS.** A project's whole operational reality on one screen, dense enough
that you never search for anything. It refuses the category default this app
currently ships -- the dark dashboard of evenly-weighted cards under
alphabetical headings -- and refuses its predictable opposite, the airy white
docs page with thin grey rules and a blue link. Density is the argument: 35
services, 41 edges, five architecture bands, no scrolling to find a thing.

**OWN-WORLD.** Bright white ground (#FFFFFF), ink (#111111), one utility red
(#E60012) and nothing else chromatic. Hairline grey (#E0E0E0) rules every
module; light grey (#F2F2F2) fills header tabs. Boxed modules tile edge to edge
in an uneven grid -- a wide spine module beside narrow stacked ones -- each with
a small header bar carrying a title left and a count right. Sharp corners
throughout, no radius above 2px, no shadow, no gradient. Compact sans at 11-13px
with tight leading; a heavier face for numerals. Tags are small sharp rectangles
in four weights: red solid, red outline, black solid, grey solid. Icons are
1.5px line work. Recognizable with all content removed by: hairline module
mosaic, red header tabs, tabular numerals, zero rounding.

**STORY.** The reader opens a project they have not touched in six months, or
hands it to someone who has never seen it. In one viewport they understand the
shape -- what serves requests, what it runs on, what holds the data, what
watches it, what builds it -- and they can see which few services everything
else hangs off. They click one and land on its page.

**FIRST VIEWPORT.** Left rail (240px): project identity, then the band index
with counts, no search field. Main field: a two-row header (project name +
architecture sentence, then the List/Graph/Migrations rail with a red underline
on the active one). Below it the module mosaic -- ON THE REQUEST PATH spans the
full width as the spine, drawn as a routed chain rather than a list; beneath it
RUNS ON, HOLDS DATA, WATCHED BY, BUILT AND SHIPPED BY tile in an uneven grid
sized to their contents; MOST DEPENDED ON sits right as a numbered rank module.
No primary action -- this is Read mode; the action is clicking a service.

**FORM.** Dense module mosaic, candidate 2 of the challenger hand, chosen by the
user over the assigned grounded direction (the manifest/bill-of-lading world).
Seed key ac1ba604.

**Mapped from the world's own grammar, not invented.**
- struck old price + red new price -> `phasing_out` with its `replaced_by`
- numbered ranking module -> most depended on, by inbound edge count
- red outline "NEW" tag -> recently added (answers HANDOFF §4.2 query 5)
- `active` carries no tag: tagging the norm is what produced 35 identical pills
- `deprecated` -> black solid tag; `removed` -> grey solid; `phasing_out` -> red
  outline

**Constraints carried in from PRODUCT.md.**
- No search. "It should fit." (owner)
- Organize by architecture, not alphabet. (owner)
- First screen = the shape of the system. (owner)
- Hover -> popover near the item; click -> the service page. (owner, supersedes
  viewer-foundations decision 4)
- Read-only: no editing affordance anywhere. Editing arrives with Phase 4.
- 38% of services have no brand icon; the category fallback must look
  deliberate.
- Keep meaning out of colour alone -- greyscale must survive.

**Open, to solve honestly during the build.** `role` does not encode which band
a service belongs to. A `role -> band` table must be authored, following
`rollup-labels.ts`'s existing pattern: seed from SKILL.md's documented
vocabulary, and let an unmapped role land in a clearly-named band rather than be
guessed into one. *(Resolved since: `bands.ts` carries exactly this table, and
the viewer groups on it.)*

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, and DESIGN.md.

---

## Revision -- 2026-08-31: candidate E is built, less the shell, and one ruling closes a rule

The section "What is open now" above is a dated record of 2026-08-26 and stays as
written. This revision supersedes it on two points and adds a third.

### The build caught up with the contract, except for the shell

"None of candidate E has been built into `apps/web/src` yet" was true when it was
written and is no longer. Built since, each against
`apps/web/docs/candidates/candidate-e-homescreen.html`: the icon grid and its
band headings, the bare-icon tile with its two-line label and corner status
badge, the hover popover's six-fact grid, the service page, the migrations board
and the graph. The two views without a mockup -- migrations and the graph --
were moved by matching this world's rules and reusing the tile's and the
popover's own measured values, not by inventing a second vocabulary for the same
facts.

**What is left is the shell.** `AppShell.tsx` is a top bar carrying the wordmark
and the manifest path. FIRST VIEWPORT's left rail with the band index, its
footer, and its help / settings / profile cluster and their menus are unbuilt, so
the contract still describes a first viewport nobody has seen.

### The mockup's edge-column popover is solved

Also from that section: the hover popover pushing past the viewport edge between
768px and 1280px. The React build centres under the tile, clamps into the
viewport, prefers below, and flips above only where the stylesheet's own 60vh
ceiling fits there -- so an estimate that is wrong places the popover low or
high, and cannot place it over the tile it describes. A first attempt got the
flip wrong in exactly that way and shipped; a validator reproduced it before
anyone saw it on screen.

### Signal red: the rule stands, and the build was wrong rather than the rule

OWN-WORLD says signal red is spent in exactly two places, the status badge and
the status word, "and nowhere else: not a view, not a count". The build spent it
in more than two -- the popover's "no catalog entry" line, the same fact on the
service page, the view rail's active-tab underline, and some of the tag tones.
Put to the owner on 2026-08-31 with the option of amending the contract to
license a third place, **the owner ruled that the rule stands and the build is to
be corrected.** Nothing in OWN-WORLD changes; the extra sites move onto ink, and
a guard now fails the suite on a red site outside the two.

The same day the owner also ruled on a case the contract does not cover: a
service that is `status: active` and carries `replaced_by`, which the schema
permits. **Both surfaces show it.** It is not the norm the "active carries no
badge and no status word" rule protects -- it is the exception that rule exists
to make visible.

### Still open, unchanged

The mark, and with it the finish review and `DESIGN.md`, by the owner's standing
condition.

### Note -- 2026-09-02: three of the four sites had not moved, and there was no guard

The paragraph above says "the extra sites move onto ink, and a guard now fails
the suite on a red site outside the two." It is written in the present tense of
an accomplished fact, and on 2026-09-02 a validator executed the built app and
found that neither half of it was true yet.

Of the four sites the ruling named, one had moved: the popover's "no catalog
entry" line, which is ink in `ServicePopover.module.css`. The other three had
not.

- **The same fact on the service page.** `ServicePage.module.css`'s
  `.uncatalogued` was still `--color-signal`. This one is worth stating exactly,
  because the file was not silent about it: the correction pass wrote the
  owner's ruling into that stylesheet's header at length, said the marker "moves
  to ink here and in `ServicePopover.module.css` together, in the same pass" --
  and changed only the popover. For two days the file carried an accurate
  account of a fix it had not made, which is the most expensive shape this kind
  of miss can take, since a reader checking whether the site moved finds a
  paragraph saying it did.
- **The view rail's active-tab underline.** `ViewToggle.module.css`'s
  `.current::after` was still `--color-signal`, and that file's own header
  called it "the only place on this page besides a count where the signal colour
  is spent" -- a licence OWN-WORLD does not grant and never did. Both halves of
  that sentence are the clause the contract writes as "not a view, not a count".
- **The tag tones.** `--tag-phasing-line`, `--tag-phasing-ink`, `--tag-new-line`
  and `--tag-new-ink` all still aliased `--color-signal`, so a `phasing out` tag
  and a `new` tag on an active service went on rendering red on the popover and
  the service page throughout. `Tag.module.css`'s header stated the defect
  plainly as a decision -- "the tone -> colour mapping is untouched".

And there was no guard of any kind in the tree.

This pass moved all three onto ink and wrote `apps/web/src/signal-red.test.ts`,
which scans every stylesheet under `apps/web/src` for the signal hex, its `rgb()`
forms, and any custom property that resolves to it transitively -- the tag tokens
were one hop, and one more would have hidden them from a scan looking only for
the token's own name. Its allow-list names selector plus property rather than
files, so a new red rule in a stylesheet that already draws a badge still fails,
and every entry must still match a real declaration, so a permission cannot
outlive the rule it was written for. The mutation it was checked against -- a red
rule appended to `ProjectBoard.module.css` -- takes the suite red.

**One red site is neither fixed nor licensed, and is the owner's to rule on.**
`RankModule.module.css` paints a red left border on the selected row and a red
chip on the top-ranked one; the chip is the "not a count" clause almost word for
word. It is not corrected here because `RankModule` has no caller -- the owner
removed the ranking from the board on 2026-08-25 ("the most depend panel is noise
for now") -- so no reader sees the red, and choosing what replaces it is a design
decision on a component that is off the board. The contract says *not red*; it
does not say what instead. The guard carries the two rules in a quarantine list,
named per selector and dated, which is not a licence: any other red rule in that
file still fails, and either rule going green makes its own entry stale and fails
too. It resolves when `RankModule` next has a caller, or when the file goes.

**What the whole entry is evidence for.** Every one of the three sites had a
comment beside it discussing the red, two of them stating the ruling correctly,
and one stating that the fix had been applied. Prose next to a rule is not a
guard on that rule -- it reads as the decision, which is exactly how a reader
gets past it.
