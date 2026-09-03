// @vitest-environment jsdom
//
// The shared status vocabulary's own tests. Before this file existed, three
// components each carried their own copy of these three things and their
// own coverage for them (ServiceTile.test.tsx, ServiceNode.test.tsx,
// MigrationList.test.tsx). Those suites still exercise the vocabulary
// through each component's own rendering; this file exercises it directly,
// once, so a defect here is caught at its source rather than three times
// downstream (or, worse, in only one of the three call sites while the
// other two silently disagree).
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { makeViewService } from "../test-support/fixtures.js";
import { STATUS_WORDS, StatusBadgeGlyph, statusPhrase } from "./ServiceStatus.js";

afterEach(() => cleanup());

describe("STATUS_WORDS", () => {
  it("spells out the three non-active statuses in Title Case, matching candidate-e-homescreen.html's own wording", () => {
    expect(STATUS_WORDS.phasing_out).toBe("Phasing out");
    expect(STATUS_WORDS.deprecated).toBe("Deprecated");
    expect(STATUS_WORDS.removed).toBe("Removed");
  });
});

// D11-style guard (docs/PLAN.md), the same one ServiceTile.test.tsx and
// ServiceNode.test.tsx each carried against their own now-removed private
// copy: a `StatusBadgeGlyph` edited to fall through to no glyph at all for
// one status would still satisfy a test that only checks the wrapper
// renders. This pins that the three pictograms are non-empty and mutually
// distinct, without pinning any path's `d` data (a legitimate redraw stays
// free to change that).
describe("StatusBadgeGlyph", () => {
  function svgMarkup(status: "phasing_out" | "deprecated" | "removed") {
    const { container, unmount } = render(<StatusBadgeGlyph status={status} />);
    const markup = container.querySelector("svg")?.innerHTML ?? "";
    unmount();
    return markup;
  }

  it("renders a non-empty pictogram for every non-active status", () => {
    expect(svgMarkup("phasing_out").length).toBeGreaterThan(0);
    expect(svgMarkup("deprecated").length).toBeGreaterThan(0);
    expect(svgMarkup("removed").length).toBeGreaterThan(0);
  });

  it("renders a different pictogram for each of the three statuses, pairwise", () => {
    const phasingOut = svgMarkup("phasing_out");
    const deprecated = svgMarkup("deprecated");
    const removed = svgMarkup("removed");

    expect(phasingOut).not.toBe(deprecated);
    expect(phasingOut).not.toBe(removed);
    expect(deprecated).not.toBe(removed);
  });
});

describe("statusPhrase", () => {
  it("returns undefined for active, regardless of replaced_by -- the norm earns neither a badge nor a word", () => {
    expect(statusPhrase(makeViewService({ id: "a", role: "hosting", status: "active" }))).toBeUndefined();
    // Schema-legal but not the case this function's contract covers -- every
    // caller of *this* shared function (ServiceNode.tsx, and MigrationList.tsx
    // by construction never asking) agreed `active` returns undefined before
    // ServiceTile.tsx's own local exception existed; that exception is
    // deliberately not folded in here (see ServiceStatus.tsx's own header).
    expect(statusPhrase(makeViewService({ id: "a", role: "hosting", status: "active", replaced_by: "b" }))).toBeUndefined();
  });

  it("returns the bare word when replaced_by is unset", () => {
    expect(statusPhrase(makeViewService({ id: "a", role: "hosting", status: "deprecated" }))).toBe("Deprecated");
  });

  it("folds the replacement into the phrase with an arrow when replaced_by is set", () => {
    expect(statusPhrase(makeViewService({ id: "a", role: "hosting", status: "phasing_out", replaced_by: "new-svc" }))).toBe("Phasing out → new-svc");
  });
});
