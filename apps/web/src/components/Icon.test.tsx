// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FLYIO_ICON_FIXTURE, THESVG_ICON_FIXTURE } from "../test-support/fixtures.js";
import { Icon } from "./Icon.js";

afterEach(() => {
  cleanup();
});

describe("Icon", () => {
  it("renders the resolved icon's viewBox and body markup when icon is present", () => {
    const { container } = render(<Icon icon={FLYIO_ICON_FIXTURE} rollup="hosting" label="Fly.io" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe(FLYIO_ICON_FIXTURE.viewBox);
    const path = container.querySelector("path");
    expect(path?.getAttribute("d")).toBe("M0 0h24v24H0z");
    expect(container.querySelector('[data-testid="icon-fallback"]')).toBeNull();
  });

  it("renders the rollup's fallback glyph when icon is null", () => {
    const { container } = render(<Icon icon={null} rollup="database" label="Mystery DB" />);
    expect(container.querySelector('[data-testid="icon-fallback"]')).not.toBeNull();
    // The fallback path is never mistaken for a real brand path -- there is
    // no <path d="..."> carrying arbitrary brand-shaped data in this case.
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("falls back to the neutral default glyph for a rollup the fallback table doesn't name", () => {
    const { container } = render(<Icon icon={null} rollup="some-rollup-nobody-mapped" label="Widget" />);
    expect(container.querySelector('[data-testid="icon-fallback"]')).not.toBeNull();
    expect(container.querySelector("svg polygon")).not.toBeNull();
  });

  // Regression. `rollup` is the segment of `role` before the first "-", and
  // the schema's slug pattern admits "constructor" -- `catalogus validate`
  // passes it and `catalogus graph` prints it. While the glyph table was a
  // plain object literal, this lookup resolved through Object.prototype to
  // the `Object` function: truthy and callable, so React rendered it as a
  // component, threw error #31, and took the *entire page* down -- one bad
  // node blanking every other node with no error UI. The three tests above
  // all passed with that live, because each names a rollup that is merely
  // absent rather than inherited. "constructor" is the only Object.prototype
  // key the lowercase-only slug pattern can express, and one is enough.
  it("renders the neutral glyph for rollup 'constructor' rather than inheriting Object.prototype", () => {
    const { container } = render(<Icon icon={null} rollup="constructor" label="Prototype probe" />);
    expect(container.querySelector('[data-testid="icon-fallback"]')).not.toBeNull();
    expect(container.querySelector("svg polygon")).not.toBeNull();
  });

  // The three colour modes live in Icon.module.css, and jsdom never computes
  // styles (token-references.test.ts's own header makes the same point) --
  // so what these tests can and do pin is the *mechanism* CSS reads off: the
  // `.colour` class toggle and the one JS-side `color` value, never the
  // rendered pixel. A real-browser check of the resulting colour is
  // docs/icons-brief.md's job for the validation pass, not this file's.
  describe("the colour mechanism", () => {
    it("adds no colour class, and sets no inline style, by default (monochrome)", () => {
      const { container } = render(<Icon icon={FLYIO_ICON_FIXTURE} rollup="hosting" label="Fly.io" />);
      const wrapper = container.querySelector("span");
      const svg = container.querySelector("svg");
      expect(wrapper?.className).not.toContain("colour");
      expect(svg?.getAttribute("style")).toBeNull();
    });

    it("sets the svg's `color` to the resolved hex when colour is asked for and a single-ink hex resolved", () => {
      const { container } = render(<Icon icon={FLYIO_ICON_FIXTURE} rollup="hosting" label="Fly.io" colour />);
      const wrapper = container.querySelector("span");
      const svg = container.querySelector("svg");
      expect(wrapper?.className).toContain("colour");
      // jsdom's own CSSOM (cssstyle) normalises a hex colour value to
      // rgb(...) the moment it is set through the DOM style object -- this
      // is that normalised form of FLYIO_ICON_FIXTURE.hex ("#24175B"), not a
      // hand-rolled expectation.
      expect(svg?.style.color).toBe("rgb(36, 23, 91)");
    });

    it("sets no inline colour, even with colour asked for, when the mark is multi-colour (hex is null)", () => {
      const { container } = render(<Icon icon={THESVG_ICON_FIXTURE} rollup="language" label="C#" colour />);
      const wrapper = container.querySelector("span");
      const svg = container.querySelector("svg");
      // The mode toggle still applies -- colour was asked for -- but there is
      // no single colour to hand back for a multi-colour mark, so the mark
      // keeps its own fills untouched by this component.
      expect(wrapper?.className).toContain("colour");
      expect(svg?.getAttribute("style")).toBeNull();
    });
  });

  // The knockout element survives `dangerouslySetInnerHTML` intact -- this
  // is the DOM-shape half of Icon.module.css's `[data-knockout]` rule; the
  // painted colour it produces is, again, a real-browser question.
  it("carries the resolved body's data-knockout element through to the DOM untouched", () => {
    const { container } = render(<Icon icon={THESVG_ICON_FIXTURE} rollup="language" label="C#" colour />);
    const knockout = container.querySelector("[data-knockout]");
    expect(knockout).not.toBeNull();
    expect(knockout?.hasAttribute("fill")).toBe(false);
  });
});
