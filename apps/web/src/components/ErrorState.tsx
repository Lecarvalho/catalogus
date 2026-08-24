// Pure. `dagstree view` only starts once the manifest has already passed
// validation (createViewServer's own loadValidManifest check), so this is
// never a schema-invalid manifest reaching the browser -- it's the server
// being unreachable after the page loaded, which is why the message names
// what failed rather than guessing at the manifest.
import styles from "./ErrorState.module.css";

export interface ErrorStateProps {
  message: string;
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <div className={styles.state} role="alert">
      <p className={styles.heading}>Could not load the project view</p>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
