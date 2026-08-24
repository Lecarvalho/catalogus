// Pure.
import styles from "./LoadingState.module.css";

export function LoadingState() {
  return (
    <p className={styles.state} role="status">
      Loading…
    </p>
  );
}
