// @vitest-environment jsdom
//
// ServicePopover has two shapes that are not variants of each other: a
// single-entry group renders ServiceSummary (the same body the detail panel
// uses); a multi-entry group renders a chooser, one row per entry, none of
// them the destination on its own.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { collapseByService } from "../bands.js";
import { makeViewService as service } from "../test-support/fixtures.js";
import { ServicePopover } from "./ServicePopover.js";

const readAt = "2026-08-24T00:00:00.000Z";
const labelForId = (id: string) => `label:${id}`;

type PopoverPropsSansGroup = Omit<Parameters<typeof ServicePopover>[0], "group">;

function popoverProps(overrides: Partial<PopoverPropsSansGroup> = {}): PopoverPropsSansGroup {
  return {
    readAt,
    position: { top: 0, left: 0 },
    dependsOn: () => [],
    dependedOnBy: () => [],
    labelForId,
    onOpen: vi.fn(),
    onPointerEnter: vi.fn(),
    onPointerLeave: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("ServicePopover -- single entry", () => {
  it("renders the entry's own summary and a status pill, not a chooser", () => {
    const [group] = collapseByService([service({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io", status: "deprecated" })]);
    render(<ServicePopover group={group!} {...popoverProps()} />);
    expect(screen.getByText("Fly.io")).not.toBeNull();
    expect(screen.getByText("hosting-api")).not.toBeNull();
    expect(screen.getByText("deprecated")).not.toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("says 'Click the tile to open its page.' for a single entry", () => {
    const [group] = collapseByService([service({ id: "a", role: "hosting-api", service: "flyio" })]);
    render(<ServicePopover group={group!} {...popoverProps()} />);
    expect(screen.getByText("Click the tile to open its page.")).not.toBeNull();
  });

  it("states an uncatalogued entry, rather than hiding the gap", () => {
    const [group] = collapseByService([service({ id: "a", role: "widget", service: "mystery", known: false })]);
    render(<ServicePopover group={group!} {...popoverProps()} />);
    expect(screen.getByText("no catalog entry for this slug")).not.toBeNull();
  });
});

describe("ServicePopover -- several entries", () => {
  it("renders one row per entry and no single status pill for the group", () => {
    const [group] = collapseByService([
      service({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io" }),
      service({ id: "b", role: "hosting-web", service: "flyio", name: "Fly.io" }),
    ]);
    render(<ServicePopover group={group!} {...popoverProps()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("hosting-api")).not.toBeNull();
    expect(screen.getByText("hosting-web")).not.toBeNull();
  });

  it("says 'Choose one to open its page.' for several entries", () => {
    const [group] = collapseByService([
      service({ id: "a", role: "hosting-api", service: "flyio" }),
      service({ id: "b", role: "hosting-web", service: "flyio" }),
    ]);
    render(<ServicePopover group={group!} {...popoverProps()} />);
    expect(screen.getByText("Choose one to open its page.")).not.toBeNull();
  });

  it("calls onOpen with the clicked row's own entry id, not the vendor's", () => {
    const onOpen = vi.fn();
    const [group] = collapseByService([
      service({ id: "a", role: "hosting-api", service: "flyio" }),
      service({ id: "b", role: "hosting-web", service: "flyio" }),
    ]);
    render(<ServicePopover group={group!} {...popoverProps({ onOpen })} />);
    fireEvent.click(screen.getAllByRole("button")[1]!);
    expect(onOpen).toHaveBeenCalledWith("b");
  });

  it("states each row's own dependent count via dependedOnBy(id), not a shared number", () => {
    const [group] = collapseByService([
      service({ id: "a", role: "hosting-api", service: "flyio" }),
      service({ id: "b", role: "hosting-web", service: "flyio" }),
    ]);
    const dependedOnBy = (id: string) => (id === "a" ? ["x", "y"] : []);
    render(<ServicePopover group={group!} {...popoverProps({ dependedOnBy })} />);
    expect(screen.getByText("2 entries depend on this")).not.toBeNull();
  });
});

describe("ServicePopover -- the hover bridge", () => {
  it("wires onPointerEnter/onPointerLeave onto the popover element itself", () => {
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    const [group] = collapseByService([service({ id: "a", role: "hosting", service: "flyio" })]);
    render(<ServicePopover group={group!} {...popoverProps({ onPointerEnter, onPointerLeave })} />);
    const popover = screen.getByRole("presentation");
    fireEvent.pointerOver(popover);
    expect(onPointerEnter).toHaveBeenCalledTimes(1);
    fireEvent.pointerOut(popover, { relatedTarget: document.body });
    expect(onPointerLeave).toHaveBeenCalledTimes(1);
  });
});
