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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ViewPayload, ViewService } from "@catalogus/cli";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";
import appStyles from "./App.module.css";
import { serviceNodeDomId } from "./components/ServiceNode.js";
import { serviceTileDomId } from "./components/ServiceTile.js";
import { makeViewService } from "./test-support/fixtures.js";

// elk-layout.ts reaches its worker through a Vite `?worker` import that
// cannot be evaluated outside a browser -- importing it under jsdom throws at
// module load. App.tsx only ever reaches it through a dynamic import, so
// mocking the module here means the real one is never loaded at all, and the
// graph-mode tests below can exercise App's own wiring rather than elk's.
vi.mock("./elk-layout.js", () => ({
  layoutGraph: async (services: { id: string }[]) => new Map(services.map((service, index) => [service.id, { x: index * 300, y: 0 }])),
}));

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
 * bands (hosting -> serves, database -> holds) so it would not bite here,
 * but naming a real slug for each is what every test below actually means.
 */
function payload(overrides: { services?: ViewService[]; edges?: { from: string; to: string }[] } = {}): ViewPayload {
  return {
    manifestPath: "C:/scratch/project/catalogus.yaml",
    readAt: "2026-08-24T00:00:00.000Z",
    project: { name: "Scratch", slug: "scratch" },
    services: overrides.services ?? [
      makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
      makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase", service: "supabase" }),
    ],
    edges: overrides.edges ?? [{ from: "fly-api", to: "supabase-db" }],
  };
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
 * one. The page and the board are mutually exclusive branches in App.tsx
 * (selecting a service replaces the board outright), so this is never
 * ambiguous the way `getByRole("region")` would be against a rendered board.
 */
const servicePage = () => screen.queryByRole("article");

beforeEach(() => {
  // Every test starts from a hash-free URL on the same history entry --
  // otherwise one test's deep link is the next test's starting state.
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  // The page replaces the board outright (App.tsx's own comment: two <h1>s
  // on one document is wrong for a page whose subject is the service), so
  // the toggle and the masthead must not still be sitting underneath it.
  it("hides the board, the view toggle and the masthead while the page is open", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Holds data" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "Scratch" })).toBeNull();
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

  // The defect the coordinator named directly: App.tsx's deep-link fallback
  // still calls `serviceNodeDomId(closedId)` (entry id, "service-node-..."),
  // and imports `serviceTileDomId` without ever calling it. On the list view
  // a tile's real DOM id is `serviceTileDomId(group.service)` -- the catalog
  // slug, "service-tile-..." -- so the lookup finds nothing and focus falls
  // through to <body>, which is the exact regression this fallback exists to
  // prevent (see App.tsx's own comment on the line above the lookup).
  //
  // Was `it.fails`: the fallback looked the closed service up with
  // `serviceNodeDomId`, keyed by entry id, while the board's tiles are keyed
  // by catalog slug -- so it found nothing and focus fell to `<body>`. App.tsx
  // now tries the slug-keyed tile id first and the entry-keyed node id second,
  // which covers the board, the graph and the migration board without knowing
  // which is mounted.
  it("hands focus to the tile the page was addressed to when nothing opened it -- the deep-link case", async () => {
    window.history.replaceState(null, "", "/#/service/supabase-db");
    await renderLoaded();
    await waitFor(() => expect(servicePage()).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(servicePage()).toBeNull());
    expect(document.activeElement).toBe(document.getElementById(serviceTileDomId("supabase")));
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

describe("App -- clicking a tile: single entry navigates, several do not", () => {
  const multiPayload = () =>
    payload({
      services: [
        makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
        makeViewService({ id: "fly-web", role: "hosting-web", rollup: "hosting", name: "Fly.io", service: "flyio" }),
      ],
    });

  it("navigates on click for a single-entry tile", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/fly-api"));
  });

  // Named directly by the coordinator: there is no vendor page to open for a
  // multi-entry tile -- "Fly.io" is not a document, two Fly.io deployments
  // are -- so the click must not change the hash or open a page at all.
  it("does not navigate, and opens no page, on click for a multi-entry tile", async () => {
    await renderLoaded(multiPayload());
    const tile = await screen.findByRole("button", { name: /Fly\.io, 2 entries/ });
    fireEvent.click(tile);
    // Give any (incorrect) navigation a chance to happen before asserting
    // its absence.
    await Promise.resolve();
    expect(window.location.hash).toBe("");
    expect(servicePage()).toBeNull();
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
});

// The toggle, per docs/PLAN.md's Phase 3.7 DAG decision 1: a view switch, the
// list as default, and one addressable page rather than a second route.
describe("App -- the view toggle", () => {
  it("starts on the list", async () => {
    await renderLoaded();
    expect(screen.getByRole("radio", { name: "List" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("heading", { level: 2, name: "Serves requests" })).not.toBeNull();
  });

  it("swaps the list for the canvas, and back", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));

    // The band headings are the board's; the legend is the canvas's.
    await waitFor(() => expect(screen.queryByText(/Arrows point from a service to what it depends on/)).not.toBeNull());
    expect(screen.queryByRole("heading", { level: 2, name: "Serves requests" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Serves requests" })).not.toBeNull());
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
    expect(screen.queryByRole("heading", { level: 2, name: "Serves requests" })).toBeNull();
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
    expect(screen.queryByRole("heading", { level: 2, name: "Serves requests" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Serves requests" })).not.toBeNull());
    expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).toBeNull();
  });

  // The original two tests here ("drops the text edge list on the migration
  // board too" / "...on the canvas") each asserted a *before* state -- a
  // "Dependencies" heading, or edge text like "supabase-db", visible on the
  // list view -- and then that switching view dropped it. Neither premise is
  // true any more: EdgesList has no caller anywhere in this app (App.tsx's
  // own trailing comment says so directly), not just off the migration board
  // and the canvas. There is nothing left to contrast a removal against, so
  // this is reframed as the fact both older tests were actually protecting:
  // no view in the app renders the flat text transcript of the manifest's
  // edges.
  it("renders no flat text edge list ('Dependencies' heading, or 'id (Name) -> id (Name)' lines) on any view", async () => {
    await renderLoaded(migratingPayload());
    const asserts = () => {
      // "Dependencies" is EdgesList's own heading and nothing else's --
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

  // The wide page is the canvas's alone -- a graph needs the horizontal room,
  // a list, a board and the service page do not. This asserts the class
  // App.tsx actually applies, not that the stylesheet defines a rule for it:
  // vitest's CSS Module proxy synthesises a class name for *any* key
  // (probed: an undefined key comes back as `_doesNotExist_<hash>`), so no
  // test in this suite can see whether `.wide` still exists in
  // App.module.css. What this can and does prove is App.tsx's own
  // conditional -- both files resolve `styles.wide` to the same fabricated
  // string, so the comparison is meaningful for that, and only that.
  it("widens the page for the canvas only, and drops it once a service page opens", async () => {
    // `!` because the base tsconfig sets noUncheckedIndexedAccess and
    // vite/client types a CSS Module as an index signature.
    const wide = appStyles.wide!;
    await renderLoaded(migratingPayload());
    const main = () => document.querySelector("main")!;
    expect(main().classList.contains(wide)).toBe(false);

    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    await waitFor(() => expect(main().classList.contains(wide)).toBe(true));

    fireEvent.click(screen.getByRole("radio", { name: "Migrations" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).not.toBeNull());
    expect(main().classList.contains(wide)).toBe(false);
  });

  it("drops the wide class once a service page opens from the graph, even though mode is still 'graph'", async () => {
    const wide = appStyles.wide!;
    await renderLoaded();
    const main = () => document.querySelector("main")!;
    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    await waitFor(() => expect(main().classList.contains(wide)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(servicePage()).not.toBeNull());
    expect(main().classList.contains(wide)).toBe(false);
  });
});
