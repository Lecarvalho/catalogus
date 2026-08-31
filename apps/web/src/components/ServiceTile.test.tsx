// @vitest-environment jsdom
//
// ServiceTile is one manifest entry, rendered as a bare home-screen icon
// (candidate E, approved 2026-08-26): the mark, a two-line label (name then
// id), and -- only when the entry is not `active` -- a corner badge, the
// mark desaturated, and the status spelled out in words. No card, no entry
// count; a tile is one entry now, not a collapsed vendor.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService as service } from "../test-support/fixtures.js";
import { monogramFor, ServiceTile, serviceTileDomId } from "./ServiceTile.js";

const readAt = "2026-08-24T00:00:00.000Z";

afterEach(() => cleanup());

function renderTile(overrides: Partial<Parameters<typeof ServiceTile>[0]> & { service: ReturnType<typeof service> }) {
  const onActivate = vi.fn();
  const onPeek = vi.fn();
  const onPeekEnd = vi.fn();
  const result = render(<ServiceTile readAt={readAt} selected={false} onActivate={onActivate} onPeek={onPeek} onPeekEnd={onPeekEnd} {...overrides} />);
  return { onActivate, onPeek, onPeekEnd, unmount: result.unmount };
}

describe("ServiceTile -- the two-line label", () => {
  it("renders both the vendor name and the manifest id", () => {
    renderTile({ service: service({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }) });
    expect(screen.getByText("Fly.io")).not.toBeNull();
    expect(screen.getByText("host-api")).not.toBeNull();
  });

  it("renders two same-vendor entries distinguishably by id, since the name alone would render them the same", () => {
    const { unmount } = renderTile({
      service: service({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }),
    });
    expect(screen.getByText("host-api")).not.toBeNull();
    expect(screen.queryByText("host-web")).toBeNull();
    unmount();

    renderTile({ service: service({ id: "host-web", role: "hosting-web", service: "flyio", name: "Fly.io" }) });
    expect(screen.getByText("host-web")).not.toBeNull();
    expect(screen.queryByText("host-api")).toBeNull();
    // Both renders share the same vendor name -- that repetition is exactly
    // the case the id line exists to disambiguate.
    expect(screen.getByText("Fly.io")).not.toBeNull();
  });
});

describe("ServiceTile -- the no-brand-icon case", () => {
  it("renders the monogram, not the generic rollup glyph", () => {
    renderTile({ service: service({ id: "a", role: "finance-ledger", service: "acme-ledger", name: "acme-ledger", icon: null }) });
    expect(screen.getByText("AL")).not.toBeNull();
    // Icon.tsx stamps its own fallback with this testid -- its absence
    // proves the tile never handed Icon a null path, not merely that a
    // monogram happens to also be on screen.
    expect(screen.queryByTestId("icon-fallback")).toBeNull();
  });

  it("renders the real brand icon, not a monogram, when one resolved", () => {
    renderTile({ service: service({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io", icon: "M0 0h24v24H0z", iconHex: "#24175B" }) });
    expect(screen.queryByText("AL")).toBeNull();
    // The squircle is aria-hidden (the button's own aria-label is the one
    // accessible name), so the icon's own role="img" is deliberately
    // unreachable by an accessibility query here -- read the DOM directly
    // instead, the same way the "not.toContain" style checks elsewhere in
    // this file reach past the a11y tree to the render itself.
    const mark = screen.getByTestId("icon-mark").querySelector("svg");
    expect(mark?.getAttribute("aria-label")).toBe("Fly.io");
    expect(mark?.querySelector("path")?.getAttribute("fill")).toBe("#24175B");
  });
});

describe("monogramFor", () => {
  it("takes the first letter of each of the slug's first two segments", () => {
    expect(monogramFor("acme-ledger")).toBe("AL");
  });

  it("reads underscore-separated segments the same way as dashes", () => {
    expect(monogramFor("acme_ledger")).toBe("AL");
  });

  it("takes a one-word slug's own first two letters", () => {
    expect(monogramFor("vercel")).toBe("VE");
  });

  it("doubles a single-character segment rather than returning one letter", () => {
    expect(monogramFor("x")).toBe("XX");
  });

  it("reads only the first two segments of a slug with more than two", () => {
    expect(monogramFor("hosting-api-eu")).toBe("HA");
  });

  it("never throws and never returns an empty string, even for a degenerate slug", () => {
    expect(monogramFor("")).toBe("??");
    expect(monogramFor("-")).toBe("??");
    expect(monogramFor("--")).toBe("??");
  });
});

describe("ServiceTile -- status", () => {
  it("active earns no badge, no worded status and no desaturation", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "active" }) });
    expect(screen.queryByTestId("status-badge")).toBeNull();
    expect(screen.queryByTestId("status-text")).toBeNull();
    expect(screen.getByTestId("icon-mark").className).not.toContain("desaturated");
  });

  it("phasing_out earns a badge, the worded status, and desaturation", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "phasing_out" }) });
    expect(screen.getByTestId("status-badge")).not.toBeNull();
    expect(screen.getByTestId("status-text").textContent).toBe("Phasing out");
    expect(screen.getByTestId("icon-mark").className).toContain("desaturated");
  });

  it("deprecated earns a badge, the worded status, and desaturation", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "deprecated" }) });
    expect(screen.getByTestId("status-badge")).not.toBeNull();
    expect(screen.getByTestId("status-text").textContent).toBe("Deprecated");
    expect(screen.getByTestId("icon-mark").className).toContain("desaturated");
  });

  it("removed earns a badge, the worded status, and desaturation", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "removed" }) });
    expect(screen.getByTestId("status-badge")).not.toBeNull();
    expect(screen.getByTestId("status-text").textContent).toBe("Removed");
    expect(screen.getByTestId("icon-mark").className).toContain("desaturated");
  });

  it("names the replacement in the worded status when replaced_by is set", () => {
    renderTile({ service: service({ id: "a", role: "auth-legacy", service: "auth0", status: "phasing_out", replaced_by: "auth-users" }) });
    expect(screen.getByTestId("status-text").textContent).toBe("Phasing out → auth-users");
  });

  it("states the status word alone when replaced_by is unset", () => {
    renderTile({ service: service({ id: "a", role: "finance-ledger", service: "acme-ledger", status: "deprecated" }) });
    expect(screen.getByTestId("status-text").textContent).toBe("Deprecated");
  });
});

describe("ServiceTile -- selection", () => {
  it("marks aria-current when selected", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio" }), selected: true });
    expect(screen.getByRole("button").getAttribute("aria-current")).toBe("true");
  });

  it("carries no aria-current attribute at all when not selected", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio" }), selected: false });
    expect(screen.getByRole("button").hasAttribute("aria-current")).toBe(false);
  });
});

describe("ServiceTile -- activation and peeking", () => {
  it("calls onActivate with the exact service on click", () => {
    const entry = service({ id: "a", role: "hosting", service: "flyio" });
    const { onActivate } = renderTile({ service: entry });
    fireEvent.click(screen.getByRole("button"));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]![0]).toBe(entry);
  });

  it("peeks on pointer enter (mouse) and ends the peek on pointer leave", () => {
    const { onPeek, onPeekEnd } = renderTile({ service: service({ id: "a", role: "hosting", service: "flyio" }) });
    const tile = screen.getByRole("button");
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    expect(onPeek).toHaveBeenCalledTimes(1);
    fireEvent.pointerOut(tile, { relatedTarget: document.body });
    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });

  // Touch has no hover at all -- a popover a touch user cannot dismiss would
  // be worse than none, so touch skips straight past peeking to the click.
  it("does not peek on a touch pointer", () => {
    const { onPeek } = renderTile({ service: service({ id: "a", role: "hosting", service: "flyio" }) });
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
    const { onPeek, onPeekEnd } = renderTile({ service: service({ id: "a", role: "hosting", service: "flyio" }) });
    const tile = screen.getByRole("button");
    fireEvent.focus(tile);
    expect(onPeek).toHaveBeenCalledTimes(1);
    fireEvent.blur(tile);
    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });
});

describe("serviceTileDomId", () => {
  it("keys the DOM id on the manifest entry id, and the button carries exactly that id", () => {
    renderTile({ service: service({ id: "host-api", role: "hosting", service: "flyio" }) });
    expect(screen.getByRole("button").id).toBe(serviceTileDomId("host-api"));
    expect(serviceTileDomId("host-api")).toBe("service-tile-host-api");
  });
});
