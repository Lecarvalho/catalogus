// @vitest-environment jsdom
//
// The pure half of preferences.ts: parsing, loading and saving, and the
// tolerance every one of those three promises. The React half (the context
// and its provider) is exercised through the components that actually mount
// it -- SettingsPanel.test.tsx (writes), ServiceTile.test.tsx (reads
// `iconColour` live) and App.test.tsx (mounts the provider and reads
// `defaultView` once) -- rather than in isolation here, the same division
// AppShell.test.tsx already draws between "what this file decides" and "what
// a sibling's own test covers".
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  loadPreferences,
  parsePreferences,
  savePreferences,
  type Preferences,
} from "./preferences.js";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("parsePreferences", () => {
  it("accepts a well-formed object unchanged", () => {
    const preferences: Preferences = { iconColour: "colour", defaultView: "graph" };
    expect(parsePreferences(preferences)).toEqual(preferences);
  });

  // Every one of these is a shape a hostile or simply older/newer stored
  // value could take -- `JSON.parse` on garbage bytes, a value some other
  // script wrote under the same key, a future version of this module's shape
  // read by today's parser. None of them may throw and none of them may
  // produce a `Preferences` with an unrecognised value in either field.
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "monochrome"],
    ["a number", 42],
    ["an array", ["colour", "list"]],
    ["an empty object", {}],
    ["an object with both fields unrecognised", { iconColour: "sepia", defaultView: "kanban" }],
  ])("falls back to DEFAULT_PREFERENCES for %s, field by field", (_label, garbage) => {
    expect(parsePreferences(garbage)).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps one recognised field and falls back only the other", () => {
    expect(parsePreferences({ iconColour: "colour", defaultView: "kanban" })).toEqual({
      iconColour: "colour",
      defaultView: DEFAULT_PREFERENCES.defaultView,
    });
    expect(parsePreferences({ iconColour: "sepia", defaultView: "graph" })).toEqual({
      iconColour: DEFAULT_PREFERENCES.iconColour,
      defaultView: "graph",
    });
    // The missing field alone -- an object carrying only one of the two,
    // rather than the other one carrying a bad value.
    expect(parsePreferences({ iconColour: "colour" })).toEqual({
      iconColour: "colour",
      defaultView: DEFAULT_PREFERENCES.defaultView,
    });
  });
});

describe("loadPreferences", () => {
  it("returns DEFAULT_PREFERENCES when nothing is stored", () => {
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("returns a stored, well-formed value", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ iconColour: "colour", defaultView: "migrations" }));
    expect(loadPreferences()).toEqual({ iconColour: "colour", defaultView: "migrations" });
  });

  // Not valid JSON at all -- `JSON.parse` throws, and this is the guard that
  // catches it rather than blanking the page.
  it("falls back to DEFAULT_PREFERENCES when the stored value is not valid JSON", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, "{not json");
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  // Valid JSON, wrong shape -- parses fine, parsePreferences is what saves it.
  it("falls back to DEFAULT_PREFERENCES when the stored value parses but is the wrong shape", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(["colour", "list"]));
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  // localStorage itself can throw synchronously on access -- Safari private
  // browsing does this for every call. Stubbing getItem to throw is the only
  // way to reproduce that from jsdom, which never throws on its own.
  it("falls back to DEFAULT_PREFERENCES when localStorage.getItem itself throws", () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error("SecurityError: access denied");
    };
    try {
      expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    } finally {
      window.localStorage.getItem = original;
    }
  });

  // A stored preference survives a re-render -- the shape this module exists
  // for: save, then load again as a fresh call would after a remount, and
  // get back exactly what was saved rather than a stale in-memory copy.
  it("survives a save-then-load round trip, as a fresh render would perform it", () => {
    savePreferences({ iconColour: "colour", defaultView: "graph" });
    expect(loadPreferences()).toEqual({ iconColour: "colour", defaultView: "graph" });
  });
});

describe("savePreferences", () => {
  it("writes one JSON object under the one versioned key", () => {
    savePreferences({ iconColour: "colour", defaultView: "list" });
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ iconColour: "colour", defaultView: "list" });
  });

  // A write that throws (quota, storage blocked outright) must not throw
  // back out at the caller -- losing the preference is better than crashing
  // whatever UI action triggered it.
  it("does not throw when localStorage.setItem itself throws", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(() => savePreferences({ iconColour: "colour", defaultView: "list" })).not.toThrow();
    } finally {
      window.localStorage.setItem = original;
    }
  });
});
