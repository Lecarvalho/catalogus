// @vitest-environment jsdom
//
// The canvas, tested against a stub layout rather than elk. That is not a
// convenience: `elk-layout.ts` reaches its worker through a Vite `?worker`
// import that cannot be evaluated outside a browser, so a canvas that
// imported elk directly would be a canvas with no tests at all. The `layout`
// prop exists for this, and the stubs below are the whole reason it does.
//
// What is under test here is everything the canvas decides -- which nodes
// exist, which edges survive, which of them are highlighted, and what the
// three layout states render. What is *not* under test is whether React Flow
// paints them in the right place: that needs a real browser with real
// dimensions, and the live run recorded in docs/PLAN.md is what covers it.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewService } from "@catalogus/cli";

import { GraphCanvas } from "./GraphCanvas.js";
import { makeViewService } from "../test-support/fixtures.js";
import type { NodePosition } from "../graph-layout.js";
import styles from "./GraphCanvas.module.css";

beforeAll(() => {
  // React Flow measures its container. jsdom has no ResizeObserver at all and
  // reports every element as 0x0, so this stub exists to let the component
  // mount -- it deliberately does not simulate resizing, because nothing here
  // asserts on geometry.
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => {
  cleanup();
});

const SERVICES: ViewService[] = [
  makeViewService({ id: "host-api", role: "hosting-api", rollup: "hosting", name: "Fly.io" }),
  makeViewService({ id: "host-web", role: "hosting-web", rollup: "hosting", name: "Fly.io" }),
  makeViewService({ id: "db-primary", role: "database-primary", rollup: "database", name: "PostgreSQL" }),
  // No edges at either end. A canvas built from the edge list drops it.
  makeViewService({ id: "board", role: "pm", rollup: "pm", name: "Trello" }),
];

const EDGES = [
  { from: "host-web", to: "host-api" },
  { from: "host-api", to: "db-primary" },
];

/** A layout that resolves immediately, placing every node on a diagonal. */
function stubLayout(services: readonly ViewService[]): Promise<Map<string, NodePosition>> {
  return Promise.resolve(new Map(services.map((service, index) => [service.id, { x: index * 300, y: index * 100 }])));
}

function renderCanvas(overrides: Partial<React.ComponentProps<typeof GraphCanvas>> = {}) {
  return render(
    <GraphCanvas services={SERVICES} edges={EDGES} selectedId={null} onSelect={vi.fn()} layout={stubLayout} {...overrides} />
  );
}

describe("GraphCanvas -- layout states", () => {
  it("says it is laying out before the layout resolves", () => {
    renderCanvas({ layout: () => new Promise(() => {}) });
    expect(screen.getByText(/Laying out the graph/)).not.toBeNull();
  });

  it("reports a layout failure instead of rendering an empty canvas", async () => {
    renderCanvas({ layout: () => Promise.reject(new Error("worker exploded")) });
    // An empty canvas and a project with no services look identical, which is
    // why this is an alert rather than a silent fallback.
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("worker exploded");
  });

  it("renders every service as a node once the layout resolves, including the one with no edges", async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByRole("button", { name: /Trello/ })).not.toBeNull());
    expect(screen.getByRole("button", { name: /PostgreSQL/ })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /Fly\.io/ })).toHaveLength(2);
  });
});

describe("GraphCanvas -- the nodes", () => {
  it("shows the local id on both entries of a repeated vendor, scoped to the whole canvas", async () => {
    renderCanvas();
    // On a flat layout every node is beside every other one, so the
    // group-at-a-time scoping the list uses would leave these two
    // indistinguishable.
    await waitFor(() => expect(screen.getByRole("button", { name: /Fly\.io.*host-api/ })).not.toBeNull());
    expect(screen.getByRole("button", { name: /Fly\.io.*host-web/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: "PostgreSQL" })).not.toBeNull();
  });

  it("marks the node matching selectedId as pressed, and no other", async () => {
    renderCanvas({ selectedId: "db-primary" });
    await waitFor(() => expect(screen.getByRole("button", { name: /PostgreSQL/ }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("button", { name: /Trello/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onSelect with the id when a node is activated -- the same contract the list has", async () => {
    const onSelect = vi.fn();
    renderCanvas({ onSelect });
    const node = await screen.findByRole("button", { name: /Trello/ });
    node.click();
    expect(onSelect).toHaveBeenCalledWith("board");
  });
});

describe("GraphCanvas -- the status-mark world", () => {
  // The canvas used to paint a coloured ring around every node's icon, one
  // rule per status including `active` -- the world ServiceNode.module.css
  // moved off of. This is the canvas-level proof that the swap actually
  // reaches a rendered node here, not only the ServiceNode unit tests: the
  // 31-of-35-active manifest this design is built against would still look
  // wrong if GraphCanvas wired the node up some other way.
  it("marks a departure-status node and marks none of the active majority", async () => {
    const services: ViewService[] = [
      ...SERVICES,
      makeViewService({ id: "old-thing", role: "hosting-legacy", rollup: "hosting", name: "Old Thing", status: "deprecated" }),
    ];
    render(<GraphCanvas services={services} edges={EDGES} selectedId={null} onSelect={vi.fn()} layout={stubLayout} />);

    const deprecatedButton = await screen.findByRole("button", { name: /Old Thing/ });
    expect(deprecatedButton.querySelector('[aria-hidden="true"]')).not.toBeNull();

    const activeButton = screen.getByRole("button", { name: /Trello/ });
    expect(activeButton.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

describe("GraphCanvas -- the legend", () => {
  // Decision 2 in docs/PLAN.md's Phase 3.7 fixed the arrow direction and
  // noted that blast radius is then read backwards, which is the reverse of
  // the intuitive reading. A graph read backwards silently is worse than no
  // graph, so the direction is stated on screen.
  it("says which way the arrows are read", async () => {
    renderCanvas();
    const legend = await screen.findByText(/Arrows point from a service to what it depends on/);
    expect(legend.textContent).toMatch(/blast radius/i);
  });
});

describe("GraphCanvas -- the node's place in the document", () => {
  // `ServiceNode` returns a bare `<button>`, and the two call sites put it
  // somewhere different: the list wraps it in an `<li>` inside its `<ul>`,
  // the canvas in React Flow's own wrapper. It used to return the `<li>`
  // itself, which made every canvas node a list item with no list around it
  // -- invalid markup, and a node announcing itself to a screen reader as
  // one of a list that does not exist.
  //
  // It also made `GraphCanvas.module.css`'s `.node > button` rule dead: with
  // the `<li>` in between, the button was a grandchild and the child
  // combinator never matched, so the tile kept its own 220px `max-width`
  // inside the 216x64 box elk laid out and React Flow anchored its edge
  // handles to. Neither defect was visible to any test, which is why both
  // are asserted here rather than in prose.
  it("puts the node's button directly inside the wrapper the stylesheet targets", async () => {
    renderCanvas();

    const button = await screen.findByRole("button", { name: /host-api/ });
    // The exact relationship `.node > button` needs. Asserting the parent's
    // class rather than a tag name is the point: this is the selector.
    expect(button.parentElement?.classList.contains(styles.node ?? "")).toBe(true);
  });

  // **The limit, so it is not mistaken for full coverage.** These two assert
  // the DOM shape the selector needs, not the selector. Under vitest a CSS
  // Module import is a proxy that synthesises a class name for *any* key, so
  // no test in this suite can see whether `.node > button` is still in the
  // stylesheet at all -- deleting the rule leaves both of these green. What
  // they do foreclose is the shape drifting back, which is how the rule died
  // the first time.
  it("renders no list item on the canvas", async () => {
    renderCanvas();

    await screen.findByRole("button", { name: /host-api/ });
    expect(document.querySelectorAll("li").length).toBe(0);
    expect(screen.queryAllByRole("listitem")).toEqual([]);
  });
});

describe("GraphCanvas -- the onError wiring", () => {
  // React Flow reports its own problems -- a dropped edge with an
  // unresolvable endpoint chief among them -- through this callback and
  // nowhere else; an unwired one fails in total silence. This is not a
  // staged defect: the beforeAll ResizeObserver stub above never gives the
  // pane a measured size, so React Flow's own "004" ("parent container needs
  // a width and a height") error fires on every render in this file already
  // -- unasserted until now, which is the gap this test closes. Deleting the
  // `onError` prop from GraphCanvas.tsx turns this red without touching
  // anything else here.
  //
  // **What it rides on, stated so nobody has to rediscover it.** The only
  // thing producing a `[react-flow ` prefix in this file is 004, and 004
  // fires only because the pane is never measured. Install the block below's
  // measuring stubs and `console.error` goes completely silent -- so if this
  // file's `beforeAll` is ever upgraded to the spec-accurate observer, this
  // test goes red for a reason that has nothing to do with the wiring it
  // guards, and the fix then is to stage an error rather than to relax the
  // assertion.
  it("forwards a React Flow error to console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderCanvas();
      await waitFor(() => {
        expect(errorSpy.mock.calls.some((call) => typeof call[0] === "string" && call[0].startsWith("[react-flow "))).toBe(true);
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("GraphCanvas -- the incident edge highlight", () => {
  // Selecting a node dims every edge except the ones touching it (see
  // GraphCanvas.tsx's `edge.incident` ternary). `drawableEdges` computes the
  // `incident` flag itself and graph-layout.test.ts covers that; getting
  // from the flag to a rendered class needs an actual edge in the DOM, which
  // nothing else in this file has -- the `beforeAll` ResizeObserver above
  // has an `observe()` that does nothing, so React Flow's node-measurement
  // effect never runs, no node ever gets handle bounds, and every edge's
  // position resolves to null and renders nothing (see graph-layout.ts's
  // `drawableEdges` comment, which documents this as a live-browser-only
  // check).
  //
  // It is reachable under jsdom anyway, with three stubs, each load-bearing:
  //
  //  - A ResizeObserver whose `observe()` actually delivers a notification.
  //    The spec requires exactly one "initial observation" per
  //    newly-observed element regardless of whether anything resized, which
  //    is what React Flow's `useNodeObserver` depends on to ever read a
  //    node's size at all; the do-nothing stub above never sends it.
  //  - `getBoundingClientRect`/`offsetWidth`/`offsetHeight` on every element.
  //    jsdom does no layout and reports 0x0 for all three, and React Flow
  //    refuses to compute handle bounds for a zero-size node.
  //  - `DOMMatrixReadOnly`. React Flow un-zooms a handle's measured pixel
  //    position through one (reading its `m22`, the y-axis scale) and jsdom
  //    has no such constructor at all -- without a stub the measurement step
  //    throws instead of running, which is a worse silence than the one this
  //    test exists to catch elsewhere.
  //
  // Scoped to this block and restored after, not hoisted to the file's own
  // `beforeAll`: every other test here relies on the *un*-measured jsdom
  // behaviour (an edgeless graph, the "004" error in the block above), and
  // installing real measurement everywhere would change what those tests
  // are exercising out from under them.
  let originalResizeObserver: typeof ResizeObserver;
  let originalOffsetWidth: PropertyDescriptor | undefined;
  let originalOffsetHeight: PropertyDescriptor | undefined;
  let originalDOMMatrixReadOnly: unknown;

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    originalDOMMatrixReadOnly = (globalThis as Record<string, unknown>).DOMMatrixReadOnly;

    class NotifyingResizeObserver implements ResizeObserver {
      #callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
      }
      observe(target: Element) {
        // Queued rather than synchronous: real browsers deliver this on the
        // next rendering opportunity, never inside the `observe()` call
        // itself, and React Flow's effect ordering assumes that.
        queueMicrotask(() => {
          const entry = { target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry;
          this.#callback([entry], this);
        });
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = NotifyingResizeObserver as unknown as typeof ResizeObserver;

    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 200 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 100 });
    HTMLElement.prototype.getBoundingClientRect = function stubbedRect() {
      return { width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => "" } as DOMRect;
    };

    (globalThis as Record<string, unknown>).DOMMatrixReadOnly = class {
      m22 = 1;
    };
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
    }
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    }
    // `getBoundingClientRect` was never an own property of HTMLElement's
    // prototype to begin with (it lives on Element's) -- deleting the
    // override here, rather than restoring a saved descriptor, is what lets
    // it fall back through to the inherited one.
    delete (HTMLElement.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
    // Same distinction one line up, and it bit here: jsdom has no
    // `DOMMatrixReadOnly` at all, so assigning the saved value back writes an
    // own property holding `undefined` -- which is not "restored", it is a
    // globalThis that now answers `true` to `"DOMMatrixReadOnly" in`. Inert
    // while this is the last block in the file and vitest isolates per file;
    // wrong the moment either stops being true.
    if (originalDOMMatrixReadOnly === undefined) {
      delete (globalThis as Record<string, unknown>).DOMMatrixReadOnly;
    } else {
      (globalThis as Record<string, unknown>).DOMMatrixReadOnly = originalDOMMatrixReadOnly;
    }
  });

  it("marks the edges touching the selected node, and no others", async () => {
    // host-web depends on host-api, which depends on db-primary. Selecting
    // host-web makes exactly one of the two edges incident.
    renderCanvas({ selectedId: "host-web" });

    // The custom `className` React Flow is handed lands on the wrapping
    // `<g class="react-flow__edge">`, not on the inner `<path
    // class="react-flow__edge-path">` -- found by rendering it and reading
    // the live DOM, the same way GraphCanvas.tsx's own comments record their
    // findings, rather than assumed from the prop name.
    const edgeGroups = await waitFor(() => {
      const groups = Array.from(document.querySelectorAll<SVGGElement>(".react-flow__edge"));
      expect(groups.length).toBe(2);
      return groups;
    });

    // The edge id is `${from}--${to}--${index}`, index being the pair's
    // position in EDGES (see graph-layout.ts's `edgeId`) -- not hardcoded
    // here, so this stays right if EDGES above is ever reordered.
    const byPair = (source: string, target: string) => {
      const index = EDGES.findIndex((edge) => edge.from === source && edge.to === target);
      return edgeGroups.find((group) => group.getAttribute("data-testid") === `rf__edge-${source}--${target}--${index}`);
    };

    // host-web is selected. Its one edge (to host-api) is incident; the
    // other edge (host-api -> db-primary) does not touch it and stays dimmed.
    // `?? ""`, the same reason ServiceNode.tsx's className line has one: CSS
    // Modules types return `string | undefined` per class under
    // `noUncheckedIndexedAccess`, and `classList.contains` wants a `string`.
    expect(byPair("host-web", "host-api")?.classList.contains(styles.edgeIncident ?? "")).toBe(true);
    expect(byPair("host-web", "host-api")?.classList.contains(styles.edge ?? "")).toBe(false);
    expect(byPair("host-api", "db-primary")?.classList.contains(styles.edge ?? "")).toBe(true);
    expect(byPair("host-api", "db-primary")?.classList.contains(styles.edgeIncident ?? "")).toBe(false);
  });
});

// The per-stylesheet legacy-alias guard that used to live here (and its
// twin in ServiceNode.test.tsx) is gone: each checked only the one
// stylesheet it was written against, so the guard covered 2 of the
// component stylesheets under apps/web/src and nothing written after it.
// One discovery-based guard now covers all of them --
// apps/web/src/token-references.test.ts, which walks every `*.module.css`
// file rather than naming files, and fails on any `var(--x)` this
// stylesheet (or any other) references that tokens.css no longer defines.
// See that file's header for what it does and does not catch.
