// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ViewToggle } from "./ViewToggle.js";

afterEach(() => {
  cleanup();
});

describe("ViewToggle", () => {
  // A radiogroup, not a checkbox and not two unrelated buttons: the two views
  // are mutually exclusive options of one setting, which is what this role
  // announces and what gives arrow-key navigation for free.
  it("is a radio group of the two views", () => {
    render(<ViewToggle mode="list" onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "View" })).not.toBeNull();
    expect(screen.getAllByRole("radio").map((el) => el.textContent)).toEqual(["List", "Graph"]);
  });

  it("marks the current mode checked, and the other not", () => {
    render(<ViewToggle mode="graph" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Graph" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "List" }).getAttribute("aria-checked")).toBe("false");
  });

  it("reports the mode that was chosen", () => {
    const onChange = vi.fn();
    render(<ViewToggle mode="list" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    expect(onChange).toHaveBeenCalledWith("graph");
  });

  it("still reports a click on the mode that is already current, rather than swallowing it", () => {
    // Swallowing it would be a micro-optimisation that turns one dead click
    // into a control that feels broken the first time someone double-taps.
    const onChange = vi.fn();
    render(<ViewToggle mode="list" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(onChange).toHaveBeenCalledWith("list");
  });
});
