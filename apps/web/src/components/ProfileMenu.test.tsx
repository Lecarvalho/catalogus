// @vitest-environment jsdom
//
// This menu's own content: no name, no email, no plan, no "Account", no
// "Sign out" -- all five would announce an account system this repo does not
// have (docs/menus-brief.md, owner answer 1) -- and that Preferences /
// Keyboard shortcuts route to the other two panels rather than duplicating
// them. AppShell.test.tsx covers the shell around it.
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DOCUMENTATION_URL } from "../links.js";
import { ProfileMenu } from "./ProfileMenu.js";

afterEach(() => cleanup());

function renderMenu(overrides: { onOpenPreferences?: () => void; onOpenKeyboardShortcuts?: () => void } = {}) {
  const rootRef = createRef<HTMLDivElement>();
  const onOpenPreferences = overrides.onOpenPreferences ?? vi.fn();
  const onOpenKeyboardShortcuts = overrides.onOpenKeyboardShortcuts ?? vi.fn();
  render(<ProfileMenu rootRef={rootRef} onOpenPreferences={onOpenPreferences} onOpenKeyboardShortcuts={onOpenKeyboardShortcuts} />);
  return { rootRef, onOpenPreferences, onOpenKeyboardShortcuts };
}

describe("ProfileMenu", () => {
  it("is a labelled menu", () => {
    renderMenu();
    expect(screen.getByRole("menu", { name: "Profile" })).not.toBeNull();
  });

  // The mockup's account block named a real person -- this repo's owner --
  // by name and email. Neither may ever appear here: there is no account
  // system, so there is nothing truthful to render in their place.
  it("names no person and states no account, only that there is none yet", () => {
    renderMenu();
    expect(screen.queryByText("Leandro Carvalho")).toBeNull();
    expect(screen.queryByText(/dsnktec@gmail\.com/)).toBeNull();
    expect(screen.queryByText(/Personal workspace/)).toBeNull();
    expect(screen.getByText(/There is no account yet/)).not.toBeNull();
  });

  it("renders no Account item and no Sign out item -- both would announce an account that does not exist", () => {
    renderMenu();
    expect(screen.queryByRole("menuitem", { name: "Account" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Sign out" })).toBeNull();
  });

  it("opens Preferences into the settings panel rather than rendering settings itself", () => {
    const onOpenPreferences = vi.fn();
    renderMenu({ onOpenPreferences });
    fireEvent.click(screen.getByRole("menuitem", { name: "Preferences" }));
    expect(onOpenPreferences).toHaveBeenCalledTimes(1);
  });

  it("opens Keyboard shortcuts into the help panel rather than rendering a second shortcut list", () => {
    const onOpenKeyboardShortcuts = vi.fn();
    renderMenu({ onOpenKeyboardShortcuts });
    fireEvent.click(screen.getByRole("menuitem", { name: "Keyboard shortcuts" }));
    expect(onOpenKeyboardShortcuts).toHaveBeenCalledTimes(1);
  });

  it("links Documentation at links.ts's own URL", () => {
    renderMenu();
    const link = screen.getByRole("menuitem", { name: "Documentation" });
    expect(link.getAttribute("href")).toBe(DOCUMENTATION_URL);
  });

  it("hands its root node to the caller's ref, for AppShell's focus and Tab-trap wiring", () => {
    const { rootRef } = renderMenu();
    expect(rootRef.current).not.toBeNull();
    expect(rootRef.current?.getAttribute("role")).toBe("menu");
  });
});
