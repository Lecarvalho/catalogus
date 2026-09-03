// Placement as arithmetic. Every one of these ran against App.tsx's
// `positionFor` only through a rendered component before this module existed,
// which meant the cases that mattered most -- a box that fits on neither side
// -- were reachable only by finding a viewport height and a tile position
// that produced them, so nobody wrote them.
//
// The numbers below are chosen so each test fails for one reason. Where a
// case is a validator's own reproduction against the built app, the measured
// rect is used rather than a rounder one, and the comment says so.
import { describe, expect, it } from "vitest";

import { POPOVER_ESTIMATE, POPOVER_GAP, fitsInViewport, placePopover, samePlacement, type AnchorRect } from "./popover-placement.js";

/** A tile, defaulting to the 119x158 box ProjectBoard actually renders at 1280px (measured on the built app). */
function tile(overrides: Partial<AnchorRect> = {}): AnchorRect {
  return { top: 341, left: 16, width: 119, height: 158, ...overrides };
}

describe("placePopover -- which side it lands on", () => {
  it("goes below the tile, one gap under it, when the whole box fits there", () => {
    // 1280x900: below is 341 + 158 + 12 = 511, and 511 + 246 = 757 clears
    // the 888 bound with room to spare.
    const at = placePopover(tile(), { width: 268, height: 246 }, { width: 1280, height: 900 });
    expect(at.top).toBe(511);
  });

  it("goes above the tile, one gap over it, when the box fits there and not below", () => {
    // The defect this module was written for, at the viewport it was measured
    // on: 1265x720 (1280 less a classic scrollbar), first-band tile at
    // [341, 499], a 286px box. Below needs 511 + 286 = 797 against a 708
    // bound and fails; above is 341 - 12 - 286 = 43, which clears 12. The
    // previous version compared the *stylesheet's 60vh ceiling* (432px) with
    // the 329px above the tile, declined the flip, and left 89px of the box
    // past the bottom edge.
    const at = placePopover(tile(), { width: 268, height: 286 }, { width: 1265, height: 720 });
    expect(at.top).toBe(43);
    expect(at.top + 286).toBe(341 - POPOVER_GAP);
  });

  it("prefers below when both sides fit, rather than flipping on a tie of available room", () => {
    // Tile dead centre of an 800px viewport with 276px free on each side and
    // a 200px box, which fits in either.
    const at = placePopover(tile({ top: 300, height: 200 }), { width: 268, height: 200 }, { width: 1280, height: 800 });
    expect(at.top).toBe(512);
  });
});

describe("placePopover -- when the box fits on neither side", () => {
  it("goes above when above has more room, overflowing past the top rather than over the tile", () => {
    // Tile low in a short viewport: 400 - 320 - 24 = 56 below, 300 - 24 = 276
    // above, and a 300px box fits in neither. Above wins, and the box's
    // bottom still stops one gap over the tile -- so the box starts at -12,
    // off the top of the screen, which is the overflow going away from the
    // tile rather than over it.
    const at = placePopover(tile({ top: 300, height: 20 }), { width: 268, height: 300 }, { width: 1280, height: 400 });
    expect(at.top).toBe(-12);
    expect(at.top + 300).toBe(288);
  });

  it("goes below when below has more room, overflowing past the bottom rather than over the tile", () => {
    // The validator's own 1280x400 reproduction: tile [100, 220], so 76px
    // above and 156px below, neither holding a 250px box. Below wins and the
    // top lands at 232 -- past the tile's own 220 bottom, which is the
    // property the old flip-and-clamp broke by putting the box at top 12.
    const at = placePopover(tile({ top: 100, height: 120 }), POPOVER_ESTIMATE, { width: 1280, height: 400 });
    expect(at.top).toBe(232);
  });

  it("still anchors to a tile that is off screen below, since neither side can hold the box", () => {
    // The validator's own 1265x260 reproduction: the whole first band is
    // below the fold. `above` is 341 - 12 - 156 = 173, which clears the top
    // inset while the box's bottom (329) sits 69px past the bottom edge --
    // and this is what the function should do, because an anchor off screen
    // has no placement that both keeps its 12px gap and stays in view. What
    // was wrong was calling it a fit; see the `fitsInViewport` block below.
    const at = placePopover(tile({ top: 341, height: 158 }), { width: 268, height: 156 }, { width: 1265, height: 260 });
    expect(at.top).toBe(173);
    expect(at.top + 156).toBe(341 - POPOVER_GAP);
  });

  it("breaks an exact tie in room by going below", () => {
    // 500px viewport, tile [238, 262]: 214 free above, 214 free below.
    const at = placePopover(tile({ top: 238, height: 24 }), { width: 268, height: 400 }, { width: 1280, height: 500 });
    expect(at.top).toBe(274);
  });
});

describe("placePopover -- the horizontal clamp", () => {
  it("centres under the tile when there is room on both sides", () => {
    // 500 + 20 - 134 = 386, which is neither rect.left nor a bound.
    const at = placePopover(tile({ top: 100, left: 500, width: 40, height: 32 }), POPOVER_ESTIMATE, { width: 1280, height: 800 });
    expect(at.left).toBe(386);
  });

  it("clamps at the right edge rather than letting the centred box run past it", () => {
    // Right column of a 768px viewport: centred is 730 + 12 - 134 = 608, and
    // 608 + 268 = 876 is off screen. The bound is 768 - 268 - 12 = 488.
    const at = placePopover(tile({ top: 100, left: 730, width: 24, height: 32 }), POPOVER_ESTIMATE, { width: 768, height: 800 });
    expect(at.left).toBe(488);
  });

  it("clamps at the left edge rather than letting the centred box run past it", () => {
    // Left column: centred is 8 + 12 - 134 = -114, so the gap is the bound.
    const at = placePopover(tile({ top: 100, left: 8, width: 24, height: 32 }), POPOVER_ESTIMATE, { width: 768, height: 800 });
    expect(at.left).toBe(POPOVER_GAP);
  });

  it("pins to the left gap when the viewport is too narrow to hold the box and both gaps", () => {
    // 200px wide: the right bound (200 - 268 - 12 = -80) is left of the left
    // one, so the left gap wins. Below 480px the stylesheet replaces both
    // coordinates with a bottom sheet, so this is what an unreachable-in-
    // practice input does rather than a placement anyone sees -- it is here
    // because the two clamps in the wrong order return -80, which is off
    // screen, and nothing else would catch it.
    const at = placePopover(tile({ top: 100, left: 8, width: 24, height: 32 }), POPOVER_ESTIMATE, { width: 200, height: 800 });
    expect(at.left).toBe(POPOVER_GAP);
  });

  it("does not let the vertical decision move the horizontal one", () => {
    // Same tile and viewport width, two box heights that land it on
    // different sides.
    const anchor = tile({ top: 341, left: 500, width: 40 });
    const belowPlacement = placePopover(anchor, { width: 268, height: 100 }, { width: 1280, height: 900 });
    const abovePlacement = placePopover(anchor, { width: 268, height: 286 }, { width: 1280, height: 720 });
    expect(belowPlacement.top).not.toBe(abovePlacement.top);
    expect(belowPlacement.left).toBe(abovePlacement.left);
  });
});

// D3. These are the only tests that can fail for this defect: correcting the
// predicate moved no placement, verified by running both versions across 1.2
// million tile/box/viewport combinations and getting an identical `top` every
// time. So the fix had to be made observable to be testable at all, which is
// why `fitsInViewport` is exported rather than inlined twice.
describe("fitsInViewport", () => {
  const short = { width: 1265, height: 260 };

  it("says no to a box whose bottom is past the viewport, even though its top clears the inset", () => {
    // The reproduced case, as the predicate sees it: a 156px box at top 173,
    // above a tile at 341 in a 260px viewport. 173 >= 12, so the old
    // top-edge-only test said yes; 173 + 156 = 329 > 248, so this says no.
    expect(fitsInViewport(173, 156, short)).toBe(false);
  });

  it("says no to a box whose top is past the viewport, even though its bottom clears the inset", () => {
    // The mirror, which the old predicate happened to get right on the below
    // branch and would have got wrong had the two been swapped.
    expect(fitsInViewport(-40, 200, short)).toBe(false);
  });

  it("says yes only when both edges are inside their insets", () => {
    expect(fitsInViewport(POPOVER_GAP, 236, short)).toBe(true); // 12 .. 248, flush against both
    expect(fitsInViewport(POPOVER_GAP - 1, 236, short)).toBe(false);
    expect(fitsInViewport(POPOVER_GAP, 237, short)).toBe(false);
  });

  it("agrees with where placePopover actually put the box, on both sides", () => {
    // The predicate and the placement must not drift apart: whenever the box
    // lands on a side, that side is one this says fits -- or neither does and
    // the placement is the deliberate overflow.
    const viewport = { width: 1280, height: 720 };
    const size = { width: 268, height: 286 };
    const anchor = tile({ top: 341, height: 158 });
    const at = placePopover(anchor, size, viewport);
    expect(fitsInViewport(at.top, size.height, viewport)).toBe(true);

    const offScreen = tile({ top: 341, height: 158 });
    const cramped = placePopover(offScreen, { width: 268, height: 156 }, short);
    expect(fitsInViewport(cramped.top, 156, short)).toBe(false);
  });
});

// `samePlacement` is three lines and would not normally earn a describe
// block. It earns one because the thing it guards against is a crash: App.tsx
// used `!==` on `placePopover`'s freshly-allocated result as "something
// changed", which is always true, and the resulting re-place chain took the
// React root down twice. A helper whose whole job is to answer "no" is worth
// checking that it can.
describe("samePlacement", () => {
  it("is true for two different objects holding the same numbers", () => {
    expect(samePlacement({ top: 43, left: 12 }, { top: 43, left: 12 })).toBe(true);
  });

  it("is false when either coordinate differs", () => {
    expect(samePlacement({ top: 43, left: 12 }, { top: 44, left: 12 })).toBe(false);
    expect(samePlacement({ top: 43, left: 12 }, { top: 43, left: 13 })).toBe(false);
  });

  it("is true for two results of the same call, which reference equality never is", () => {
    const anchor = tile();
    const first = placePopover(anchor, POPOVER_ESTIMATE, { width: 1280, height: 900 });
    const second = placePopover(anchor, POPOVER_ESTIMATE, { width: 1280, height: 900 });
    expect(first === second).toBe(false);
    expect(samePlacement(first, second)).toBe(true);
  });

  it("treats a missing placement as not the same, so a first placement always applies", () => {
    expect(samePlacement(null, { top: 43, left: 12 })).toBe(false);
    expect(samePlacement({ top: 43, left: 12 }, undefined)).toBe(false);
    expect(samePlacement(null, null)).toBe(false);
  });

  it("does not treat a sub-pixel difference as the same, since the rendered style carries it", () => {
    // Real rects are fractional -- 310.891px was measured on the built app --
    // so rounding here would pin the popover a fraction off its anchor and
    // call it settled.
    expect(samePlacement({ top: 310.891, left: 12 }, { top: 310.9, left: 12 })).toBe(false);
  });
});

// The property the two shipped defects both violated, asserted over a grid
// rather than at the handful of points that happened to be reproduced. A
// chosen-point test proves the point; this proves the rule, which is what a
// placement function is. Both branches are counted at the end, so a change
// that makes one of them unreachable fails here rather than quietly narrowing
// what the grid covers.
describe("placePopover -- the box never covers the tile", () => {
  const viewports = [
    { width: 1280, height: 900 },
    { width: 1280, height: 720 },
    { width: 1280, height: 600 },
    { width: 900, height: 400 },
    { width: 885, height: 235 },
    { width: 768, height: 1024 },
  ];
  const tops = [-60, 0, 40, 100, 240, 341, 500, 700, 880];
  const heights = [24, 60, 158, 320];
  const boxHeights = [80, 141, 246, 286, 400, 540];
  const lefts = [-20, 8, 500, 1200];

  it("keeps the popover's own span clear of the tile's, for every tile and viewport in the grid", () => {
    let below = 0;
    let above = 0;
    for (const viewport of viewports) {
      for (const top of tops) {
        for (const height of heights) {
          for (const boxHeight of boxHeights) {
            for (const left of lefts) {
              const anchor = tile({ top, left, height });
              const at = placePopover(anchor, { width: 268, height: boxHeight }, viewport);
              const where = `tile top ${top} h${height} left ${left}, box ${boxHeight}, viewport ${viewport.width}x${viewport.height}`;

              if (at.top >= anchor.top + anchor.height) {
                // Placed below: one gap under the tile, exactly.
                expect(at.top, where).toBe(anchor.top + anchor.height + POPOVER_GAP);
                below += 1;
              } else {
                // Placed above: one gap over the tile, exactly.
                expect(at.top + boxHeight, where).toBe(anchor.top - POPOVER_GAP);
                above += 1;
              }
            }
          }
        }
      }
    }
    expect(below).toBeGreaterThan(0);
    expect(above).toBeGreaterThan(0);
    expect(below + above).toBe(viewports.length * tops.length * heights.length * boxHeights.length * lefts.length);
  });

  // D3: "fits" has to mean the whole box is inside the viewport, on both
  // sides. The old `fitsAbove` checked the box's top against the inset and
  // never its bottom, so an anchor scrolled below the fold reported a fit for
  // a box that hung past the bottom edge. This asserts the honest version
  // over the same grid: whenever the placement is a claimed fit -- which is
  // exactly when the box lands wholly on screen -- both its edges are inside.
  it("never reports a fit for a box that would land outside the viewport", () => {
    let fits = 0;
    let overflows = 0;
    for (const viewport of viewports) {
      for (const top of tops) {
        for (const height of heights) {
          for (const boxHeight of boxHeights) {
            const anchor = tile({ top, height });
            const at = placePopover(anchor, { width: 268, height: boxHeight }, viewport);
            const where = `tile top ${top} h${height}, box ${boxHeight}, viewport ${viewport.height}`;

            // The two fit tests, restated here rather than imported, so a
            // change to the predicate has to be made in two places that
            // disagree loudly rather than in one that quietly redefines what
            // the test means.
            const below = anchor.top + anchor.height + POPOVER_GAP;
            const above = anchor.top - POPOVER_GAP - boxHeight;
            const inside = (candidate: number) => candidate >= POPOVER_GAP && candidate + boxHeight <= viewport.height - POPOVER_GAP;

            if (inside(below) || inside(above)) {
              // A side fit, so the placement must be one of them and wholly
              // on screen -- never the overflowing fallback.
              expect(at.top === below || at.top === above, where).toBe(true);
              expect(inside(at.top), where).toBe(true);
              fits += 1;
            } else {
              overflows += 1;
            }
          }
        }
      }
    }
    expect(fits).toBeGreaterThan(0);
    expect(overflows).toBeGreaterThan(0);
  });

  it("keeps the popover inside the viewport horizontally, for every tile and viewport in the grid", () => {
    for (const viewport of viewports) {
      for (const left of [-400, -20, 0, 8, 300, 640, 1200, 2000]) {
        const at = placePopover(tile({ left }), POPOVER_ESTIMATE, viewport);
        const where = `tile left ${left}, viewport ${viewport.width}`;
        expect(at.left, where).toBeGreaterThanOrEqual(POPOVER_GAP);
        // Every viewport in the list holds the box and its two gaps, so the
        // right bound is the meaningful one here; `Math.max` is for a list
        // that later gains a narrower entry.
        expect(at.left, where).toBeLessThanOrEqual(Math.max(POPOVER_GAP, viewport.width - POPOVER_ESTIMATE.width - POPOVER_GAP));
      }
    }
  });
});
