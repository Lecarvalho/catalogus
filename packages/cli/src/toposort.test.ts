import { describe, expect, it } from "vitest";

import { findCycles } from "./toposort.js";

describe("findCycles", () => {
  it("reports ok on an acyclic graph", () => {
    const result = findCycles(
      ["a", "b", "c"],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ]
    );
    expect(result.ok).toBe(true);
    expect(result.cycles).toEqual([]);
  });

  it("reports ok on a graph with no edges at all", () => {
    const result = findCycles(["a", "b"], []);
    expect(result.ok).toBe(true);
  });

  it("finds a simple 3-node cycle and prints the real path", () => {
    const result = findCycles(
      ["a", "b", "c"],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ]
    );
    expect(result.ok).toBe(false);
    expect(result.cycles).toHaveLength(1);
    const cycle = result.cycles[0] as string[];
    // Rotate-invariant check: it's the same closed loop, whichever node it starts from.
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    expect(new Set(cycle)).toEqual(new Set(["a", "b", "c"]));
  });

  it("catches a self-edge as a one-node cycle", () => {
    const result = findCycles(["a"], [{ from: "a", to: "a" }]);
    expect(result.ok).toBe(false);
    expect(result.cycles).toEqual([["a", "a"]]);
  });

  it("finds a self-edge among otherwise-fine nodes without disturbing them", () => {
    const result = findCycles(
      ["a", "b", "c"],
      [
        { from: "a", to: "b" },
        { from: "c", to: "c" },
      ]
    );
    expect(result.ok).toBe(false);
    expect(result.cycles).toEqual([["c", "c"]]);
  });

  it("finds two disjoint cycles independently", () => {
    const result = findCycles(
      ["a", "b", "c", "d"],
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
        { from: "c", to: "d" },
        { from: "d", to: "c" },
      ]
    );
    expect(result.ok).toBe(false);
    expect(result.cycles).toHaveLength(2);
    const nodesSeen = new Set(result.cycles.flat());
    expect(nodesSeen).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("does not blow the call stack on a long chain (iterative, not recursive)", () => {
    const nodeIds = Array.from({ length: 20000 }, (_, i) => `n${i}`);
    const edges = nodeIds.slice(0, -1).map((id, i) => ({ from: id, to: nodeIds[i + 1] as string }));
    expect(() => findCycles(nodeIds, edges)).not.toThrow();
    expect(findCycles(nodeIds, edges).ok).toBe(true);
  });
});
