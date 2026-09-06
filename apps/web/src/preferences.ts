// One versioned localStorage key, named once here rather than typed out at
// each read/write site, per the owner's answer 2026-09-05 (docs/menus-brief.md,
// owner answer 2): Catalogus will eventually run from a server and keep these
// under a signed-in user's own preferences in its database; until there is a
// server and an account to hold them for (Phase 5 is unbuilt), the browser's
// own storage is where they live. The version suffix exists so a future
// incompatible shape can be told apart from this one rather than crashing a
// parser that assumes today's fields.
//
// Every read and every write is wrapped in try/catch. `localStorage` throws
// synchronously in situations this app cannot rule out -- Safari private
// browsing (every call throws there), a full quota, a browser configured to
// block site data outright -- and none of them is a reason to blank the page
// or drop a setting change on the floor. They are a reason to fall back to
// the default and carry on: CLAUDE.md's "an absent field reads as not
// answered yet" rule, applied to the one storage layer this module owns.
//
// Two rows the mockup's Display settings panel draws are deliberately not a
// field here, both by owner decision (docs/menus-brief.md, owner answer 2):
//
//   - **Appearance** (Light/Dark/System): the dark theme was removed
//     2026-09-03 (tokens.css's own comment on `color-scheme: light`), and a
//     row whose only live choice is "Light" is not a setting.
//   - **Density** (Comfortable/Compact): the mockup draws it, but the owner
//     ruled it out outright on 2026-09-05 -- "Users don't need to choose the
//     density, remove it." Left out of `Preferences` on purpose; do not
//     re-propose this row as new without reading this comment first.
import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** The one key every reader and writer of this module agrees on. */
export const PREFERENCES_STORAGE_KEY = "catalogus.preferences.v1";

/** "Colour" renders a tile's brand mark in the brand's own colour, the way the popover and the brand page already do; "monochrome" is the mechanism `Icon.module.css` has carried since candidate E with no live caller (Icon.tsx's own header) -- this is that caller. */
export type IconColourPreference = "colour" | "monochrome";

/**
 * Which view `App.tsx` opens on the *next* load. Does not move the view a
 * reader is already on -- App.tsx's `mode` state reads this once, at mount,
 * the same way it reads `Date.now()` once for the footer's read time.
 *
 * Lost `"graph"` 2026-09-05, when the owner decommissioned the graph view
 * (docs/graph-removal-brief.md): "it's not yet the way I'd like to read it,
 * it's confusing." A value of `"graph"` already in a reader's `localStorage`
 * from before that day is exactly the "an object carrying a value neither
 * field recognises" case `parsePreferences` below was already built to
 * survive -- see its own doc comment and preferences.test.ts's case naming
 * it directly.
 */
export type DefaultViewPreference = "list" | "migrations";

export interface Preferences {
  iconColour: IconColourPreference;
  defaultView: DefaultViewPreference;
}

/**
 * What a browser with nothing stored -- or a browser this module could not
 * read from at all -- renders as. Not a guess: `iconColour: "monochrome"` is
 * the owner's explicit default (docs/menus-brief.md, owner answer 2, "that is
 * the board today and a measured decision"), and `defaultView: "list"` is the
 * mockup's own `is-selected` segment and the value `App.tsx`'s `mode` state
 * already started from before this preference existed.
 */
export const DEFAULT_PREFERENCES: Preferences = {
  iconColour: "monochrome",
  defaultView: "list",
};

const ICON_COLOUR_VALUES: readonly IconColourPreference[] = ["colour", "monochrome"];
const DEFAULT_VIEW_VALUES: readonly DefaultViewPreference[] = ["list", "migrations"];

/**
 * Total: every input either produces a valid `Preferences` or falls back to
 * `DEFAULT_PREFERENCES`, field by field, and never throws. `raw` is `unknown`
 * because it is whatever `JSON.parse` handed back -- `undefined`, `null`, a
 * number, a string, an array, an object missing one or both fields, an object
 * carrying a value neither field recognises (a stale key from a future
 * version of this module, or a hand-edited value) -- and every one of those
 * shapes degrades to the matching default rather than propagating `undefined`
 * into a caller that assumes both fields are always present.
 */
export function parsePreferences(raw: unknown): Preferences {
  const candidate = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const iconColour = ICON_COLOUR_VALUES.includes(candidate.iconColour as IconColourPreference)
    ? (candidate.iconColour as IconColourPreference)
    : DEFAULT_PREFERENCES.iconColour;
  const defaultView = DEFAULT_VIEW_VALUES.includes(candidate.defaultView as DefaultViewPreference)
    ? (candidate.defaultView as DefaultViewPreference)
    : DEFAULT_PREFERENCES.defaultView;
  return { iconColour, defaultView };
}

/**
 * Reads the stored preferences, or `DEFAULT_PREFERENCES` for every way that
 * can fail: no `window` (nothing in this app runs server-side today, but
 * nothing here should assume that stays true), nothing stored yet, a value
 * that is not valid JSON, a value that parses but is not the shape above, or
 * `localStorage` itself throwing on access.
 */
export function loadPreferences(): Preferences {
  try {
    if (typeof window === "undefined") {
      return DEFAULT_PREFERENCES;
    }
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_PREFERENCES;
    }
    return parsePreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Writes the whole object back, one key holding one JSON object, per the
 * owner's answer. A throw here (quota, a browser blocking storage entirely)
 * is swallowed: losing one preference change is better than crashing
 * whatever change just triggered it.
 */
export function savePreferences(preferences: Preferences): void {
  try {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Best-effort, per this module's own header.
  }
}

// --- React wiring -------------------------------------------------------
//
// A context, not a prop threaded down from App.tsx. `ServiceTile.tsx` reads
// `iconColour` several components below the nearest file this brief may edit
// (`BandModule.tsx` and `ProjectBoard.tsx` both sit in between and are off
// limits -- docs/menus-brief.md's file list), so there is no path to hand it
// a new prop without editing a file outside this brief's ownership. A
// context reaches past those files without touching them, and is mounted
// once, in `App.tsx`, around everything the shell renders: the settings
// panel that writes `iconColour` and the board that reads it both sit inside
// it. `defaultView` deliberately does *not* go through this context -- see
// its own doc comment above; a read-once fact uses the plain function, a
// live one uses this.
//
// This file stays `preferences.ts`, not `.tsx` (docs/menus-brief.md names it
// that way), so the provider below is built with `createElement` rather than
// JSX -- TypeScript only parses JSX syntax inside a `.tsx` file.
//
// The context's default value -- used by any consumer with no `Provider`
// above it, which is every component test rendered standalone -- is
// `DEFAULT_PREFERENCES` with a no-op setter. That keeps this module's own
// "renders correctly with no stored value" contract for a component under
// test in isolation: it renders, just without live persistence, which is
// also `DEFAULT_PREFERENCES` in practice since nothing stored anything yet.

interface PreferencesContextValue {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: DEFAULT_PREFERENCES,
  setPreference: () => {
    // No provider mounted -- a component rendered standalone in a test, or
    // one this app never wraps. Writing nowhere is the correct behaviour for
    // that case, not a bug to fix here: see this section's own header.
  },
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  // Lazy initializer: reads storage once, on mount, the same way App.tsx's
  // `renderedAt` reads `Date.now()` once rather than on every render.
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);

  const setPreference = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => {
      const next = { ...current, [key]: value };
      savePreferences(next);
      return next;
    });
  }, []);

  const value = useMemo<PreferencesContextValue>(() => ({ preferences, setPreference }), [preferences, setPreference]);

  return createElement(PreferencesContext.Provider, { value }, children);
}

/** The one hook every reader and writer below `PreferencesProvider` uses. */
export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}
