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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ViewService } from "@catalogus/cli";

import { GraphCanvas } from "./GraphCanvas.js";
import { makeViewService } from "../test-support/fixtures.js";
import type { NodePosition } from "../graph-layout.js";

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
