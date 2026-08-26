// The app's chrome, and the thing this viewer had none of until 2026-08-25.
//
// The owner's verdict on the finished board was "that app still needs more
// life, it's boring. We need a shell, a header, a mark for Catalogus." The
// literal defect behind that sentence is that the viewer rendered straight
// into `<main>`: there was no product identity anywhere on screen, nothing
// framing the document, nothing to say this was Catalogus rather than a bare
// page. Notion and Confluence -- the owner's stated bar -- both have a shell
// and this had none.
//
// What goes in it is decided by one rule: **chrome carries facts about the
// session, the document carries facts about the project.** The manifest path
// moved up here because it is the former -- it answers "which file am I
// looking at", which is a question about this `catalogus view` invocation,
// not about the project. It used to sit at the foot of the masthead in the
// faintest text on the page, directly under the architecture sentence, which
// gave a debug string the same slot as the one piece of prose a human wrote
// on purpose.
//
// Pure, like everything else the app renders: props in, no fetch, no
// `window`, no module-level state (App.tsx's header comment records why that
// rule exists and what it buys).
import type { ReactNode } from "react";

import styles from "./AppShell.module.css";
import { BrandMark } from "./BrandMark.js";

export interface AppShellProps {
  /**
   * Absolute path of the manifest being served, when one has loaded. Absent
   * while loading and on the error state -- and rendered as nothing rather
   * than as a placeholder, because during a load there genuinely is no
   * answer yet and inventing one is the defect class CLAUDE.md names.
   */
  manifestPath?: string;
  children: ReactNode;
}

export function AppShell({ manifestPath, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      {/*
        `banner` is implicit for a `<header>` that is not inside a sectioning
        element, but this one is a direct child of a `<div>` wrapper, which
        is exactly the case where the implicit role still applies -- stated
        explicitly anyway so a future wrapper cannot silently remove it.
      */}
      <header className={styles.bar} role="banner">
        <div className={styles.inner}>
          <BrandMark />
          {manifestPath && (
            <p className={styles.source} title={manifestPath}>
              {manifestPath}
            </p>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
