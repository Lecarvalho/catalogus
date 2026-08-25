// service-tags.ts decides which tags a service earns, away from any
// component. The one rule that matters most: `active` earns none.
import { describe, expect, it, vi } from "vitest";

import { RECENT_WINDOW_DAYS, isRecentlyAdded, tagsFor } from "./service-tags.js";
import { makeViewService as service } from "./test-support/fixtures.js";

describe("isRecentlyAdded", () => {
  it("is true for something added inside the window, measured back from readAt", () => {
    expect(isRecentlyAdded("2026-08-01T00:00:00.000Z", "2026-08-10T00:00:00.000Z")).toBe(true);
  });

  it("is false for something older than the window", () => {
    expect(isRecentlyAdded("2026-01-01T00:00:00.000Z", "2026-08-10T00:00:00.000Z")).toBe(false);
  });

  it("is inclusive of the boundary: exactly windowDays old still counts", () => {
    expect(isRecentlyAdded("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z", 30)).toBe(true);
  });

  it("is false one millisecond past the boundary", () => {
    expect(isRecentlyAdded("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.001Z", 30)).toBe(false);
  });

  it("is false when added is undefined", () => {
    expect(isRecentlyAdded(undefined, "2026-08-10T00:00:00.000Z")).toBe(false);
  });

  // Future-dated entries are wrong, not new -- that judgement belongs to
  // `catalogus validate`, not this file.
  it("is false for a future-dated added, relative to readAt", () => {
    expect(isRecentlyAdded("2026-09-01T00:00:00.000Z", "2026-08-10T00:00:00.000Z")).toBe(false);
  });

  it("is false for unparseable input, on either side", () => {
    expect(isRecentlyAdded("not-a-date", "2026-08-10T00:00:00.000Z")).toBe(false);
    expect(isRecentlyAdded("2026-08-01T00:00:00.000Z", "not-a-date")).toBe(false);
  });

  it("respects a custom window", () => {
    expect(isRecentlyAdded("2026-08-01T00:00:00.000Z", "2026-08-08T00:00:00.000Z", 5)).toBe(false);
    expect(isRecentlyAdded("2026-08-01T00:00:00.000Z", "2026-08-08T00:00:00.000Z", 7)).toBe(true);
  });

  // Purity is the property tagsFor's whole "measured from the same instant"
  // argument rests on: this must be a function of its two arguments only,
  // never of the wall clock.
  it("never calls Date.now() -- it is a pure function of added and readAt", () => {
    const spy = vi.spyOn(Date, "now");
    isRecentlyAdded("2026-08-01T00:00:00.000Z", "2026-08-10T00:00:00.000Z");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("exports the window it uses as a named constant", () => {
    expect(RECENT_WINDOW_DAYS).toBe(30);
  });
});

describe("tagsFor", () => {
  const readAt = "2026-08-24T00:00:00.000Z";

  // The rule the whole file exists to enforce.
  it("gives an active, non-recent, kind:service entry no tags at all", () => {
    expect(tagsFor(service({ id: "a", role: "hosting", status: "active", kind: "service" }), readAt)).toEqual([]);
  });

  it.each([
    ["phasing_out", "phasing out", "signal-outline"],
    ["deprecated", "deprecated", "ink-solid"],
    ["removed", "removed", "grey-solid"],
  ] as const)("tags a %s entry as '%s' with tone %s", (status, label, tone) => {
    const tags = tagsFor(service({ id: "a", role: "hosting", status }), readAt);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ id: status, label, tone });
  });

  it("tags a recently-added entry as 'new', with the outline signal tone", () => {
    const tags = tagsFor(service({ id: "a", role: "hosting", status: "active", added: "2026-08-20T00:00:00.000Z" }), readAt);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ id: "new", label: "new", tone: "signal-outline" });
  });

  it("does not tag 'new' for an entry added outside the window", () => {
    const tags = tagsFor(service({ id: "a", role: "hosting", status: "active", added: "2020-01-01T00:00:00.000Z" }), readAt);
    expect(tags).toEqual([]);
  });

  it("tags a component with a quiet 'component' outline, and a service with nothing for kind", () => {
    const component = tagsFor(service({ id: "a", role: "hosting", kind: "component" }), readAt);
    expect(component).toHaveLength(1);
    expect(component[0]).toMatchObject({ id: "component", tone: "quiet-outline" });

    const plainService = tagsFor(service({ id: "b", role: "hosting", kind: "service" }), readAt);
    expect(plainService.some((t) => t.id === "component" || t.id === "stack")).toBe(false);
  });

  it("tags a stack with its version when one is set, and without when it isn't", () => {
    const versioned = tagsFor(service({ id: "a", role: "runtime", kind: "stack", version: "20.11.0" }), readAt);
    expect(versioned[0]).toMatchObject({ id: "stack", label: "stack 20.11.0" });

    const unversioned = tagsFor(service({ id: "b", role: "runtime", kind: "stack" }), readAt);
    expect(unversioned[0]).toMatchObject({ id: "stack", label: "stack" });
  });

  // Order is deliberate: status, then recency, then kind. A row that
  // qualifies for all three should show them in that order.
  it("orders tags status, then recency, then kind, when an entry earns more than one", () => {
    const tags = tagsFor(
      service({ id: "a", role: "runtime", kind: "stack", status: "deprecated", added: "2026-08-20T00:00:00.000Z" }),
      readAt
    );
    expect(tags.map((t) => t.id)).toEqual(["deprecated", "new", "stack"]);
  });

  it("carries a long-form title on every tag, so a mark is never the only explanation", () => {
    const tags = tagsFor(service({ id: "a", role: "hosting", status: "deprecated" }), readAt);
    expect(tags[0]!.title.length).toBeGreaterThan(0);
  });
});
