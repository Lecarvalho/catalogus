// @vitest-environment jsdom
//
// ServiceTile is a vendor tile: icon, name, and only what would make the
// board wrong if it were left off -- a count when it stands for more than
// one entry, a status mark when the group's status is not `active`.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { collapseByService } from "../bands.js";
import { makeViewService as service } from "../test-support/fixtures.js";
import { ServiceTile, serviceTileDomId } from "./ServiceTile.js";

const readAt = "2026-08-24T00:00:00.000Z";

afterEach(() => cleanup());

function renderTile(entries: ReturnType<typeof service>[], overrides: Partial<Parameters<typeof ServiceTile>[0]> = {}) {
  const [group] = collapseByService(entries);
  const onActivate = vi.fn();
  const onPeek = vi.fn();
  const onPeekEnd = vi.fn();
  render(<ServiceTile group={group!} readAt={readAt} selected={false} onActivate={onActivate} onPeek={onPeek} onPeekEnd={onPeekEnd} {...overrides} />);
  return { onActivate, onPeek, onPeekEnd };
}

describe("ServiceTile -- the entry count", () => {
  it("shows no ×N for a single-entry group", () => {
    renderTile([service({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io" })]);
    expect(screen.queryByText(/×/)).toBeNull();
  });

  it("shows ×N for a group standing for more than one entry", () => {
    renderTile([
      service({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io" }),
      service({ id: "b", role: "hosting-web", service: "flyio", name: "Fly.io" }),
      service({ id: "c", role: "hosting-monitoring", service: "flyio", name: "Fly.io" }),
    ]);
    expect(screen.getByText("×3")).not.toBeNull();
  });
});

describe("ServiceTile -- the status mark", () => {
  it("carries no mark when the group's status is active", () => {
    renderTile([service({ id: "a", role: "hosting", service: "flyio", status: "active" })]);
    // service-tags.ts's exact title text for each non-active status -- absent
    // here proves no mark, not just no visible dot.
    expect(screen.queryByTitle(/Should not be used/)).toBeNull();
    expect(screen.queryByTitle(/Being replaced/)).toBeNull();
    expect(screen.queryByTitle(/No longer part of the project/)).toBeNull();
    // Structural, and not tied to any particular status's wording: a mark
    // renders as a titled child of the button, so an active tile -- which
    // must earn none at all, not merely none of the three known ones -- has
    // no titled element inside it whatsoever.
    expect(screen.getByRole("button").querySelector("[title]")).toBeNull();
  });

  it("carries a mark, with the status's own title, when the group's status is not active", () => {
    renderTile([service({ id: "a", role: "hosting", service: "flyio", status: "deprecated" })]);
    expect(screen.getByTitle(/Should not be used/)).not.toBeNull();
  });

  it("takes the group's most consequential status, not the first entry's", () => {
    renderTile([
      service({ id: "a", role: "hosting", service: "flyio", status: "active" }),
      service({ id: "b", role: "hosting", service: "flyio", status: "deprecated" }),
    ]);
    expect(screen.getByTitle(/Should not be used/)).not.toBeNull();
  });
});

describe("ServiceTile -- the accessible label", () => {
  it("names the vendor, role and mark for a single-entry group", () => {
    renderTile([service({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io", status: "deprecated" })]);
    expect(screen.getByRole("button", { name: "Fly.io, hosting-api, deprecated" })).not.toBeNull();
  });

  it("names the vendor and entry count for a multi-entry group, without a role", () => {
    renderTile([
      service({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io" }),
      service({ id: "b", role: "hosting-web", service: "flyio", name: "Fly.io" }),
    ]);
    expect(screen.getByRole("button", { name: "Fly.io, 2 entries" })).not.toBeNull();
  });

  it("omits the mark segment entirely when the group is active", () => {
    renderTile([service({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io", status: "active" })]);
    expect(screen.getByRole("button", { name: "Fly.io, hosting-api" })).not.toBeNull();
  });
});

describe("ServiceTile -- selection", () => {
  it("marks aria-current when selected", () => {
    renderTile([service({ id: "a", role: "hosting", service: "flyio" })], { selected: true });
    expect(screen.getByRole("button").getAttribute("aria-current")).toBe("true");
  });

  it("carries no aria-current attribute at all when not selected", () => {
    renderTile([service({ id: "a", role: "hosting", service: "flyio" })], { selected: false });
    expect(screen.getByRole("button").hasAttribute("aria-current")).toBe(false);
  });
});

describe("ServiceTile -- activation and peeking", () => {
  it("calls onActivate with the group on click", () => {
    const { onActivate } = renderTile([service({ id: "a", role: "hosting", service: "flyio" })]);
    fireEvent.click(screen.getByRole("button"));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]![0]).toMatchObject({ service: "flyio" });
  });

  it("peeks on pointer enter (mouse) and ends the peek on pointer leave", () => {
    const { onPeek, onPeekEnd } = renderTile([service({ id: "a", role: "hosting", service: "flyio" })]);
    const tile = screen.getByRole("button");
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    expect(onPeek).toHaveBeenCalledTimes(1);
    fireEvent.pointerOut(tile, { relatedTarget: document.body });
    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });

  // Touch has no hover at all -- a popover a touch user cannot dismiss would
  // be worse than none, so touch skips straight past peeking to the click.
  it("does not peek on a touch pointer", () => {
    const { onPeek } = renderTile([service({ id: "a", role: "hosting", service: "flyio" })]);
    const tile = screen.getByRole("button");
    // jsdom (25.0.1) has no PointerEvent constructor, so fireEvent.pointerOver's
    // {pointerType} init is silently dropped (testing-library falls back to
    // plain Event). Build the event and patch the property on by hand.
    const event = new Event("pointerover", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    fireEvent(tile, event);
    expect(onPeek).not.toHaveBeenCalled();
  });

  it("peeks on keyboard focus, for parity with hover, and ends on blur", () => {
    const { onPeek, onPeekEnd } = renderTile([service({ id: "a", role: "hosting", service: "flyio" })]);
    const tile = screen.getByRole("button");
    fireEvent.focus(tile);
    expect(onPeek).toHaveBeenCalledTimes(1);
    fireEvent.blur(tile);
    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });
});

describe("serviceTileDomId", () => {
  it("keys the DOM id on the catalog slug, and the button carries exactly that id", () => {
    renderTile([service({ id: "a", role: "hosting", service: "flyio" })]);
    expect(screen.getByRole("button").id).toBe(serviceTileDomId("flyio"));
    expect(serviceTileDomId("flyio")).toBe("service-tile-flyio");
  });
});
