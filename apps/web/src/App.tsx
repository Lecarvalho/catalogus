// The only place data enters this app -- fetches GET /api/project once on
// mount and derives the per-service dependency maps the detail panel needs
// -- and, since the Phase 3.7 restructure, the only place `window` is
// touched at all: reading `location.hash` and replacing it through
// `history.replaceState` for the `#/service/<id>` detail-panel route,
// listening for `hashchange` and `Escape`, and the two `document` focus
// calls the panel's open/close needs. Every component this renders is pure -- props in, no fetch, no
// window/location, no node import, no module-level singleton -- which is
// what lets them move to a shared package later as a file move rather than
// a rewrite (docs/PLAN.md's Phase 3.7 styling decisions), and what the next
// slice relies on when it swaps ServiceList's list container for a canvas.
//
// No router dependency: one route doesn't warrant react-router, so this is
// plain `hashchange` plus the one hook below (hash-route.ts carries the
// pure parsing, kept out of this file and out of `window` the same way
// group-services.ts is kept out of the render tree).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewPayload } from "@catalogus/cli";

import styles from "./App.module.css";
import { EdgesList } from "./components/EdgesList.js";
import { ErrorState } from "./components/ErrorState.js";
import { LoadingState } from "./components/LoadingState.js";
import { ProjectHeader } from "./components/ProjectHeader.js";
import { ServiceDetailPanel } from "./components/ServiceDetailPanel.js";
import { serviceNodeDomId } from "./components/ServiceNode.js";
import { ServiceList } from "./components/ServiceList.js";
import { hashForServiceId, serviceIdFromHash } from "./hash-route.js";

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
    <main className={styles.page}>
      {state.kind === "loading" && <LoadingState />}
      {state.kind === "error" && <ErrorState message={state.message} />}
      {state.kind === "loaded" && edgeMaps && (
        <>
          <ProjectHeader project={state.payload.project} manifestPath={state.payload.manifestPath} />
          <div className={styles.body}>
            <ServiceList services={state.payload.services} selectedId={selectedId} onSelect={handleSelect} />
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
          <EdgesList edges={state.payload.edges} labelForId={edgeMaps.labelForId} />
        </>
      )}
    </main>
  );
}
