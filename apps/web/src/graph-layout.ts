// Pure graph-layout plumbing, kept out of any component and out of elkjs
// itself so the rules are testable without a worker, without a canvas and
// without jsdom -- the same reason group-services.ts and hash-route.ts are
// separate modules. elk-layout.ts is the impure half: it owns the worker and
// nothing else.
//
// What this module decides: which nodes exist, which edges survive, how big
// a node is, and what elk is asked for. What it deliberately does not decide:
// edge *routing*. elk is asked for node positions only and React Flow draws
// its own edges, which is the standard pairing of the two -- taking elk's
// routed polylines would mean a custom edge renderer and a second source of
// truth for where a line goes.
//
// Direction: `RIGHT`, so an edge runs left-to-right from the depender to the
// dependency (docs/PLAN.md's Phase 3.7 DAG decision 2). Blast radius is
// therefore read right-to-left -- what points *at* a node is what breaks when
// it dies -- and the canvas has to say so somewhere, because the reverse
// reading is the intuitive one.
import type { ViewService } from "@catalogus/cli";

/**
 * One node's box on the canvas, in CSS pixels.
 *
 * Fixed rather than measured. React Flow needs a size before elk runs, and
 * measuring 35 nodes to lay them out means rendering them twice -- once
 * off-screen at the wrong positions, which is visible as a flash. The height
 * is the taller of the two node variants (with an id line and without), so a
 * node that grows the id line stays inside its box instead of overlapping its
 * neighbour.
 */
export const NODE_SIZE = { width: 216, height: 64 } as const;

/**
 * What elk is asked to do. `layered` is the Sugiyama-family algorithm, which
 * is the right family for a dependency DAG: it assigns ranks along the flow
 * direction and then minimises crossings within each rank.
 *
 * The two spacing numbers are not arbitrary. `nodeNodeBetweenLayers` is the
 * gap edges have to travel, and 18 edges leaving one node (see
 * examples/layout-stress.catalogus.yaml) fan out across that gap -- too small
 * and they overlap into a single band. `nodeNode` is the within-rank gap, and
 * the fan-out node's 18 targets stack up in one rank, so this is the number
 * that decides how tall that column gets.
 */
export const ELK_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "28",
  "elk.layered.spacing.nodeNodeBetweenLayers": "110",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  // Orphans (an entry with no edges at all -- three of them in the stress
  // fixture) are laid out as their own component. Packing them beside the
  // main graph rather than letting elk scatter them keeps them findable.
  "elk.separateConnectedComponents": "true",
  "elk.spacing.componentComponent": "40",
};

export interface ElkNodeInput {
  id: string;
  width: number;
  height: number;
}

export interface ElkEdgeInput {
  id: string;
  sources: [string];
  targets: [string];
}

export interface ElkGraphInput {
  id: "root";
  layoutOptions: Record<string, string>;
  children: ElkNodeInput[];
  edges: ElkEdgeInput[];
}

/** One node's laid-out position, as elk returns it and React Flow consumes it. */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * Builds the graph description elk is handed.
 *
 * Two properties this guarantees, both of which have a test naming them:
 *
 *  - **Every service becomes a node**, including one nothing points at and
 *    that points at nothing. Walking the edge list instead is the obvious
 *    shortcut and it silently drops orphans -- `board`, `agent-claude` and
 *    `agent-cursor` in examples/layout-stress.catalogus.yaml exist to catch
 *    exactly that.
 *  - **An edge with an endpoint that is not a node is dropped**, rather than
 *    handed to elk, which throws on one and takes the whole canvas down with
 *    it. This should never happen: `catalogus validate` enforces referential
 *    integrity and `catalogus view` refuses to serve a manifest that fails
 *    it. It is the same defensive posture App.tsx's `labelForId` already
 *    takes for the same reason -- a rendering bug must degrade to a missing
 *    line, not to a blank page.
 */
/**
 * One edge's stable identity, used by both the elk graph and the React Flow
 * edge list so the two never disagree about which line is which.
 *
 * The index is the edge's position in the manifest's own `dependencies` list.
 * An id of just `from--to` would collide on a manifest that declares the same
 * pair twice, which `catalogus validate --strict` accepts, so it is reachable
 * rather than theoretical. Keying off the position *after* filtering would
 * mean one dangling edge silently renumbering every edge after it.
 *
 * **Who actually needs the uniqueness is React Flow, not elk.** This comment
 * used to say elk rejects a duplicate edge id outright; an independent pass
 * ran elkjs 0.12.0 against duplicate edge ids and duplicate *node* ids and it
 * laid both out without complaint. What elk does reject is a dangling
 * endpoint (`JsonImportException: Referenced shape does not exist`), which is
 * the filter below, not this id scheme.
 *
 * React Flow is what actually needs the uniqueness, and that half was run
 * too rather than read off `edgeLookup.set(edge.id, edge)`: dropping the
 * index and rendering a duplicated pair draws both lines but hands React two
 * children with the same key, which React warns may be "duplicated and/or
 * omitted". Not a crash -- a graph that is quietly one line short of the
 * manifest, which is the failure mode this whole module is arranged against.
 */
function edgeId(edge: { from: string; to: string }, index: number): string {
  return `${edge.from}--${edge.to}--${index}`;
}

export function toElkGraph(services: readonly ViewService[], edges: readonly { from: string; to: string }[]): ElkGraphInput {
  const known = new Set(services.map((service) => service.id));

  return {
    id: "root",
    layoutOptions: ELK_LAYOUT_OPTIONS,
    children: services.map((service) => ({ id: service.id, width: NODE_SIZE.width, height: NODE_SIZE.height })),
    edges: edges
      // Indexed before filtering, not after: `edgeId` keys off the position
      // in the *declared* list, so a dangling edge earlier in the manifest
      // does not shift every id after it. drawableEdges() indexes the same
      // way, which is what makes the two agree.
      .map((edge, index) => ({ edge, index }))
      .filter(({ edge }) => known.has(edge.from) && known.has(edge.to))
      .map(({ edge, index }) => ({ id: edgeId(edge, index), sources: [edge.from] as [string], targets: [edge.to] as [string] })),
  };
}

/** The subset of elk's result this module reads. elk returns a great deal more; none of it is used. */
export interface ElkLayoutResult {
  children?: { id: string; x?: number; y?: number }[];
}

/**
 * Reads node positions out of elk's result.
 *
 * A `Map`, not an object literal: the keys are service ids, which are
 * manifest-derived text, and `positions.constructor` on a plain object
 * resolves through `Object.prototype` -- the defect class this repo has now
 * produced five times (docs/PLAN.md).
 *
 * A child elk returns without coordinates falls back to the origin rather
 * than to `undefined`: React Flow throws on a node whose position is not two
 * numbers, and one unplaced node must not blank the canvas.
 */
export function positionsFrom(result: ElkLayoutResult): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return positions;
}

/** One edge the canvas will draw, with the one piece of presentation state that is not styling: whether it touches the selected node. */
export interface DrawableEdge {
  id: string;
  source: string;
  target: string;
  /** True when this edge touches the selected node -- the canvas draws those at full strength and dims the rest. */
  incident: boolean;
}

/**
 * The edges the canvas draws, in the same order the manifest declares them.
 *
 * Split out of GraphCanvas so the rules are testable: what survives the
 * dangling-endpoint filter, what counts as incident, and that the ids match
 * the ones `toElkGraph` produced for the same input -- React Flow and elk
 * have to agree on an edge's identity or a highlight lands on the wrong line.
 * Both call sites derive them the same way for that reason.
 *
 * What this cannot tell you is whether an edge is actually *painted*. React
 * Flow resolves an edge's endpoints from handle bounds it computes while
 * measuring the node element, jsdom reports every element as 0x0, and so no
 * edge is drawn under jsdom whether the code is right or wrong. That check is
 * a live-browser one, and docs/PLAN.md records it as such.
 */
export function drawableEdges(
  services: readonly ViewService[],
  edges: readonly { from: string; to: string }[],
  selectedId: string | null
): DrawableEdge[] {
  const known = new Set(services.map((service) => service.id));
  const drawable: DrawableEdge[] = [];

  edges.forEach((edge, index) => {
    if (!known.has(edge.from) || !known.has(edge.to)) {
      return;
    }
    drawable.push({
      id: edgeId(edge, index),
      source: edge.from,
      target: edge.to,
      incident: selectedId !== null && (edge.from === selectedId || edge.to === selectedId),
    });
  });

  return drawable;
}
