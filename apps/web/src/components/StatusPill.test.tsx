// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatusPill } from "./StatusPill.js";

afterEach(() => {
  cleanup();
});

describe("StatusPill", () => {
  it.each([
    ["active", "active"],
    ["phasing_out", "phasing out"],
    ["deprecated", "deprecated"],
    ["removed", "removed"],
  ] as const)("renders %s as the word %s", (status, label) => {
    render(<StatusPill status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  // The prototype-inheritance test. `status` is a schema enum and `catalogus
  // view` refuses an invalid manifest, so this input cannot arrive today
  // through the app's own path -- which is exactly the argument that was
  // made for the two lookups that then shipped this bug (see StatusPill.tsx's
  // own comment, and docs/PLAN.md's "one defect class this repo keeps
  // producing"). The test is here so the property holds because it is
  // enforced rather than because a caller elsewhere happens to be careful.
  //
  // Cast at the call site rather than widening StatusPillProps: the type
  // should stay the four legal values, and this test's whole point is to
  // describe what happens when something gets past it at runtime.
  it("renders a prototype key like 'constructor' as text, rather than resolving Object through the prototype chain", () => {
    const { container } = render(<StatusPill status={"constructor" as never} />);
    expect(container.textContent).toBe("constructor");
  });

  it("does not inherit a className from Object.prototype for a key the stylesheet has no rule for", () => {
    const { container } = render(<StatusPill status={"toString" as never} />);
    const className = container.firstElementChild?.getAttribute("class") ?? "";
    expect(className).not.toContain("function");
    expect(className).not.toContain("[native code]");
  });
});
