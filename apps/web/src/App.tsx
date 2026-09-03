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

import styles from "./App.module.css";
import { AppShell } from "./components/AppShell.js";
import { ErrorState } from "./components/ErrorState.js";
import { LoadingState } from "./components/LoadingState.js";
import { MigrationList } from "./components/MigrationList.js";
import { ProjectHeader } from "./components/ProjectHeader.js";
import { ServicePage } from "./components/ServicePage.js";
import { serviceNodeDomId } from "./components/ServiceNode.js";
import { serviceTileDomId } from "./components/ServiceTile.js";
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
  const previousSelectedRef = useRef<{ id: string } | null>(null);

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
      replaceHash(hashForServiceId(id));
    },
    [replaceHash]
  );

  const handleClose = useCallback(() => {
    replaceHash("");
  }, [replaceHash]);

  // Hover peek and click-to-open, settled by the owner 2026-08-25:
  // **hovering a tile shows the popover; clicking opens the page.** An
  // earlier build pinned the popover on click, and that was wrong -- it made
  // the click do the cheap thing and left the reader without the expensive
  // one.
  //
  // The hover model has one hazard that is easy to ship broken: the popover
  // has to survive the pointer travelling *into* it. Clearing the peek
  // straight from the tile's pointerleave closes it in the gap between tile
  // and popover, so anything inside it is unreachable. Hence the close is
  // scheduled rather than immediate, and the popover cancels it on enter.
  // (Until candidate E the popover also carried the *only* route to a page
  // for a multi-entry vendor, which made this load-bearing rather than a
  // nicety; one tile per entry retires that, and the bridge is kept because
  // a peek the pointer cannot enter is still a broken peek.)
  //
  // Position is measured here rather than in the popover because the popover
  // is `position: fixed` and wants viewport coordinates, which is what
  // getBoundingClientRect() already returns.
  //
  // The anchor element itself is kept in state, not just the rect its
  // getBoundingClientRect() returned at hover time. `position: fixed` does
  // not track its anchor -- nothing in the CSS makes the popover move when
  // the tile does -- and a rect read once goes stale the instant the page
  // scrolls or the window resizes. Keeping the anchor lets the effect below
  // re-read a *live* rect on either event and recompute, instead of holding
  // a snapshot of where the tile used to be (see that effect's own comment).
  const [peek, setPeek] = useState<{ service: ViewService; anchor: HTMLElement; position: { top: number; left: number } } | null>(
    null
  );
  const closeTimerRef = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const positionFor = useCallback((anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    // Both mirror ServicePopover.module.css. The coupling is real and
    // unavoidable -- the flip below has to know how wide the thing it is
    // flipping is, and reading it back would mean measuring after a paint the
    // reader has already seen in the wrong place -- so it is stated here
    // rather than left implicit.
    const width = 268;
    const gap = 12;

    // `document.documentElement.clientWidth`/`clientHeight`, not
    // `window.innerWidth`/`innerHeight`. The popover is `position: fixed`,
    // and a fixed element's containing block is the initial containing
    // block -- the viewport *minus* a classic (non-overlay) scrollbar, which
    // `clientWidth` reports and `innerWidth` does not. On a board tall
    // enough to scroll, with a platform that still draws one, the gap
    // between the two numbers is the scrollbar's own width (commonly
    // 15-17px): clamping the right edge against `innerWidth` lands it that
    // far past where the popover can actually sit, eating most of the 12px
    // gap the clamp exists to preserve. Overlay-scrollbar platforms (macOS,
    // mobile, most of Linux) have no gap between the two numbers, so this
    // costs nothing there -- it is strictly a correction, never a regression.
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    // Centred under the tile, which is what candidate E specifies. The
    // mockup does this with `left: 50%; transform: translateX(-50%)` and
    // that is precisely the defect its own author reported: CSS centring
    // cannot notice a viewport edge, so a tile in the first or last grid
    // column pushed half a popover off screen between 768 and 1280px
    // (apps/web/docs/candidates/README.md, "Known limitation in E"). Clamping
    // the centred position into the viewport is the whole fix, and it is why
    // the stylesheet must carry no transform of its own.
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(gap, Math.min(centred, viewportWidth - width - gap));

    // Below the tile by preference, above it when below does not fit.
    //
    // `ESTIMATED_HEIGHT` decides *whether* to flip, and only that. It is the
    // ordinary-case height -- a head, three rows of two facts, sometimes a
    // note -- that "won't fit below" means, and getting that decision wrong
    // is cheap either way: below gets tried when it was actually a little
    // short, or a flip gets skipped when it would narrowly have fit, and the
    // fallback in both cases is a popover that hangs slightly past an edge,
    // never one that is unreachable.
    //
    // *Where the flip's top goes* must not reuse that same ordinary-case
    // number -- that was the actual defect a validator reproduced against
    // this function twice over: with a short window, clamping the flipped
    // top back down toward `gap` put the popover flush on top of the tile it
    // describes instead of above it; and with a tall note or a wrapped name,
    // ESTIMATED_HEIGHT is a floor a real popover can exceed, and exceeding it
    // costs exactly the overrun in anchor coverage, because the top was
    // placed as if the box stopped there. The real height is never knowable
    // before paint, but the ceiling is: ServicePopover.module.css caps
    // `.popover` at `max-height: 60vh` and scrolls its own content past
    // that, so the browser will never render it taller than 60% of the
    // viewport regardless of what the six facts and the optional note add up
    // to. Anchoring the flip against that ceiling instead of the
    // ordinary-case estimate makes the guarantee unconditional: the box's
    // bottom edge stops at `rect.top - gap` no matter what actually renders
    // inside it. A popover shorter than the ceiling then leaves a gap above
    // the tile rather than sitting flush against it -- the price of the
    // guarantee is a popover that sometimes floats higher than it strictly
    // needs to, never one that covers the thing it names.
    //
    // Flipping is only taken when the full ceiling fits above the tile.
    // When it does not -- a short window, a tile near the top -- this stays
    // below instead of flipping-and-clamping into the tile the way the
    // previous version did: below can only ever run past the *bottom* edge,
    // never cover the anchor above it, which makes it the safe fallback
    // whenever a safe flip is not available either.
    const ESTIMATED_HEIGHT = 250;
    const below = rect.bottom + gap;
    const fitsBelow = below + ESTIMATED_HEIGHT <= viewportHeight - gap;
    const maxPopoverHeight = viewportHeight * 0.6;
    const canFlipSafely = rect.top - 2 * gap >= maxPopoverHeight;
    const top = !fitsBelow && canFlipSafely ? rect.top - gap - maxPopoverHeight : below;

    // Below 480px none of this applies: the stylesheet turns the popover into
    // a viewport-anchored bottom sheet and overrides both coordinates, because
    // at that width there is no placement relative to a tile that does not
    // clip. These numbers are still computed and still handed over; they are
    // simply not what positions it there.
    return { top, left };
  }, []);

  const handlePeek = useCallback(
    (service: ViewService, anchor: HTMLElement) => {
      cancelClose();
      setPeek({ service, anchor, position: positionFor(anchor) });
    },
    [cancelClose, positionFor]
  );

  // `position: fixed` freezes the popover at the pixel coordinates it opened
  // with -- nothing about that CSS makes it follow the tile. The anchor
  // moves under it the moment the page scrolls (the board is one scrolling
  // page, and the popover's own `overflow-y: auto` has nothing to scroll
  // once its content fits, so a wheel over the popover chains straight to
  // the page rather than doing anything local) or the window resizes, and a
  // `position` computed once at hover time has no way to notice either.
  // Reproduced directly: the anchor moves from y=300 to y=-100, both events
  // fire, and without this effect `style.top` never changes -- the popover
  // ends up sitting over unrelated content, or over nothing. This re-reads
  // the anchor's live rect through `positionFor` on both events, so the
  // popover keeps tracking the tile it describes.
  //
  // `scroll` is bound with `capture: true` because it does not bubble -- a
  // scroll inside a container fires on that container and on `window`
  // during the *capture* phase, never during bubbling, which is the phase a
  // bare `addEventListener("scroll", ...)` listens on.
  //
  // The dependency is `peek?.service.id`, not `peek` itself. `positionFor`
  // is stable and every call below reads `peek` fresh through the updater
  // form of `setPeek`, so the only thing that should ever re-run this effect
  // is a *different popover opening* -- not the position update the effect
  // performs on its own scroll/resize handling, which would otherwise tear
  // down and re-attach the listeners on every scroll tick.
  useEffect(() => {
    if (!peek) {
      return;
    }
    function reposition() {
      setPeek((current) => (current ? { ...current, position: positionFor(current.anchor) } : current));
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [peek?.service.id, positionFor]);

  // Scheduled, not immediate -- see the hover-bridge note above. The delay is
  // the time a pointer needs to cross a 6px gap, not a deliberate dwell.
  const handlePeekEnd = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setPeek(null);
      closeTimerRef.current = null;
    }, 120);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  const handleActivate = useCallback(
    (service: ViewService) => {
      // Every tile is one manifest entry now, so every tile has a page and
      // clicking always opens it. This used to branch: a tile standing for
      // several entries of one vendor had no page to open -- "Fly.io" is not
      // a document, five Fly.io deployments are -- so it refused to navigate
      // and left the popover's rows as the only destinations. Candidate E
      // renders one tile per entry, so the branch and the rows went together.
      setPeek(null);
      handleSelect(service.id);
    },
    [handleSelect]
  );

  useEffect(() => {
    setPeek(null);
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

  // Moves focus into the page the moment it opens (click or deep link), and
  // hands it back to the thing that opened it once it closes. Keyed on the
  // resolved service, not on the raw (possibly stale/unknown) hash id, so an
  // unmatched hash never tries to focus a page that isn't rendered.
  //
  // **Restoring by DOM id, never by a captured element reference.** An earlier
  // version stashed `document.activeElement` on select and refocused it on
  // close, falling back to a lookup only for the deep-link case where nothing
  // had been clicked. That worked while the panel rendered *beside* the board.
  // It stopped working the moment the service page began replacing the board:
  // opening a page unmounts every tile, so the captured node is detached by
  // the time anyone closes, `document.contains` is false on every path, and
  // focus fell to `<body>` for clicks as well as deep links. A stashed element
  // is a reference to a render that no longer exists.
  //
  // Two ids are tried because two surfaces render a service, and each names
  // its DOM node with its own prefix -- `service-tile-` on the board,
  // `service-node-` in the graph and the migration board. Trying both covers
  // all three without this file knowing which view is mounted.
  //
  // Both now key on the **entry id**. The board's tiles used to key on the
  // catalog slug instead, because a tile stood for every entry of one vendor
  // and no single entry id named it; candidate E renders one tile per entry
  // (docs/PLAN.md, "The form is settled"), so the slug branch went with the
  // collapse and the two schemes converged.
  //
  // A focus restore that silently finds nothing is invisible in a passing test
  // suite -- this repo has shipped that exact defect twice now, once on the
  // migration board and once here -- so both branches are covered by tests
  // that go red when the id scheme changes underneath them.
  useEffect(() => {
    const matched = selectedService ?? null;
    const closed = previousSelectedRef.current;
    if (matched?.id === closed?.id) {
      return;
    }
    previousSelectedRef.current = matched ? { id: matched.id } : null;

    if (matched) {
      panelRef.current?.focus();
      return;
    }

    if (closed) {
      const target =
        document.getElementById(serviceTileDomId(closed.id)) ?? document.getElementById(serviceNodeDomId(closed.id));
      target?.focus();
    }
  }, [selectedService]);

  return (
    <AppShell manifestPath={state.kind === "loaded" ? state.payload.manifestPath : undefined}>
      <main className={`${styles.page} ${mode === "graph" && !selectedService ? styles.wide : ""}`}>
        {state.kind === "loading" && <LoadingState />}
        {state.kind === "error" && <ErrorState message={state.message} />}
        {state.kind === "loaded" && edgeMaps && (
          <>
            {/*
              The masthead is the board's, not the app's. On a service page the
              breadcrumb already names the project, and rendering both put two
              `<h1>`s on one document -- the project's and the service's -- which
              is wrong for a page whose subject is the service. A reader on a
              service page needs the way back, which the breadcrumb is, not the
              project's entry counts.
            */}
            {!selectedService && (
              <ProjectHeader
                project={state.payload.project}
                serviceCount={state.payload.services.length}
                edgeCount={state.payload.edges.length}
                readAt={state.payload.readAt}
              />
            )}

            {/*
              The page replaces the board rather than docking beside it. That is
              the difference between a panel and a page, and leaving the old
              panel on the click path produced a visible defect once the same
              content became the hover popover: hovering a tile and then
              clicking it rendered the identical facts twice, once floating and
              once docked on the right.

              The toggle goes with the board. It selects between three views of
              the *project*, and a service page is not one of them -- leaving it
              on screen would offer to switch a view that is no longer showing.
            */}
            {selectedService ? (
              <ServicePage
                service={selectedService}
                projectName={state.payload.project.name}
                readAt={state.payload.readAt}
                dependsOn={edgeMaps.dependsOn.get(selectedService.id) ?? []}
                dependedOnBy={edgeMaps.dependedOnBy.get(selectedService.id) ?? []}
                labelForId={edgeMaps.labelForId}
                onBack={handleClose}
                pageRef={panelRef}
              />
            ) : (
              <>
                <ViewToggle mode={mode} onChange={setMode} />
                <div className={styles.body}>
                  {mode === "list" ? (
                    <ProjectBoard
                      services={state.payload.services}
                      readAt={state.payload.readAt}
                      selectedId={selectedId}
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
                </div>
                {peek && mode === "list" && (
                  <ServicePopover
                    service={peek.service}
                    readAt={state.payload.readAt}
                    position={peek.position}
                    dependsOn={edgeMaps.dependsOn.get(peek.service.id) ?? []}
                    dependedOnBy={edgeMaps.dependedOnBy.get(peek.service.id) ?? []}
                    labelForId={edgeMaps.labelForId}
                    onPointerEnter={cancelClose}
                    onPointerLeave={handlePeekEnd}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
