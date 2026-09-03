// @vitest-environment jsdom
//
// ServiceSummary is the facts body ServicePage renders inside its own
// `.facts` aside -- its only caller since candidate E gave ServicePopover
// its own six-fact grid (ServicePopover.tsx's header). `compact` used to be
// this file's one variation; it is gone as of 2026-08-31 (ServiceSummary.tsx's
// header records why), so notes and the Layer 3 block are asserted
// unconditionally below rather than under a compact/not-compact split.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { makeViewService as service } from "../test-support/fixtures.js";
import { ServiceSummary } from "./ServiceSummary.js";

const labelForId = (id: string) => `label:${id}`;

afterEach(() => cleanup());

describe("ServiceSummary -- the facts list", () => {
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

describe("ServiceSummary -- edges", () => {
  it("renders both edge directions, resolved through labelForId, when both are non-empty", () => {
    render(<ServiceSummary service={service({ id: "a", role: "hosting" })} dependsOn={["x"]} dependedOnBy={["y", "z"]} labelForId={labelForId} />);
    expect(screen.getByText("Depends on")).not.toBeNull();
    expect(screen.getByText("Depended on by")).not.toBeNull();
    expect(screen.getByText("label:x")).not.toBeNull();
    expect(screen.getByText(/label:y, label:z/)).not.toBeNull();
  });

  it("renders neither block when there are no edges in either direction", () => {
    render(<ServiceSummary service={service({ id: "a", role: "hosting" })} dependsOn={[]} dependedOnBy={[]} labelForId={labelForId} />);
    expect(screen.queryByText("Depends on")).toBeNull();
    expect(screen.queryByText("Depended on by")).toBeNull();
  });
});

describe("ServiceSummary -- notes and the Layer 3 block", () => {
  // Catches a mutation that reintroduces a hidden gate on either block --
  // e.g. a stray `compact &&` left over from the prop this removed, or the
  // two guards (`service.notes`, `service.kind === "service"`) merged into
  // one so that one block's presence silently controls the other's.
  it("shows the notes paragraph and the Layer 3 block for kind:service", () => {
    render(
      <ServiceSummary
        service={service({ id: "a", role: "hosting", kind: "service", notes: "a private note" })}
        dependsOn={[]}
        dependedOnBy={[]}
        labelForId={labelForId}
      />
    );
    expect(screen.getByText("a private note")).not.toBeNull();
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
});
