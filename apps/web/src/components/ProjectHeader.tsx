// Pure. Renders only the fields the manifest actually set -- an absent
// field means "not answered yet" (CLAUDE.md's ask-never-guess rule applied
// to rendering) so this never falls back to a placeholder like "unknown".
import type { ViewPayload } from "dagstree";

import styles from "./ProjectHeader.module.css";

export interface ProjectHeaderProps {
  project: ViewPayload["project"];
  manifestPath: string;
}

export function ProjectHeader({ project, manifestPath }: ProjectHeaderProps) {
  // Only `visibility` is left at project level. The VCS provider, the PM
  // tool and every coding agent are service entries now (role: vcs, pm,
  // coding-agent), so they arrive through `services` and render in their
  // own role groups like any other entry -- see the amendment log in
  // docs/HANDOFF.md §4. Nothing about them belongs in this header; a
  // project-level copy would be the same duplication that change removed.
  const visibility = project.vcs?.visibility;

  return (
    <header className={styles.header}>
      <h1 className={styles.name}>{project.name}</h1>
      <div className={styles.slug}>{project.slug}</div>

      {project.architecture && <p className={styles.architecture}>{project.architecture}</p>}

      {visibility && (
        <dl className={styles.meta}>
          <div className={styles.metaItem}>
            <dt>visibility</dt>
            <dd>{visibility}</dd>
          </div>
        </dl>
      )}

      <div className={styles.manifestPath}>{manifestPath}</div>
    </header>
  );
}
