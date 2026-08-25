// Pure. The one control that switches between the grouped list and the DAG.
//
// A toggle rather than a second route or a replacement, per docs/PLAN.md's
// Phase 3.7 DAG decision 1: the list answers "what does this project use" and
// the graph answers "what breaks if this dies", both are questions the viewer
// exists for, and neither has been used against a real manifest yet. The list
// stays the default.
//
// A radio group, not two buttons or a checkbox: the two views are mutually
// exclusive options of one setting. `role="radiogroup"`/`role="radio"`
// announce that relationship to assistive tech, but a role only describes --
// it does not implement. Native `<input type="radio">` gets arrow-key
// navigation and a single tab stop from the browser's own key handling for
// free; a `<button>` wearing the same role gets none of it. Measured:
// ArrowRight moved neither focus nor selection, both buttons carried
// `tabindex` null, and both sat in the tab order -- a widget announcing
// itself as one control and behaving as two unrelated ones, which is exactly
// the mismatch the role was supposed to head off.
//
// So the roving-tabindex pattern is implemented here by hand: the checked
// option is the only one with `tabIndex={0}` (the group's single tab stop),
// the other is `tabIndex={-1}` (still reachable once the group has focus,
// just not from Tab), and the arrow keys move both focus and selection
// between them with wraparound. A checkbox would say "graph: on/off", which
// is not what this is, and two independent buttons -- the thing this would
// have been without the fix above -- announce no relationship at all.
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

import styles from "./ViewToggle.module.css";

export type ViewMode = "list" | "graph";

export interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { value: ViewMode; label: string; hint: string }[] = [
  { value: "list", label: "List", hint: "Everything this project uses, grouped by rollup" },
  { value: "graph", label: "Graph", hint: "The dependency graph, laid out left to right" },
];

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  // One ref per option, indexed the same as MODES, so a key handler on any
  // button can move focus to any other without walking the DOM -- the same
  // reason a `<select>`'s native arrow-key handling never needs to.
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const groupRef = useRef<HTMLDivElement | null>(null);

  // Focus follows the *committed* mode, not the requested one.
  //
  // This is a controlled component: an arrow key asks the parent to change
  // `mode` and the parent is free to decline. Focusing the requested option
  // directly inside the key handler assumed it never would, and a parent that
  // ignored `onChange` left focus on the option carrying `tabIndex={-1}`
  // while the other one kept the group's only tab stop -- roving tabindex's
  // one invariant, broken, and Tab would then land somewhere the user was not.
  // App.tsx always honours `onChange`, so it was never live; it was wrong.
  //
  // The `contains` guard is what keeps this from being a focus thief: a mode
  // change driven from outside the group (a future keyboard shortcut, a
  // restored URL) must not yank focus out of whatever the user is actually
  // in, so focus only moves when it was already inside the group.
  useEffect(() => {
    const active = document.activeElement;
    if (!groupRef.current || !active || !groupRef.current.contains(active)) {
      return;
    }
    optionRefs.current[MODES.findIndex((option) => option.value === mode)]?.focus();
  }, [mode]);

  function moveTo(index: number) {
    onChange(MODES[(index + MODES.length) % MODES.length]!.value);
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
        moveTo(MODES.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={groupRef} className={styles.toggle} role="radiogroup" aria-label="View">
      {MODES.map((option, index) => {
        const checked = mode === option.value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            title={option.hint}
            className={`${styles.option} ${checked ? styles.current : ""}`}
            // The roving half of roving tabindex: only the checked option is
            // in the Tab order, so the group is one tab stop rather than two.
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
