// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService } from "../test-support/fixtures.js";
import { ServiceNode } from "./ServiceNode.js";

afterEach(() => {
  cleanup();
});

describe("ServiceNode", () => {
  it("is a real <button>, so Tab/Enter/Space keyboard operability comes from native semantics", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api" })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").tagName).toBe("BUTTON");
  });

  it("renders the display name and calls onSelect with the id when activated", () => {
    const onSelect = vi.fn();
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api", name: "Fly.io" })} isSelected={false} onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: /Fly\.io/ });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith("fly-api");
  });

  it("carries a hover tooltip of exactly name and role -- never more", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api", name: "Fly.io" })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("title")).toBe("Fly.io — hosting-api");
  });

  it("conveys selection to assistive tech via aria-pressed, not colour alone", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api" })} isSelected={true} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("reflects isSelected=false as aria-pressed=false", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api" })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  it("marks an uncatalogued service with reachable text, not just a decorative dot", () => {
    render(
      <ServiceNode
        service={makeViewService({ id: "mystery", role: "widget-thing", known: false, name: "some-raw-slug" })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    // The accessible name includes the sr-only text -- reachable to
    // assistive tech even though nothing renders the old full-word pill.
    expect(screen.getByRole("button", { name: /some-raw-slug.*uncatalogued/ })).not.toBeNull();
  });

  it("renders no uncatalogued marker text for a catalogued service", () => {
    render(<ServiceNode service={makeViewService({ id: "known", role: "hosting", known: true, name: "Fly.io" })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText(/uncatalogued/)).toBeNull();
  });

  it.each(["active", "phasing_out", "deprecated", "removed"] as const)("renders without crashing for status '%s'", (status) => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting", status })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button")).not.toBeNull();
  });
});
