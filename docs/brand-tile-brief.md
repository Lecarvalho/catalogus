# Brief: one tile per brand per band, the brand page, and the entry page that breathes

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first.
The comment register of neighbouring files is the register you write in: every decision gets a
comment beside the code, in full sentences, dated, with the reason.

**The mockup is the specification for what it draws:** `apps/web/docs/candidates/candidate-e-brandpage.html`,
three artboards, approved by the owner on 2026-09-04 (artboard 3 after one revision, see Part C).
Read its leading HTML comment and the comments at each artboard: they record what was decided and
what was not. `apps/web/docs/DIRECTION.md` binds everything (cream world, signal-red ruling). A
static mockup is a specification for what it draws, not for what it does — the 2026-09-03 handoff
in `docs/PLAN.md` has the sticky-head lesson — so behaviour (hover, click, keyboard, routing,
clamping) follows the existing components' conventions, not the mockup's silence.

## What the owner decided (docs/PLAN.md, "Owner decisions — 2026-09-04", and findings 4 + 5 of 2026-09-03)

- **One tile per brand per band.** Within one band, every entry sharing a catalog `service` slug
  shares one tile; Supabase in two bands keeps a tile in each. A band with no repeats is
  unchanged. `collapseByService` in `bands.ts` already does the per-band collapse and has had no
  caller since `e1f7dba`; it gets one again.
- **A multi-entry tile's second line is the entry count** ("5 entries"), in the id line's slot,
  not mono (mono marks a typeable literal; a count is not one — the mockup's comment).
- **Group status:** the tile carries the group's worst status (`groupStatus`) as the corner
  badge and the red status word (`<id> phasing out`, mono id, no arrow — the arrow means
  "replaced by" everywhere else). **The mark stays in colour**: no whole-mark desaturation for a
  group, because dimming four live apps for one phasing-out entry is the wrong signal (owner,
  2026-09-04). A single-entry tile keeps today's full treatment, desaturation included.
- **The popover for a group** keeps its header (mark, name, "5 entries") and lists the entries —
  id, role beneath, status word right when off the norm — **in place of** the six-fact grid; note
  and hint are dropped for groups. Each row is a link to that entry's own page. A single-entry
  popover is unchanged.
- **Clicking a multi-entry tile opens the brand page**; a single-entry tile still opens the
  entry page directly.
- **Counts stay entry counts everywhere** — rail, band header, footer. The tile's "5 entries"
  explains the gap between nine entries and five tiles. Nothing in `Footer`, `Rail` or
  `BandModule`'s header changes.
- **The graph stays per entry. Migrations stay per entry.** Neither is touched.
- **The brand page** (artboard 2): the entry page's frame — crumb, bare mark, brand name, catalog
  slug, then Kind / Band / Entries once as a fact grid in the header; below, an "Entries" section
  with rows id / role / status / version, each a link to the entry page. No facts aside, no
  Layer-3 block (those are per entry, HANDOFF §4).
- **The entry page breathes** (artboard 3, Part C): same content, more air; the facts become a
  right-hand sidebar stack; an entry of a multi-entry brand gets a second breadcrumb crumb
  naming the brand (linking to the brand page).

## Shared contract, fixed here so three agents can build in parallel

- **Route.** `#/brand/<bandId>/<serviceSlug>` is the brand page. `hash-route.ts` gains
  `brandFromHash(hash): { band: BandId; service: string } | null` and
  `hashForBrand(band, service)`; `serviceIdFromHash` is unchanged. Part A owns the file.
- **Group shape.** `VendorGroup` from `bands.ts` is the group, unchanged:
  `{ service, name, icon, rollup, entries: [ViewService, ...ViewService[]] }`. A band's tiles are
  `collapseByService(bandGroup.services)`, in that function's existing order.
- **`BrandPage` props** (Part B builds it, Part A wires it):

  ```ts
  export interface BrandPageProps {
    group: VendorGroup;
    band: BandDefinition;
    projectName: string;
    readAt: string;
    onBack: () => void;                 // to the board
    onOpenEntry: (id: string) => void;  // to #/service/<id>
    pageRef?: Ref<HTMLElement>;
  }
  ```

- **`ServicePage` gains one optional prop** (Part C adds it, Part A passes it):

  ```ts
  brand?: { name: string; entryCount: number; href: string };  // present only for an entry of a multi-entry group in its band
  ```

- **No new token in `tokens.css` from Parts A or B.** The mockup introduced no number candidate E
  lacked; if you believe you need one, stop and say so in your report rather than adding it.
  Part C owns `tokens.css` for the entry page's air and is the only writer of it.
- **`BandModule`'s `services` prop stays the flat entry list** (the header count needs it);
  the collapse happens inside `BandModule`, once, and the tile receives a `VendorGroup`.

## Part A — the wall, the popover, the routes (one agent)

### Files you own
- `apps/web/src/bands.ts`, `bands.test.ts` (only if `collapseByService`/`groupStatus` need a
  change; their comments say they have no caller — update that)
- `apps/web/src/components/BandModule.tsx`, `.module.css`, `.test.tsx`
- `apps/web/src/components/ServiceTile.tsx`, `.module.css`, `.test.tsx`
- `apps/web/src/components/ServicePopover.tsx`, `.module.css`, `.test.tsx`
- `apps/web/src/components/ProjectBoard.tsx`, `.test.tsx` (prop threading only)
- `apps/web/src/hash-route.ts`, `hash-route.test.ts`
- `apps/web/src/App.tsx`, `App.test.tsx` — the peek state carries a `VendorGroup`; the brand
  route renders `<BrandPage>` from `./components/BrandPage.js` with the props above (Part B is
  writing that file now; until it lands, build against the interface and expect the import to
  resolve when you run the suite — coordinate through the main session if it does not).
  Pass `brand` to `ServicePage` for an entry whose band group has more than one entry.

Do not touch `BrandPage.*`, `ServicePage.*`, `ServiceSummary.*`, `tokens.css`, `Footer.*`,
`Rail.*`, `GraphCanvas.*`, `ServiceNode.*`, `graph-layout.ts`, `MigrationList.*`.

### Build
Artboard 1, exactly. The tile's DOM id for a group: `serviceTileDomId` keyed on
`${band.id}-${service}` for groups, on the entry id for single entries — write down why in the
function's comment (deep-link focus restore in `App.tsx` keys on it; check `App.test.tsx`'s
focus-restore test). Keyboard: a group tile is one button, Enter opens the brand page, the
popover's rows are real links (`<a href="#/service/<id>">`) reachable by Tab while the popover is
pinned by focus, the same way the existing popover is reachable. The popover's placement code
(`popover-placement.ts`) is unchanged; the taller group popover must still clamp — `App.tsx`
measures the real box, so it should, but prove it with a test that renders a five-entry group at
the bottom of a short viewport.

Rewrite the tests that assert one-tile-per-entry (`BandModule.test.tsx`'s describe, the
App.test.tsx "two entries of one vendor two tiles" case, the header comments in
`ServiceTile.test.tsx`, `ServicePopover.test.tsx`, `ProjectBoard.test.tsx`) to assert the new
rule, and keep the single-entry behaviour tests as they are — they are still true.

## Part B — the brand page (one agent)

### Files you own
- new: `apps/web/src/components/BrandPage.tsx`, `BrandPage.module.css`, `BrandPage.test.tsx`

Nothing else. Build to the props interface above and artboard 2. Reuse `ServicePage.module.css`'s
vocabulary by reading it, not by importing it (CSS Modules hash per file — write your own rules
with the same tokens). The rows are links; the status column is ink (a labelled fact, the
mockup's comment); version reads "not tracked" dim when absent, the way `ServiceSummary` does it.
Test: renders every entry as a link with the right href, the header facts, singular "1 entry"
never occurs (a one-entry group never reaches this page — assert the component still renders
sanely if it does), keyboard order, and the `known === false` gap notice if the group's catalog
row is unknown (copy `ServicePage`'s treatment).

## Part C — the entry page breathes, with the summary docked as a right side panel (one agent)

Artboard 3 as revised twice and approved by the owner on 2026-09-04 ("this is better now.
Approved."): the document column keeps the air the mockup gives it (40px section rhythm, 19px
section headings, 15px/1.55 body, one edge per line as mono id + name); the facts — everything
`ServiceSummary` renders today: Facts grid, Notes, Depends on, Depended on by, the Layer-3
Cost & account block — become a **side panel docked to the right edge of the rail-plus-board
row**, the left rail's mirror: full row height, surface fill, 1px hairline on its left edge,
the rail's inset, sections divided by rules under caps headings; the mockup's comment says which
width it chose and why, and what the panel does below the 900px breakpoint where the rail
leaves. Build what the comment says; if it is silent on something behavioural, follow the
rail's own behaviour and record the choice.

### Files you own
- `apps/web/src/components/ServicePage.tsx`, `.module.css`, `.test.tsx`
- `apps/web/src/components/ServiceSummary.tsx`, `.module.css`, `.test.tsx`
- `apps/web/src/tokens.css` — you are its only writer this round. Every number comes from the
  mockup and is already a token or is cited there to a candidate-E rule; add tokens in the page
  block with the same register as the rest of the file.
- `apps/web/src/components/AppShell.tsx`, `AppShell.module.css`, `AppShell.test.tsx` **only if**
  docking the panel at the row's edge needs the shell to know a page has one (the board is a
  flex item of `.shell`; a panel that must stretch the row's full height is a sibling of `.board`,
  not a child of it). If you touch the shell, the panel's presence is a prop or a slot, never a
  route check inside the shell, and the shell's frozen geometry (tokens.css's shell block: "the
  owner froze this shell") must measure identically on the board views — assert it in
  `AppShell.test.tsx` by rendering without a panel and checking the structure is byte-identical
  to today's.

Do not touch `App.tsx` beyond what the `brand` prop below needs — Part A owns `App.tsx`; if the
panel has to be mounted from `App.tsx`, build the component to accept a `panel` prop on
`ServicePage` (or a slot on `AppShell`) and tell the main session what one line `App.tsx` needs;
do not edit it yourself.

### The `brand` prop
`ServicePage` gains `brand?: { name: string; entryCount: number; href: string }` (the shared
contract above). When present, the breadcrumb gains a second crumb naming the brand and linking
to `href`. Part A passes it.

### Build and test
The breakpoint behaviour the mockup's comment names, tested by structure (jsdom has no layout —
say so in the test, and assert the class or attribute that the media query keys on, not a
measurement). Every existing `ServicePage`/`ServiceSummary` test that asserts content still
passes; tests that assert the old two-column structure are rewritten to the new one. The
`token-references.test.ts` guard will catch a token you forgot to declare.
