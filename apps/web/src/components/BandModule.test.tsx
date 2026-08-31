// @vitest-environment jsdom
//
// BandModule is one full-width section of the board: a heading naming the
// band and stating its entry count, an optional note, and a grid of bare
// icons -- one tile per manifest entry, never collapsed by vendor.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BandDefinition } from "../bands.js";
import { makeViewService as service } from "../test-support/fixtures.js";
import { BandModule } from "./BandModule.js";

const readAt = "2026-08-24T00:00:00.000Z";

const band: BandDefinition = { id: "production", label: "Runs in production", note: "" };
const notedBand: BandDefinition = { id: "unplaced", label: "Unplaced", note: "These roles are not in SKILL.md's base-word list." };

afterEach(() => cleanup());

describe("BandModule -- one tile per entry, never collapsed by vendor", () => {
  // The regression this exists to catch: candidate E's board has no card
  // left to carry a collapsed tile's `xN`, so three Fly.io entries must
  // render as three distinct marks, not one Fly.io tile standing in for
  // all three. The header count is the same number as the tile count now
  // that nothing collapses, so this test checks both at once.
  it("renders three entries of one vendor as three tiles, and the header count matches", () => {
    render(
      <BandModule
        band={band}
        services={[
          service({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }),
          service({ id: "host-web", role: "hosting-web", service: "flyio", name: "Fly.io" }),
          service({ id: "host-worker", role: "hosting-worker", service: "flyio", name: "Fly.io" }),
          service({ id: "database", role: "database", service: "supabase", name: "Supabase" }),
        ]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { level: 2, name: "Runs in production" })).not.toBeNull();
    // Four tiles, one per manifest entry -- not two (one per vendor slug).
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(document.getElementById("service-tile-host-api")).not.toBeNull();
    expect(document.getElementById("service-tile-host-web")).not.toBeNull();
    expect(document.getElementById("service-tile-host-worker")).not.toBeNull();
    // The old collapsed id, keyed on the vendor slug rather than the entry
    // id, must not appear -- its presence would mean collapsing came back.
    expect(document.getElementById("service-tile-flyio")).toBeNull();
    // The header states the entry count, which is also the tile count now
    // that nothing collapses.
    expect(screen.getByText("4")).not.toBeNull();
  });
});

describe("BandModule -- the section anchor and its heading", () => {
  it("carries id=\"band-<id>\" on the section, labelled by a distinct heading id", () => {
    render(
      <BandModule
        band={band}
        services={[service({ id: "a", role: "hosting", service: "flyio" })]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    const region = screen.getByRole("region", { name: "Runs in production" });
    expect(region.id).toBe("band-production");
    const heading = screen.getByRole("heading", { level: 2, name: "Runs in production" });
    // The heading's own id must not collide with the section's -- it is a
    // distinct id that aria-labelledby points at.
    expect(heading.id).not.toBe("band-production");
    expect(heading.id.length).toBeGreaterThan(0);
  });
});

describe("BandModule -- the note", () => {
  it("renders no note when the band defines an empty one, and renders it when the band has one", () => {
    const { unmount } = render(
      <BandModule
        band={band}
        services={[service({ id: "a", role: "hosting", service: "flyio" })]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    expect(document.querySelector("p")).toBeNull();
    unmount();

    render(
      <BandModule
        band={notedBand}
        services={[service({ id: "a", role: "widget", service: "mystery" })]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    expect(screen.getByText(notedBand.note)).not.toBeNull();
  });
});

describe("BandModule -- selection reaches the right tile", () => {
  it("marks exactly the tile whose entry id matches selectedId, and no sibling", () => {
    render(
      <BandModule
        band={band}
        services={[
          service({ id: "a", role: "hosting-api", service: "flyio" }),
          service({ id: "b", role: "hosting-web", service: "flyio" }),
          service({ id: "c", role: "database", service: "supabase" }),
        ]}
        readAt={readAt}
        selectedId="b"
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    const a = document.getElementById("service-tile-a");
    const b = document.getElementById("service-tile-b");
    const c = document.getElementById("service-tile-c");
    expect(a?.hasAttribute("aria-current")).toBe(false);
    expect(b?.getAttribute("aria-current")).toBe("true");
    expect(c?.hasAttribute("aria-current")).toBe(false);
  });
});

describe("BandModule -- callbacks reach the right tile with the right service", () => {
  it("passes the exact ViewService for the tile that was activated and peeked, not another one", () => {
    const onActivate = vi.fn();
    const onPeek = vi.fn();
    const onPeekEnd = vi.fn();
    const a = service({ id: "a", role: "hosting-api", service: "flyio" });
    const b = service({ id: "b", role: "hosting-web", service: "flyio" });
    render(
      <BandModule
        band={band}
        services={[a, b]}
        readAt={readAt}
        selectedId={null}
        onActivate={onActivate}
        onPeek={onPeek}
        onPeekEnd={onPeekEnd}
      />
    );
    const tileB = document.getElementById("service-tile-b")!;

    fireEvent.click(tileB);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]![0]).toBe(b);

    fireEvent.pointerOver(tileB, { pointerType: "mouse" });
    expect(onPeek).toHaveBeenCalledTimes(1);
    expect(onPeek.mock.calls[0]![0]).toBe(b);
    expect(onPeek.mock.calls[0]![1]).toBe(tileB);

    fireEvent.pointerOut(tileB, { relatedTarget: document.body });
    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });
});
