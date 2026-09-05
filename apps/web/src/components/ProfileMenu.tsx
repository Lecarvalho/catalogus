// The profile menu -- one of the three surfaces the top bar's cluster opens
// (AppShell.tsx owns which one, if any, is open). The mockup's own `.menu`
// (docs/candidates/candidate-e-homescreen.html, ~lines 484-497) draws an
// account block (a name, an email, a plan) and five items, one of them "Sign
// out". None of that is built here, by owner decision, 2026-09-05
// (docs/menus-brief.md, owner answer 1): **there is no account system**
// (Phase 5 is unbuilt), so there is no name, no email and no plan to render,
// and nothing in this file may carry a person's name or email -- rendering
// the mockup's block would state an account fact this repo does not have,
// and look exactly right while doing it (CLAUDE.md's "ask, never guess").
// The block's slot instead carries one short, honest note, and the item list
// drops "Account" and "Sign out" with it -- both would announce things that
// do not exist.
//
// "Preferences" opens the Settings panel and "Keyboard shortcuts" opens the
// Help panel (where the real shortcut list lives, HelpMenu.tsx), both by
// switching AppShell.tsx's `openMenu` rather than duplicating either panel's
// content here -- there is exactly one settings panel and one shortcuts
// list in this app, and this menu only ever points at them.
import type { RefObject } from "react";

import { DOCUMENTATION_URL } from "../links.js";
import styles from "./ProfileMenu.module.css";

export interface ProfileMenuProps {
  /** This menu's own root node -- AppShell.tsx moves focus into it on open and traps Tab inside it while open. */
  rootRef: RefObject<HTMLDivElement>;
  /** Switches the cluster to the Settings panel, closing this one -- AppShell.tsx's `setOpenMenu("settings")`. */
  onOpenPreferences: () => void;
  /** Switches the cluster to the Help panel, closing this one -- the real shortcut list lives there. */
  onOpenKeyboardShortcuts: () => void;
}

export function ProfileMenu({ rootRef, onOpenPreferences, onOpenKeyboardShortcuts }: ProfileMenuProps) {
  return (
    <div ref={rootRef} className={styles.menu} role="menu" aria-label="Profile">
      {/*
        The account block's slot, carrying the one true fact about it instead
        of the mockup's name/email/plan -- see this file's own header.
        `role="presentation"`-free plain text, not a `menuitem`: it names
        nothing to activate, only a state of the app.
      */}
      <div className={styles.note}>
        There is no account yet. Sign-in arrives with <span className={styles.code}>catalogus login</span>.
      </div>

      <button type="button" role="menuitem" className={styles.item} onClick={onOpenPreferences}>
        Preferences
      </button>
      <button type="button" role="menuitem" className={styles.item} onClick={onOpenKeyboardShortcuts}>
        Keyboard shortcuts
      </button>
      <a className={styles.item} role="menuitem" href={DOCUMENTATION_URL} target="_blank" rel="noreferrer">
        Documentation
      </a>
    </div>
  );
}
