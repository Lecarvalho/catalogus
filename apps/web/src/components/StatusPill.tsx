// Pure. `status` is always one of the four schema values (ViewPayload
// already defaults it -- see view-payload.ts) so this never has to guess
// what an omitted status means; it only has to render one.
import styles from "./StatusPill.module.css";

export interface StatusPillProps {
  status: "active" | "phasing_out" | "deprecated" | "removed";
}

const LABELS: Record<StatusPillProps["status"], string> = {
  active: "active",
  phasing_out: "phasing out",
  deprecated: "deprecated",
  removed: "removed",
};

export function StatusPill({ status }: StatusPillProps) {
  return <span className={`${styles.pill} ${styles[status]}`}>{LABELS[status]}</span>;
}
