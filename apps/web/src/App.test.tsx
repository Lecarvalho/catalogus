// @vitest-environment jsdom
//
// App.tsx's first tests. This is the one impure component in the app -- the
// fetch, the hash route, the history writes and every focus call live here
// and nowhere below it -- which is exactly why it was the largest untested
// surface in the repo (docs/PLAN.md, end of the drift-and-corpus session)
// and why the pure components' green suites said nothing about any of it.
//
// `fetch` is stubbed rather than a server being started: the payload shape
// is @catalogus/cli's contract and is already tested there against a real
// server (commands/view.test.ts). What is under test here is what this
// component does with a payload once it has one.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ViewPayload, ViewService } from "@catalogus/cli";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";
import { serviceNodeDomId } from "./components/ServiceNode.js";
import { makeViewService } from "./test-support/fixtures.js";

function payload(overrides: { services?: ViewService[]; edges?: { from: string; to: string }[] } = {}): ViewPayload {
  return {
    manifestPath: "C:/scratch/project/catalogus.yaml",
    readAt: "2026-08-24T00:00:00.000Z",
    project: { name: "Scratch", slug: "scratch" },
    services: overrides.services ?? [
      makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io" }),
      makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase" }),
    ],
    edges: overrides.edges ?? [{ from: "fly-api", to: "supabase-db" }],
  };
}

/** Renders App with `fetch` answering one payload, and waits for the first node to appear. */
async function renderLoaded(body: ViewPayload = payload()) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", json: async () => body }))
  );
  render(<App />);
  await screen.findByRole("button", { name: /Fly\.io/ });
}

beforeEach(() => {
  // Every test starts from a hash-free URL on the same history entry --
  // otherwise one test's deep link is the next test's starting state.
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App -- loading", () => {
  it("renders the services once the payload arrives", async () => {
    await renderLoaded();
    expect(screen.getByRole("button", { name: /Supabase/ })).not.toBeNull();
  });

  it("renders the error state, naming the status, when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, statusText: "Internal Server Error", json: async () => ({}) }))
    );
    render(<App />);
    expect(await screen.findByText(/500 Internal Server Error/)).not.toBeNull();
  });

  it("renders the error state when the request rejects outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      })
    );
    render(<App />);
    expect(await screen.findByText(/connection refused/)).not.toBeNull();
  });
});

describe("App -- the detail panel route", () => {
  it("opens the panel for the clicked node and addresses it in the hash", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/fly-api"));
    expect(screen.getByRole("region")).not.toBeNull();
  });

  it("opens the panel straight from a deep link, with no click at all", async () => {
    window.history.replaceState(null, "", "/#/service/supabase-db");
    await renderLoaded();
    expect(screen.getByRole("region")).not.toBeNull();
  });

  it("selects nothing for a hash naming a service the manifest does not have", async () => {
    window.history.replaceState(null, "", "/#/service/does-not-exist");
    await renderLoaded();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("closes the panel on Escape", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  });

  it("reopens the panel when the hash changes under it -- back/forward, or a hand-edited URL", async () => {
    await renderLoaded();
    window.history.replaceState(null, "", "/#/service/supabase-db");
    fireEvent(window, new window.HashChangeEvent("hashchange"));
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
  });
});

// The defect: `window.location.hash = ...` pushes a history entry, so Back
// walked the panel open and shut instead of leaving the viewer, and a close
// pushed an entry whose only content was "no panel" -- which Back then undid
// by reopening it (docs/PLAN.md, Phase 3.7's five smaller viewer defects).
describe("App -- opening and closing the panel does not grow history", () => {
  it("adds no history entry when a node is clicked", async () => {
    await renderLoaded();
    const before = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/fly-api"));
    expect(window.history.length).toBe(before);
  });

  it("adds no history entry across a click, a close, and a second click", async () => {
    await renderLoaded();
    const before = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Supabase/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/service/supabase-db"));
    expect(window.history.length).toBe(before);
  });

  it("leaves no bare '#' behind when the panel closes, so the address stays clean", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(window.location.hash).toBe("");
  });
});

// The defect: focus fell to <body> when a deep-linked panel was closed,
// because `lastFocusedRef` is captured on click and a deep link involves no
// click. From <body>, the next Tab starts at the top of the document and a
// screen reader has lost its place entirely.
describe("App -- focus when the panel closes", () => {
  it("hands focus back to the node that opened it", async () => {
    await renderLoaded();
    const node = screen.getByRole("button", { name: /Fly\.io/ });
    node.focus();
    fireEvent.click(node);
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(document.activeElement).toBe(node);
  });

  it("hands focus to the addressed node when nothing opened the panel -- the deep-link case", async () => {
    window.history.replaceState(null, "", "/#/service/supabase-db");
    await renderLoaded();
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(document.activeElement).toBe(document.getElementById(serviceNodeDomId("supabase-db")));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("does not restore a stale opener when the next panel was deep-linked to another service", async () => {
    await renderLoaded();
    const flyNode = screen.getByRole("button", { name: /Fly\.io/ });
    flyNode.focus();
    fireEvent.click(flyNode);
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());

    // Now a deep link to the *other* service, arriving the way back/forward
    // or a hand-edited address does.
    window.history.replaceState(null, "", "/#/service/supabase-db");
    fireEvent(window, new window.HashChangeEvent("hashchange"));
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());

    expect(document.activeElement).toBe(document.getElementById(serviceNodeDomId("supabase-db")));
    expect(document.activeElement).not.toBe(flyNode);
  });

  it("moves focus into the panel when it opens", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Fly\.io/ }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("region")));
  });
});
