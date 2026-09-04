// @vitest-environment jsdom
//
// ServicePopover renders one vendor's tile's whole popover content -- a
// single entry's own six-fact grid, unchanged since candidate E collapsed
// the chooser away on 2026-08-26, or, since 2026-09-04
// (docs/brand-tile-brief.md, Part A), a multi-entry group's header plus an
// entry-list body in place of that grid. `group` replaces the old bare
// `service` prop either way -- see ServicePopover.tsx's own header for the
// full history of the chooser leaving and coming back in a different shape.
//
// The six-fact `<dl>` is this file's own now, not `ServiceSummary`'s (see
// ServicePopover.tsx's header for why sharing that component's mechanism
// did not survive candidate E's popover), so the tests below assert this
// component's own rendering of Role/Kind/Version/Status/Dependents in/
// Dependencies out directly, rather than through a shared body.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VendorGroup } from "../bands.js";
import { makeViewService as service } from "../test-support/fixtures.js";
import { ServicePopover } from "./ServicePopover.js";

const readAt = "2026-08-24T00:00:00.000Z";
const labelForId = (id: string) => `label:${id}`;

/** A one-entry `VendorGroup` -- what every tile stood for before this pass, and what a repeat-free band's tile still stands for. */
function soloGroup(overrides: Parameters<typeof service>[0]): VendorGroup {
  const entry = service(overrides);
  return { service: entry.service, name: entry.name, icon: entry.icon, rollup: entry.rollup, entries: [entry] };
}

/** A multi-entry `VendorGroup` -- every entry sharing one `service` slug, the invariant `collapseByService` guarantees its own output. */
function multiGroup(entries: ReturnType<typeof service>[]): VendorGroup {
  const [first, ...rest] = entries as [ReturnType<typeof service>, ...ReturnType<typeof service>[]];
  return { service: first.service, name: first.name, icon: first.icon, rollup: first.rollup, entries: [first, ...rest] };
}

type PopoverProps = Parameters<typeof ServicePopover>[0];

function popoverProps(overrides: Partial<PopoverProps> = {}): PopoverProps {
  return {
    group: soloGroup({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }),
    readAt,
    position: { top: 0, left: 0 },
    dependsOn: [],
    dependedOnBy: [],
    labelForId,
    onOpenEntry: vi.fn(),
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

describe("ServicePopover -- one entry, one popover (unchanged)", () => {
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
          group: soloGroup({ id: "host-api", role: "hosting-api", service: "flyio", kind: "service", version: "3.2.1", status: "active" }),
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
    render(<ServicePopover {...popoverProps({ group: soloGroup({ id: "host-api", role: "hosting-api", service: "flyio", version: undefined }) })} />);
    expect(factValue("Version")).toBe("not tracked");
  });

  it("renders both dependency counts as zero, not omitted, when there are no edges", () => {
    render(<ServicePopover {...popoverProps({ dependsOn: [], dependedOnBy: [] })} />);
    expect(factValue("Dependents in")).toBe("0");
    expect(factValue("Dependencies out")).toBe("0");
  });

  it("status 'active' earns no tag", () => {
    render(<ServicePopover {...popoverProps({ group: soloGroup({ id: "host-api", role: "hosting-api", service: "flyio", status: "active" }) })} />);
    expect(screen.queryByText("deprecated")).toBeNull();
    expect(screen.queryByText("phasing out")).toBeNull();
  });

  it("a non-active status earns its tag, in addition to the Status fact", () => {
    render(<ServicePopover {...popoverProps({ group: soloGroup({ id: "host-api", role: "hosting-api", service: "flyio", status: "deprecated" }) })} />);
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
          group: soloGroup({ id: "auth-legacy", role: "auth-legacy", service: "auth0", status: "phasing_out", replaced_by: "auth-users" }),
        })}
      />
    );
    expect(factValue("Status")).toBe("Phasing out → label:auth-users");
    expect(screen.queryByText("Replaced by")).toBeNull();
  });

  it("states an uncatalogued entry, rather than hiding the gap", () => {
    render(<ServicePopover {...popoverProps({ group: soloGroup({ id: "mystery-1", role: "widget", service: "mystery", known: false }) })} />);
    expect(screen.getByText("no catalog entry for this slug")).not.toBeNull();
  });

  it("renders no brand mark when the entry has no verified icon", () => {
    render(<ServicePopover {...popoverProps({ group: soloGroup({ id: "mystery-1", role: "widget", service: "mystery", icon: null }) })} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("icon-fallback")).not.toBeNull();
  });

  it("renders the manifest's notes, quoted, below the facts", () => {
    render(
      <ServicePopover
        {...popoverProps({ group: soloGroup({ id: "host-api", role: "hosting-api", service: "flyio", notes: "the fan-out hub: 18 outgoing edges" }) })}
      />
    );
    expect(screen.getByText("“the fan-out hub: 18 outgoing edges”")).not.toBeNull();
  });

  it("renders no note block when the entry has none", () => {
    render(<ServicePopover {...popoverProps({ group: soloGroup({ id: "host-api", role: "hosting-api", service: "flyio", notes: undefined }) })} />);
    expect(screen.queryByText(/outgoing edges/)).toBeNull();
  });

  it("says 'Click the tile to open its page.' -- there is no entry list to say anything else", () => {
    render(<ServicePopover {...popoverProps()} />);
    expect(screen.getByText("Click the tile to open its page.")).not.toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("places itself at the position prop, as inline top/left", () => {
    render(<ServicePopover {...popoverProps({ position: { top: 42, left: 108 } })} />);
    const popover = screen.getByRole("presentation");
    expect(popover.style.top).toBe("42px");
    expect(popover.style.left).toBe("108px");
  });
});

describe("ServicePopover -- the hover bridge (unchanged)", () => {
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

// ---------------------------------------------------------------------------
// The multi-entry group popover (docs/brand-tile-brief.md, Part A; the
// mockup's leading comment, decision 4). Reinstated 2026-09-04.
// ---------------------------------------------------------------------------

const flyGroup = () =>
  multiGroup([
    service({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }),
    service({ id: "host-cron", role: "hosting-cron", service: "flyio", name: "Fly.io" }),
    service({ id: "host-preview", role: "hosting-preview", service: "flyio", name: "Fly.io", status: "phasing_out" }),
    service({ id: "host-web", role: "hosting-web", service: "flyio", name: "Fly.io" }),
    service({ id: "host-worker", role: "hosting-worker", service: "flyio", name: "Fly.io" }),
  ]);

describe("ServicePopover -- the group popover's header", () => {
  it("keeps the mark, the name, and the entry count -- and nothing the six-fact grid carried", () => {
    render(<ServicePopover {...popoverProps({ group: flyGroup() })} />);
    expect(screen.getByText("Fly.io")).not.toBeNull();
    expect(screen.getByText("5 entries")).not.toBeNull();
    // None of the six facts render for a group -- there is no single value
    // for Role, Version, Status or the two edge counts across five entries,
    // and Kind is stated on the brand page instead (this file's header).
    expect(screen.queryByText("Role")).toBeNull();
    expect(screen.queryByText("Kind")).toBeNull();
    expect(screen.queryByText("Version")).toBeNull();
    expect(screen.queryByText("Dependents in")).toBeNull();
    expect(screen.queryByText("Dependencies out")).toBeNull();
  });

  it("renders no tag row and no uncatalogued notice -- the mockup's header states only mark, name and count", () => {
    render(<ServicePopover {...popoverProps({ group: flyGroup() })} />);
    expect(screen.queryByText("no catalog entry for this slug")).toBeNull();
    expect(screen.queryByText("phasing out")).toBeNull(); // the Tag component's own label
  });

  it("renders no note and no hint -- a note belongs to one entry, and every row is already its own destination", () => {
    render(<ServicePopover {...popoverProps({ group: flyGroup() })} />);
    expect(screen.queryByText("Click the tile to open its page.")).toBeNull();
  });
});

describe("ServicePopover -- the group popover's entry rows, in place of the fact grid", () => {
  it("renders one row per entry, each carrying its id and role", () => {
    render(<ServicePopover {...popoverProps({ group: flyGroup() })} />);
    const rows = screen.getAllByRole("link");
    expect(rows).toHaveLength(5);
    expect(screen.getByText("host-api")).not.toBeNull();
    expect(screen.getByText("hosting-api")).not.toBeNull();
    expect(screen.getByText("host-preview")).not.toBeNull();
    expect(screen.getByText("hosting-preview")).not.toBeNull();
  });

  it("shows the status word only for the entry that departs from active", () => {
    render(<ServicePopover {...popoverProps({ group: flyGroup() })} />);
    expect(screen.getByText("Phasing out")).not.toBeNull();
    // Exactly one row states a status word -- the other four are active and
    // earn nothing, the same norm-suppression rule the tile applies.
    expect(screen.getAllByText(/^(Phasing out|Deprecated|Removed)$/)).toHaveLength(1);
  });

  it("each row links to its own entry page at #/service/<id>", () => {
    render(<ServicePopover {...popoverProps({ group: flyGroup() })} />);
    const row = screen.getByRole("link", { name: /host-preview/ });
    expect(row.getAttribute("href")).toBe("#/service/host-preview");
  });

  it("routes a row click through onOpenEntry rather than the anchor's own default navigation", () => {
    const onOpenEntry = vi.fn();
    render(<ServicePopover {...popoverProps({ group: flyGroup(), onOpenEntry })} />);
    const row = screen.getByRole("link", { name: /host-web/ });
    const event = fireEvent.click(row);
    // testing-library's fireEvent returns false when preventDefault() was
    // called on a cancelable event -- the proof the anchor's own navigation
    // never ran, not just that the callback also happened to fire.
    expect(event).toBe(false);
    expect(onOpenEntry).toHaveBeenCalledTimes(1);
    expect(onOpenEntry).toHaveBeenCalledWith("host-web");
  });

  // The brief's own requirement: the rows are reachable by Tab while the
  // popover is pinned by focus, the same bridge the pointer already has.
  // Verified directly against the mechanism (ServicePopover.tsx's own
  // onFocus/onBlur wiring) rather than against a full document tab
  // sequence, which this component -- rendered here with no siblings -- has
  // no way to exercise; App.test.tsx exercises the same mechanism end to
  // end through a real tile.
  describe("rows are reachable by Tab, and keep the popover pinned while focus is inside it", () => {
    it("cancels a scheduled close when one of its own rows receives focus", () => {
      const onPointerEnter = vi.fn();
      render(<ServicePopover {...popoverProps({ group: flyGroup(), onPointerEnter })} />);
      fireEvent.focus(screen.getByRole("link", { name: /host-api/ }));
      expect(onPointerEnter).toHaveBeenCalledTimes(1);
    });

    it("schedules a close when focus leaves the popover's own rows", () => {
      const onPointerLeave = vi.fn();
      render(<ServicePopover {...popoverProps({ group: flyGroup(), onPointerLeave })} />);
      fireEvent.blur(screen.getByRole("link", { name: /host-api/ }));
      expect(onPointerLeave).toHaveBeenCalledTimes(1);
    });

    it("every row is a real, focusable link -- not a div with a click handler standing in for one", () => {
      render(<ServicePopover {...popoverProps({ group: flyGroup() })} />);
      for (const row of screen.getAllByRole("link")) {
        expect(row.tagName).toBe("A");
        expect(row.hasAttribute("href")).toBe(true);
        expect(row.getAttribute("tabindex")).not.toBe("-1");
      }
    });
  });
});

// A one-entry group must never reach the group rendering -- BandModule.tsx
// only ever hands ServiceTile (and, through it, this component) a group
// whose size matches what it collapsed to, but this is the component-level
// guard that the branch itself keys on `entries.length > 1`, not on some
// other signal that could drift from it.
describe("ServicePopover -- the branch itself", () => {
  it("renders the single-entry six-fact body, not the entry list, for a one-entry group", () => {
    render(<ServicePopover {...popoverProps({ group: soloGroup({ id: "host-api", role: "hosting-api", service: "flyio" }) })} />);
    expect(screen.getByText("Role")).not.toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
