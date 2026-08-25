// @vitest-environment jsdom
//
// Tag renders one mark from service-tags.ts's vocabulary and decides
// nothing itself.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Tag as TagData } from "../service-tags.js";
import { Tag } from "./Tag.js";

afterEach(() => cleanup());

describe("Tag", () => {
  it("shows the label and carries the title as the long-form explanation", () => {
    const tag: TagData = { id: "deprecated", label: "deprecated", tone: "ink-solid", title: "Should not be used." };
    render(<Tag tag={tag} />);
    const el = screen.getByText("deprecated");
    expect(el.getAttribute("title")).toBe("Should not be used.");
  });

  // `tone` is a closed union rather than manifest data, so this cannot
  // happen through a real payload -- the same argument StatusPill.tsx's
  // header records was made once before and was wrong. The own-property
  // guard is a belt kept regardless of whether this particular caller is
  // safe today.
  // The stylesheet is mocked to a **real plain object** for this one test, and
  // that substitution is the entire point of it.
  //
  // Without it the test is inert, and was. Vitest's CSS-modules handling hands
  // components a proxy that fabricates a string for *any* key it is asked for
  // -- including `toString` -- so `styles["toString"]` came back as a harmless
  // generated class name and the assertion below passed against source with the
  // guard removed. It proved nothing. It is worth stating plainly because the
  // test looked exactly like a test that worked, and this repo's recurring
  // failure is a plausible-looking thing nobody goes back and checks.
  //
  // A plain `{}` has a real prototype chain, so `styles["toString"]` resolves to
  // `Function.prototype.toString` and React is handed a function to render into
  // a class attribute -- which is the actual defect being guarded against, and
  // the reason `Tag.tsx` uses an own-property test rather than a bare index.
  //
  // **The identical test in `StatusPill.test.tsx` has the same flaw**, and is
  // fixed the same way in the same commit.
  it("does not resolve an Object.prototype member name through the prototype chain into the class attribute", async () => {
    vi.doMock("./Tag.module.css", () => ({ default: {} }));
    vi.resetModules();
    const { Tag: TagWithRealStyles } = await import("./Tag.js");

    const tag = { id: "x", label: "x", tone: "toString", title: "x" } as unknown as TagData;
    const { container } = render(<TagWithRealStyles tag={tag} />);
    const className = container.firstElementChild?.getAttribute("class") ?? "";
    expect(className).not.toContain("function");
    expect(className).not.toContain("[native code]");

    vi.doUnmock("./Tag.module.css");
    vi.resetModules();
  });
});
