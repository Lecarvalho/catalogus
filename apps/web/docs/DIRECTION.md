<!--
  Rescued from a session-scoped scratchpad on 2026-08-25 and committed here so
  it survives. The Impeccable flow writes this contract during a run and expects
  DESIGN.md to be written from the *built* world at finish; that finish step has
  not run, so this file is the contract, not the design system. See the note at
  the foot of this file for exactly what is left.
-->

# Direction contract — Catalogus viewer

Seed key: ac1ba604 · direction: challenger `japanese-high-density-web` (user-chosen; a user pick
beats the roll). Mode: **Read**.

## THESIS

A project's whole operational reality on one screen, dense enough that you never search for anything.
It refuses the category default this app currently ships — the dark dashboard of evenly-weighted
cards under alphabetical headings — and refuses its predictable opposite, the airy white docs page
with thin grey rules and a blue link. Density is the argument: 35 services, 41 edges, five
architecture bands, no scrolling to find a thing.

## OWN-WORLD

Bright white ground (#FFFFFF), ink (#111111), one utility red (#E60012) and nothing else chromatic.
Hairline grey (#E0E0E0) rules every module; light grey (#F2F2F2) fills header tabs. Boxed modules
tile edge to edge in an uneven grid — a wide spine module beside narrow stacked ones — each with a
small header bar carrying a title left and a count right. Sharp corners throughout, no radius above
2px, no shadow, no gradient. Compact sans at 11–13px with tight leading; a heavier face for numerals.
Tags are small sharp rectangles in four weights: red solid, red outline, black solid, grey solid.
Icons are 1.5px line work. Recognizable with all content removed by: hairline module mosaic, red
header tabs, tabular numerals, zero rounding.

## STORY

The reader opens a project they have not touched in six months, or hands it to someone who has never
seen it. In one viewport they understand the shape — what serves requests, what it runs on, what
holds the data, what watches it, what builds it — and they can see which few services everything
else hangs off. They click one and land on its page.

## FIRST VIEWPORT

Left rail (240px): project identity, then the band index with counts, no search field. Main field: a
two-row header (project name + architecture sentence, then the List/Graph/Migrations rail with a red
underline on the active one). Below it the module mosaic — ON THE REQUEST PATH spans the full width
as the spine, drawn as a routed chain rather than a list; beneath it RUNS ON, HOLDS DATA, WATCHED BY,
BUILT AND SHIPPED BY tile in an uneven grid sized to their contents; MOST DEPENDED ON sits right as a
numbered rank module. No primary action — this is Read mode; the action is clicking a service.

## FORM

Dense module mosaic, candidate 2 of the challenger hand, chosen by the user over the assigned
grounded direction (the manifest/bill-of-lading world). Seed key ac1ba604.

## Mapped from the world's own grammar, not invented

- struck old price + red new price -> `phasing_out` with its `replaced_by`
- numbered ranking module -> most depended on, by inbound edge count
- red outline "NEW" tag -> recently added (answers HANDOFF §4.2 query 5)
- `active` carries **no tag**: tagging the norm is what produced 35 identical pills
- `deprecated` -> black solid tag; `removed` -> grey solid; `phasing_out` -> red outline

## Constraints carried in from PRODUCT.md

- No search. "It should fit." (owner)
- Organize by architecture, not alphabet. (owner)
- First screen = the shape of the system. (owner)
- Hover -> popover near the item; click -> the service page. (owner, supersedes
  viewer-foundations decision 4)
- Read-only: no editing affordance anywhere. Editing arrives with Phase 4.
- 38% of services have no brand icon; the category fallback must look deliberate.
- Keep meaning out of colour alone — greyscale must survive.

## Open, to solve honestly during the build

`role` does not encode which band a service belongs to. A `role -> band` table must be authored,
following `rollup-labels.ts`'s existing pattern: seed from SKILL.md's documented vocabulary, and let
an unmapped role land in a clearly-named band rather than be guessed into one.

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
