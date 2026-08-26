// @vitest-environment jsdom
//
// The mark is undecided, and the test that matters most here is the one that
// says so out loud: `data-mark="placeholder"` is on the element for as long as
// no glyph exists, and it disappears the moment one is passed.
//
// That is not decoration. `docs/HANDOFF.md` §2 records the logo as open, the
// owner deferred the choice on 2026-08-25 after rejecting candidates in three
// directions, and the standing risk with any stand-in is that it quietly
// becomes the real thing because nobody remembers it was temporary. This very
// repo nearly proved that in one session: a candidate was drawn, tested, wired
// in and given a favicon before the deferral, and had it been left in place
// "for now" it would have shipped as the mark by default. A test pinning the
// placeholder state is what makes "is the mark still undecided?" a question the
// suite answers rather than one somebody has to remember to ask.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BrandMark } from "./BrandMark.js";

afterEach(() => cleanup());

describe("BrandMark", () => {
  it("sets the wordmark and draws no glyph, because none has been chosen", () => {
    const { container } = render(<BrandMark />);

    expect(screen.getByText("Catalogus")).not.toBeNull();
    // No svg, no img, no invented shape. Absent beats plausible.
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("declares itself a placeholder in the DOM while there is no mark", () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector('[data-mark="placeholder"]')).not.toBeNull();
  });

  it("stops declaring itself a placeholder once a real mark is passed", () => {
    const { container } = render(<BrandMark glyph={<svg data-testid="mark" />} />);

    expect(container.querySelector('[data-mark="placeholder"]')).toBeNull();
    expect(screen.getByTestId("mark")).not.toBeNull();
    // The lockup is glyph then word, in that order -- swapping them is a
    // different lockup, not a detail.
    expect(screen.getByText("Catalogus").previousElementSibling?.tagName.toLowerCase()).toBe("svg");
  });
});
