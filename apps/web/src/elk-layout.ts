// The impure half of the layout: it owns elkjs and the worker, and nothing
// else. graph-layout.ts holds every rule worth testing; this file holds the
// one thing that cannot be tested without a browser.
//
// **Do not import this module from a test.** `?worker` is a Vite build-time
// import and there is no Worker under jsdom, so importing this file into a
// vitest run fails at module evaluation -- before any test body runs, which
// makes the failure look like a broken suite rather than a missing
// capability. GraphCanvas.tsx takes the layout function as a prop for exactly
// this reason: the canvas is testable with a stub, and only main.tsx's tree
// ever reaches the real elk.
//
// Worker rather than main thread, per docs/PLAN.md's Phase 3.7 DAG decision
// 5. A layered layout over the stress fixture's 35 nodes and 48 edges is not
// slow, but it is synchronous and unbounded: the cost is in crossing
// minimisation, which grows with the fan-out, and the fan-out is the number a
// real manifest is free to make large. Blocking the frame for it is a choice
// nobody has to make.
import ELK from "elkjs/lib/elk-api.js";
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker";

import { positionsFrom, toElkGraph, type NodePosition } from "./graph-layout.js";
import type { ViewService } from "@catalogus/cli";

const elk = new ELK({ workerFactory: () => new ElkWorker() });

/**
 * Lays out one project's graph, returning a position per service id.
 *
 * The signature is the whole contract GraphCanvas depends on -- it takes the
 * same shape a stub can produce, so the canvas's tests never load this file.
 */
export async function layoutGraph(
  services: readonly ViewService[],
  edges: readonly { from: string; to: string }[]
): Promise<Map<string, NodePosition>> {
  const result = await elk.layout(toElkGraph(services, edges));
  return positionsFrom(result);
}
