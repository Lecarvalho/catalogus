// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService } from "../test-support/fixtures.js";
import { ServiceList } from "./ServiceList.js";

afterEach(() => {
  cleanup();
});

describe("ServiceList", () => {
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
});
