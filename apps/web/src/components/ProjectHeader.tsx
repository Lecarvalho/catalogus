// Pure. Renders only the fields the manifest actually set -- an absent
// field means "not answered yet" (CLAUDE.md's ask-never-guess rule applied
// to rendering) so this never falls back to a placeholder like "unknown".
//
// Rebuilt 2026-08-25 as a masthead. The previous header stacked five things
// down the left margin at roughly equal weight -- name, slug, architecture
// paragraph, a VISIBILITY/private definition list, and the absolute path to
// the manifest -- which read as a debug dump rather than the top of a
// document. The worst of it was ranking: `project.architecture` is the most
// informative sentence anyone has written about the project, and it was set
// in the same small grey as the file path.
//
// So the masthead states, in order: what this is, what shape it is, and how
// much of it there is. The absolute manifest path left this component on 2026-08-25 and moved to
// `AppShell`. It is a fact about the `catalogus view` invocation -- which file
// is being served -- not a fact about the project, and it had been sitting at
// the foot of the masthead in the faintest text on the page, immediately under
// the architecture sentence. Chrome carries the session, the document carries
// the project.
//
// The counts belong here rather than only on the band modules, because they
// are the first honest answer to "how big is this thing" and a reader forms
// that judgement before reading a single name.
import type { ViewPayload } from "@catalogus/cli";

import styles from "./ProjectHeader.module.css";

export interface ProjectHeaderProps {
  project: ViewPayload["project"];
  /** Entry count, stated because it is the first thing a reader wants to size. */
  serviceCount: number;
  /** Declared dependency edges. */
  edgeCount: number;
  /** ISO timestamp the manifest was read; rendered as the snapshot it is. */
  readAt: string;
}

/**
 * The date part of an ISO timestamp, without a locale call.
 *
 * `toLocaleDateString()` is deliberately avoided: it renders differently
 * depending on the host's ICU data, which would make this component's output
 * untestable and would make two machines disagree about the same manifest.
 * Every other ordering in this app avoids locale for the same reason.
 * Returns the raw string unchanged if it does not look like an ISO stamp,
 * because a wrong date is worse than an ugly one.
 */
export function readDate(readAt: string): string {
  const separator = readAt.indexOf("T");
  return separator === -1 ? readAt : readAt.slice(0, separator);
}

export function ProjectHeader({ project, serviceCount, edgeCount, readAt }: ProjectHeaderProps) {
  // Only `visibility` is left at project level. The VCS provider, the PM
  // tool and every coding agent are service entries now (role: vcs, pm,
  // coding-agent), so they arrive through `services` and render in their
  // own bands like any other entry -- see the amendment log in
  // docs/HANDOFF.md §4. Nothing about them belongs in this header; a
  // project-level copy would be the same duplication that change removed.
  const visibility = project.vcs?.visibility;

  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <h1 className={styles.name}>{project.name}</h1>
        <span className={styles.slug}>{project.slug}</span>
        {visibility && <span className={styles.visibility}>{visibility}</span>}
      </div>

      {/*
        The architecture sentence is the lead, at reading size. It is the one
        piece of prose a human wrote about this project on purpose, and until
        Layer 3 pages exist it is the only prose the viewer has at all.
      */}
      {project.architecture && <p className={styles.architecture}>{project.architecture}</p>}

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Entries</dt>
          <dd>{serviceCount}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Dependencies</dt>
          <dd>{edgeCount}</dd>
        </div>
        <div className={styles.fact}>
          {/*
            Stated as a snapshot rather than as a timestamp, because that is
            what it is: `catalogus view` reads the manifest once at server
            start (view-payload.ts's readAt comment says the field exists so
            the data can say so, and that rendering it is this app's job).
            A reader who edits the manifest and wonders why nothing changed
            needs this line to exist.
          */}
          <dt>Read</dt>
          <dd>{readDate(readAt)}</dd>
        </div>
      </dl>
    </header>
  );
}
