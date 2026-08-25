// Pure. The one control that switches between the grouped list and the DAG.
//
// A toggle rather than a second route or a replacement, per docs/PLAN.md's
// Phase 3.7 DAG decision 1: the list answers "what does this project use" and
// the graph answers "what breaks if this dies", both are questions the viewer
// exists for, and neither has been used against a real manifest yet. The list
// stays the default.
//
// A radio group, not two buttons or a checkbox: the two views are mutually
// exclusive options of one setting, which is what `role="radiogroup"`
// announces and what gives arrow-key navigation between them for free from
// native semantics. A checkbox would say "graph: on/off", which is not what
// this is, and two independent buttons would announce no relationship at all.
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
  return (
    <div className={styles.toggle} role="radiogroup" aria-label="View">
      {MODES.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          title={option.hint}
          className={`${styles.option} ${mode === option.value ? styles.current : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
