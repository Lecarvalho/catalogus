import { describe, expect, it } from "vitest";

import { ELK_LAYOUT_OPTIONS, NODE_SIZE, drawableEdges, positionsFrom, toElkGraph } from "./graph-layout.js";
import { makeViewService as service } from "./test-support/fixtures.js";

describe("toElkGraph", () => {
  it("makes a node of every service, including one with no edges at either end", () => {
    const graph = toElkGraph(
      [
        service({ id: "host-api", role: "hosting-api" }),
        service({ id: "db-primary", role: "database-primary" }),
        // Nothing points at this and it points at nothing. Walking the edge
        // list instead of the service list drops it silently, which is the
        // reason examples/layout-stress.catalogus.yaml carries three orphans.
        service({ id: "board", role: "pm" }),
      ],
      [{ from: "host-api", to: "db-primary" }]
    );
    expect(graph.children.map((child) => child.id)).toEqual(["host-api", "db-primary", "board"]);
  });

  it("gives every node the same fixed box, so elk lays out against what React Flow will render", () => {
    const graph = toElkGraph([service({ id: "a", role: "x" }), service({ id: "b", role: "y" })], []);
    expect(graph.children.every((child) => child.width === NODE_SIZE.width && child.height === NODE_SIZE.height)).toBe(true);
  });

  it("turns each edge into a source/target pair in the manifest's own direction", () => {
    const graph = toElkGraph(
      [service({ id: "host-api", role: "hosting-api" }), service({ id: "db-primary", role: "database-primary" })],
      [{ from: "host-api", to: "db-primary" }]
    );
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]!.sources).toEqual(["host-api"]);
    expect(graph.edges[0]!.targets).toEqual(["db-primary"]);
  });

  // elk throws on an edge naming a node it was not given, and a throw here
  // takes the whole canvas down. `catalogus validate` makes this unreachable
  // through the CLI; the guard is for a rendering bug, which must degrade to
  // a missing line rather than to a blank page.
  it("drops an edge whose source is not a node", () => {
    const graph = toElkGraph([service({ id: "db-primary", role: "database-primary" })], [{ from: "ghost", to: "db-primary" }]);
    expect(graph.edges).toEqual([]);
  });

  it("drops an edge whose target is not a node", () => {
    const graph = toElkGraph([service({ id: "host-api", role: "hosting-api" })], [{ from: "host-api", to: "ghost" }]);
    expect(graph.edges).toEqual([]);
  });

  it("keeps the good edges when a bad one is present", () => {
    const graph = toElkGraph(
      [service({ id: "a", role: "x" }), service({ id: "b", role: "y" })],
      [
        { from: "a", to: "b" },
        { from: "a", to: "ghost" },
      ]
    );
    expect(graph.edges.map((edge) => edge.sources[0] + "->" + edge.targets[0])).toEqual(["a->b"]);
  });

  it("gives two declarations of the same pair distinct ids, since elk rejects a duplicate", () => {
    const graph = toElkGraph(
      [service({ id: "a", role: "x" }), service({ id: "b", role: "y" })],
      [
        { from: "a", to: "b" },
        { from: "a", to: "b" },
      ]
    );
    expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(2);
  });

  it("asks elk for a left-to-right layered layout -- the direction the arrow decision fixed", () => {
    expect(toElkGraph([], []).layoutOptions).toBe(ELK_LAYOUT_OPTIONS);
    expect(ELK_LAYOUT_OPTIONS["elk.algorithm"]).toBe("layered");
    expect(ELK_LAYOUT_OPTIONS["elk.direction"]).toBe("RIGHT");
  });

  it("returns an empty graph for no services, rather than throwing", () => {
    const graph = toElkGraph([], []);
    expect(graph.children).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});

describe("positionsFrom", () => {
  it("reads each child's coordinates", () => {
    const positions = positionsFrom({ children: [{ id: "a", x: 10, y: 20 }] });
    expect(positions.get("a")).toEqual({ x: 10, y: 20 });
  });

  it("falls back to the origin for a child elk placed without coordinates", () => {
    // React Flow throws on a node whose position is not two numbers, so one
    // unplaced node must not blank the canvas.
    expect(positionsFrom({ children: [{ id: "a" }] }).get("a")).toEqual({ x: 0, y: 0 });
  });

  it("returns an empty map when elk returns no children at all", () => {
    expect(positionsFrom({}).size).toBe(0);
  });

  // The keyed-lookup defect class (docs/PLAN.md): service ids are
  // manifest-derived text, and a plain object literal resolves `constructor`
  // through Object.prototype.
  it("treats a service id of 'constructor' as an ordinary key", () => {
    const positions = positionsFrom({ children: [{ id: "constructor", x: 3, y: 4 }] });
    expect(positions.get("constructor")).toEqual({ x: 3, y: 4 });
    expect(positions.get("toString")).toBeUndefined();
  });
});

describe("drawableEdges", () => {
  const services = [
    service({ id: "host-api", role: "hosting-api" }),
    service({ id: "db-primary", role: "database-primary" }),
    service({ id: "board", role: "pm" }),
  ];
  const edges = [
    { from: "host-api", to: "db-primary" },
    { from: "host-api", to: "ghost" },
  ];

  it("keeps an edge whose endpoints are both nodes and drops one that is not", () => {
    expect(drawableEdges(services, edges, null).map((edge) => `${edge.source}->${edge.target}`)).toEqual(["host-api->db-primary"]);
  });

  it("marks nothing incident when nothing is selected", () => {
    expect(drawableEdges(services, edges, null).every((edge) => !edge.incident)).toBe(true);
  });

  it("marks an edge incident when the selected node is its source", () => {
    expect(drawableEdges(services, edges, "host-api")[0]!.incident).toBe(true);
  });

  it("marks an edge incident when the selected node is its target", () => {
    expect(drawableEdges(services, edges, "db-primary")[0]!.incident).toBe(true);
  });

  it("marks nothing incident for a selected node no edge touches", () => {
    expect(drawableEdges(services, edges, "board").every((edge) => !edge.incident)).toBe(true);
  });

  // React Flow and elk have to agree on an edge's identity, or a highlight
  // lands on a different line from the one it was computed for. The index in
  // the id is what makes a repeated pair distinct, and it has to be the index
  // in the *declared* list, not in the filtered one.
  it("gives an edge the same id toElkGraph gave it, dangling edges included in the count", () => {
    const elk = toElkGraph(services, [{ from: "host-api", to: "ghost" }, { from: "host-api", to: "db-primary" }]);
    const flow = drawableEdges(services, [{ from: "host-api", to: "ghost" }, { from: "host-api", to: "db-primary" }], null);
    expect(flow.map((edge) => edge.id)).toEqual(elk.edges.map((edge) => edge.id));
  });

  it("returns nothing for no edges", () => {
    expect(drawableEdges(services, [], null)).toEqual([]);
  });
});
