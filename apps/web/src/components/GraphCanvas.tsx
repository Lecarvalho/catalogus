// The DAG view: the same nodes the list renders, placed by elk and drawn on a
// pannable React Flow canvas. docs/PLAN.md's Phase 3.7 planned this as a swap
// of the *container* rather than a rebuild of the node, and that is what it
// is -- `ServiceNode` is rendered unchanged inside a React Flow node wrapper,
// with the same `onSelect` contract and the same `#/service/<id>` panel
// behind it.
//
// **The layout function arrives as a prop.** elk lives behind a Vite
// `?worker` import (see elk-layout.ts), which cannot be loaded under jsdom at
// all, so a canvas that imported it directly would be a canvas with no tests.
// Taking it as a prop costs one line at the call site and makes every
// behaviour below testable against a stub.
//
// Arrows run from a service to what it depends on, the direction settled in
// docs/PLAN.md's Phase 3.7 DAG decision 2. That means **blast radius is read
// backwards** -- what points *at* a node is what breaks when it dies -- and
// the legend says so on screen, because the reverse reading is the intuitive
// one and a graph that is read backwards silently is worse than no graph.
import { Background, Handle, MarkerType, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import type { ViewService } from "@catalogus/cli";

import "@xyflow/react/dist/style.css";

import { duplicateNames } from "../group-services.js";
import { NODE_SIZE, drawableEdges, type NodePosition } from "../graph-layout.js";
import { ServiceNode } from "./ServiceNode.js";
import styles from "./GraphCanvas.module.css";

/** What a canvas node carries. React Flow hands this back to the node component untouched. */
type ServiceNodeData = {
  service: ViewService;
  showId: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
};

type ServiceFlowNode = Node<ServiceNodeData, "service">;

/**
 * One canvas node: the list's `ServiceNode` inside React Flow's wrapper, plus
 * the two connection points edges attach to.
 *
 * The handles are `isConnectable={false}` and visually hidden: this canvas
 * never lets anyone draw an edge, because an edge is a fact in
 * `catalogus.yaml` and the CLI is the only writer (see CLAUDE.md). They exist
 * only as the anchors React Flow routes lines to.
 */
function ServiceFlowNodeView({ data }: NodeProps<ServiceFlowNode>) {
  return (
    <div className={styles.node}>
      <Handle type="target" position={Position.Left} isConnectable={false} className={styles.handle} />
      <ServiceNode service={data.service} isSelected={data.isSelected} showId={data.showId} onSelect={data.onSelect} />
      <Handle type="source" position={Position.Right} isConnectable={false} className={styles.handle} />
    </div>
  );
}

// Module-level and frozen by convention: React Flow re-initialises its
// internal node registry whenever this object's identity changes, so building
// it inside the component would reset the canvas on every render.
const NODE_TYPES = { service: ServiceFlowNodeView };

export interface GraphCanvasProps {
  services: ViewService[];
  edges: { from: string; to: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Injected so the canvas is testable without elk's worker -- see this file's top comment. */
  layout: (services: readonly ViewService[], edges: readonly { from: string; to: string }[]) => Promise<Map<string, NodePosition>>;
}

type LayoutState =
  | { kind: "laying-out" }
  | { kind: "failed"; message: string }
  | { kind: "placed"; positions: Map<string, NodePosition> };

export function GraphCanvas({ services, edges, selectedId, onSelect, layout }: GraphCanvasProps) {
  const [state, setState] = useState<LayoutState>({ kind: "laying-out" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "laying-out" });

    layout(services, edges)
      .then((positions) => {
        if (!cancelled) {
          setState({ kind: "placed", positions });
        }
      })
      .catch((error: unknown) => {
        // A layout failure is reported, never swallowed into an empty
        // canvas: a graph that renders nothing and says nothing is
        // indistinguishable from a project with no services.
        if (!cancelled) {
          setState({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [services, edges, layout]);

  // Scoped to the whole canvas rather than to a rollup: on a flat layout
  // every node is beside every other one, so the group-at-a-time scoping the
  // list uses (see ServiceGroup.tsx) would leave two Fly.io nodes sitting
  // next to each other with nothing to tell them apart.
  const duplicated = useMemo(() => duplicateNames(services), [services]);

  const flowNodes = useMemo<ServiceFlowNode[]>(() => {
    if (state.kind !== "placed") {
      return [];
    }
    return services.map((service) => ({
      id: service.id,
      type: "service" as const,
      position: state.positions.get(service.id) ?? { x: 0, y: 0 },
      data: { service, showId: duplicated.has(service.name), isSelected: service.id === selectedId, onSelect },
      // The box elk laid out against, and the same box React Flow gives the
      // node's wrapper -- the node's own content is `100%` of it (see
      // GraphCanvas.module.css).
      width: NODE_SIZE.width,
      height: NODE_SIZE.height,
      // `measured` as well, which is not redundant with the two lines above.
      // React Flow keeps each node's handle bounds -- the anchors every edge
      // resolves against -- in internal state keyed by id, and `parseHandles`
      // in @xyflow/system drops them whenever a node object arrives *without*
      // `measured` set. This array is rebuilt on every selection change, so
      // that path is taken constantly here. Recovering from it depends on a
      // ResizeObserver callback that has no reason to fire when the element's
      // size has not changed, and an edge that cannot resolve its endpoints
      // renders nothing and reports nothing. Read out of the installed
      // library rather than reproduced end to end: the cost of setting it is
      // one line and the failure it forecloses is a silently edgeless graph.
      measured: NODE_SIZE,
      draggable: false,
      selectable: false,
      connectable: false,
    }));
  }, [state, services, duplicated, selectedId, onSelect]);

  const flowEdges = useMemo(
    () =>
      drawableEdges(services, edges, selectedId).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        // Dims every edge that does not touch the selected node, so one
        // node's blast radius is readable without clicking through the
        // panel's two lists.
        className: edge.incident ? styles.edgeIncident : styles.edge,
      })),
    [services, edges, selectedId]
  );

  if (state.kind === "failed") {
    return (
      <div className={styles.canvas}>
        <p className={styles.message} role="alert">
          Could not lay out the graph: {state.message}
        </p>
      </div>
    );
  }

  if (state.kind === "laying-out") {
    return (
      <div className={styles.canvas}>
        <p className={styles.message}>Laying out the graph…</p>
      </div>
    );
  }

  return (
    <div className={styles.canvas}>
      <p className={styles.legend}>
        Arrows point from a service to what it depends on. Read them backwards for blast radius: what points <em>at</em> a node is what
        breaks when that node dies.
      </p>
      <div className={styles.flow}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          fitView
          // The default `minZoom` is 0.5, which is not enough to fit a real
          // graph: the stress fixture spans 2634x1607px, so anything short of
          // a very large window clips it and `fitView` silently gives up at
          // the floor. Panning is fine as a way to explore; it is not fine as
          // the only way to discover that there is more.
          minZoom={0.1}
          fitViewOptions={{ padding: 0.12 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          // Selection is the detail panel's job and lives in the URL. React
          // Flow's own delete/selection keybindings would be a second,
          // invisible selection model on the same nodes.
          deleteKeyCode={null}
          selectionKeyCode={null}
          proOptions={{ hideAttribution: true }}
          // React Flow reports its own problems through this callback and
          // nowhere else -- an edge whose endpoints it cannot resolve is
          // dropped in complete silence otherwise, which is exactly the
          // failure this canvas hit during its first live run. A local
          // developer tool has no reason to swallow that.
          onError={(code, message) => console.error(`[react-flow ${code}] ${message}`)}
        >
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}
