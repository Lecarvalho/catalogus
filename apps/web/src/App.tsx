// The only place data enters this app -- fetches GET /api/project once on
// mount and derives the per-service dependency maps the detail panel needs
// -- and, since the Phase 3.7 restructure, the only place `window` is
// touched at all: reading `location.hash` and replacing it through
// `history.replaceState` for the `#/service/<id>` detail-panel route,
// listening for `hashchange` and `Escape`, and the two `document` focus
// calls the panel's open/close needs. Every component this renders is pure -- props in, no fetch, no
// window/location, no node import, no module-level singleton -- which is
// what lets them move to a shared package later as a file move rather than
// a rewrite (docs/PLAN.md's Phase 3.7 styling decisions), and what let the
// canvas and the migration board each drop in beside ServiceList without
// touching how selection or data loading work.
//
// No router dependency: one route doesn't warrant react-router, so this is
// plain `hashchange` plus the one hook below (hash-route.ts carries the
// pure parsing, kept out of this file and out of `window` the same way
// group-services.ts is kept out of the render tree).
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewPayload, ViewService } from "@catalogus/cli";

import type { VendorGroup } from "./bands.js";
import { dependentCounts } from "./bands.js";

import styles from "./App.module.css";
import { ErrorState } from "./components/ErrorState.js";
import { LoadingState } from "./components/LoadingState.js";
import { MigrationList } from "./components/MigrationList.js";
import { ProjectHeader } from "./components/ProjectHeader.js";
import { ServiceDetailPanel } from "./components/ServiceDetailPanel.js";
import { serviceNodeDomId } from "./components/ServiceNode.js";
import { ProjectBoard } from "./components/ProjectBoard.js";
import { ServicePopover } from "./components/ServicePopover.js";
import { ViewToggle, type ViewMode } from "./components/ViewToggle.js";
import { hashForServiceId, serviceIdFromHash } from "./hash-route.js";

// Both halves of the graph view load on demand, and for two different
// reasons. React Flow is several hundred KB that a viewer who never leaves
// the list should not download, so the canvas is a lazy chunk. elkjs is
// worse than large: it reaches its worker through a Vite `?worker` import
// that cannot be evaluated outside a browser at all, so a static import here
// would make every test in this file fail at module load. Neither is loaded
// until someone actually asks for the graph.
const GraphCanvas = lazy(() => import("./components/GraphCanvas.js").then((module) => ({ default: module.GraphCanvas })));

const layoutWithElk = (services: readonly ViewService[], edges: readonly { from: string; to: string }[]) =>
  import("./elk-layout.js").then((module) => module.layoutGraph(services, edges));

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "loaded"; payload: ViewPayload };

/**
 * Builds both directions of the dependency graph from the flat edges list,
 * and a plain id -> label lookup for rendering an edge endpoint or a
 * replaced_by target -- falls back to the bare id for a dangling reference,
 * which should never happen against a manifest that already passed
 * `catalogus validate`'s referential-integrity check, but a rendering bug
 * must degrade to the id rather than crash the page.
 */
function deriveEdgeMaps(payload: ViewPayload) {
  const dependsOn = new Map<string, string[]>();
  const dependedOnBy = new Map<string, string[]>();
  const nameById = new Map(payload.services.map((service) => [service.id, service.name]));

  for (const edge of payload.edges) {
    const forward = dependsOn.get(edge.from) ?? [];
    forward.push(edge.to);
    dependsOn.set(edge.from, forward);

    const backward = dependedOnBy.get(edge.to) ?? [];
    backward.push(edge.from);
    dependedOnBy.set(edge.to, backward);
  }

  const labelForId = (id: string): string => {
    const name = nameById.get(id);
    return name ? `${id} (${name})` : id;
  };

  return { dependsOn, dependedOnBy, labelForId };
}

/** Reads the current hash, or "" outside a browser (this app has no SSR path, but the lazy initializer runs at module-eval-adjacent time, before any test can stub `window`). */
function currentHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

export function App() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [hash, setHash] = useState<string>(currentHash);
  // Plain state, deliberately not a second route: docs/PLAN.md's Phase 3.7
  // DAG decision 1 chose a toggle over `#/graph` precisely so the viewer
  // stays one addressable page, and `#/service/<id>` keeps addressing the
  // panel from any of the three views -- the migration board joined the
  // same toggle for the same reason (ViewToggle.tsx's top comment).
  const [mode, setMode] = useState<ViewMode>("list");

  // Panel focus management: a click captures whatever had focus (the node
  // button just activated) so Escape can hand focus back to it, and the
  // panel itself is focused once it opens -- including on a deep link,
  // where the panel opening *is* the reason the page was loaded. Both are
  // plain DOM refs, not React state, because moving focus is an imperative
  // side effect, never something a render should read back.
  const panelRef = useRef<HTMLElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const previousSelectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/project")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`GET /api/project returned ${response.status} ${response.statusText}`);
        }
        return (await response.json()) as ViewPayload;
      })
      .then((payload) => {
        if (!cancelled) {
          setState({ kind: "loaded", payload });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The one hashchange listener this app has -- back/forward and any other
  // navigation that changes the hash (including this component's own
  // handleSelect/handleClose below, which only ever go through
  // `window.location.hash =`, never a parallel bit of React state) all flow
  // through this single subscription.
  useEffect(() => {
    function onHashChange() {
      setHash(window.location.hash);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // serviceIdFromHash never throws (see hash-route.ts) -- a hostile or
  // stale hash just fails to match any service below, which selects
  // nothing rather than crashing.
  const selectedId = serviceIdFromHash(hash);

  // useMemo, not a plain const: recomputed only when the payload identity
  // actually changes (once, on load -- this app never refetches), not on
  // every render this component happens to take part in.
  const edgeMaps = useMemo(() => (state.kind === "loaded" ? deriveEdgeMaps(state.payload) : null), [state]);

  const selectedService = useMemo(
    () => (state.kind === "loaded" && selectedId ? state.payload.services.find((service) => service.id === selectedId) : undefined),
    [state, selectedId]
  );

  // Opening and closing the panel *replaces* the current history entry
  // instead of pushing one. The panel is a view of this page, not a page of
  // its own: assigning `window.location.hash` pushed an entry per open and
  // per close, so Back walked the user's clicks one at a time instead of
  // leaving the viewer -- and a close pushed an entry whose only content is
  // "no panel", which Back then undoes by reopening it. The hash stays in
  // the URL, so a deep link, a reload and a copied address still address a
  // panel; it just stops accumulating.
  //
  // `replaceState` fires no `hashchange`, which is why this sets the state
  // itself. The listener above is still the only path for back/forward and
  // for a hash edited by hand -- this is the one navigation that bypasses
  // it, deliberately, and it is the reason this component keeps `hash` in
  // state at all rather than reading `window.location.hash` at render.
  const replaceHash = useCallback((next: string) => {
    const base = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", next ? `${base}${next}` : base);
    setHash(next);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      if (document.activeElement instanceof HTMLElement) {
        lastFocusedRef.current = document.activeElement;
      }
      replaceHash(hashForServiceId(id));
    },
    [replaceHash]
  );

  const handleClose = useCallback(() => {
    replaceHash("");
  }, [replaceHash]);

  // Hover peek and click-to-open, settled by the owner 2026-08-25: hovering
  // a tile shows a popover near it, clicking opens the page. Where a tile
  // stands for several entries of one vendor -- Clapline's four Fly.io apps
  // -- clicking cannot open "the" page because there isn't one, so it pins
  // the popover and the reader picks an entry from it.
  //
  // Position is measured here rather than in the popover, and measured from
  // the anchor at the moment of the event, because the tiles live inside a
  // CSS multi-column container: a column fragment is not a containing block
  // an absolutely-positioned child can be trusted against, so the popover is
  // `position: fixed` and wants viewport coordinates. getBoundingClientRect()
  // already returns those.
  const [peek, setPeek] = useState<{ group: VendorGroup; position: { top: number; left: number } } | null>(null);
  const [expandedService, setExpandedService] = useState<string | null>(null);

  const positionFor = useCallback((anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const width = 268;
    const gap = 6;
    // Prefer the right of the tile; flip to the left when that would run off
    // the viewport, and clamp rather than allow a negative left, so a tile in
    // the first column of a narrow window still produces a reachable popover.
    const rightRoom = window.innerWidth - rect.right - gap;
    const left = rightRoom >= width ? rect.right + gap : Math.max(gap, rect.left - width - gap);
    // Top-aligned to the tile, then pulled up only as far as needed to stay
    // on screen. Popover height is unknown before paint, so this uses the
    // max-height the stylesheet caps it at.
    const maxHeight = window.innerHeight * 0.6;
    const top = Math.max(gap, Math.min(rect.top, window.innerHeight - maxHeight - gap));
    return { top, left };
  }, []);

  const handlePeek = useCallback(
    (group: VendorGroup, anchor: HTMLElement) => {
      // A pinned popover outranks hover: moving the pointer across the board
      // must not silently replace the thing the reader deliberately opened.
      if (expandedService !== null) return;
      setPeek({ group, position: positionFor(anchor) });
    },
    [expandedService, positionFor]
  );

  const handlePeekEnd = useCallback(() => {
    if (expandedService !== null) return;
    setPeek(null);
  }, [expandedService]);

  const handleActivate = useCallback(
    (group: VendorGroup, anchor: HTMLElement) => {
      if (group.entries.length === 1) {
        setExpandedService(null);
        setPeek(null);
        handleSelect(group.entries[0].id);
        return;
      }
      // Several entries: pin the popover so it survives the pointer leaving
      // the tile, and toggle it closed if this tile is already pinned.
      setExpandedService((current) => (current === group.service ? null : group.service));
      setPeek({ group, position: positionFor(anchor) });
    },
    [handleSelect, positionFor]
  );

  useEffect(() => {
    setPeek(null);
    setExpandedService(null);
  }, [selectedId, mode]);

  // Escape closes the panel, only while one is open -- the listener is
  // added and removed with the panel's own lifetime rather than sitting on
  // `document` permanently doing nothing.
  useEffect(() => {
    if (!selectedService) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedService, handleClose]);

  // Moves focus into the panel the moment it opens (click or deep link),
  // and hands it somewhere sensible once it closes. Keyed on the resolved
  // service's id, not on the raw (possibly stale/unknown) hash id, so an
  // unmatched hash never tries to focus a panel that isn't rendered.
  //
  // Closing has two cases and only one of them used to work. A panel opened
  // by a click restores the element that opened it. A panel opened by a
  // *deep link* had no opener -- nothing was clicked, so `lastFocusedRef`
  // was still null and focus fell to `<body>`, which is the state where the
  // next Tab starts from the top of the document and a screen reader loses
  // its place entirely. There is still an obvious target in that case: the
  // node for the service that was open, which is where a click would have
  // left focus anyway. Hence the DOM-id lookup.
  //
  // The opener is cleared once used, so a click, a close, and then a deep
  // link to some *other* service cannot restore focus to the first
  // service's node -- a stale ref is worse than none, because it moves
  // focus somewhere confidently wrong.
  useEffect(() => {
    const matchedId = selectedService?.id ?? null;
    const closedId = previousSelectedIdRef.current;
    if (matchedId === closedId) {
      return;
    }
    previousSelectedIdRef.current = matchedId;

    if (matchedId) {
      panelRef.current?.focus();
      return;
    }

    const opener = lastFocusedRef.current;
    lastFocusedRef.current = null;
    if (opener && document.contains(opener)) {
      opener.focus();
      return;
    }
    if (closedId) {
      document.getElementById(serviceNodeDomId(closedId))?.focus();
    }
  }, [selectedService]);

  return (
    <main className={`${styles.page} ${mode === "graph" ? styles.wide : ""}`}>
      {state.kind === "loading" && <LoadingState />}
      {state.kind === "error" && <ErrorState message={state.message} />}
      {state.kind === "loaded" && edgeMaps && (
        <>
          <ProjectHeader project={state.payload.project} manifestPath={state.payload.manifestPath} />
          <ViewToggle mode={mode} onChange={setMode} />
          <div className={styles.body}>
            {mode === "list" ? (
              <ProjectBoard
                services={state.payload.services}
                edges={state.payload.edges}
                readAt={state.payload.readAt}
                selectedId={selectedId}
                expandedService={expandedService}
                onOpen={handleSelect}
                onActivate={handleActivate}
                onPeek={handlePeek}
                onPeekEnd={handlePeekEnd}
              />
            ) : mode === "graph" ? (
              <Suspense fallback={<p>Loading the graph…</p>}>
                <GraphCanvas
                  services={state.payload.services}
                  edges={state.payload.edges}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  layout={layoutWithElk}
                />
              </Suspense>
            ) : (
              <MigrationList services={state.payload.services} selectedId={selectedId} onSelect={handleSelect} />
            )}
            {selectedService && (
              <ServiceDetailPanel
                service={selectedService}
                dependsOn={edgeMaps.dependsOn.get(selectedService.id) ?? []}
                dependedOnBy={edgeMaps.dependedOnBy.get(selectedService.id) ?? []}
                labelForId={edgeMaps.labelForId}
                onClose={handleClose}
                panelRef={panelRef}
              />
            )}
          </div>
          {peek && mode === "list" && (
            <ServicePopover
              group={peek.group}
              readAt={state.payload.readAt}
              position={peek.position}
              dependentsById={dependentCounts(state.payload.edges)}
              labelForId={edgeMaps.labelForId}
              onOpen={handleSelect}
            />
          )}
          {/* The text edge list used to render under the list view, on the
              reasoning that it was "the list view's way of showing edges at
              all". That reasoning expired on 2026-08-25: the board shows a
              dependent count on every row and ranks the most depended-on
              entries in their own module, so the edges are represented
              where they mean something rather than as a flat transcript.

              And the transcript was actively harmful once the board got
              dense. Against Clapline it rendered 41 lines of
              `fly-api (Fly.io) -> dotnet (.NET)` below the fold -- taller
              than the entire project summary above it, and the largest
              thing on a page whose whole argument is that a project fits
              one screen. The owner chose "nothing -- it should fit" over
              every search and index affordance; a 41-line appendix is that
              affordance wearing a different hat.

              EdgesList itself is kept, not deleted: it is the honest
              rendering for a viewer that cannot draw a graph, and the
              no-JavaScript and print paths may want it. It simply has no
              caller on this page. The Graph view draws the same edges. */}
        </>
      )}
    </main>
  );
}
