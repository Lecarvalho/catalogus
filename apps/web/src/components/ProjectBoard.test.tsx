// @vitest-environment jsdom
//
// ProjectBoard composes the band sections in BANDS's reading order, one
// full-width section per non-empty band, each rendering one tile per
// manifest entry (candidate E; BandModule no longer collapses by vendor).
// It no longer receives `edges` or renders a rank module (owner decision,
// 2026-08-25, recorded in this file's own earlier history: ranking is
// premature while the catalog cannot yet name several of the services it
// would rank).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService as service } from "../test-support/fixtures.js";
import { ProjectBoard } from "./ProjectBoard.js";

const readAt = "2026-08-24T00:00:00.000Z";

afterEach(() => cleanup());

describe("ProjectBoard -- the empty state", () => {
  it("renders 'No services declared.' rather than an empty board", () => {
    render(<ProjectBoard services={[]} readAt={readAt} selectedId={null} onActivate={vi.fn()} onPeek={vi.fn()} onPeekEnd={vi.fn()} />);
    expect(screen.getByText("No services declared.")).not.toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});

describe("ProjectBoard -- reading order", () => {
  it("orders band headings by BANDS's reading order, not by input order", () => {
    render(
      <ProjectBoard
        services={[
          service({ id: "namecheap", role: "registrar", rollup: "registrar", service: "namecheap" }),
          service({ id: "grafana", role: "monitoring-dashboard", rollup: "monitoring", service: "grafana" }),
          service({ id: "fly-api", role: "hosting-api", rollup: "hosting", service: "flyio" }),
        ]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Runs in production", "Watched by", "Registered at"]);
  });
});

describe("ProjectBoard -- bands with no services", () => {
  it("does not render a section for a band that has nothing in it", () => {
    render(
      <ProjectBoard
        services={[service({ id: "fly-api", role: "hosting-api", rollup: "hosting", service: "flyio" })]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    // Only "Runs in production" has an entry -- none of the other six bands
    // (nor "Unplaced") should render a heading or a section for themselves.
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Holds data" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Watched by" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Registered at" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Unplaced" })).toBeNull();
  });
});

// D12 (docs/PLAN.md): every test above this one passes `selectedId={null}`,
// so a `ProjectBoard` that silently hardcoded `selectedId={null}` in its own
// call to `BandModule` -- rather than forwarding the prop it was actually
// handed -- would pass every one of them. This is the test that reaches
// through `BandModule` down to a real `ServiceTile` and checks the one
// thing selection actually does on screen: `aria-current` on the matching
// tile, and nowhere else (ServiceTile.tsx's own `aria-current={selected ?
// "true" : undefined}`).
describe("ProjectBoard -- selection reaches the tiles", () => {
  it("marks only the tile matching selectedId as aria-current", () => {
    const services = [
      service({ id: "fly-api", role: "hosting-api", rollup: "hosting", service: "flyio" }),
      service({ id: "fly-web", role: "hosting-web", rollup: "hosting", service: "flyio" }),
    ];
    render(
      <ProjectBoard
        services={services}
        readAt={readAt}
        selectedId="fly-web"
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    expect(document.getElementById("service-tile-fly-web")?.getAttribute("aria-current")).toBe("true");
    expect(document.getElementById("service-tile-fly-api")?.hasAttribute("aria-current")).toBe(false);
  });
});

describe("ProjectBoard -- the arithmetic", () => {
  it("renders every service handed in exactly once across the whole board", () => {
    const services = [
      service({ id: "fly-api", role: "hosting-api", rollup: "hosting", service: "flyio" }),
      service({ id: "fly-web", role: "hosting-web", rollup: "hosting", service: "flyio" }),
      service({ id: "supabase-db", role: "database", rollup: "database", service: "supabase" }),
      service({ id: "grafana", role: "monitoring-dashboard", rollup: "monitoring", service: "grafana" }),
      service({ id: "namecheap", role: "registrar", rollup: "registrar", service: "namecheap" }),
      service({ id: "mystery-widget", role: "widget", rollup: "widget", service: "mystery" }),
    ];
    render(
      <ProjectBoard
        services={services}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    // Nothing dropped, nothing duplicated: exactly as many tiles as
    // services, and each one findable by its own entry id.
    expect(screen.getAllByRole("button")).toHaveLength(services.length);
    for (const entry of services) {
      expect(document.getElementById(`service-tile-${entry.id}`)).not.toBeNull();
    }
  });
});
