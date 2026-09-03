// Where the hover popover goes, as arithmetic rather than as DOM. Pure and
// window-free for the same reason graph-layout.ts and hash-route.ts are: the
// rules are the part that keeps getting this wrong, and rules that live
// inside a `useCallback` can only be tested by rendering a component,
// stubbing a viewport and reading an inline style back -- which is how two
// vertical-placement defects reached the built app with App.test.tsx green.
//
// App.tsx keeps the impure half: reading the anchor's and the popover's own
// `getBoundingClientRect()`, and `document.documentElement.clientWidth` /
// `clientHeight` for the viewport (see its own comment on why not
// `window.innerWidth`/`innerHeight`).
//
// **The heights that arrive here are measured, never estimated.** That
// distinction is the whole reason this module exists. The version this
// replaced decided the vertical placement from two numbers that stood in for
// the box's height -- a 250px "ordinary case" for whether to flip, and the
// stylesheet's `max-height: 60vh` ceiling for where the flip's top went --
// and both were wrong in the same direction, measured on the built app at
// 1280x720 against examples/layout-stress.catalogus.yaml:
//
//   - The real box is 246-291px tall there, and 329px of room was free above
//     every first-band tile. The ceiling (432px at that height) did not fit
//     in it, so the flip was declined and the popover ran 37-82px past the
//     bottom edge -- on a mainstream laptop viewport, not an edge case. At
//     1280x600 the overrun was about 197px.
//   - Where the flip *was* taken, the top was placed as if the box were
//     exactly the ceiling tall. A 246px box under a 540px ceiling floated
//     306px above the tile it describes instead of 12 (measured, 1280x900),
//     and any disagreement between the JS `clientHeight` and the CSS `vh`
//     unit that resolves `max-height` -- a horizontal scrollbar is enough --
//     pushes the box's bottom the other way, into the tile.
//
// A measured height ends both, because the box's bottom edge is then a
// number this function knows rather than one it is betting on.

/** A tile's box in viewport coordinates -- exactly what `getBoundingClientRect()` returns, narrowed to the four fields this needs. */
export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The popover's own rendered box, measured after it mounts. */
export interface PopoverSize {
  width: number;
  height: number;
}

/** The viewport the popover is `position: fixed` against. */
export interface Viewport {
  width: number;
  height: number;
}

/** Viewport-relative `top`/`left`, the two numbers ServicePopover renders as an inline style. */
export interface Placement {
  top: number;
  left: number;
}

/**
 * The inset the popover keeps from the tile it describes and from every
 * viewport edge. One number for both, because they are the same promise: the
 * box never touches the thing it is next to.
 */
export const POPOVER_GAP = 12;

/**
 * What to assume before the popover has been measured -- the first paint of a
 * peek, when there is no rendered box to read a height off yet.
 *
 * The width is the stylesheet's own (`ServicePopover.module.css`, `.popover`
 * is `width: 268px`), so the horizontal placement is exact from the first
 * frame. The height is the ordinary case -- a head, three rows of two facts,
 * sometimes a note -- and it is an estimate, which is why App.tsx corrects it
 * in a layout effect before the browser paints rather than leaving it on
 * screen. It exists to avoid a flash, not to decide anything: every placement
 * a reader actually sees is made from a measured height.
 */
export const POPOVER_ESTIMATE: PopoverSize = { width: 268, height: 250 };

/**
 * Whether a box of `height` placed at `top` lands wholly inside the viewport,
 * both edges clear of `POPOVER_GAP`. This is what "fits" means for either
 * side, and it is exported because it is the only way to test that it means
 * that: correcting it changed no placement at all.
 *
 * That is worth stating precisely, because it is the whole shape of the
 * defect. `fitsAbove` used to test the box's top against the inset and never
 * its bottom, so a tile scrolled below the fold was reported as fitting above
 * while the box it reported on hung 69px past the bottom edge (measured,
 * 1265x260). Comparing the two versions across 1.2 million tile/box/viewport
 * combinations returns an identical `top` every time: when the anchor is off
 * screen the fallback's room comparison picks the same side the lying
 * predicate did, because the side the tile is *not* on can never have more
 * room. So nothing a reader sees moved -- what moved is that the function no
 * longer answers "yes, it fits" about a box that is off screen, which is an
 * answer the next change to this file would have built on.
 */
export function fitsInViewport(top: number, height: number, viewport: Viewport): boolean {
  return top >= POPOVER_GAP && top + height <= viewport.height - POPOVER_GAP;
}

/**
 * Places the popover against its tile.
 *
 * Horizontal: centred under the tile, clamped `POPOVER_GAP` inside both
 * viewport edges. This half was already right and is unchanged -- the mockup
 * centres with `left: 50%; transform: translateX(-50%)`, which cannot notice
 * an edge, and the clamp is the whole fix (docs/candidates/README.md, "Known
 * limitation in E"). When the viewport is narrower than the popover plus two
 * gaps the left clamp wins, which pins the box to the left edge rather than
 * to a bound that is left of it; below 480px the stylesheet overrides both
 * coordinates with a bottom sheet anyway.
 *
 * Vertical: below if the whole box fits below, else above if the whole box
 * fits above, else the side with more room. The last case is the one worth
 * stating, because it is where the previous version went wrong: a box that
 * cannot fit overflows **away** from the tile, never over it. Placed below,
 * its top edge sits exactly `POPOVER_GAP` under the tile and it runs past the
 * bottom of the viewport; placed above, its bottom edge sits exactly
 * `POPOVER_GAP` over the tile and it runs past the top. Either way the edge
 * nearest the tile is pinned to the tile, so the popover and the thing it
 * describes are never on top of each other -- which holds for every input,
 * not just the reachable ones, and popover-placement.test.ts asserts it over
 * a grid rather than at three chosen points.
 *
 * "Fits" is `fitsInViewport` above, the same test on both sides -- see its
 * own note for the asymmetry it replaced and why correcting it moved nothing.
 *
 * The overflow is not free and is not hidden: the far end of an overflowing
 * popover is off screen and cannot be scrolled to, because the box is
 * `position: fixed`. `max-height: 60vh` plus `overflow-y: auto` in
 * ServicePopover.module.css is what keeps that from mattering in practice --
 * a box the browser will never render taller than 60% of the viewport
 * overflows only when the tile leaves it less than that on both sides, which
 * needs a tile taller than 40% of the viewport height or one already
 * partly off screen.
 *
 * A tie in the last case goes below, matching the preference the first branch
 * states.
 */
export function placePopover(tile: AnchorRect, popover: PopoverSize, viewport: Viewport): Placement {
  const centred = tile.left + tile.width / 2 - popover.width / 2;
  const left = Math.max(POPOVER_GAP, Math.min(centred, viewport.width - popover.width - POPOVER_GAP));

  // The two candidate tops, each pinning the edge nearest the tile.
  const below = tile.top + tile.height + POPOVER_GAP;
  const above = tile.top - POPOVER_GAP - popover.height;

  // The same test on both sides -- see `fitsInViewport` for why it is one
  // function rather than two inline comparisons, and for what the asymmetric
  // version it replaced got wrong.
  const fitsBelow = fitsInViewport(below, popover.height, viewport);
  const fitsAbove = fitsInViewport(above, popover.height, viewport);

  if (fitsBelow) {
    return { top: below, left };
  }
  if (fitsAbove) {
    return { top: above, left };
  }

  // Neither side holds the box. Both of these are the space a popover could
  // occupy on that side while keeping its gap from the tile and its gap from
  // the viewport edge -- the same quantity the two `fits` tests above compare
  // the height against, so "more room" means "less overflow", not something
  // measured differently.
  const roomBelow = viewport.height - POPOVER_GAP - below;
  const roomAbove = tile.top - POPOVER_GAP - POPOVER_GAP;
  return { top: roomAbove > roomBelow ? above : below, left };
}

/**
 * Whether two placements put the box in the same place. Numeric, not
 * reference, comparison: every call to `placePopover` allocates a fresh
 * object, so `===` on the results is always false and a caller that reuses
 * it as "nothing changed" never stops updating.
 *
 * That is not hypothetical. It is the mechanism behind an intermittent
 * `Minified React error #185` (maximum update depth) a validator hit twice on
 * the built viewer while scrolling with a popover open: App.tsx's re-place
 * path allocated a new peek on every scroll tick whether or not the numbers
 * had moved, each allocation re-ran the measuring layout effect, and the only
 * thing standing between that and an unbounded loop was the hope that a
 * re-measure would agree. Both callers now route through this instead.
 *
 * `null`/`undefined` on either side is "not the same", so a first placement
 * always applies.
 */
export function samePlacement(a: Placement | null | undefined, b: Placement | null | undefined): boolean {
  return a != null && b != null && a.top === b.top && a.left === b.left;
}
