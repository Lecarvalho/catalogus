// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ViewToggle, type ViewMode } from "./ViewToggle.js";

/** A stateful wrapper, because the arrow-key tests need to see a real
 * controlled round-trip -- ViewToggle calls `onChange` and expects the new
 * `mode` back as a prop, the same contract App.tsx has with it. */
function StatefulToggle({ initial }: { initial: ViewMode }) {
  const [mode, setMode] = useState<ViewMode>(initial);
  return <ViewToggle mode={mode} onChange={setMode} />;
}

afterEach(() => {
  cleanup();
});

describe("ViewToggle", () => {
  // A radiogroup, not a checkbox and not a row of unrelated buttons: the
  // views are mutually exclusive options of one setting, which is what this
  // role announces. It does not *give* anything -- the arrow keys below are
  // hand written, and the tests after this one exist because the role
  // announced a behaviour nothing implemented. See ViewToggle.tsx's top
  // comment.
  it("is a radio group of the three views", () => {
    render(<ViewToggle mode="list" onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "View" })).not.toBeNull();
    expect(screen.getAllByRole("radio").map((el) => el.textContent)).toEqual(["List", "Graph", "Migrations"]);
  });

  it("marks the current mode checked, and the other two not", () => {
    render(<ViewToggle mode="graph" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Graph" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "List" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("radio", { name: "Migrations" }).getAttribute("aria-checked")).toBe("false");
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

  // Roving tabindex: exactly one option is in the Tab order at a time, so the
  // whole group is one tab stop rather than one per option -- the gap
  // `role="radiogroup"` alone does not close (see this file's top comment).
  // Still exactly one stop now that a third option exists: the invariant is
  // "exactly one", not "the other of two".
  it("is a single tab stop: the checked option is tabIndex 0, the other two -1", () => {
    render(<ViewToggle mode="list" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "List" }).tabIndex).toBe(0);
    expect(screen.getByRole("radio", { name: "Graph" }).tabIndex).toBe(-1);
    expect(screen.getByRole("radio", { name: "Migrations" }).tabIndex).toBe(-1);
  });

  it("moves focus and selection one option at a time on ArrowRight, and wraps around after the last", () => {
    render(<StatefulToggle initial="list" />);
    const list = screen.getByRole("radio", { name: "List" });
    const graph = screen.getByRole("radio", { name: "Graph" });
    const migrations = screen.getByRole("radio", { name: "Migrations" });

    list.focus();
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(document.activeElement).toBe(graph);
    expect(graph.getAttribute("aria-checked")).toBe("true");
    expect(list.getAttribute("aria-checked")).toBe("false");

    fireEvent.keyDown(graph, { key: "ArrowRight" });
    expect(document.activeElement).toBe(migrations);
    expect(migrations.getAttribute("aria-checked")).toBe("true");
    expect(graph.getAttribute("aria-checked")).toBe("false");

    // Three options wrap straight back to the first.
    fireEvent.keyDown(migrations, { key: "ArrowRight" });
    expect(document.activeElement).toBe(list);
    expect(list.getAttribute("aria-checked")).toBe("true");
  });

  it("moves focus and selection together on ArrowLeft, and wraps around to the last option", () => {
    render(<StatefulToggle initial="list" />);
    const list = screen.getByRole("radio", { name: "List" });
    const migrations = screen.getByRole("radio", { name: "Migrations" });

    list.focus();
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(migrations);
    expect(migrations.getAttribute("aria-checked")).toBe("true");
    expect(list.getAttribute("aria-checked")).toBe("false");
  });

  it("treats ArrowDown/ArrowUp the same as ArrowRight/ArrowLeft", () => {
    render(<StatefulToggle initial="list" />);
    const list = screen.getByRole("radio", { name: "List" });
    const graph = screen.getByRole("radio", { name: "Graph" });

    list.focus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(document.activeElement).toBe(graph);

    fireEvent.keyDown(graph, { key: "ArrowUp" });
    expect(document.activeElement).toBe(list);
  });

  it("jumps to the first and last option on Home and End", () => {
    render(<StatefulToggle initial="list" />);
    const list = screen.getByRole("radio", { name: "List" });
    const migrations = screen.getByRole("radio", { name: "Migrations" });

    list.focus();
    fireEvent.keyDown(list, { key: "End" });
    expect(document.activeElement).toBe(migrations);
    expect(migrations.getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(migrations, { key: "Home" });
    expect(document.activeElement).toBe(list);
    expect(list.getAttribute("aria-checked")).toBe("true");
  });

  // Not a formality. ArrowDown and ArrowUp scroll the page by default, and a
  // group that moves selection *and* scrolls the document out from under the
  // user on every keypress is worse than one that does nothing. Deleting the
  // four `preventDefault()` calls left every other test here green.
  it("consumes the keys it handles, and leaves every other key alone", () => {
    const onChange = vi.fn();
    render(<ViewToggle mode="list" onChange={onChange} />);
    const list = screen.getByRole("radio", { name: "List" });

    for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"]) {
      expect(fireEvent.keyDown(list, { key })).toBe(false); // false === defaultPrevented
    }

    // Counted from here, because the six handled keys above are *supposed*
    // to have called it.
    const handledCalls = onChange.mock.calls.length;
    for (const key of ["Tab", "Enter", " ", "a", "Escape", "PageDown"]) {
      expect(fireEvent.keyDown(list, { key })).toBe(true);
    }
    expect(onChange.mock.calls.length).toBe(handledCalls);
  });

  // The roving-tabindex invariant: whichever option has focus must be the one
  // in the tab order. This component asks its parent to change `mode` and the
  // parent may decline -- and it used to move focus regardless, landing focus
  // on the `tabIndex={-1}` option while the other kept the group's only tab
  // stop. App.tsx always honours `onChange`, so this was never live; it was
  // still wrong, and it is the state a controlled component has to get right.
  it("leaves focus on the checked option when the parent declines the change", () => {
    render(<ViewToggle mode="list" onChange={vi.fn()} />);
    const list = screen.getByRole("radio", { name: "List" });

    list.focus();
    fireEvent.keyDown(list, { key: "ArrowRight" });

    expect(document.activeElement).toBe(list);
    expect(list.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("radio", { name: "Graph" }).getAttribute("tabindex")).toBe("-1");
  });

  // The other half of that effect, and the half nothing held until the
  // validation pass pointed out that removing the `contains` guard left the
  // whole suite green. The effect exists to keep focus with the user through
  // an arrow key; it must not *acquire* focus when the mode changes for some
  // other reason -- a keyboard shortcut, a restored URL, a parent's own
  // state. Without the guard this component becomes a focus thief, which is
  // far worse than the problem it was added to solve.
  it("does not pull focus into the group when the mode changes from outside it", () => {
    function Harness() {
      const [mode, setMode] = useState<ViewMode>("list");
      return (
        <>
          <button type="button" onClick={() => setMode("migrations")}>
            Change the mode from out here
          </button>
          <ViewToggle mode={mode} onChange={setMode} />
        </>
      );
    }
    render(<Harness />);
    const outside = screen.getByRole("button", { name: "Change the mode from out here" });

    outside.focus();
    fireEvent.click(outside);

    // The selection moved; the focus did not.
    expect(screen.getByRole("radio", { name: "Migrations" }).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(outside);
  });
});
