// @vitest-environment jsdom
//
// BandModule is one boxed section of the board: a header naming the band and
// stating its entry count, an optional note, and a grid of vendor tiles
// collapsed from this band's own services.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BandDefinition } from "../bands.js";
import { makeViewService as service } from "../test-support/fixtures.js";
import { BandModule } from "./BandModule.js";

const readAt = "2026-08-24T00:00:00.000Z";

const band: BandDefinition = { id: "serves", label: "Serves requests", note: "" };
const notedBand: BandDefinition = { id: "unplaced", label: "Unplaced", note: "These roles are not in SKILL.md's base-word list." };

afterEach(() => cleanup());

describe("BandModule -- the header count", () => {
  // The header counts entries, not tiles -- they differ once a vendor
  // collapses, and the header's number is the one that reconciles with the
  // manifest and the CLI.
  it("counts entries, which can be more than the number of tiles rendered", () => {
    render(
      <BandModule
        band={band}
        services={[
          service({ id: "a", role: "hosting-api", service: "flyio" }),
          service({ id: "b", role: "hosting-web", service: "flyio" }),
          service({ id: "c", role: "database", service: "supabase" }),
        ]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { level: 2, name: "Serves requests" })).not.toBeNull();
    expect(screen.getByText("3")).not.toBeNull();
    // Two vendors -- flyio (2 entries) and supabase (1) -- so two tiles.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});

describe("BandModule -- the note", () => {
  it("renders no note when the band defines an empty one", () => {
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
    expect(document.querySelector("p")).toBeNull();
  });

  it("renders the band's note when it has one", () => {
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

describe("BandModule -- collapsing is scoped to the services it is given", () => {
  it("collapses same-slug entries within its own services into one tile", () => {
    render(
      <BandModule
        band={band}
        services={[
          service({ id: "a", role: "hosting-api", service: "flyio" }),
          service({ id: "b", role: "hosting-web", service: "flyio" }),
        ]}
        readAt={readAt}
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("×2")).not.toBeNull();
  });
});

describe("BandModule -- selection reaches the right tile", () => {
  it("marks a tile selected when any of its entries matches selectedId", () => {
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
    const buttons = screen.getAllByRole("button");
    const flyio = buttons.find((btn) => btn.id === "service-tile-flyio");
    const supabase = buttons.find((btn) => btn.id === "service-tile-supabase");
    expect(flyio?.getAttribute("aria-current")).toBe("true");
    expect(supabase?.hasAttribute("aria-current")).toBe(false);
  });
});
