// @vitest-environment jsdom
//
// ServiceSummary is the facts body `ServicePagePanel` renders inside its own
// `.panel` aside (ServicePage.tsx) -- its only caller since candidate E gave
// ServicePopover its own six-fact grid (ServicePopover.tsx's header). `compact`
// used to be this file's one variation; it is gone as of 2026-08-31
// (ServiceSummary.tsx's header records why), so notes and the Layer 3 block
// are asserted unconditionally below rather than under a compact/not-compact
// split.
//
// Rewritten 2026-09-04 for the side-panel redesign (ServiceSummary.tsx's own
// header): every section now carries a heading, the edge lists are one line
// per entry rather than one comma-joined paragraph, and "Depends on" /
// "Depended on by" are independently gated rather than sharing one guard.
// Every fact this file asserted before still shows -- what changed is how it
// is found.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { makeViewService as service } from "../test-support/fixtures.js";
import { ServiceSummary } from "./ServiceSummary.js";

const labelForId = (id: string) => `label:${id}`;

afterEach(() => cleanup());

describe("ServiceSummary -- section headings", () => {
  // "Facts" is the one section with no guard: Role is always present, so it
  // is always the first heading rendered, and nothing above it draws a
  // divider (ServiceSummary.tsx's own comment on why index 0 never gets one).
  it("always renders the Facts section first, with no divider above it", () => {
    const { container } = render(
      <ServiceSummary service={service({ id: "a", role: "hosting-api" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />
    );
    const summary = container.firstElementChild;
    expect(summary?.firstElementChild?.textContent).toBe("Facts");
    expect(summary?.querySelector('[class*="divider"]')).toBeNull();
  });

  // A divider sits between every pair of sections that actually render, and
  // nowhere else -- three sections rendered (Facts, Notes, Depends on) means
  // exactly two dividers, not three and not one shared by accident.
  it("draws one divider between each pair of rendered sections, and no more", () => {
    const { container } = render(
      <ServiceSummary
        service={service({ id: "a", role: "hosting-api", notes: "a note" })}
        dependsOn={["x"]}
        dependedOnBy={[]}
        labelForId={labelForId}
      />
    );
    expect(container.querySelectorAll('[class*="divider"]')).toHaveLength(2);
  });

  it("renders the sections in document order: Facts, then Notes, then the edges, then Cost & account", () => {
    render(
      <ServiceSummary
        service={service({ id: "a", role: "hosting-api", kind: "service", notes: "a note" })}
        dependsOn={["x"]}
        dependedOnBy={["y"]}
        labelForId={labelForId}
      />
    );
    const headings = screen.getAllByText(/^(Facts|Notes|Depends on|Depended on by|Cost & account)/).map((el) => el.textContent);
    expect(headings).toEqual(["Facts", "Notes", "Depends on · 1", "Depended on by · 1", "Cost & account"]);
  });
});

describe("ServiceSummary -- the facts grid", () => {
  it("always states the role", () => {
    render(<ServiceSummary service={service({ id: "a", role: "hosting-api" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />);
    expect(screen.getByText("Role")).not.toBeNull();
    expect(screen.getByText("hosting-api")).not.toBeNull();
  });

  it("omits Kind for a plain service, and states it for a component or a stack", () => {
    const { rerender } = render(
      <ServiceSummary service={service({ id: "a", role: "hosting", kind: "service" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />
    );
    expect(screen.queryByText("Kind")).toBeNull();

    rerender(<ServiceSummary service={service({ id: "a", role: "hosting", kind: "component" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />);
    expect(screen.getByText("Kind")).not.toBeNull();
    expect(screen.getByText("component")).not.toBeNull();
  });

  it("states version, added and replaced_by only when the manifest set them", () => {
    render(
      <ServiceSummary
        service={service({ id: "a", role: "runtime", version: "20.11.0", added: "2026-08-01T00:00:00.000Z", replaced_by: "b" })}
        dependsOn={[]}
        dependedOnBy={[]}
        labelForId={labelForId}
      />
    );
    expect(screen.getByText("20.11.0")).not.toBeNull();
    expect(screen.getByText("2026-08-01T00:00:00.000Z")).not.toBeNull();
    expect(screen.getByText("label:b")).not.toBeNull();
  });

  it("omits version, added and replaced_by rows when unset", () => {
    render(<ServiceSummary service={service({ id: "a", role: "runtime" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />);
    expect(screen.queryByText("Version")).toBeNull();
    expect(screen.queryByText("Added")).toBeNull();
    expect(screen.queryByText("Replaced by")).toBeNull();
  });
});

describe("ServiceSummary -- notes", () => {
  it("quotes the manifest's own notes, the way ServicePopover's note quotes the same field", () => {
    render(
      <ServiceSummary service={service({ id: "a", role: "hosting", notes: "the fan-out hub" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />
    );
    expect(screen.getByText("“the fan-out hub”")).not.toBeNull();
  });

  it("renders no Notes section when the manifest has none", () => {
    render(<ServiceSummary service={service({ id: "a", role: "hosting" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />);
    expect(screen.queryByText("Notes")).toBeNull();
  });
});

describe("ServiceSummary -- edges", () => {
  it("renders one line per dependency, in the section's own count heading, resolved through labelForId", () => {
    render(<ServiceSummary service={service({ id: "a", role: "hosting" })} dependsOn={["x", "w"]} dependedOnBy={["y", "z"]} labelForId={labelForId} />);
    expect(screen.getByText("Depends on · 2")).not.toBeNull();
    expect(screen.getByText("Depended on by · 2")).not.toBeNull();
    expect(screen.getByText("label:x")).not.toBeNull();
    expect(screen.getByText("label:w")).not.toBeNull();
    expect(screen.getByText("label:y")).not.toBeNull();
    expect(screen.getByText("label:z")).not.toBeNull();
    // One id per line, not one comma-joined paragraph -- the old
    // `/label:y, label:z/` shape this test used to assert is gone with it.
    expect(screen.queryByText(/label:y, label:z/)).toBeNull();
  });

  // Independently gated, unlike before: a group with only one direction of
  // edges renders only that direction's section, not an empty pair.
  it("renders only the direction that has edges, when the other is empty", () => {
    render(<ServiceSummary service={service({ id: "a", role: "hosting" })} dependsOn={["x"]} dependedOnBy={[]} labelForId={labelForId} />);
    expect(screen.getByText("Depends on · 1")).not.toBeNull();
    expect(screen.queryByText(/^Depended on by/)).toBeNull();
  });

  it("renders neither block when there are no edges in either direction", () => {
    render(<ServiceSummary service={service({ id: "a", role: "hosting" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />);
    expect(screen.queryByText(/^Depends on/)).toBeNull();
    expect(screen.queryByText(/^Depended on by/)).toBeNull();
  });

  // The mockup draws these rows as links; this component cannot without
  // reconstructing an id/name split `labelForId` does not give it
  // (ServiceSummary.tsx's own header explains why) -- pinned here so a
  // reviewer expecting `<a>` finds the reasoning rather than a silent gap.
  it("renders the edge lines as plain text, not links", () => {
    render(<ServiceSummary service={service({ id: "a", role: "hosting" })} dependsOn={["x"]} dependedOnBy={[]} labelForId={labelForId} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("ServiceSummary -- the Layer 3 block", () => {
  // Catches a mutation that reintroduces a hidden gate on either block --
  // e.g. a stray `compact &&` left over from the prop this removed, or the
  // two guards (`service.notes`, `service.kind === "service"`) merged into
  // one so that one block's presence silently controls the other's.
  it("shows the notes section and the Layer 3 block for kind:service", () => {
    render(
      <ServiceSummary
        service={service({ id: "a", role: "hosting", kind: "service", notes: "a private note" })}
        dependsOn={[]}
        dependedOnBy={[]}
        labelForId={labelForId}
      />
    );
    expect(screen.getByText("“a private note”")).not.toBeNull();
    expect(screen.getByText("Cost & account")).not.toBeNull();
  });

  // Catches a mutation dropping the `service.kind === "service"` guard --
  // e.g. rendering Layer 3 for every kind regardless, which would promise a
  // cost field HANDOFF.md's 2026-08-23 amendment says a component or a
  // stack can never carry.
  it("never shows the Layer 3 block for a component or a stack -- only a service can carry a cost", () => {
    render(
      <ServiceSummary service={service({ id: "a", role: "runtime", kind: "stack" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />
    );
    expect(screen.queryByText("Cost & account")).toBeNull();
  });

  it("draws no divider above the Layer 3 block -- its own top rule stands in for one", () => {
    const { container } = render(
      <ServiceSummary service={service({ id: "a", role: "hosting", kind: "service" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />
    );
    // One rendered section (Facts) plus the Layer 3 block: zero dividers,
    // because the block substitutes its own rule for one (ServiceSummary.tsx
    // and ServiceSummary.module.css's `.overlay` both record why).
    expect(container.querySelectorAll('[class*="divider"]')).toHaveLength(0);
  });
});
