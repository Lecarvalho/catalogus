// @vitest-environment jsdom
//
// RankModule renders the rows bands.ts's mostDependedOn already ranked --
// it makes no ordering decision of its own. It currently has no caller on
// the board (ProjectBoard.tsx's top comment: the owner deferred ranking
// until the catalog can name every service it would rank), but the module
// itself is kept, correct and worth testing on its own.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService as service } from "../test-support/fixtures.js";
import { RankModule } from "./RankModule.js";

afterEach(() => cleanup());

describe("RankModule -- the empty case", () => {
  it("renders nothing at all when no row is given -- not a heading over an empty list", () => {
    const { container } = render(<RankModule rows={[]} selectedId={null} onOpen={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("RankModule -- rendering rows", () => {
  it("renders rows in the order given, naming the service and its role", () => {
    render(
      <RankModule
        rows={[
          { service: service({ id: "fly-api", role: "hosting-api", name: "Fly.io" }), count: 14 },
          { service: service({ id: "namecheap", role: "registrar", name: "Namecheap" }), count: 1 },
        ]}
        selectedId={null}
        onOpen={vi.fn()}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Fly.io");
    expect(items[0]!.textContent).toContain("hosting-api");
    expect(items[1]!.textContent).toContain("Namecheap");
  });

  it("states the count in an accessible sentence, singular for one and plural otherwise", () => {
    render(
      <RankModule
        rows={[
          { service: service({ id: "a", role: "hosting", name: "A" }), count: 1 },
          { service: service({ id: "b", role: "hosting", name: "B" }), count: 2 },
        ]}
        selectedId={null}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText("1 entry depends on this")).not.toBeNull();
    expect(screen.getByText("2 entries depend on this")).not.toBeNull();
  });

  it("calls onOpen with the row's service id when clicked", () => {
    const onOpen = vi.fn();
    render(<RankModule rows={[{ service: service({ id: "fly-api", role: "hosting", name: "Fly.io" }), count: 3 }]} selectedId={null} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith("fly-api");
  });
});
