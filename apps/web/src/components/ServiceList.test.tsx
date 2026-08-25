// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService } from "../test-support/fixtures.js";
import { ServiceList } from "./ServiceList.js";

afterEach(() => {
  cleanup();
});

describe("ServiceList", () => {
  // The counterpart to GraphCanvas.test.tsx's "no list item on the canvas".
  // `ServiceNode` returns a bare `<button>` and each caller supplies its own
  // wrapper, so the `<ul>` -> `<li>` -> `<button>` chain the list depends on
  // is now a property of ServiceGroup rather than of the node, and nothing
  // asserted it. Reverting the hoist -- putting the `<li>` back inside
  // ServiceNode, or dropping it from ServiceGroup -- left the whole suite
  // green, which is what this closes.
  it("wraps each node in a list item inside the group's list", () => {
    render(
      <ServiceList
        services={[
          makeViewService({ id: "host-api", role: "hosting-api", rollup: "hosting", name: "Fly.io" }),
          makeViewService({ id: "host-web", role: "hosting-web", rollup: "hosting", name: "Fly.io" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.parentElement?.tagName).toBe("UL");
      // One button per item, and it is the item's own child -- not a
      // grandchild, which is the shape that made the canvas stylesheet's
      // `.node > button` rule dead.
      expect(Array.from(item.children).map((child) => child.tagName)).toEqual(["BUTTON"]);
    }
  });

  it("renders one heading per rollup group, grouping services that share a rollup, under the rollup's display label", () => {
    render(
      <ServiceList
        services={[
          makeViewService({ id: "host-api", role: "hosting-api", rollup: "hosting", name: "Fly.io" }),
          makeViewService({ id: "host-web", role: "hosting-web", rollup: "hosting", name: "Fly.io" }),
          makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Database", "Hosting"]);
    // Both hosting entries render, under the one "Hosting" heading.
    expect(screen.getAllByRole("button", { name: /Fly\.io/ })).toHaveLength(2);
  });

  // Regression: role: coding-agent rolls up to "coding", which used to
  // render as the raw rollup "coding" (and, uppercased by CSS, read as
  // "CODING" -- a truncation of "coding-agent" rather than a whole word).
  it("renders the coding-agent group under its display label, not the raw rollup", () => {
    render(
      <ServiceList
        services={[makeViewService({ id: "claude-code", role: "coding-agent", rollup: "coding", name: "Claude Code" })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Coding agent");
  });

  it("calls onSelect with a node's id when it is activated", () => {
    const onSelect = vi.fn();
    render(
      <ServiceList
        services={[makeViewService({ id: "vendor", role: "payments", rollup: "payments", name: "Stripe" })]}
        selectedId={null}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Stripe/ }));
    expect(onSelect).toHaveBeenCalledWith("vendor");
  });

  it("marks the node matching selectedId as pressed, and no other", () => {
    render(
      <ServiceList
        services={[
          makeViewService({ id: "a", role: "payments", rollup: "payments", name: "A" }),
          makeViewService({ id: "b", role: "payments", rollup: "payments", name: "B" }),
        ]}
        selectedId="a"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /^A$/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^B$/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("selects nothing for a selectedId matching no service -- an unknown id must not crash", () => {
    expect(() =>
      render(
        <ServiceList
          services={[makeViewService({ id: "a", role: "payments", rollup: "payments", name: "A" })]}
          selectedId="does-not-exist"
          onSelect={vi.fn()}
        />
      )
    ).not.toThrow();
    expect(screen.getByRole("button", { name: /^A$/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("renders the empty-state message when there are no services", () => {
    render(<ServiceList services={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("No services declared.")).not.toBeNull();
  });

  // Two entries of one vendor under one heading used to render as the same
  // node twice -- same icon, same display name, nothing to tell them apart
  // until one was clicked (docs/PLAN.md, Phase 3.7's five smaller viewer
  // defects).
  it("shows the local id on both nodes when two entries in a group share a display name", () => {
    render(
      <ServiceList
        services={[
          makeViewService({ id: "supabase-db", role: "database-primary", rollup: "database", name: "Supabase" }),
          makeViewService({ id: "supabase-auth", role: "database-auth", rollup: "database", name: "Supabase" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /Supabase.*supabase-auth/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Supabase.*supabase-db/ })).not.toBeNull();
  });

  it("leaves the id off a name only one entry in the group carries", () => {
    render(
      <ServiceList
        services={[
          makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase" }),
          makeViewService({ id: "fly-api", role: "hosting", rollup: "hosting", name: "Fly.io" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Supabase" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Fly.io" })).not.toBeNull();
  });

  // The scope is the group, not the manifest: two headings already tell
  // these two apart, and showing the id anyway is noise on every node.
  it("leaves the id off when the shared display name is split across two groups", () => {
    render(
      <ServiceList
        services={[
          makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase" }),
          makeViewService({ id: "supabase-auth", role: "auth", rollup: "auth", name: "Supabase" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getAllByRole("button", { name: "Supabase" })).toHaveLength(2);
  });
});
