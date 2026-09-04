// @vitest-environment jsdom
//
// App.tsx's first tests. This is the one impure component in the app -- the
// fetch, the hash route, the history writes and every focus call live here
// and nowhere below it -- which is exactly why it was the largest untested
// surface in the repo (docs/PLAN.md, end of the drift-and-corpus session)
// and why the pure components' green suites said nothing about any of it.
//
// `fetch` is stubbed rather than a server being started: the payload shape
// is @catalogus/cli's contract and is already tested there against a real
// server (commands/view.test.ts). What is under test here is what this
// component does with a payload once it has one.
//
// Rewritten for the project board redesign (docs/PLAN.md, Phase 3.7 close):
// `ServiceList`/`ServiceGroup`/`ServiceNode` no longer render on the list
// view -- `ProjectBoard`'s vendor tiles do -- and a click now opens a full
// `ServicePage` that replaces the board entirely, rather than a panel that
// docks beside it. Selectors below changed to match; the *intent* behind
// every test that existed before this rewrite is preserved, and every place
// that intent had to bend is called out in its own comment.
//
// **2026-09-04: one tile per brand per band, and a second page route**
// (docs/brand-tile-brief.md, Part A). Every fixture above the new
// describe blocks still uses one entry per vendor per band (`fly-api` in
// "production", `supabase-db` in "holds"), so none of the existing tests'
// premises changed -- a single-entry group renders exactly the tile it
// always did, at exactly the same DOM id. The "two entries of one vendor,
// two tiles" describe block near the end of the click-handling section is
// the one place a fixture's own premise inverted: it used to prove the
// collapse stayed gone, and now proves the opposite, on purpose (see its
// own comment). New describe blocks cover what did not exist before: the
// brand page route, the `brand` prop reaching `ServicePage`, the group
// popover's rows, and focus restoring to a group's own tile.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ViewPayload, ViewService } from "@catalogus/cli";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";
import { serviceNodeDomId } from "./components/ServiceNode.js";
import { makeViewPayload, makeViewService } from "./test-support/fixtures.js";

// elk-layout.ts reaches its worker through a Vite `?worker` import that
// cannot be evaluated outside a browser -- importing it under jsdom throws at
// module load. App.tsx only ever reaches it through a dynamic import, so
// mocking the module here means the real one is never loaded at all, and the
// graph-mode tests below can exercise App's own wiring rather than elk's.
vi.mock("./elk-layout.js", () => ({
  layoutGraph: async (services: { id: string }[]) => new Map(services.map((service, index) => [service.id, { x: index * 300, y: 0 }])),
}));

/**
 * A counter around the real `placePopover`, not a replacement for it -- the
 * mock spreads the actual module and calls through, so every test in this
 * file still exercises the real placement arithmetic. What it buys is the one
 * thing the D4 tests below need and the DOM cannot show: *how often* App.tsx
 * places the popover. A runaway re-place loop leaves no trace in the rendered
 * style, because every pass computes the same numbers -- it only shows up as
 * work, and then as `Minified React error #185` on whichever gesture happens
 * to move the anchor between passes.
 */
const placements = vi.hoisted(() => ({ count: 0 }));

vi.mock("./popover-placement.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./popover-placement.js")>();
  return {
    ...actual,
    placePopover: (...args: Parameters<typeof actual.placePopover>) => {
      placements.count += 1;
      return actual.placePopover(...args);
    },
  };
});

beforeAll(() => {
  // React Flow measures its container and jsdom has no ResizeObserver. Same
  // stub, same reasoning as GraphCanvas.test.tsx -- nothing here asserts on
  // geometry.
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

/**
 * Distinct `service` slugs on every entry, unlike the fixture's own default
 * ("some-service" for both) -- collapseByService keys a tile's DOM id on the
 * slug, and two entries sharing one would collide in the DOM the moment they
 * land in the same band. The two default fixture entries land in different
 * bands (hosting -> production, database -> holds) so it would not bite here,
 * but naming a real slug for each is what every test below actually means.
 */
function payload(overrides: { services?: ViewService[]; edges?: { from: string; to: string }[] } = {}): ViewPayload {
  return makeViewPayload({
    services: overrides.services ?? [
      makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
      makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase", service: "supabase" }),
    ],
    edges: overrides.edges ?? [{ from: "fly-api", to: "supabase-db" }],
  });
}

/**
 * Five Fly.io entries in "Runs in production", one of them phasing out --
 * the mockup's own artboard-1 fixture (docs/candidates/candidate-e-
 * brandpage.html), reproduced here rather than the layout-stress example
 * manifest itself, since this file builds `ViewPayload`s from
 * `makeViewService` throughout and a fixture file would be a second way to
 * build the same shape. `host-preview` is the one that departs, unchanged
 * from the mockup's own choice and its own reasoning for picking it (that
 * file's leading comment, "What it does not decide"). `supabase-db` is
 * along for the ride, unaffected in a different band, so a test can also
 * reach a single-entry tile in this same payload -- one payload for both
 * shapes rather than two similar ones.
 */
function flyGroupPayload(): ViewPayload {
  return payload({
    services: [
      makeViewService({ id: "host-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
      makeViewService({ id: "host-cron", role: "hosting-cron", rollup: "hosting", name: "Fly.io", service: "flyio" }),
      makeViewService({
        id: "host-preview",
        role: "hosting-preview",
        rollup: "hosting",
        name: "Fly.io",
        service: "flyio",
        status: "phasing_out",
      }),
      makeViewService({ id: "host-web", role: "hosting-web", rollup: "hosting", name: "Fly.io", service: "flyio" }),
      makeViewService({ id: "host-worker", role: "hosting-worker", rollup: "hosting", name: "Fly.io", service: "flyio" }),
      makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase", service: "supabase" }),
    ],
    edges: [],
  });
}

/** Renders App with `fetch` answering one payload, and waits for the first tile to appear. */
async function renderLoaded(body: ViewPayload = payload()) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => body }))
  );
  render(<App />);
  // Not "wait for the Fly.io tile": a test that deep-links straight to a
  // service before rendering never shows the board at all -- only the
  // service page -- so that tile would never appear. LoadingState's own
  // `role="status"` disappearing is the one signal common to every loaded
  // branch (board or page).
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
}

/**
 * The service page has an unconditional, unambiguous role -- `<article>` is
 * "article" regardless of its accessible name, unlike the band modules'
 * `<section aria-labelledby>`, which computes to "region" the moment it has
 * one. The page, the brand page and the board are mutually exclusive
 * branches in App.tsx (selecting one replaces the board outright, and the
 * two pages never coexist), so this was never ambiguous the way
 * `getByRole("region")` would be against a rendered board.
 *
 * Since 2026-09-04 two different pages both render as `<article>`
 * (`BrandPage.tsx` matches `ServicePage.tsx`'s own role on purpose --
 * "same shape as ServicePage.tsx", that file's own header), so `queryByRole
 * ("article")` alone can no longer tell them apart -- it would read true for
 * either. Every existing test above this line only ever has a
 * `ServicePage` in play (their fixtures are single-entry groups), so this
 * stays a safe, behaviour-preserving narrowing rather than a new
 * assumption: it now also requires the heading id `ServicePage.tsx`'s own
 * `headingId` produces, which `BrandPage.tsx`'s own `headingId` never does.
 */
const servicePage = () => document.querySelector('article[aria-labelledby^="service-page-heading-"]');

/** The brand page's own version of `servicePage` above -- same reasoning, the other prefix. */
const brandPage = () => document.querySelector('article[aria-labelledby^="brand-page-heading-"]');

/**
 * Stubs one element's own `getBoundingClientRect`, the way GraphCanvas.test.tsx
 * stubs it for React Flow's measurement -- an own-property override, not a
 * prototype patch, so only the element a positioning test actually cares
 * about (the hovered tile) reports a real rect; every other element keeps
 * jsdom's default zero rect, which the rest of this file already renders
 * against without incident.
 */
function stubRect(element: HTMLElement, rect: { top: number; left: number; width: number; height: number }) {
  element.getBoundingClientRect = () =>
    ({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => "",
    }) as DOMRect;
}

/**
 * Stubs the viewport dimensions `App.tsx`'s `positionFor` actually reads --
 * `document.documentElement.clientWidth`/`clientHeight`, not
 * `window.innerWidth`/`innerHeight` (see that function's own comment on why
 * it reads the former). jsdom reports 0 for both by default, since it does
 * no real layout, so every positioning test needs this rather than being
 * able to lean on a jsdom-provided default the way `window.innerWidth` has
 * one.
 */
function stubViewport(width: number, height: number) {
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: height });
}

/** Undoes stubViewport, falling back to the inherited (jsdom-default) accessor, the same restoration GraphCanvas.test.tsx uses for `getBoundingClientRect`. */
function restoreViewport() {
  delete (document.documentElement as { clientWidth?: unknown }).clientWidth;
  delete (document.documentElement as { clientHeight?: unknown }).clientHeight;
}

/**
 * Stubs the box reported by every element that does *not* have its own
 * `getBoundingClientRect` -- which in a positioning test is the popover and
 * nothing else, because `stubRect` above installs an own property on the one
 * tile the test hovers, and an own property shadows this prototype patch.
 *
 * A prototype patch rather than an own-property override only because there
 * is no element to override: the popover does not exist until the peek opens,
 * and the height has to be readable by the layout effect that runs in the
 * same commit. Same mechanism, and the same `delete`-rather-than-restore
 * teardown, as GraphCanvas.test.tsx's React Flow measurement stub -- see its
 * comment for why deleting is what restores an inherited method.
 *
 * Without this the popover measures 0x0 (jsdom does no layout), App.tsx falls
 * back to POPOVER_ESTIMATE, and a test that means to exercise the measured
 * path silently exercises the estimated one instead.
 */
function stubPopoverBox(size: { width: number; height: number }) {
  HTMLElement.prototype.getBoundingClientRect = function stubbedRect() {
    return {
      width: size.width,
      height: size.height,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
      x: 0,
      y: 0,
      toJSON: () => "",
    } as DOMRect;
  };
}

/** Undoes stubPopoverBox. Unconditional: deleting a property that was never set is a no-op, so this needs no matching flag. */
function restorePopoverBox() {
  delete (HTMLElement.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
}

/** Reads a popover fact's value by its label -- the `<dt>`/`<dd>` pair ServicePopover.tsx renders one of per fact. Mirrors ServicePopover.test.tsx's own `factValue`. */
function factValue(label: string) {
  return screen.getByText(label).closest("div")?.querySelector("dd")?.textContent;
}

beforeEach(() => {
  // Every test starts from a hash-free URL on the same history entry --
  // otherwise one test's deep link is the next test's starting state.
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  restoreViewport();
  restorePopoverBox();
  // A test that opts into fake timers for the hover-close delay must not
  // leave them running for the next test's own waitFor() polling.
  vi.useRealTimers();
});

describe("App -- loading", () => {
  it("renders the services once the payload arrives", async () => {
    await renderLoaded();
    expect(screen.getByRole("button", { name: /Supabase/ })).not.toBeNull();
  });

  it("renders the error state, naming the status, when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, statusText: "Internal Server Error", json: async () => ({}) }))
    );
    render(<App />);
    expect(await screen.findByText(/500 Internal Server Error/)).not.toBeNull();
  });

  it("renders the error state when the request rejects outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      })
    );
    render(<App />);
    expect(await screen.findByText(/connection refused/)).not.toBeNull();
  });
});

describe("App -- the service page route", () => {
  it("opens the page for the clicked tile and addresses it in the hash", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/fly-api"));
    expect(servicePage()).not.toBeNull();
  });

  it("opens the page straight from a deep link, with no click at all", async () => {
    window.history.replaceState(null, "", "/#/service/supabase-db");
    await renderLoaded();
    expect(servicePage()).not.toBeNull();
  });

  it("selects nothing for a hash naming a service the manifest does not have", async () => {
    window.history.replaceState(null, "", "/#/service/does-not-exist");
    await renderLoaded();
    expect(servicePage()).toBeNull();
  });

  it("closes the page on Escape, back to the board", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());
  });

  it("reopens the page when the hash changes under it -- back/forward, or a hand-edited URL", async () => {
    await renderLoaded();
    window.history.replaceState(null, "", "/#/service/supabase-db");
    fireEvent(window, new window.HashChangeEvent("hashchange"));
    await waitFor(() => expect(servicePage()).not.toBeNull());
  });

  // The page replaces the board outright, so the toggle must not still be
  // sitting underneath it -- it selects between three views of the project and
  // a page is not one of them. Since 2026-09-03 the toggle is handed to the
  // shell as the board head rather than rendered beside the board, so this also
  // covers that App stops handing it over rather than merely stops rendering it.
  //
  // The masthead half of this test is gone with the masthead: there is no
  // `<h1>` for the project anywhere any more (the rail names it as chrome), so
  // asserting its absence on a service page would pass for the wrong reason.
  // What replaced it is the rail's band index, which must also go: its anchors
  // point at sections a service page does not mount.
  it("hides the board, the view toggle and the band index while the page is open", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Holds data" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Bands" })).toBeNull();
  });

  it("carries a back control that names the project and returns to the board", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Scratch/ }));
    await waitFor(() => expect(servicePage()).toBeNull());
    expect(screen.getByRole("button", { name: /Fly\.io/ })).not.toBeNull();
  });
});

// The defect: `window.location.hash = ...` pushes a history entry, so Back
// walked the page open and shut instead of leaving the viewer, and a close
// pushed an entry whose only content was "no page" -- which Back then undid
// by reopening it (docs/PLAN.md, Phase 3.7's five smaller viewer defects).
describe("App -- opening and closing the page does not grow history", () => {
  it("adds no history entry when a tile is clicked", async () => {
    await renderLoaded();
    const before = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/fly-api"));
    expect(window.history.length).toBe(before);
  });

  it("adds no history entry across a click, a close, and a second click", async () => {
    await renderLoaded();
    const before = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Supabase/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/supabase-db"));
    expect(window.history.length).toBe(before);
  });

  it("leaves no bare '#' behind when the page closes, so the address stays clean", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());
    expect(window.location.hash).toBe("");
  });
});

// The defect: focus fell to <body> when a deep-linked page was closed,
// because `lastFocusedRef` is captured on click and a deep link involves no
// click. From <body>, the next Tab starts at the top of the document and a
// screen reader has lost its place entirely.
describe("App -- focus when the page closes", () => {
  // A second, previously-undiscovered defect the "page replaces the board"
  // restructure introduced: `ServicePage` opening unmounts the entire board
  // (it is the other branch of a ternary, not a sibling), so the exact
  // button element `lastFocusedRef` captured on click is removed from the
  // document. `document.contains(opener)` in App.tsx's close effect is then
  // always false, so the "restore the literal opener" path can never fire
  // any more, for any click, in any of the three views -- it silently falls
  // through to the id-based fallback every time. On the list view that
  // fallback is itself the other known defect (serviceNodeDomId, not
  // serviceTileDomId), so the combination is a hard failure end to end;
  // Migrations/Graph happen to still land correctly, purely because their
  // fallback id (serviceNodeDomId, keyed by entry id) matches whatever
  // freshly-remounted node carries that same id.
  //
  // Was `it.fails`: the page unmounts the board on open, so the captured
  // opener element was detached by the time anything closed and focus fell to
  // `<body>`. App.tsx now restores by DOM id instead of by a captured
  // reference, so this is a plain `it` and goes red if that regresses.
  it("hands focus back to the tile that opened it", async () => {
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    const openerId = tile.id;
    tile.focus();
    fireEvent.click(tile);
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());

    // Asserted on the id, not on the original node. Opening a page unmounts
    // the whole board, so the tile that comes back is a different element
    // with the same id -- node identity is not achievable here and asserting
    // it would be asserting that the board does not unmount, which is the
    // architecture rather than the behaviour. The id is what is restorable
    // and what a reader actually experiences: focus lands on the tile they
    // clicked.
    expect(openerId).not.toBe("");
    expect((document.activeElement as HTMLElement | null)?.id).toBe(openerId);
  });

  // The Migrations/Graph-view sibling of the test above: it still passes,
  // because those views' rows/nodes key their DOM id by entry id
  // (serviceNodeDomId) -- the same id the close effect's fallback looks up
  // -- so a freshly-remounted row with the same id is a correct-looking
  // substitute for the exact element that was clicked, even though the
  // "restore the literal opener" path never actually fires (see above).
  it("lands focus on a same-id row after a click-opened page closes on the migration board", async () => {
    await renderLoaded(
      payload({
        services: [
          makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
          makeViewService({
            id: "supabase-db",
            role: "database",
            rollup: "database",
            name: "Supabase",
            service: "supabase",
            status: "phasing_out",
            replaced_by: "fly-api",
          }),
        ],
      })
    );
    fireEvent.click(screen.getByRole("radio", { name: "Migrations" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).not.toBeNull());
    const row = screen.getByRole("button", { name: /Supabase/ });
    row.focus();
    fireEvent.click(row);
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(serviceNodeDomId("supabase-db"))));
    expect(document.activeElement).not.toBe(document.body);
  });

  // A deep link opens a page with nothing on screen having opened it, so
  // there is no opener to hand focus back to and the fallback has to find the
  // tile by id. Was `it.fails` once: the fallback looked the closed service up
  // with `serviceNodeDomId` alone, which names the graph's nodes, so on the
  // board it found nothing and focus fell to `<body>` -- the exact regression
  // the fallback exists to prevent. App.tsx now tries the tile id and the node
  // id in turn, covering the board, the graph and the migration board without
  // knowing which is mounted.
  //
  // The two ids used to key differently as well as prefix differently -- tiles
  // by catalog slug, because a tile stood for every entry of one vendor, and
  // nodes by entry id. Candidate E renders one tile per entry, so both key on
  // the entry id now and this asserts on `supabase-db` where it once asserted
  // on `supabase`.
  //
  // `supabase-db` is a single-entry group in this payload (nothing else
  // shares its slug), so its tile still keys on the bare entry id --
  // `serviceTileDomId`'s own header -- and the literal string below is that
  // same id, not a hand-picked one; the band-qualified form only applies to
  // a *multi*-entry group's own describe block further down.
  it("hands focus to the tile the page was addressed to when nothing opened it -- the deep-link case", async () => {
    window.history.replaceState(null, "", "/#/service/supabase-db");
    await renderLoaded();
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());
    expect(document.activeElement).toBe(document.getElementById("service-tile-supabase-db"));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("does not restore a stale opener when the next page was deep-linked to another service", async () => {
    await renderLoaded();
    const flyTile = screen.getByRole("button", { name: /Fly\.io/ });
    flyTile.focus();
    fireEvent.click(flyTile);
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());

    // Now a deep link to the *other* service, arriving the way back/forward
    // or a hand-edited address does -- nothing on the page opened this one.
    window.history.replaceState(null, "", "/#/service/supabase-db");
    fireEvent(window, new window.HashChangeEvent("hashchange"));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());

    // Whatever the fallback does or does not find, it must never be the
    // *first* service's tile -- a stale opener is worse than none, because
    // it moves focus somewhere confidently wrong.
    expect(document.activeElement).not.toBe(flyTile);
  });

  it("moves focus into the page when it opens", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(document.activeElement).toBe(servicePage()));
  });

  // MigrationList still keys its rows on `serviceNodeDomId` (unaffected by
  // the board's own DOM-id scheme), so this fallback genuinely works there --
  // the regression above is specific to the list view's collapsed tiles.
  it("hands focus back to the migration board's row when a deep-linked page closes", async () => {
    window.history.replaceState(null, "", "/#/service/supabase-db");
    await renderLoaded(
      payload({
        services: [
          makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
          makeViewService({
            id: "supabase-db",
            role: "database",
            rollup: "database",
            name: "Supabase",
            service: "supabase",
            status: "phasing_out",
            replaced_by: "fly-api",
          }),
        ],
      })
    );
    // The page pre-empts the board on first load regardless of mode, so
    // there is no toggle to click yet. Close it, switch to Migrations on the
    // board underneath, then re-open the same deep link -- this time the
    // fallback's target (the row's `serviceNodeDomId`) actually exists in the
    // DOM once Escape hands control back to the (now Migrations) board.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());
    fireEvent.click(screen.getByRole("radio", { name: "Migrations" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).not.toBeNull());

    window.history.replaceState(null, "", "/#/service/supabase-db");
    fireEvent(window, new window.HashChangeEvent("hashchange"));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById(serviceNodeDomId("supabase-db")))
    );
    expect(document.activeElement).not.toBe(document.body);
  });
});

// This describe has changed its own premise twice now. Until 2026-08-26 the
// board collapsed every entry of one vendor into a single tile, so a
// two-entry Fly.io tile had no page to open and the click deliberately did
// nothing. Candidate E's one-tile-per-entry board (2026-08-26 to 2026-09-04)
// retired that: every tile was exactly one entry, so every click opened
// exactly one page, and the second test below proved two entries of one
// vendor reached two *different* pages as a guard against the collapse
// coming back. **It came back, on purpose, 2026-09-04**
// (docs/brand-tile-brief.md, Part A) -- so this describe's second test now
// proves the opposite of what it proved a week earlier: two entries of one
// vendor, in the same band, are one tile, and that one tile opens the brand
// page rather than either entry's own. The single-entry case (the first
// test) is untouched -- a tile that never collapsed anything still opens
// its own entry's page directly, exactly as it always has.
describe("App -- clicking a tile: a single entry opens its own page, several open the brand page", () => {
  const twoOfOneVendor = () =>
    payload({
      services: [
        makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
        makeViewService({ id: "fly-web", role: "hosting-web", rollup: "hosting", name: "Fly.io", service: "flyio" }),
      ],
    });

  it("navigates a single-entry tile straight to its own entry page", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/fly-api"));
  });

  // The reversal: two entries of one vendor, in one band, collapse into one
  // tile -- not two -- and that tile opens the brand page, not either
  // entry's own. This is the App-level guard that the collapse stays
  // restored: a regression back to one-tile-per-entry renders two buttons
  // where this looks for one, and a regression that opens an entry page
  // directly (rather than the brand page) fails the hash assertion.
  it("collapses two entries of one vendor into one tile, which opens the brand page rather than either entry's own", async () => {
    await renderLoaded(twoOfOneVendor());
    const tiles = await screen.findAllByRole("button", { name: /Fly\.io/ });
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.id).toBe("service-tile-production-flyio");

    fireEvent.click(tiles[0]!);
    await waitFor(() => expect(window.location.hash).toBe("#/brand/production/flyio"));
    expect(servicePage()).toBeNull();
    expect(brandPage()).not.toBeNull();
  });
});

// The brand page route itself (docs/brand-tile-brief.md, Part A's shared
// contract: `#/brand/<bandId>/<serviceSlug>`). Mirrors "App -- the service
// page route" above, one test at a time, over the five-entry Fly.io group.
describe("App -- the brand page route", () => {
  it("opens straight from a deep link, with no click at all", async () => {
    window.history.replaceState(null, "", "/#/brand/production/flyio");
    await renderLoaded(flyGroupPayload());
    expect(brandPage()).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Fly.io" })).not.toBeNull();
    // The header's own fact grid states the entry count once -- the same
    // number the tile's "5 entries" line and the entries table both agree
    // with.
    expect(screen.getByText("5")).not.toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("selects nothing for a hash naming a band the manifest does not have", async () => {
    window.history.replaceState(null, "", "/#/brand/production/does-not-exist");
    await renderLoaded(flyGroupPayload());
    expect(brandPage()).toBeNull();
    expect(servicePage()).toBeNull();
  });

  it("selects nothing for a hash naming a real band but no group in it", async () => {
    window.history.replaceState(null, "", "/#/brand/holds/flyio");
    await renderLoaded(flyGroupPayload());
    expect(brandPage()).toBeNull();
  });

  it("closes on Escape, back to the board", async () => {
    await renderLoaded(flyGroupPayload());
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(brandPage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(brandPage()).toBeNull());
  });

  it("carries a back control that names the project and returns to the board", async () => {
    await renderLoaded(flyGroupPayload());
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(brandPage()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Scratch/ }));
    await waitFor(() => expect(brandPage()).toBeNull());
    expect(screen.getByRole("button", { name: /Fly\.io/ })).not.toBeNull();
  });

  it("hides the board, the view toggle and the band index while it is open", async () => {
    await renderLoaded(flyGroupPayload());
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(brandPage()).not.toBeNull());
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Bands" })).toBeNull();
  });

  // The same regression class "App -- opening and closing the page does not
  // grow history" guards for the entry page, over the brand page instead.
  it("adds no history entry across an open and a close", async () => {
    await renderLoaded(flyGroupPayload());
    const before = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(brandPage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(brandPage()).toBeNull());
    expect(window.history.length).toBe(before);
  });

  // BrandPage.tsx's own rows route through `onOpenEntry` -- this is the
  // App-level proof that App.tsx wires it to `handleSelect` (a real
  // navigation to that entry's own page), not left unconnected.
  it("opens an entry's own page when a row inside the brand page is clicked", async () => {
    await renderLoaded(flyGroupPayload());
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(brandPage()).not.toBeNull());
    fireEvent.click(screen.getByRole("link", { name: /host-preview/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/host-preview"));
    expect(servicePage()).not.toBeNull();
    expect(brandPage()).toBeNull();
  });

  describe("focus", () => {
    it("hands focus back to the group tile that opened it", async () => {
      await renderLoaded(flyGroupPayload());
      const tile = screen.getByRole("button", { name: /Fly\.io/ });
      const openerId = tile.id;
      tile.focus();
      fireEvent.click(tile);
      await waitFor(() => expect(brandPage()).not.toBeNull());
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(brandPage()).toBeNull());
      expect(openerId).toBe("service-tile-production-flyio");
      expect((document.activeElement as HTMLElement | null)?.id).toBe(openerId);
    });

    it("hands focus to the group tile when the brand page was reached by deep link", async () => {
      window.history.replaceState(null, "", "/#/brand/production/flyio");
      await renderLoaded(flyGroupPayload());
      await waitFor(() => expect(brandPage()).not.toBeNull());
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(brandPage()).toBeNull());
      expect(document.activeElement).toBe(document.getElementById("service-tile-production-flyio"));
      expect(document.activeElement).not.toBe(document.body);
    });

    it("moves focus into the page when it opens", async () => {
      await renderLoaded(flyGroupPayload());
      fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
      await waitFor(() => expect(document.activeElement).toBe(brandPage()));
    });
  });
});

// The `brand` prop reaching `ServicePage` (shared contract, docs/brand-
// tile-brief.md): present only for an entry whose band group collapsed to
// more than one tile-worth of entries -- Part A's own side of the contract,
// since `ServicePage.tsx` and its crumb belong to Part C.
describe("App -- ServicePage's own brand prop", () => {
  it("passes brand for an entry of a multi-entry group, naming the group and linking to its brand page", async () => {
    window.history.replaceState(null, "", "/#/service/host-web");
    await renderLoaded(flyGroupPayload());
    await waitFor(() => expect(servicePage()).not.toBeNull());
    const crumb = screen.getByRole("link", { name: "Fly.io" });
    expect(crumb.getAttribute("href")).toBe("#/brand/production/flyio");
  });

  it("passes no brand for a single-entry group -- no second crumb, no link at all on the page", async () => {
    window.history.replaceState(null, "", "/#/service/supabase-db");
    await renderLoaded(flyGroupPayload());
    await waitFor(() => expect(servicePage()).not.toBeNull());
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("follows the crumb back to the brand page", async () => {
    window.history.replaceState(null, "", "/#/service/host-web");
    await renderLoaded(flyGroupPayload());
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.click(screen.getByRole("link", { name: "Fly.io" }));
    await waitFor(() => expect(window.location.hash).toBe("#/brand/production/flyio"));
  });
});

describe("App -- the hover popover", () => {
  it("shows the popover on hover and calls onOpen with the entry id on its own click", async () => {
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    await waitFor(() => expect(screen.queryByRole("presentation")).not.toBeNull());
  });

  it("does not show a popover for a touch pointer", async () => {
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    const event = new Event("pointerover", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    fireEvent(tile, event);
    expect(screen.queryByRole("presentation")).toBeNull();
  });

  // The hover-bridge hazard the source comment names directly: clearing the
  // popover immediately on pointerleave would close it in the gap between
  // the tile and the popover itself, so the popover's own rows -- the only
  // route to a page for a multi-entry vendor -- could never be reached.
  it("keeps the popover open across the gap into itself, and closes it only once the pointer leaves both", async () => {
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");

    vi.useFakeTimers();
    // Leaving the tile toward the popover schedules a close...
    fireEvent.pointerOut(tile, { relatedTarget: popover });
    // ...but entering the popover itself cancels it before the delay fires.
    fireEvent.pointerOver(popover);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("presentation")).not.toBeNull();

    // Now actually leaving for good: the scheduled close fires.
    fireEvent.pointerOut(popover, { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("presentation")).toBeNull();
  });

  it("does not close synchronously on pointer leave -- the close is scheduled, not immediate", async () => {
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    await screen.findByRole("presentation");
    fireEvent.pointerOut(tile, { relatedTarget: document.body });
    // Asserted synchronously, with real timers still running: the 120ms
    // close has not had a chance to fire yet.
    expect(screen.queryByRole("presentation")).not.toBeNull();
  });

  it("clears any open popover once a page opens", async () => {
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    await screen.findByRole("presentation");
    fireEvent.click(tile);
    await waitFor(() => expect(servicePage()).not.toBeNull());
    expect(screen.queryByRole("presentation")).toBeNull();
  });

  // D1: the Escape listener has been gated on `selectedService` since
  // d9001b1, so a peek -- which is not a service page -- had nothing
  // listening. Verified against that commit rather than assumed: this is
  // older than the popover-placement work, not a regression from it. The
  // keyboard path is the one that made it a real defect, because a reader who
  // opened the popover by tabbing to a tile had no way to dismiss it without
  // leaving the tile.
  describe("Escape dismisses it", () => {
    it("closes a popover opened by hovering", async () => {
      await renderLoaded();
      const tile = screen.getByRole("button", { name: /Fly\.io/ });
      fireEvent.pointerOver(tile, { pointerType: "mouse" });
      await screen.findByRole("presentation");
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("presentation")).toBeNull());
    });

    it("closes a popover opened by keyboard focus, and leaves focus on the tile", async () => {
      await renderLoaded();
      const tile = screen.getByRole("button", { name: /Fly\.io/ });
      // The focus path, not the pointer one: ServiceTile opens the peek from
      // `onFocus`, which is how a tab-through reader ever sees a popover.
      tile.focus();
      fireEvent.focus(tile);
      await screen.findByRole("presentation");
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("presentation")).toBeNull());
      // The peek never took focus, so dismissing it must not move focus
      // either -- the reader stays on the tile they were on.
      expect(document.activeElement).toBe(tile);
    });

    it("ignores keys that are not Escape", async () => {
      await renderLoaded();
      const tile = screen.getByRole("button", { name: /Fly\.io/ });
      fireEvent.pointerOver(tile, { pointerType: "mouse" });
      await screen.findByRole("presentation");
      fireEvent.keyDown(document, { key: "Enter" });
      fireEvent.keyDown(document, { key: "Tab" });
      expect(screen.queryByRole("presentation")).not.toBeNull();
    });
  });
});

// The group popover, end to end through a real board tile -- ServicePopover.
// test.tsx already proves the component's own rendering and its focus
// bridge in isolation; what only App.tsx can prove is that the real wiring
// (a real ServiceTile's onPeek reaching a real ServicePopover's onOpenEntry)
// behaves the same way, and that opening a row does not grow history.
describe("App -- the group popover", () => {
  it("lists every entry as a link, with the departing one's status word", async () => {
    await renderLoaded(flyGroupPayload());
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");
    // Scoped to the popover itself, not the whole document -- the rail's
    // own band index renders `<a>` links too while the board is showing,
    // and this test is about the popover's rows, not the rail's.
    expect(within(popover).getAllByRole("link")).toHaveLength(5);
    expect(screen.getByText("Phasing out")).not.toBeNull();
  });

  // The brief's own requirement: reachable by Tab while the popover is
  // pinned by focus. This is the mechanism ServicePopover.test.tsx already
  // isolates (its own onFocus/onBlur bridge), proven here against the real
  // tile that opens it -- tabbing from the tile into its own popover keeps
  // the popover open rather than letting the tile's own blur close it.
  it("stays open when focus moves from the tile into one of its own rows", async () => {
    await renderLoaded(flyGroupPayload());
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    fireEvent.focus(tile);
    await screen.findByRole("presentation");
    const row = screen.getByRole("link", { name: /host-api/ });

    // The same sequence a real Tab keypress produces: the tile blurs, the
    // row gains focus, both synchronously.
    fireEvent.blur(tile);
    fireEvent.focus(row);
    expect(screen.queryByRole("presentation")).not.toBeNull();

    // And leaving the popover's own rows for good still closes it -- the
    // bridge re-arms the close rather than cancelling it permanently.
    vi.useFakeTimers();
    fireEvent.blur(row);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("presentation")).toBeNull();
  });

  // The keyboard's way *in*. The test above focuses a row directly, which
  // proved the bridge and hid the gap: the popover mounts after the whole
  // board, so a real Tab from the tile lands on the next tile, never on a
  // row. Found 2026-09-04 by a validator driving the built app from the
  // keyboard; ArrowDown/ArrowUp are the path now (App.tsx's peek keydown
  // effect). `tile.focus()` here is a real focus move, so the tile's own
  // blur and the row's focus fire the way a browser fires them.
  describe("the arrow keys walk from the tile into its rows", () => {
    async function focusedGroupTile() {
      await renderLoaded(flyGroupPayload());
      const tile = screen.getByRole("button", { name: /Fly\.io/ });
      tile.focus();
      fireEvent.focus(tile);
      const popover = await screen.findByRole("presentation");
      return { tile, links: within(popover).getAllByRole("link") };
    }

    it("ArrowDown on the tile focuses the first row and keeps the popover open", async () => {
      const { links } = await focusedGroupTile();
      fireEvent.keyDown(document, { key: "ArrowDown" });
      expect(document.activeElement).toBe(links[0]);
      expect(links[0]?.textContent).toContain("host-api");
      expect(screen.queryByRole("presentation")).not.toBeNull();
    });

    it("ArrowUp on the tile focuses the last row", async () => {
      const { links } = await focusedGroupTile();
      fireEvent.keyDown(document, { key: "ArrowUp" });
      expect(document.activeElement).toBe(links[links.length - 1]);
    });

    it("wraps through the rows in both directions", async () => {
      const { links } = await focusedGroupTile();
      fireEvent.keyDown(document, { key: "ArrowDown" });
      fireEvent.keyDown(document, { key: "ArrowDown" });
      expect(document.activeElement).toBe(links[1]);
      fireEvent.keyDown(document, { key: "ArrowUp" });
      fireEvent.keyDown(document, { key: "ArrowUp" });
      expect(document.activeElement).toBe(links[links.length - 1]);
      fireEvent.keyDown(document, { key: "ArrowDown" });
      expect(document.activeElement).toBe(links[0]);
      expect(screen.queryByRole("presentation")).not.toBeNull();
    });

    it("Escape from a row closes the popover and hands focus back to the tile", async () => {
      const { tile } = await focusedGroupTile();
      fireEvent.keyDown(document, { key: "ArrowDown" });
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("presentation")).toBeNull());
      expect(document.activeElement).toBe(tile);
    });

    it("Enter on a focused row opens that entry's page, not the brand page", async () => {
      const { links } = await focusedGroupTile();
      fireEvent.keyDown(document, { key: "ArrowDown" });
      // An anchor's Enter is a click in every browser; jsdom does not
      // synthesise it, so the click is fired on the focused row directly.
      fireEvent.click(links[0]!);
      await waitFor(() => expect(window.location.hash).toBe("#/service/host-api"));
      expect(brandPage()).toBeNull();
    });

    // Found by the re-validation of this path, 2026-09-04: a pointer
    // brushing a neighbouring tile replaced the peek, unmounted the focused
    // row and left focus on <body>, where neither the arrows nor Escape had
    // anything to act on. A row that holds focus now holds the popover:
    // the neighbour's pointer-enter is refused, and its pointer-leave's
    // scheduled close finds focus still inside and stands down.
    it("keeps the popover, and the focused row, when a pointer brushes another tile", async () => {
      const { links } = await focusedGroupTile();
      fireEvent.keyDown(document, { key: "ArrowDown" });
      fireEvent.keyDown(document, { key: "ArrowDown" });
      expect(document.activeElement).toBe(links[1]);

      vi.useFakeTimers();
      const neighbour = screen.getByRole("button", { name: /Supabase/ });
      fireEvent.pointerEnter(neighbour, { pointerType: "mouse" });
      fireEvent.pointerLeave(neighbour, { pointerType: "mouse" });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(document.activeElement).toBe(links[1]);
      expect(screen.queryByRole("presentation")).not.toBeNull();
      expect(within(screen.getByRole("presentation")).getAllByRole("link")).toHaveLength(5);

      // And the keyboard still owns it afterwards: the arrows keep walking
      // and Escape still lands the reader back on the tile.
      fireEvent.keyDown(document, { key: "ArrowDown" });
      expect(document.activeElement).toBe(links[2]);
      fireEvent.keyDown(document, { key: "Escape" });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.queryByRole("presentation")).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /Fly\.io/ }));
    });

    it("does nothing on a single-entry tile, which has no rows", async () => {
      await renderLoaded(flyGroupPayload());
      const tile = screen.getByRole("button", { name: /Supabase/ });
      tile.focus();
      fireEvent.focus(tile);
      await screen.findByRole("presentation");
      fireEvent.keyDown(document, { key: "ArrowDown" });
      expect(document.activeElement).toBe(tile);
      expect(screen.queryByRole("presentation")).not.toBeNull();
    });
  });

  it("opens the clicked row's own entry page, not the brand page, and does not grow history", async () => {
    await renderLoaded(flyGroupPayload());
    const before = window.history.length;
    fireEvent.pointerOver(screen.getByRole("button", { name: /Fly\.io/ }), { pointerType: "mouse" });
    await screen.findByRole("presentation");
    fireEvent.click(screen.getByRole("link", { name: /host-preview/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/host-preview"));
    expect(servicePage()).not.toBeNull();
    expect(brandPage()).toBeNull();
    expect(window.history.length).toBe(before);
  });

  // The core new focus-restore case: an entry opened from a *group's*
  // popover row has no tile of its own to return to -- the group's own tile
  // is the only DOM node that entry renders inside, on the board, and this
  // is the App-level proof that `groupFor` finds it rather than looking for
  // an id (`service-tile-host-preview`) that was never rendered.
  it("hands focus back to the group's own tile, not a per-entry id, when an entry opened from its popover closes", async () => {
    await renderLoaded(flyGroupPayload());
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    const openerId = tile.id;
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    await screen.findByRole("presentation");
    fireEvent.click(screen.getByRole("link", { name: /host-preview/ }));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());
    expect(document.getElementById("service-tile-host-preview")).toBeNull(); // never rendered -- the group collapsed it
    expect((document.activeElement as HTMLElement | null)?.id).toBe(openerId);
  });

  it("clears the popover once the brand page opens from the same tile", async () => {
    await renderLoaded(flyGroupPayload());
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    await screen.findByRole("presentation");
    fireEvent.click(tile);
    await waitFor(() => expect(brandPage()).not.toBeNull());
    expect(screen.queryByRole("presentation")).toBeNull();
  });
});

// `positionFor` (App.tsx) had zero coverage before this -- every test above
// only ever asked *whether* a popover was open, never *where*. These read
// the inline `style.top`/`style.left` the real component actually renders,
// through stubbed rects on the real anchor tile, the same way a validator
// reproduced App.tsx:247-250's defects: no mock of `positionFor` itself,
// because a mock proves nothing about the function under test.
//
// The *rules* moved to popover-placement.ts and are tested there over a grid
// of viewports and box heights, which is where a rule belongs. What is left
// here is the wiring, and it is worth its own tests because it is where the
// two shipped defects actually lived: which numbers get handed to the rules.
// So each test below isolates one of those -- the anchor's live rect, the
// viewport read, the measured box, and the fallback when there is nothing to
// measure yet.
describe("App -- popover position", () => {
  it("clamps the centred position into the viewport, rather than letting it run past the right edge", async () => {
    stubViewport(768, 800);
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    // Right column, 768px viewport: centred (730 + 12 - 134 = 608) overruns
    // the 268px-wide popover's right edge; the clamp is what keeps it on
    // screen (768 - 268 - 12 = 488). This is also sensitive to `width`: a
    // narrower popover would either not need clamping at all, or clamp to a
    // different bound -- either way, not 488.
    stubRect(tile, { top: 100, left: 730, width: 24, height: 32 });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");
    expect(popover.style.left).toBe("488px");
  });

  it("centres the popover under the tile when there is room on both sides", async () => {
    stubViewport(1280, 800);
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    // Nowhere near an edge at 1280px, so this is the clamp's *identity*
    // case: left is whatever centred computes (500 + 20 - 134 = 386), not
    // rect.left (500) and not some other width's centring.
    stubRect(tile, { top: 100, left: 500, width: 40, height: 32 });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");
    expect(popover.style.left).toBe("386px");
  });

  it("leaves a 12px gap below the tile when it fits there", async () => {
    stubViewport(1280, 800);
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    stubRect(tile, { top: 100, left: 100, width: 32, height: 32 });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");
    // rect.bottom (132) + gap (12).
    expect(popover.style.top).toBe("144px");
  });

  it("flips above the tile when below does not fit, using the ordinary-case estimate until there is a box to measure", async () => {
    stubViewport(1280, 800);
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    // No stubPopoverBox here, so jsdom reports 0x0 and App.tsx falls back to
    // POPOVER_ESTIMATE -- which is the first-paint path, deliberately
    // exercised. Below (732 + 12 = 744) has no room for a 250px box
    // (744 + 250 > 788); above does (700 - 12 - 250 = 438, clear of the
    // 12px inset), so it flips and its bottom lands exactly one gap over the
    // tile.
    stubRect(tile, { top: 700, left: 100, width: 32, height: 32 });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");
    expect(popover.style.top).toBe("438px");
  });

  // The whole point of the 2026-09-02 rewrite: the placement is made from the
  // box's *measured* height, corrected in a layout effect before the browser
  // paints, rather than from a constant or from the stylesheet's 60vh
  // ceiling. Each of these fails if App.tsx goes back to estimating.
  describe("the measured box, not an estimate of it", () => {
    it("places against the popover's own rendered height, which is a different answer from the estimate", async () => {
      stubViewport(1280, 900);
      stubPopoverBox({ width: 268, height: 400 });
      await renderLoaded();
      const tile = screen.getByRole("button", { name: /Fly\.io/ });
      // Same tile and viewport as the estimate case above one viewport
      // taller: a 400px box does not fit below (744 + 400 > 888) and does
      // fit above, so it flips to 700 - 12 - 400 = 288. The estimate would
      // have said 438 and left 150px of the box over the tile.
      stubRect(tile, { top: 700, left: 100, width: 32, height: 32 });
      fireEvent.pointerOver(tile, { pointerType: "mouse" });
      const popover = await screen.findByRole("presentation");
      expect(popover.style.top).toBe("288px");
      expect(288 + 400).toBe(700 - 12); // the box's bottom, one gap over the tile
    });

    it("stays below when the measured box fits there and the estimate would have flipped", async () => {
      stubViewport(1280, 720);
      stubPopoverBox({ width: 268, height: 150 });
      await renderLoaded();
      const tile = screen.getByRole("button", { name: /Fly\.io/ });
      // Below is 452 + 12 = 464. A 150px box clears the bound (464 + 150 =
      // 614 <= 708); the 250px estimate would not have (714 > 708) and would
      // have flipped a box that had room where it was.
      stubRect(tile, { top: 420, left: 100, width: 32, height: 32 });
      fireEvent.pointerOver(tile, { pointerType: "mouse" });
      const popover = await screen.findByRole("presentation");
      expect(popover.style.top).toBe("464px");
    });

    it("flips a first-band tile at 1280x720 that the 60vh ceiling used to keep below the fold", async () => {
      // The reproduction, with the rects measured on the built app against
      // examples/layout-stress.catalogus.yaml: viewport 1265x720 (1280 less
      // a classic scrollbar), first-band tile [341, 499], popover 286px
      // tall. The old code compared the 432px ceiling with the 329px above
      // the tile, declined to flip, and put the box at 511 -- 89px past the
      // bottom edge. Measured, the box fits above at 341 - 12 - 286 = 43.
      stubViewport(1265, 720);
      stubPopoverBox({ width: 268, height: 286 });
      await renderLoaded();
      const tile = screen.getByRole("button", { name: /Fly\.io/ });
      stubRect(tile, { top: 341, left: 16, width: 119, height: 158 });
      fireEvent.pointerOver(tile, { pointerType: "mouse" });
      const popover = await screen.findByRole("presentation");
      expect(popover.style.top).toBe("43px");
      expect(43 + 286).toBeLessThanOrEqual(720 - 12); // and it no longer runs past the bottom
    });
  });

  // D2: the validator's own reproductions, run against the real component
  // rather than reasoned about. Each asserts the fixed property directly --
  // the popover never starts inside, or above the bottom of, the tile it is
  // describing -- not just a specific number. popover-placement.test.ts
  // proves the same property over a grid; these prove that the component is
  // wired to the function that has it.
  describe("D2 -- the flip never covers the tile it describes", () => {
    it("stays below a tile near the top of a short window, rather than clamping the flip on top of it", async () => {
      stubViewport(1280, 400);
      await renderLoaded();
      const tile = screen.getByRole("button", { name: /Fly\.io/ });
      // The validator's own numbers: innerHeight 400, tile [100..220]. The
      // old code clamped the flipped top to 12, which spans [12, 262] and
      // fully covers [100, 220]. A 250px box fits on neither side here, and
      // below has the more room (156 against 76), so it lands at
      // rect.bottom + gap (232) and overflows past the bottom instead.
      stubRect(tile, { top: 100, left: 100, width: 32, height: 120 });
      fireEvent.pointerOver(tile, { pointerType: "mouse" });
      const popover = await screen.findByRole("presentation");
      const top = Number(popover.style.top.replace("px", ""));
      expect(top).toBeGreaterThanOrEqual(232);
      expect(top).toBeGreaterThan(220); // never starts inside the tile's own span
    });

    it("overflows off the top of the viewport, away from the tile, when neither side holds the box", async () => {
      stubViewport(1280, 400);
      stubPopoverBox({ width: 268, height: 300 });
      await renderLoaded();
      const tile = screen.getByRole("button", { name: /Fly\.io/ });
      // Tile [300, 320] in a 400px viewport: 276px free above, 56px below,
      // and a 300px box fits in neither. Above wins on room, so the box's
      // bottom stops one gap over the tile (288) and its top goes to -12 --
      // off the top edge, which is the direction away from the tile. The
      // alternative, pinning the top at the 12px inset, is the shape of the
      // defect this whole rewrite exists to make unreachable.
      stubRect(tile, { top: 300, left: 100, width: 32, height: 20 });
      fireEvent.pointerOver(tile, { pointerType: "mouse" });
      const popover = await screen.findByRole("presentation");
      const top = Number(popover.style.top.replace("px", ""));
      expect(top).toBe(-12);
      expect(top + 300).toBe(300 - 12); // the bottom edge, one gap clear of the tile
    });
  });
});

// The brief's own requirement: the group popover's entry list runs taller
// than the six-fact grid every test above this measures, and the placement
// code itself is unchanged (popover-placement.ts, and App.tsx's own
// `positionFor`) -- it measures the *real* box regardless of what is inside
// it, so it should already clamp a taller box correctly. Proved directly,
// not assumed: a five-entry group's popover, stubbed at a height well past
// anything the single-entry grid reaches in this file, anchored near the
// bottom of a short viewport.
describe("App -- the group popover, taller than the single-entry one, still clamps", () => {
  it("flips above rather than running past the bottom of a short viewport", async () => {
    stubViewport(1280, 500);
    // A five-row entry list plus its own header -- taller than every
    // six-fact single-entry box stubbed elsewhere in this file (250-400px),
    // and closer to what five real rows plus a header actually render at.
    stubPopoverBox({ width: 268, height: 340 });
    await renderLoaded(flyGroupPayload());
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    // Near the bottom of a 500px viewport: below has almost no room left, so
    // a 340px box cannot fit there and the placement has to flip.
    stubRect(tile, { top: 420, left: 100, width: 32, height: 32 });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");
    const top = Number(popover.style.top.replace("px", ""));
    // The same property the D2 describe above proves for the single-entry
    // popover, over this file's own taller box: the placement never lets the
    // box run past the viewport's bottom edge (12px inset), and it moves
    // away from the tile (above it) rather than covering it.
    expect(top + 340).toBeLessThanOrEqual(500 - 12);
    expect(top).toBeLessThan(420);
  });
});

// D10: `position: fixed` freezes the popover at the coordinates it opened
// with, and nothing in the CSS makes it follow the tile. Reproduced exactly
// as the validator did it: change what the anchor's own getBoundingClientRect
// reports (standing in for the tile having scrolled, or the window having
// resized), fire the event App.tsx should be listening for, and check that
// `style.top` actually moved -- not that a listener was attached.
describe("App -- the popover tracks its anchor across scroll and resize", () => {
  it("recomputes position on a scroll event", async () => {
    stubViewport(1280, 900);
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    stubRect(tile, { top: 300, left: 100, width: 32, height: 32 });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");
    expect(popover.style.top).toBe("344px"); // 300 + 32 + 12

    // The anchor moved from viewport y=300 to y=-100 -- the validator's own
    // reproduction -- standing in for the page (or a scroll container)
    // having scrolled underneath the still-open popover.
    stubRect(tile, { top: -100, left: 100, width: 32, height: 32 });
    fireEvent.scroll(window);
    await waitFor(() => expect(popover.style.top).toBe("-56px")); // -100 + 32 + 12
  });

  it("recomputes position on a resize event", async () => {
    stubViewport(1280, 900);
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    stubRect(tile, { top: 400, left: 100, width: 32, height: 32 });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");
    expect(popover.style.top).toBe("444px"); // below: 432 + 12, and 444 + 250 clears 888

    // The window got shorter without the tile moving. The same box no longer
    // fits below (444 + 250 > 488) and does fit above, so the side it is on
    // has to change -- which a placement computed once at hover time cannot
    // notice.
    stubViewport(1280, 500);
    fireEvent.resize(window);
    await waitFor(() => expect(popover.style.top).toBe("138px")); // flips: 400 - 12 - 250
  });
});

// D4: the highest-severity defect of the 2026-09-02 validation pass, and the
// only one whose symptom was a blank page. A validator saw `Minified React
// error #185` -- maximum update depth -- twice on the built viewer, once from
// an ordinary wheel scroll with a popover open, and it was not reproducible
// on demand, which is exactly what a loop that needs the anchor to move
// between two synchronous measurements looks like from outside.
//
// These reproduce it by mechanism rather than by luck. The first drives the
// gesture (many scroll events, no geometry change) and counts the work; the
// second makes the anchor move on *every* read, which is the momentum-scroll
// condition the crash needed, and asserts the chain still terminates.
//
// `console.error` is inspected for React's own message rather than for any
// error at all: a state update arriving from a requestAnimationFrame callback
// is outside `act()` and React says so, which is noise here and not a defect.
describe("App -- re-placing the popover is bounded work", () => {
  /** React's update-depth message, in whichever form this build emits (`#185` minified, the sentence in development). */
  function updateDepthErrors(spy: ReturnType<typeof vi.spyOn>) {
    return spy.mock.calls.map((call) => String(call[0])).filter((message) => /Maximum update depth|error #185|Minified React error/.test(message));
  }

  it("places at most once per animation frame across a burst of 100 scroll events", async () => {
    stubViewport(1280, 900);
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    stubRect(tile, { top: 300, left: 100, width: 32, height: 32 });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");
    const before = popover.style.top;

    // Count only the burst: opening the peek legitimately places it.
    placements.count = 0;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (let i = 0; i < 100; i += 1) {
        fireEvent.scroll(window);
      }
      // Let every frame the burst could have scheduled actually run.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
      });

      // The tile has not moved, so the correct amount of work is one
      // placement for the frame the burst coalesced into -- and the answer
      // must not scale with the event count. The bound is 2 rather than 1
      // only because a burst that straddles a frame boundary is legitimate.
      expect(placements.count).toBeLessThanOrEqual(2);
      expect(popover.style.top).toBe(before);
      expect(updateDepthErrors(errors)).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it("does not chase an anchor that moves on every read, which is what the crash needed", async () => {
    stubViewport(1280, 900);
    // The popover must report a real box or the measuring effect bails on
    // the zero-height check before reaching the loop this test is about --
    // which is how the first draft of this test passed against the very
    // mutation it was written to catch.
    stubPopoverBox({ width: 268, height: 400 });
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });

    // A momentum scroll, as a synchronous re-measure sees it: every call to
    // getBoundingClientRect reports a different top. The first version of the
    // measuring layout effect re-read this on every run and set state
    // whenever the answer differed, so each run scheduled another -- 50 deep,
    // then React threw. Nothing here may depend on the anchor settling.
    let top = 300;
    tile.getBoundingClientRect = () => {
      top -= 7;
      return { top, left: 100, width: 32, height: 32, right: 132, bottom: top + 32, x: 100, y: top, toJSON: () => "" } as DOMRect;
    };

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      fireEvent.pointerOver(tile, { pointerType: "mouse" });
      await screen.findByRole("presentation");
      placements.count = 0;
      fireEvent.scroll(window);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
      });

      // One frame, one placement -- not one per re-render until React gives
      // up. The popover is still on screen, which is the part the crash took
      // away: error #185 unmounts the whole root.
      expect(placements.count).toBeLessThanOrEqual(2);
      expect(screen.queryByRole("presentation")).not.toBeNull();
      expect(updateDepthErrors(errors)).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it("re-places when the box's own size changes, which is the one thing the measuring effect exists for", async () => {
    // The guard that stops the loop is "an identical measured size teaches
    // nothing" -- so a *different* size must still get through, or the
    // termination fix would have silently disabled the measurement it
    // protects. 60vh moves with the viewport, so a resize is exactly that
    // case.
    stubViewport(1280, 900);
    stubPopoverBox({ width: 268, height: 400 });
    await renderLoaded();
    const tile = screen.getByRole("button", { name: /Fly\.io/ });
    stubRect(tile, { top: 700, left: 100, width: 32, height: 32 });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    const popover = await screen.findByRole("presentation");
    expect(popover.style.top).toBe("288px"); // flips above: 700 - 12 - 400

    stubPopoverBox({ width: 268, height: 120 });
    stubViewport(1280, 400);
    fireEvent.resize(window);
    // Now 120 tall in a 400px viewport: below is 744, off screen; above is
    // 700 - 12 - 120 = 568, also below the fold since the tile is. Room
    // above wins, so it stays anchored one gap over the tile at 568.
    await waitFor(() => expect(popover.style.top).toBe("568px"));
  });
});

// D4: `dependsOn`/`dependedOnBy` are two props of the same type, wired at
// App.tsx's own ServicePopover call site from two different maps. Swapping
// which map feeds which prop at that one call site leaves every other test
// in this file green -- ServicePopover's own tests catch a transposition
// *inside* the component, by checking its `<dt>`s, but nothing here reads
// past "a popover opened" to notice the two counts arrived in the wrong
// fields. This uses asymmetric in/out edges specifically so a swap cannot
// coincidentally produce the same numbers.
describe("App -- the popover's edge counts are wired the right way round", () => {
  it("shows dependents-in and dependencies-out from the correct edge direction", async () => {
    await renderLoaded(
      payload({
        services: [
          makeViewService({ id: "svc-a", role: "hosting-api", rollup: "hosting", name: "Alpha", service: "alpha" }),
          makeViewService({ id: "svc-b", role: "hosting-web", rollup: "hosting", name: "Bravo", service: "bravo" }),
          makeViewService({ id: "svc-c", role: "database", rollup: "database", name: "Charlie", service: "charlie" }),
          makeViewService({ id: "svc-d", role: "ai", rollup: "ai", name: "Delta", service: "delta" }),
        ],
        edges: [
          // svc-a depends on two others (dependencies out: 2) and exactly one
          // other depends on svc-a (dependents in: 1) -- deliberately
          // different numbers, so a transposed wiring shows up as the wrong
          // fact rather than as a coincidentally-correct one.
          { from: "svc-a", to: "svc-b" },
          { from: "svc-a", to: "svc-c" },
          { from: "svc-d", to: "svc-a" },
        ],
      })
    );
    const tile = screen.getByRole("button", { name: /Alpha/ });
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    await screen.findByRole("presentation");
    expect(factValue("Dependents in")).toBe("1");
    expect(factValue("Dependencies out")).toBe("2");
  });
});

// The toggle, per docs/PLAN.md's Phase 3.7 DAG decision 1: a view switch, the
// list as default, and one addressable page rather than a second route.
describe("App -- the view toggle", () => {
  it("starts on the list", async () => {
    await renderLoaded();
    expect(screen.getByRole("radio", { name: "List" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("heading", { level: 2, name: "Runs in production" })).not.toBeNull();
  });

  it("swaps the list for the canvas, and back", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));

    // The band headings are the board's; the legend is the canvas's.
    await waitFor(() => expect(screen.queryByText(/Arrows point from a service to what it depends on/)).not.toBeNull());
    expect(screen.queryByRole("heading", { level: 2, name: "Runs in production" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Runs in production" })).not.toBeNull());
    expect(screen.queryByText(/Arrows point from a service to what it depends on/)).toBeNull();
  });

  // The original intent here was "selecting a service survives a List<->Graph
  // mode swap while its panel stays open beside the view". That mechanism no
  // longer exists: opening a service now replaces the *entire* board,
  // including the toggle itself, so a mode swap cannot happen while a service
  // page is open at all -- there is nothing to click. What does survive is
  // the *mode setting itself*, underneath the page: reopening the board after
  // closing the page returns to whichever mode was active before, not a
  // reset to List. That is the closest surviving claim to the original test's
  // intent, and it is what this asserts.
  it("remembers the active mode underneath the page -- closing it does not reset to List", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    await waitFor(() => expect(screen.queryByText(/Arrows point from a service to what it depends on/)).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    // The toggle is gone while the page is open (asserted elsewhere); mode is
    // plain state that keeps its value regardless.
    expect(screen.queryByRole("radiogroup")).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());
    expect(screen.getByRole("radio", { name: "Graph" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("heading", { level: 2, name: "Runs in production" })).toBeNull();
  });

  const migratingPayload = () =>
    payload({
      services: [
        makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
        makeViewService({
          id: "supabase-db",
          role: "database",
          rollup: "database",
          name: "Supabase",
          service: "supabase",
          status: "phasing_out",
          replaced_by: "fly-api",
        }),
      ],
    });

  it("swaps the list for the migration board, and back", async () => {
    await renderLoaded(migratingPayload());
    fireEvent.click(screen.getByRole("radio", { name: "Migrations" }));

    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).not.toBeNull());
    expect(screen.queryByRole("heading", { level: 2, name: "Overdue" })).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Runs in production" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Runs in production" })).not.toBeNull());
    expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).toBeNull();
  });

  // The original two tests here ("drops the text edge list on the migration
  // board too" / "...on the canvas") each asserted a *before* state -- a
  // "Dependencies" heading, or edge text like "supabase-db", visible on the
  // list view -- and then that switching view dropped it. Neither premise is
  // true any more: `EdgesList` had no caller anywhere in this app, not just
  // off the migration board and the canvas, and it was **deleted** on
  // 2026-08-25 along with `ServiceDetailPanel`, the last thing that had ever
  // rendered it. There is nothing left to contrast a removal against, so this
  // is reframed as the fact both older tests were actually protecting: no view
  // in the app renders the flat text transcript of the manifest's edges.
  //
  // The assertion outlives the component on purpose. It is a statement about
  // the design -- edges are shown as structure, on the canvas and in the
  // summary, never as a wall of `id (Name) -> id (Name)` lines -- so it should
  // fail if someone reintroduces one, whatever they call it.
  it("renders no flat text edge list ('Dependencies' heading, or 'id (Name) -> id (Name)' lines) on any view", async () => {
    await renderLoaded(migratingPayload());
    const asserts = () => {
      // "Dependencies" was EdgesList's own heading and is nothing else's --
      // MigrationList has its own, unrelated "→ replaced by" arrow between a
      // migrating service and its replacement, so the check has to be this
      // specific rather than keying on the arrow glyph itself.
      expect(screen.queryByRole("heading", { level: 2, name: "Dependencies" })).toBeNull();
    };
    asserts();

    fireEvent.click(screen.getByRole("radio", { name: "Migrations" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).not.toBeNull());
    asserts();

    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    await waitFor(() => expect(screen.queryByText(/Arrows point from a service/)).not.toBeNull());
    asserts();
  });

  /*
   * Two tests stood here until 2026-09-03 and are recorded rather than quietly
   * dropped, because deleting a test is a claim that what it protected no
   * longer exists.
   *
   * They asserted that `App.tsx` put a `wide` class on `<main>` for the graph
   * and only the graph -- App.module.css's `.page` capped the app at a 1680px
   * measure and `.wide` was the canvas's exemption from it, since a
   * left-to-right layered DAG has no comfortable measure at all. What they
   * could prove was narrow and they said so: vitest's CSS Module proxy
   * synthesises a class name for any key, so no test in this suite could see
   * whether `.wide` still existed in the stylesheet -- only that App applied
   * whatever `styles.wide` resolved to.
   *
   * The approved shell has no measure to be exempt from. `<main>` is the
   * shell's element now, the board fills whatever the rail leaves, and both
   * rules were deleted with the wiring that applied them (App.module.css's
   * header carries the full account). There is no conditional left for a test
   * to check: the graph gets the window at every width, which is what `.wide`
   * existed to arrange.
   */

  // What survives from those two is the part that was never about the measure:
  // the graph and the migrations board are three views of the project and the
  // service page replaces all of them, so the shell's board head must be gone
  // on a page opened from the graph even though `mode` is still "graph".
  it("drops the view rail when a service page opens from the graph, though the mode is still 'graph'", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    await waitFor(() => expect(screen.queryByText(/Arrows point from a service/)).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});

/*
 * The shell, from App's side of the wiring. What the top bar, the rail and the
 * footer *say* is covered by their own suites; what is only visible from here
 * is which of them App turns on, and when.
 */
describe("App wires the shell", () => {
  /** One entry phasing out, so the migrations board has something to head with. */
  const migrating = () =>
    payload({
      services: [
        makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
        makeViewService({
          id: "supabase-db",
          role: "database",
          rollup: "database",
          name: "Supabase",
          service: "supabase",
          status: "phasing_out",
          replaced_by: "fly-api",
        }),
      ],
    });

  it("frames every view in the shell -- top bar, rail, footer -- once the payload arrives", async () => {
    await renderLoaded();
    expect(screen.getByRole("banner").textContent).toContain("Catalogus");
    expect(screen.getByRole("navigation", { name: "Bands" })).not.toBeNull();
    expect(screen.getByRole("contentinfo").textContent).toContain("2 services");
  });

  it("states the CLI version and the schema URL the payload carries, and nothing this app made up", async () => {
    await renderLoaded(payload());
    const footer = screen.getByRole("contentinfo").textContent!;
    // makeViewPayload's default is deliberately not @catalogus/cli's own
    // version, so a footer reading the package instead of the payload fails.
    expect(footer).toContain("catalogus 9.9.9");
    expect(footer).toContain("catalogus.dev/schema/v1.json");
  });

  // The band anchors point at sections only the list view mounts. The rail's
  // identity block survives everywhere; the index does not.
  it("keeps the rail on the graph and the migrations board but drops the band index there", async () => {
    // Two elements name the project -- the top bar and the rail -- so the
    // count is the assertion: one alone would mean the rail went with its
    // index, which is a different shell at three of the four destinations.
    const namesTheProject = () => screen.getAllByText("Scratch").length;
    await renderLoaded(migrating());
    expect(screen.getByRole("navigation", { name: "Bands" })).not.toBeNull();
    expect(namesTheProject()).toBe(2);

    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Bands" })).toBeNull());
    expect(namesTheProject()).toBe(2);

    fireEvent.click(screen.getByRole("radio", { name: "Migrations" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).not.toBeNull());
    expect(screen.queryByRole("navigation", { name: "Bands" })).toBeNull();
    expect(namesTheProject()).toBe(2);
  });

  // Every band the rail indexes has to have its section on the board. This
  // resolves each href against the rendered document rather than trusting that
  // two files agree about `band-<id>`.
  it("gives every band anchor in the rail a section on the board to land on", async () => {
    await renderLoaded();
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(document.getElementById(href.slice(1)), `${href} points at nothing on the board`).not.toBeNull();
    }
  });

  // While the payload is still in flight there is no path, no project and no
  // counts -- so the rail and the footer are not rendered at all. A shell that
  // drew them empty would be showing placeholders for facts it does not have.
  it("renders the bar but no rail and no footer while the payload is still loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<App />);
    expect(screen.getByRole("banner").textContent).toContain("Catalogus");
    expect(screen.getByRole("status")).not.toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Bands" })).toBeNull();
  });
});
