// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  // The stylesheet is mocked to a **real plain object** here, and that
  // substitution is the whole test.
  //
  // Without it this was inert, and had been since it was written. Vitest's
  // CSS-modules handling hands components a proxy that fabricates a string for
  // *any* key it is asked for -- `toString` included -- so `styles["toString"]`
  // came back as a harmless generated class name and this passed against source
  // with the own-property guard deleted. It was a test of the test harness, not
  // of the component.
  //
  // It matters more here than most places: this file's own header records that
  // the prototype-inheritance defect has landed five times in this repo, and
  // the guard this test exists to protect was the one instance closed as a
  // precaution rather than after a live bug. A precaution nobody can verify is
  // not a precaution.
  //
  // A plain `{}` has a real prototype chain, so `styles["toString"]` resolves to
  // `Function.prototype.toString` and React renders a function into a class
  // attribute -- the actual defect. Found by the agent that rewrote the viewer
  // tests, which hit the same inertness in its own new `Tag.test.tsx` and
  // traced it back here; both are fixed the same way in the same commit.
  it("does not inherit a className from Object.prototype for a key the stylesheet has no rule for", async () => {
    vi.doMock("./StatusPill.module.css", () => ({ default: {} }));
    vi.resetModules();
    const { StatusPill: StatusPillWithRealStyles } = await import("./StatusPill.js");

    const { container } = render(<StatusPillWithRealStyles status={"toString" as never} />);
    const className = container.firstElementChild?.getAttribute("class") ?? "";
    expect(className).not.toContain("function");
    expect(className).not.toContain("[native code]");

    vi.doUnmock("./StatusPill.module.css");
    vi.resetModules();
  });
});
