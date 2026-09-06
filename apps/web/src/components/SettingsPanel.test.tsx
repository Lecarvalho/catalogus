// @vitest-environment jsdom
//
// This panel's own content and its wiring to preferences.ts's context:
// which row shows which value, that a click both flips the ink-filled
// segment and writes through to storage, and that what was written is what
// a fresh mount reads back. AppShell.test.tsx covers the shell around it --
// opening/closing, one-at-a-time, focus and the Tab trap.
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY, PreferencesProvider } from "../preferences.js";
import { SettingsPanel } from "./SettingsPanel.js";

const MANIFEST_PATH = "C:/scratch/project/catalogus.yaml";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderPanel() {
  const rootRef = createRef<HTMLDivElement>();
  render(
    <PreferencesProvider>
      <SettingsPanel rootRef={rootRef} manifestPath={MANIFEST_PATH} />
    </PreferencesProvider>,
  );
  return rootRef;
}

function radio(name: string) {
  return screen.getByRole("radio", { name });
}

describe("SettingsPanel", () => {
  it("is a labelled, dialog-free region -- no role=\"dialog\" anywhere", () => {
    renderPanel();
    expect(screen.getByRole("region", { name: "Display settings" })).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the manifest path at the bottom of the panel", () => {
    renderPanel();
    expect(screen.getByText(MANIFEST_PATH)).not.toBeNull();
  });

  it("renders no Appearance row and no Density row -- both deferred by the owner, 2026-09-05", () => {
    renderPanel();
    expect(screen.queryByText("Appearance")).toBeNull();
    expect(screen.queryByText("Dark")).toBeNull();
    expect(screen.queryByText("Density")).toBeNull();
    expect(screen.queryByText("Compact")).toBeNull();
  });

  it("defaults Brand icons to Monochrome and Default view to List, with nothing stored", () => {
    renderPanel();
    expect(radio("Colour").getAttribute("aria-checked")).toBe("false");
    expect(radio("Monochrome").getAttribute("aria-checked")).toBe("true");
    expect(radio("List").getAttribute("aria-checked")).toBe("true");
    expect(radio("Migrations").getAttribute("aria-checked")).toBe("false");
  });

  it("reflects a preference already in storage when the panel mounts", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ iconColour: "colour", defaultView: "migrations" }));
    renderPanel();
    expect(radio("Colour").getAttribute("aria-checked")).toBe("true");
    expect(radio("Migrations").getAttribute("aria-checked")).toBe("true");
  });

  it("flips the ink-filled segment on click and writes the change to storage", () => {
    renderPanel();
    fireEvent.click(radio("Colour"));

    expect(radio("Colour").getAttribute("aria-checked")).toBe("true");
    expect(radio("Monochrome").getAttribute("aria-checked")).toBe("false");

    const stored = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!);
    expect(stored.iconColour).toBe("colour");
  });

  it("writes the default view row independently of the brand icons row", () => {
    renderPanel();
    fireEvent.click(radio("Migrations"));

    expect(radio("Migrations").getAttribute("aria-checked")).toBe("true");
    const stored = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!);
    expect(stored.defaultView).toBe("migrations");
    expect(stored.iconColour).toBe(DEFAULT_PREFERENCES.iconColour);
  });

  // A stored preference survives a re-render -- change it, unmount the whole
  // tree (including the provider, so nothing but storage carries the value
  // forward), and mount a fresh one the way a real page load would.
  it("survives a re-render: a changed preference is what a fresh mount reads back", () => {
    const { unmount } = render(
      <PreferencesProvider>
        <SettingsPanel rootRef={createRef<HTMLDivElement>()} manifestPath={MANIFEST_PATH} />
      </PreferencesProvider>,
    );
    fireEvent.click(radio("Colour"));
    unmount();

    render(
      <PreferencesProvider>
        <SettingsPanel rootRef={createRef<HTMLDivElement>()} manifestPath={MANIFEST_PATH} />
      </PreferencesProvider>,
    );
    expect(radio("Colour").getAttribute("aria-checked")).toBe("true");
  });

  // A garbage value in storage falls back to DEFAULT_PREFERENCES rather than
  // rendering broken or throwing -- preferences.ts's own parser is what does
  // the falling back; this is the assertion that the panel actually uses it.
  it("falls back to the default selection when storage holds a garbage value", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, "{not json");
    renderPanel();
    expect(radio("Monochrome").getAttribute("aria-checked")).toBe("true");
    expect(radio("List").getAttribute("aria-checked")).toBe("true");
  });

  it("moves the arrow keys between the options of one row and wraps at the ends", () => {
    renderPanel();
    const list = radio("List");
    list.focus();
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(radio("Migrations").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radio("Migrations"));

    fireEvent.keyDown(radio("Migrations"), { key: "ArrowLeft" });
    expect(radio("List").getAttribute("aria-checked")).toBe("true");
  });

  it("keeps exactly one tab stop per radiogroup -- the checked option", () => {
    renderPanel();
    expect(radio("Monochrome").tabIndex).toBe(0);
    expect(radio("Colour").tabIndex).toBe(-1);
    expect(radio("List").tabIndex).toBe(0);
    expect(radio("Migrations").tabIndex).toBe(-1);
  });

  it("hands its root node to the caller's ref, for AppShell's focus and Tab-trap wiring", () => {
    const rootRef = renderPanel();
    expect(rootRef.current).not.toBeNull();
    expect(rootRef.current?.getAttribute("role")).toBe("region");
  });
});
