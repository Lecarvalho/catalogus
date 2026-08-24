// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Icon } from "./Icon.js";

afterEach(() => {
  cleanup();
});

describe("Icon", () => {
  it("renders the resolved brand path when iconPath is present", () => {
    const { container } = render(<Icon iconPath="M12 0L1.605 6" rollup="hosting" label="Fly.io" />);
    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("d")).toBe("M12 0L1.605 6");
    expect(container.querySelector('[data-testid="icon-fallback"]')).toBeNull();
  });

  it("renders the rollup's fallback glyph when iconPath is null", () => {
    const { container } = render(<Icon iconPath={null} rollup="database" label="Mystery DB" />);
    expect(container.querySelector('[data-testid="icon-fallback"]')).not.toBeNull();
    // The fallback path is never mistaken for a real brand path -- there is
    // no <path d="..."> carrying arbitrary brand-shaped data in this case.
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("falls back to the neutral default glyph for a rollup the fallback table doesn't name", () => {
    const { container } = render(<Icon iconPath={null} rollup="some-rollup-nobody-mapped" label="Widget" />);
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
    const { container } = render(<Icon iconPath={null} rollup="constructor" label="Prototype probe" />);
    expect(container.querySelector('[data-testid="icon-fallback"]')).not.toBeNull();
    expect(container.querySelector("svg polygon")).not.toBeNull();
  });
});
