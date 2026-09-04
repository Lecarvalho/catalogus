// @vitest-environment jsdom
//
// BandModule is one full-width section of the board: a heading naming the
// band and stating its entry count, an optional note, and a grid of bare
// icons -- one tile per catalog slug within this band (collapseByService,
// bands.ts), restored 2026-09-04 after standing at one-tile-per-entry since
// 2026-08-26. See BandModule.tsx's own header for the full history; this
// file's first describe below is the regression guard for it.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BandDefinition } from "../bands.js";
import { makeViewService as service } from "../test-support/fixtures.js";
import { BandModule } from "./BandModule.js";

const readAt = "2026-08-24T00:00:00.000Z";

const band: BandDefinition = { id: "production", label: "Runs in production", note: "" };
const notedBand: BandDefinition = { id: "unplaced", label: "Unplaced", note: "These roles are not in SKILL.md's base-word list." };

afterEach(() => cleanup());

describe("BandModule -- one tile per brand per band", () => {
  // The regression this exists to catch, and the one the 2026-09-04 pass
  // restored: repeating a vendor's mark once per entry says the same thing
  // several times over -- three Fly.io entries must render as one tile
  // carrying all three, not three separate marks. The header keeps counting
  // entries (nine, four here) even though the tile count on screen is now
  // smaller (two: one Fly.io group, one Supabase tile) -- BandModule.tsx's
  // own header explains why the two numbers are allowed to differ again.
  it("collapses three entries of one vendor into one tile, and the header still states the entry count", () => {
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
    // Two tiles: one collapsed Fly.io group, one single-entry Supabase tile
    // -- not four, which is what one-tile-per-entry would have rendered.
    expect(screen.getAllByRole("button")).toHaveLength(2);
    // The collapsed tile's DOM id is band-qualified (ServiceTile.tsx's own
    // serviceTileDomId), not any one entry's id.
    expect(document.getElementById("service-tile-production-flyio")).not.toBeNull();
    expect(document.getElementById("service-tile-database")).not.toBeNull();
    // None of the three Fly.io entries' own ids should have become a tile id
    // -- their presence would mean the collapse did not happen.
    expect(document.getElementById("service-tile-host-api")).toBeNull();
    expect(document.getElementById("service-tile-host-web")).toBeNull();
    expect(document.getElementById("service-tile-host-worker")).toBeNull();
    // The header states the entry count -- four -- which is no longer the
    // tile count now that Fly.io collapsed.
    expect(screen.getByText("4")).not.toBeNull();
    expect(screen.getByText("3 entries")).not.toBeNull();
  });

  // A band with no repeated vendor collapses to nothing -- every group is
  // its own single entry, so the tile count and the entry count agree, the
  // same as before this pass.
  it("renders one tile per entry, unchanged, when no two entries in the band share a catalog slug", () => {
    render(
      <BandModule
        band={band}
        services={[
          service({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }),
          service({ id: "database", role: "database", service: "supabase", name: "Supabase" }),
        ]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(document.getElementById("service-tile-host-api")).not.toBeNull();
    expect(document.getElementById("service-tile-database")).not.toBeNull();
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
  // Three different vendors, so none of them collapse -- this is the
  // single-entry-tile case, unchanged from before the group pass, and it is
  // still true: `aria-current` marks exactly the tile whose entry id matches
  // `selectedId`.
  it("marks exactly the single-entry tile whose entry id matches selectedId, and no sibling", () => {
    render(
      <BandModule
        band={band}
        services={[
          service({ id: "a", role: "hosting-api", service: "flyio" }),
          service({ id: "b", role: "hosting-edge", service: "cloudflare-workers" }),
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

  // The new case a collapsed tile introduces: `selectedId` names one entry
  // *inside* a multi-entry group, which has no tile of its own any more --
  // the group's own tile is what has to carry aria-current, since that is
  // the only DOM node the selected entry renders inside now.
  it("marks the group tile as aria-current when selectedId matches one of the entries it collapsed", () => {
    render(
      <BandModule
        band={band}
        services={[
          service({ id: "host-api", role: "hosting-api", service: "flyio" }),
          service({ id: "host-web", role: "hosting-web", service: "flyio" }),
          service({ id: "database", role: "database", service: "supabase" }),
        ]}
        readAt={readAt}
        selectedId="host-web"
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    const flyTile = document.getElementById("service-tile-production-flyio");
    const supabaseTile = document.getElementById("service-tile-database");
    expect(flyTile?.getAttribute("aria-current")).toBe("true");
    expect(supabaseTile?.hasAttribute("aria-current")).toBe(false);
  });
});

describe("BandModule -- callbacks carry the band alongside the group", () => {
  // Two different vendors -- the single-entry case -- proving the right
  // service reaches the callback among more than one tile, and that the
  // band handed back is this band, not some other one.
  it("passes this band and a one-entry group holding the exact activated/peeked service", () => {
    const onActivate = vi.fn();
    const onPeek = vi.fn();
    const onPeekEnd = vi.fn();
    const a = service({ id: "a", role: "hosting-api", service: "flyio" });
    const b = service({ id: "b", role: "hosting-edge", service: "cloudflare-workers" });
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
    expect(onActivate.mock.calls[0]![0]).toBe(band);
    expect(onActivate.mock.calls[0]![1].entries).toEqual([b]);

    fireEvent.pointerOver(tileB, { pointerType: "mouse" });
    expect(onPeek).toHaveBeenCalledTimes(1);
    expect(onPeek.mock.calls[0]![0]).toBe(band);
    expect(onPeek.mock.calls[0]![1].entries).toEqual([b]);
    expect(onPeek.mock.calls[0]![2]).toBe(tileB);

    fireEvent.pointerOut(tileB, { relatedTarget: document.body });
    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });

  // The group case: activating the collapsed Fly.io tile must hand back
  // every entry it stands for, not just one -- App.tsx's own routing (open
  // the entry page for a one-entry group, the brand page for several) reads
  // `group.entries.length` to decide, so a callback that dropped entries
  // here would silently misroute on click.
  it("passes the whole group, every entry it collapsed, when the collapsed tile is activated", () => {
    const onActivate = vi.fn();
    const a = service({ id: "host-api", role: "hosting-api", service: "flyio" });
    const c = service({ id: "host-web", role: "hosting-web", service: "flyio" });
    render(
      <BandModule
        band={band}
        services={[a, c]}
        readAt={readAt}
        selectedId={null}
        onActivate={onActivate}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    fireEvent.click(document.getElementById("service-tile-production-flyio")!);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]![0]).toBe(band);
    expect(onActivate.mock.calls[0]![1].entries).toEqual([a, c]);
  });
});
