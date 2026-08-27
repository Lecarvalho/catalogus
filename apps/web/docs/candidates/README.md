# Design candidates — the 2026-08-26 redesign

Six static mockups of the viewer's board screen, built to settle a design direction the owner had
twice rejected. **Candidate E is the approved one.** The rest are kept because knowing what was
rejected is most of what makes the choice legible later.

These are committed rather than left in a scratchpad because they are the **specification** for the
component work that has not been done yet. A later session implements E in `apps/web/src`; this
directory is what it implements *against*.

## Viewing them

They are self-contained: no network, no build, no dependencies. `index.html` is a switcher that
loads each one in an iframe, so it needs to be served rather than opened over `file://`:

```
cd apps/web/docs/candidates && npx --yes serve .   # or any static server
```

Individual candidate files open fine directly over `file://`.

## What each one is

| | Form | Brand marks | Outcome |
|---|---|---|---|
| **A** | Document — measured column, band panels, service rows | Ink only | Not chosen |
| **B** | Grouped database table with shared columns | Colour, 20px | Not chosen |
| **C** | Gallery — band sections of cards, hub cards span two columns | Colour | Not chosen |
| **D** | Icon wall — bordered tiles, vendor name + id below | Colour | Superseded by E |
| **E** | **Home screen — bare icons on the ground, no card** | **Colour** | **APPROVED** |
| **F** | App list — icon left, name and id right, one per row | Colour | Not chosen |

## The world they all share

Settled by an owner interview on 2026-08-26, recorded in full in `docs/PLAN.md`:

- **Notion** as the reference. Not Confluence.
- **Warm cream ground** `#f4f1ea`, warm charcoal ink, **one red** `#d40010` and nothing else
  chromatic in the UI. Brand marks are the declared exception.
- **Breathing room** over density. Scrolling is allowed; the old world's "it should fit" is retired.
- **No search**, ever. Bands and the left rail carry finding.
- **Sharp structure, soft transients** — radius and shadow on popovers and menus only, plus the one
  contained exception E introduced and the owner approved: the icon tile's phone-like radius.
- **Organize by architecture, not alphabet.** Seven bands plus `Unplaced`.

## What E actually decided, and why each was hard

- **Bare icons, no card.** The owner's instruction was *"it doesn't need all that shell"*, which was
  first misread as the app chrome. They meant the card around each service. The app shell is
  separately approved and frozen — *"Your new app shell is perfect, don't touch it."*
- **Two-line label: vendor name, then the manifest `id`.** `host-api`, `host-web` and `host-worker`
  are all Fly.io; `db-primary` and `db-replica` are both PostgreSQL. A label showing the vendor name
  alone renders the same tile three times. The stress fixture exists to expose exactly this.
- **Status without hover, in greyscale, three independent ways**: a corner badge with a distinct
  pictogram per status (readable by shape alone), the brand mark desaturated, and the status spelled
  out in words under the label. Verified under a full-page `grayscale(1)` filter.
- **`legacy-ledger` keeps its tile** — dashed border, sunken fill, `AL` monogram from the raw slug
  `acme-ledger`. It is the 38%-with-no-brand-icon case, and an icon-led form is where it is most
  exposed.

## Data

All six render the same real fixture — `examples/layout-stress.catalogus.yaml`, 35 services,
48 dependencies, 21 rollups, band counts 7/7/6/4/4/5/1/1. Nothing is lorem and every number on
screen is computed from that file. `icons.json` carries the `simple-icons` path data they inline;
`acme-ledger` is deliberately absent from it.

## Verification state

`check.mjs` is the mechanical checker used on all six:

```
node check.mjs candidate-e-homescreen.html
```

It asserts the 35 ids and 32 display names, the band labels, the token values, absence of remote
assets / `@import` / `fetch`, absence of unexpected hexes outside inline SVG, and absence of any
search field or editing affordance.

All six passed it, and all six measured clean for horizontal overflow at 1600 / 1440 / 1280 / 1024 /
768 / 390 through fixed-width iframes. **Rendering them found three defects that reading them had
not** — a 390px overflow in A, a 1024px overflow in B, and two invented CLI version numbers — which
is the argument for driving a built page rather than inspecting its source.

## Known limitation in E, for whoever implements it

Hover popovers on icons in the grid's **edge columns** can extend past the viewport between 768 and
1280px. The mockup centres them with CSS alone and cannot flip at an edge. In the React
implementation this is a solvable positioning problem and should be solved rather than inherited.
