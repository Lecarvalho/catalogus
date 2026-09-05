// @vitest-environment jsdom
//
// This panel's own content: the two links, the CLI block reading off its
// props rather than the mockup's stale text, the version, and the keyboard
// shortcuts list, real and expandable. AppShell.test.tsx covers the shell
// around it -- opening/closing, one-at-a-time, focus and the `?` shortcut
// this file's button advertises but does not itself bind (AppShell.tsx owns
// the key, since it is the file that knows which menu is open).
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DOCUMENTATION_URL, MANIFEST_FORMAT_REFERENCE_URL } from "../links.js";
import { HelpMenu, KEYBOARD_SHORTCUTS } from "./HelpMenu.js";

afterEach(() => cleanup());

function renderHelp(overrides: { cliCommands?: string[]; cliVersion?: string } = {}) {
  const rootRef = createRef<HTMLDivElement>();
  render(<HelpMenu rootRef={rootRef} cliCommands={overrides.cliCommands ?? ["init", "detect", "view"]} cliVersion={overrides.cliVersion ?? "9.9.9"} />);
  return rootRef;
}

describe("HelpMenu", () => {
  it("is a labelled menu", () => {
    renderHelp();
    expect(screen.getByRole("menu", { name: "Help" })).not.toBeNull();
  });

  it("links Documentation and the manifest format reference at links.ts's own URLs", () => {
    renderHelp();
    const documentation = screen.getByRole("menuitem", { name: "Documentation" });
    expect(documentation.getAttribute("href")).toBe(DOCUMENTATION_URL);
    const manifestReference = screen.getByRole("menuitem", { name: "Manifest format reference" });
    expect(manifestReference.getAttribute("href")).toBe(MANIFEST_FORMAT_REFERENCE_URL);
  });

  it("renders exactly the payload's cliCommands, dot-separated, in the payload's own order", () => {
    renderHelp({ cliCommands: ["init", "detect", "diff", "view"] });
    expect(screen.getByText("init · detect · diff · view")).not.toBeNull();
  });

  it("renders the payload's version, not a literal", () => {
    renderHelp({ cliVersion: "1.2.3" });
    expect(screen.getByText("catalogus 1.2.3")).not.toBeNull();
  });

  it("starts with the shortcut list collapsed", () => {
    renderHelp();
    expect(screen.queryByText("Open this help panel")).toBeNull();
    const toggle = screen.getByRole("menuitem", { name: /Keyboard shortcuts/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("expands the real shortcut list on click, and collapses it again", () => {
    renderHelp();
    const toggle = screen.getByRole("menuitem", { name: /Keyboard shortcuts/ });

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(screen.getByText(shortcut.description)).not.toBeNull();
    }

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(KEYBOARD_SHORTCUTS[0]!.description)).toBeNull();
  });

  // Not invented: exactly the app's real handlers, not a plausible-looking
  // longer list -- see this component's own header for provenance.
  it("lists no shortcut beyond the real, transcribed set", () => {
    renderHelp();
    fireEvent.click(screen.getByRole("menuitem", { name: /Keyboard shortcuts/ }));
    const rows = screen.getAllByRole("definition");
    expect(rows).toHaveLength(KEYBOARD_SHORTCUTS.length);
  });

  it("hands its root node to the caller's ref, for AppShell's focus and Tab-trap wiring", () => {
    const rootRef = renderHelp();
    expect(rootRef.current).not.toBeNull();
    expect(rootRef.current?.getAttribute("role")).toBe("menu");
  });
});
