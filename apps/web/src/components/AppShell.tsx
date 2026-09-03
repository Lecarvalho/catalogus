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
// is the former -- it answers "which file am I looking at", which is a
// question about this `catalogus view` invocation -- and it lives in the rail
// and the footer, where the mockup puts it. It left the top bar with this
// rewrite for a plainer reason than the rule: the top bar is the wordmark, the
// project name and the cluster, and the mockup never shows a path there.
//
// **Built to the approved mockup, 2026-09-03**
// (docs/candidates/candidate-e-homescreen.html). The owner approved that shell
// on sight and froze it -- "your new app shell is perfect, don't touch it" --
// so this file reproduces it rather than interpreting it, and every number it
// spends is a token read off that file (tokens.css's shell block). What used
// to be here was a single sticky bar holding the wordmark and the path; the
// structure now is the mockup's: a top bar, a row of rail plus board, and a
// footer, in a column that fills the viewport.
//
// One structural change worth naming, because it reverses a decision recorded
// at length in this file's stylesheet: the bar was `position: sticky` and is
// now `position: relative`. The mockup's sticky element is the *board head* --
// the view rail, which is the control a reader scrolling a long board actually
// needs within reach -- and having both stick would pin 110px of chrome to the
// top of a page whose argument is that it is scrolled.
//
// Pure, like everything else the app renders: props in, no fetch, no
// `window`, no module-level state (App.tsx's header comment records why that
// rule exists and what it buys).
import type { ReactNode } from "react";
import type { ViewPayload } from "@catalogus/cli";

import { groupIntoBands } from "../bands.js";
import styles from "./AppShell.module.css";
import { BrandMark } from "./BrandMark.js";
import { Footer } from "./Footer.js";
import { Rail } from "./Rail.js";

export interface AppShellProps {
  /**
   * The manifest being served, once one has loaded. Absent while loading and
   * on the error state -- and the rail and footer are then not rendered at
   * all, rather than rendered with placeholders. During a load there genuinely
   * is no answer yet, and inventing one is the defect class CLAUDE.md names.
   */
  payload?: ViewPayload;
  /**
   * Whether the rail's band index has anything to point at.
   *
   * The band anchors jump to the `<section>`s the board mounts, so they are
   * correct on the list view and nowhere else: the graph, the migrations board
   * and a service page mount no bands, and an anchor that jumps nowhere reads
   * as a page that failed to scroll. Neither the mockup nor FIRST VIEWPORT
   * describes a rail for those views -- the mockup draws the List view only --
   * so the rail keeps its identity block there and drops the index, rather
   * than growing a graph index or a migrations index that nobody has designed.
   */
  showBandIndex: boolean;
  /**
   * The sticky board head's contents -- the view rail, in practice.
   *
   * A prop rather than something this file renders, because *when* the view
   * rail shows is App.tsx's decision and it already has one: the toggle
   * selects between three views of the project, and a service page is not one
   * of them, so leaving it on screen would offer to switch a view that is no
   * longer showing. The head is not rendered at all when this is absent, and
   * the board takes the head's own top padding instead so the content does not
   * sit flush against the bar.
   */
  boardHead?: ReactNode;
  /** Epoch milliseconds the page was rendered, for the footer's "read <relative time>". */
  now: number;
  children: ReactNode;
}

/**
 * The two icons the mockup draws on the Help and Settings triggers, copied
 * from it rather than redrawn -- a question mark in a circle, and a gear. They
 * are `aria-hidden` because the button's own text names it; announcing "image"
 * beside the word "Help" adds nothing.
 */
function HelpIcon() {
  return (
    <svg className={styles.tbIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 4.7-1.2c.5.9.2 1.7-.6 2.4-.8.6-1.6 1-1.6 2.3" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className={styles.tbIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function AppShell({ payload, showBandIndex, boardHead, now, children }: AppShellProps) {
  // Grouped here rather than passed in, from the same `groupIntoBands` the
  // board itself calls on the same services -- a pure function of one input,
  // so two calls cannot disagree, and the rail's counts are the board's counts
  // by construction rather than by a second derivation someone has to keep in
  // step.
  const bands = payload && showBandIndex ? groupIntoBands(payload.services) : [];

  return (
    <div className={styles.app}>
      {/*
        `banner` is implicit for a `<header>` that is not inside a sectioning
        element, but this one is a direct child of a `<div>` wrapper, which
        is exactly the case where the implicit role still applies -- stated
        explicitly anyway so a future wrapper cannot silently remove it.
      */}
      <header className={styles.topbar} role="banner">
        <div className={styles.lockup}>
          <BrandMark />
          {payload && (
            <>
              <span className={styles.separator} aria-hidden="true">
                /
              </span>
              <span className={styles.project} title={payload.project.name}>
                {payload.project.name}
              </span>
            </>
          )}
        </div>

        {/*
          Help / settings / profile. **The three menus are a separate brief and
          none of them exists yet**: these are the triggers the mockup draws,
          with no surface behind them, and they carry no `aria-haspopup` and no
          `aria-expanded` because both would announce a menu that nothing
          opens. They are not disabled either -- unbuilt is not the same state
          as unavailable, and saying the wrong one is worse than saying
          neither.

          The avatar disc is empty on purpose. The mockup fills it with initials
          and its menu with a name, an email and a plan; **there is no account
          system** -- Phase 5 is unbuilt -- so there is no initial, no name and
          no plan to render, and CLAUDE.md's ask-never-guess rule makes an empty
          disc the honest render rather than a degraded one. Nothing in this
          file may name a person.
        */}
        <div className={styles.cluster}>
          <button type="button" className={styles.tbBtn}>
            <HelpIcon />
            Help
          </button>
          <button type="button" className={styles.tbBtn}>
            <SettingsIcon />
            Settings
          </button>
          <button type="button" className={styles.tbBtn} aria-label="Profile">
            <span className={styles.avatar} />
          </button>
        </div>
      </header>

      <div className={styles.shell}>
        {payload && <Rail project={payload.project} manifestPath={payload.manifestPath} bands={bands} />}

        <main className={`${styles.board} ${boardHead ? "" : styles.headless}`}>
          {boardHead && <div className={styles.boardHead}>{boardHead}</div>}
          {children}
        </main>
      </div>

      {payload && <Footer payload={payload} now={now} />}
    </div>
  );
}
