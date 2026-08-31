// @vitest-environment jsdom
//
// Candidate E collapses the board to one tile per manifest entry, so
// ServicePopover no longer has a multi-entry chooser to test: every popover
// is about exactly one `ViewService`, the same one its tile is about. This
// file replaces the old two-shape (single entry / chooser) suite entirely.
//
// The six-fact `<dl>` is this file's own now, not `ServiceSummary`'s (see
// ServicePopover.tsx's header for why sharing that component's mechanism
// did not survive candidate E's popover), so the tests below assert this
// component's own rendering of Role/Kind/Version/Status/Dependents in/
// Dependencies out directly, rather than through a shared body.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService as service } from "../test-support/fixtures.js";
import { ServicePopover } from "./ServicePopover.js";

const readAt = "2026-08-24T00:00:00.000Z";
const labelForId = (id: string) => `label:${id}`;

type PopoverProps = Parameters<typeof ServicePopover>[0];

function popoverProps(overrides: Partial<PopoverProps> = {}): PopoverProps {
  return {
    service: service({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }),
    readAt,
    position: { top: 0, left: 0 },
    dependsOn: [],
    dependedOnBy: [],
    labelForId,
    onPointerEnter: vi.fn(),
    onPointerLeave: vi.fn(),
    ...overrides,
  };
}

/** The value cell for a named fact -- finds the `<dt>` by its label, then reads the `<dd>` beside it in the same wrapping `<div>`, rather than asserting a value's text exists anywhere on the page regardless of which fact it sits under. */
function factValue(label: string): string | null | undefined {
  return screen.getByText(label).closest("div")?.querySelector("dd")?.textContent;
}

afterEach(() => cleanup());

describe("ServicePopover -- one entry, one popover", () => {
  it("renders the vendor name, the entry id, and the Role fact", () => {
    render(<ServicePopover {...popoverProps()} />);
    expect(screen.getByText("Fly.io")).not.toBeNull();
    expect(screen.getByText("host-api")).not.toBeNull();
    expect(factValue("Role")).toBe("hosting-api");
  });

  it("renders all six facts with the right values, each under its own label", () => {
    render(
      <ServicePopover
        {...popoverProps({
          service: service({ id: "host-api", role: "hosting-api", service: "flyio", kind: "service", version: "3.2.1", status: "active" }),
          dependsOn: ["a", "b", "c"],
          dependedOnBy: ["x"],
        })}
      />
    );
    expect(factValue("Role")).toBe("hosting-api");
    // Kind included even for kind: "service" -- E does not hide the common
    // case the way ServiceSummary's service-page rendering does.
    expect(factValue("Kind")).toBe("service");
    expect(factValue("Version")).toBe("3.2.1");
    expect(factValue("Status")).toBe("Active");
    expect(factValue("Dependents in")).toBe("1");
    expect(factValue("Dependencies out")).toBe("3");
  });

  it("renders 'not tracked', dimmed, rather than omitting the row, when the entry has no version", () => {
    render(<ServicePopover {...popoverProps({ service: service({ id: "host-api", role: "hosting-api", service: "flyio", version: undefined }) })} />);
    expect(factValue("Version")).toBe("not tracked");
  });

  it("renders both dependency counts as zero, not omitted, when there are no edges", () => {
    render(<ServicePopover {...popoverProps({ dependsOn: [], dependedOnBy: [] })} />);
    expect(factValue("Dependents in")).toBe("0");
    expect(factValue("Dependencies out")).toBe("0");
  });

  it("status 'active' earns no tag", () => {
    render(<ServicePopover {...popoverProps({ service: service({ id: "host-api", role: "hosting-api", service: "flyio", status: "active" }) })} />);
    expect(screen.queryByText("deprecated")).toBeNull();
    expect(screen.queryByText("phasing out")).toBeNull();
  });

  it("a non-active status earns its tag, in addition to the Status fact", () => {
    render(<ServicePopover {...popoverProps({ service: service({ id: "host-api", role: "hosting-api", service: "flyio", status: "deprecated" }) })} />);
    // The Tag component's own label casing (lower-case "deprecated"), distinct
    // from the Status fact's sentence-case "Deprecated" -- both are asserted
    // so a regression collapsing them into one can't hide as a pass.
    expect(screen.getByText("deprecated")).not.toBeNull();
    expect(factValue("Status")).toBe("Deprecated");
  });

  it("folds replaced_by into the Status fact, resolved through labelForId, rather than a separate row", () => {
    render(
      <ServicePopover
        {...popoverProps({
          service: service({ id: "auth-legacy", role: "auth-legacy", service: "auth0", status: "phasing_out", replaced_by: "auth-users" }),
        })}
      />
    );
    expect(factValue("Status")).toBe("Phasing out → label:auth-users");
    expect(screen.queryByText("Replaced by")).toBeNull();
  });

  it("states an uncatalogued entry, rather than hiding the gap", () => {
    render(<ServicePopover {...popoverProps({ service: service({ id: "mystery-1", role: "widget", service: "mystery", known: false }) })} />);
    expect(screen.getByText("no catalog entry for this slug")).not.toBeNull();
  });

  it("renders no brand mark when the entry has no verified icon", () => {
    render(<ServicePopover {...popoverProps({ service: service({ id: "mystery-1", role: "widget", service: "mystery", icon: null }) })} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("icon-fallback")).not.toBeNull();
  });

  it("renders the manifest's notes, quoted, below the facts", () => {
    render(
      <ServicePopover
        {...popoverProps({ service: service({ id: "host-api", role: "hosting-api", service: "flyio", notes: "the fan-out hub: 18 outgoing edges" }) })}
      />
    );
    expect(screen.getByText("“the fan-out hub: 18 outgoing edges”")).not.toBeNull();
  });

  it("renders no note block when the entry has none", () => {
    render(<ServicePopover {...popoverProps({ service: service({ id: "host-api", role: "hosting-api", service: "flyio", notes: undefined }) })} />);
    expect(screen.queryByText(/outgoing edges/)).toBeNull();
  });

  it("says 'Click the tile to open its page.' -- there is no chooser to say anything else", () => {
    render(<ServicePopover {...popoverProps()} />);
    expect(screen.getByText("Click the tile to open its page.")).not.toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("places itself at the position prop, as inline top/left", () => {
    render(<ServicePopover {...popoverProps({ position: { top: 42, left: 108 } })} />);
    const popover = screen.getByRole("presentation");
    expect(popover.style.top).toBe("42px");
    expect(popover.style.left).toBe("108px");
  });
});

describe("ServicePopover -- the hover bridge", () => {
  it("wires onPointerEnter/onPointerLeave onto the popover element itself", () => {
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    render(<ServicePopover {...popoverProps({ onPointerEnter, onPointerLeave })} />);
    const popover = screen.getByRole("presentation");
    fireEvent.pointerOver(popover);
    expect(onPointerEnter).toHaveBeenCalledTimes(1);
    fireEvent.pointerOut(popover, { relatedTarget: document.body });
    expect(onPointerLeave).toHaveBeenCalledTimes(1);
  });
});
