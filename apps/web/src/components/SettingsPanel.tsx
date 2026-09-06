// The Settings panel -- one of the three surfaces the top bar's cluster
// opens (AppShell.tsx owns which one, if any, is open). Content per the
// mockup's own `.panel` (docs/candidates/candidate-e-homescreen.html, ~lines
// 463-482), minus two rows the owner dropped on 2026-09-05
// (docs/menus-brief.md, owner answer 2) and left named here so neither is
// re-proposed as new:
//
//   - **Appearance** (Light/Dark/System) -- omitted. The dark theme was
//     removed 2026-09-03 (tokens.css's `color-scheme: light` comment), and a
//     row whose only live choice is "Light" is not a setting.
//   - **Density** (Comfortable/Compact) -- the owner ruled it out outright on
//     2026-09-05: "Users don't need to choose the density, remove it."
//     Nothing rendered for this row before that ruling and nothing does now.
//
// The two rows that ship are a "region", not a `<dialog>` -- this panel
// closes on Escape or an outside click the same way the other two menus do
// (AppShell.tsx), it just never claims to be a modal dialog, which
// `role="dialog"` would. Its heading gives the region its accessible name.
//
// **Preferences live in `localStorage`, read and written through
// preferences.ts's context** (owner answer 2: a server and an account will
// hold these later; there is neither yet). This file is the one place that
// writes; ServiceTile.tsx is the one place besides this that reads
// `iconColour` -- both through `usePreferences()`, never through a prop
// threaded from a common ancestor, because the two sit in different branches
// of the render tree with files in between this brief does not own (this
// file's sibling, preferences.ts, states the reasoning in full).
import { useId, useRef, type KeyboardEvent, type RefObject } from "react";

import { usePreferences } from "../preferences.js";
import type { DefaultViewPreference, IconColourPreference } from "../preferences.js";
import styles from "./SettingsPanel.module.css";

export interface SettingsPanelProps {
  /** This panel's own root node -- AppShell.tsx moves focus into it (the first selected radio) on open and traps Tab inside it while open. */
  rootRef: RefObject<HTMLDivElement>;
  /** The manifest this session is serving, for the panel's own bottom line (`.panel-manifest`). */
  manifestPath: string;
}

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedRowProps<T extends string> {
  label: string;
  sublabel?: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * One `role="radiogroup"` row, the mockup's `.segmented` -- reused for both
 * rows below rather than duplicated, since the two differ only in their
 * option lists and value type.
 *
 * Roving tabindex, the same shape ViewToggle.tsx already carries for the
 * same reason (its own header states it at length: a `role="radio"` button
 * gets none of a native radio input's key handling for free, so this
 * implements it by hand -- one tab stop, the arrow keys move both focus and
 * selection with wraparound). One thing here is deliberately simpler than
 * ViewToggle's own version: that file moves focus from a `useEffect` keyed
 * on the *committed* mode, specifically because its parent (App.tsx) is free
 * to decline a requested change and a direct focus call would then move
 * focus to an option that never became selected. `setPreference` never
 * declines -- it is a plain, always-applied write -- so there is no
 * daylight here between "requested" and "committed" for an effect to
 * reconcile, and moving focus directly inside the key handler is correct
 * rather than merely simpler.
 */
function SegmentedRow<T extends string>({ label, sublabel, options, value, onChange }: SegmentedRowProps<T>) {
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function moveTo(index: number) {
    const wrapped = (index + options.length) % options.length;
    const option = options[wrapped]!;
    onChange(option.value);
    optionRefs.current[wrapped]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(options.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className={styles.row}>
      <div>
        <div className={styles.label}>{label}</div>
        {sublabel !== undefined && <div className={styles.sublabel}>{sublabel}</div>}
      </div>
      <div className={styles.segmented} role="radiogroup" aria-label={label}>
        {options.map((option, index) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className={`${styles.segment} ${checked ? styles.selected : ""}`}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ICON_COLOUR_OPTIONS: readonly SegmentOption<IconColourPreference>[] = [
  { value: "colour", label: "Colour" },
  { value: "monochrome", label: "Monochrome" },
];

const DEFAULT_VIEW_OPTIONS: readonly SegmentOption<DefaultViewPreference>[] = [
  { value: "list", label: "List" },
  { value: "migrations", label: "Migrations" },
];

export function SettingsPanel({ rootRef, manifestPath }: SettingsPanelProps) {
  const { preferences, setPreference } = usePreferences();
  const headingId = useId();

  return (
    <div ref={rootRef} className={styles.panel} role="region" aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.heading}>
        Display settings
      </h3>

      <SegmentedRow
        label="Brand icons"
        sublabel="Full colour, or ink to match the UI"
        options={ICON_COLOUR_OPTIONS}
        value={preferences.iconColour}
        onChange={(next) => setPreference("iconColour", next)}
      />

      <SegmentedRow
        label="Default view"
        options={DEFAULT_VIEW_OPTIONS}
        value={preferences.defaultView}
        onChange={(next) => setPreference("defaultView", next)}
      />

      <div className={styles.manifest}>{manifestPath}</div>
    </div>
  );
}
