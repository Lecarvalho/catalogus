// @vitest-environment jsdom
//
// ProjectBoard composes the band modules in BANDS's reading order. It no
// longer renders a rank module (owner decision, 2026-08-25, recorded in this
// file's own top comment: ranking is premature while the catalog cannot yet
// name several of the services it would rank) and it no longer receives
// `edges` at all.
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
    expect(headings).toEqual(["Serves requests", "Watched by", "Registered at"]);
  });

  it("has no rank module -- 'Most depended on' is not on the board", () => {
    render(
      <ProjectBoard
        services={[service({ id: "a", role: "hosting", service: "flyio" }), service({ id: "b", role: "database", service: "supabase" })]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    expect(screen.queryByRole("heading", { name: "Most depended on" })).toBeNull();
  });
});

describe("ProjectBoard -- collapsing is per band, never global", () => {
  // Supabase-shaped case: one vendor slug shared by two entries that land in
  // two different bands. Collapsing across bands would force one tile into
  // one band, stating it does a single job when the manifest says two.
  it("renders one tile per band for a vendor whose entries span two bands", () => {
    render(
      <ProjectBoard
        services={[
          service({ id: "supabase-auth", role: "auth", rollup: "auth", service: "supabase", name: "Supabase" }),
          service({ id: "supabase-db", role: "database", rollup: "database", service: "supabase", name: "Supabase" }),
        ]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    const tiles = screen.getAllByRole("button", { name: /Supabase/ });
    expect(tiles).toHaveLength(2);
    // Neither tile shows ×2 -- each stands for exactly one entry in its band.
    expect(screen.queryByText(/×/)).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Serves requests" })).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Holds data" })).not.toBeNull();
  });
});
