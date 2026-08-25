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
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ViewPayload, ViewService } from "@catalogus/cli";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";
import appStyles from "./App.module.css";
import { serviceNodeDomId } from "./components/ServiceNode.js";
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

function payload(overrides: { services?: ViewService[]; edges?: { from: string; to: string }[] } = {}): ViewPayload {
  return {
    manifestPath: "C:/scratch/project/catalogus.yaml",
    readAt: "2026-08-24T00:00:00.000Z",
    project: { name: "Scratch", slug: "scratch" },
    services: overrides.services ?? [
      makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io" }),
      makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase" }),
    ],
    edges: overrides.edges ?? [{ from: "fly-api", to: "supabase-db" }],
  };
}

/** Renders App with `fetch` answering one payload, and waits for the first node to appear. */
async function renderLoaded(body: ViewPayload = payload()) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => body }))
  );
  render(<App />);
  await screen.findByRole("button", { name: /Fly\.io/ });
}

beforeEach(() => {
  // Every test starts from a hash-free URL on the same history entry --
  // otherwise one test's deep link is the next test's starting state.
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

describe("App -- the detail panel route", () => {
  it("opens the panel for the clicked node and addresses it in the hash", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/fly-api"));
    expect(screen.getByRole("region")).not.toBeNull();
  });

  it("opens the panel straight from a deep link, with no click at all", async () => {
    window.history.replaceState(null, "", "/#/service/supabase-db");
    await renderLoaded();
    expect(screen.getByRole("region")).not.toBeNull();
  });

  it("selects nothing for a hash naming a service the manifest does not have", async () => {
    window.history.replaceState(null, "", "/#/service/does-not-exist");
    await renderLoaded();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("closes the panel on Escape", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  });

  it("reopens the panel when the hash changes under it -- back/forward, or a hand-edited URL", async () => {
    await renderLoaded();
    window.history.replaceState(null, "", "/#/service/supabase-db");
    fireEvent(window, new window.HashChangeEvent("hashchange"));
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
  });
});

// The defect: `window.location.hash = ...` pushes a history entry, so Back
// walked the panel open and shut instead of leaving the viewer, and a close
// pushed an entry whose only content was "no panel" -- which Back then undid
// by reopening it (docs/PLAN.md, Phase 3.7's five smaller viewer defects).
describe("App -- opening and closing the panel does not grow history", () => {
  it("adds no history entry when a node is clicked", async () => {
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
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Supabase/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/supabase-db"));
    expect(window.history.length).toBe(before);
  });

  it("leaves no bare '#' behind when the panel closes, so the address stays clean", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(window.location.hash).toBe("");
  });
});

// The defect: focus fell to <body> when a deep-linked panel was closed,
// because `lastFocusedRef` is captured on click and a deep link involves no
// click. From <body>, the next Tab starts at the top of the document and a
// screen reader has lost its place entirely.
describe("App -- focus when the panel closes", () => {
  it("hands focus back to the node that opened it", async () => {
    await renderLoaded();
    const node = screen.getByRole("button", { name: /Fly\.io/ });
    node.focus();
    fireEvent.click(node);
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(document.activeElement).toBe(node);
  });

  it("hands focus to the addressed node when nothing opened the panel -- the deep-link case", async () => {
    window.history.replaceState(null, "", "/#/service/supabase-db");
    await renderLoaded();
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(document.activeElement).toBe(document.getElementById(serviceNodeDomId("supabase-db")));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("does not restore a stale opener when the next panel was deep-linked to another service", async () => {
    await renderLoaded();
    const flyNode = screen.getByRole("button", { name: /Fly\.io/ });
    flyNode.focus();
    fireEvent.click(flyNode);
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());

    // Now a deep link to the *other* service, arriving the way back/forward
    // or a hand-edited address does.
    window.history.replaceState(null, "", "/#/service/supabase-db");
    fireEvent(window, new window.HashChangeEvent("hashchange"));
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());

    expect(document.activeElement).toBe(document.getElementById(serviceNodeDomId("supabase-db")));
    expect(document.activeElement).not.toBe(flyNode);
  });

  it("moves focus into the panel when it opens", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("region")));
  });
});

// The toggle, per docs/PLAN.md's Phase 3.7 DAG decision 1: a view switch, the
// list as default, and one addressable page rather than a second route.
describe("App -- the view toggle", () => {
  it("starts on the list", async () => {
    await renderLoaded();
    expect(screen.getByRole("radio", { name: "List" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("heading", { level: 2, name: "Hosting" })).not.toBeNull();
  });

  it("swaps the list for the canvas, and back", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));

    // The rollup headings are the list's; the legend is the canvas's.
    await waitFor(() => expect(screen.queryByText(/Arrows point from a service to what it depends on/)).not.toBeNull());
    expect(screen.queryByRole("heading", { level: 2, name: "Hosting" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Hosting" })).not.toBeNull());
    expect(screen.queryByText(/Arrows point from a service to what it depends on/)).toBeNull();
  });

  it("keeps the same nodes and the same selection contract across the swap", async () => {
    window.history.replaceState(null, "", "/#/service/fly-api");
    await renderLoaded();
    expect(screen.getByRole("button", { name: /Fly\.io/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    // Still selected, still the same panel, addressed by the same hash --
    // the toggle is a view switch, not a navigation.
    await waitFor(() => expect(screen.getByRole("button", { name: /Fly\.io/ }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("region")).not.toBeNull();
    expect(window.location.hash).toBe("#/service/fly-api");
  });

  // The migration board's App-level wiring. Every assertion below was added
  // because the validation pass mutated the corresponding line in App.tsx and
  // watched all 991 tests stay green: the board could have been swapped for
  // the service list, or for a bare paragraph, and nothing would have said so.
  // The board's own behaviour is MigrationList.test.tsx's; what these hold is
  // that App renders it, in the right mode, with the right neighbours.
  //
  // A payload with something to migrate: the default fixture is all-active,
  // which renders the board's all-clear state and would make "is the board
  // there" indistinguishable from "is anything there".
  const migratingPayload = () =>
    payload({
      services: [
        makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io" }),
        makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase", status: "phasing_out", replaced_by: "fly-api" }),
      ],
    });

  it("swaps the list for the migration board, and back", async () => {
    await renderLoaded(migratingPayload());
    fireEvent.click(screen.getByRole("radio", { name: "Migrations" }));

    // The board's section headings are its own; the rollup headings are the
    // list's, and exactly one of the two sets is on the page at a time.
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).not.toBeNull());
    expect(screen.queryByRole("heading", { level: 2, name: "Overdue" })).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Hosting" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Hosting" })).not.toBeNull());
    expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).toBeNull();
  });

  it("drops the text edge list on the migration board too", async () => {
    await renderLoaded(migratingPayload());
    expect(screen.queryByRole("heading", { level: 2, name: "Dependencies" })).not.toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Migrations" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).not.toBeNull());
    // The board names the replacement in its own row; what is gone is the
    // whole-manifest edge list underneath, which answers a different question
    // than the one this view was opened to ask.
    expect(screen.queryByRole("heading", { level: 2, name: "Dependencies" })).toBeNull();
  });

  // The wide page is the canvas's alone -- a graph needs the horizontal room,
  // a list and a board do not. This asserts the class App actually applies,
  // not that the stylesheet defines a rule for it: vitest's CSS Module proxy
  // synthesises a class name for *any* key (probed: an undefined key comes
  // back as `_doesNotExist_<hash>`), so no test in this suite can see whether
  // `.wide` still exists in App.module.css.
  it("widens the page for the canvas only", async () => {
    // `!` because the base tsconfig sets noUncheckedIndexedAccess and
    // vite/client types a CSS Module as an index signature -- the same reason
    // MODES[...]! reads that way in ViewToggle.tsx. Under vitest the proxy
    // answers every key, which is exactly the weakness this test's comment
    // above owns up to.
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

  // A regression guard, and the bug it guards was live: the board's rows had
  // no `serviceNodeDomId`, so the close-focus fallback below found nothing and
  // focus fell to `<body>` -- in this view and no other. That is the exact
  // state App.tsx's own focus comment says was already found and fixed once,
  // which is what makes it worth a test rather than a fix alone.
  it("hands focus back to the board's row when a deep-linked panel closes", async () => {
    window.history.replaceState(null, "", "/#/service/supabase-db");
    await renderLoaded(migratingPayload());
    fireEvent.click(screen.getByRole("radio", { name: "Migrations" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "In flight" })).not.toBeNull());

    // Nothing on the page opened this panel -- the hash did -- so the opener
    // ref is null and the id lookup is the only path left.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(serviceNodeDomId("supabase-db"))));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("drops the text edge list on the canvas, where the same edges are drawn", async () => {
    await renderLoaded();
    const edgeText = (id: string) => screen.queryAllByText(new RegExp(id)).length;
    expect(edgeText("supabase-db")).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    await waitFor(() => expect(screen.queryByText(/Arrows point from a service/)).not.toBeNull());
    // The node itself still names it; what is gone is the second, textual
    // copy of the edge list underneath.
    expect(screen.queryByText("fly-api (Fly.io)")).toBeNull();
  });
});
