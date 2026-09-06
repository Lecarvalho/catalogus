// The Help panel -- one of the three surfaces the top bar's cluster opens
// (AppShell.tsx owns which one, if any, is open; this file only ever renders
// while it is). Content per the mockup's own `.help-panel`
// (docs/candidates/candidate-e-homescreen.html, ~lines 447-462): two links, a
// keyboard-shortcuts item, the `catalogus CLI` command block and the version.
//
// **Keyboard shortcuts, real ones, and `?` really opens this panel.** The
// mockup draws "Keyboard shortcuts" with a bare `?` beside it and nothing
// behind either -- a shortcut a panel advertises but the app ignores is a lie
// (docs/menus-brief.md), so this build does two things the mockup does not:
// `?` actually opens this panel (AppShell.tsx's own keydown effect owns the
// key, since it is the file that knows which menu is open), and clicking
// this item expands the list below instead of doing nothing. The list itself
// is transcribed from what `grep -rn "event.key"` finds across
// apps/web/src, not invented: App.tsx's panel-close and peek-close Escape
// handlers, its peek keydown effect's ArrowDown/ArrowUp into a group tile's
// popover rows, ViewToggle.tsx's arrow keys between the two view tabs, and
// this app's own new `?`. There is no test that derives this list
// mechanically the way `cliCommands` is derived below -- a plain-English
// description of a keyboard behaviour is not a value a payload can carry --
// so a handler added or removed elsewhere is this file's own list to update.
//
// **The CLI command block reads off the payload, not off the mockup's own
// text.** The mockup's list predates the `icons` command and is stale; this
// renders `cliCommands` instead, which `packages/cli/src/view-payload.ts`
// fills from `cli.ts`'s own registered commands, so this panel and
// `catalogus --help` can never disagree about what exists.
import { useId, useState, type RefObject } from "react";

import { DOCUMENTATION_URL, MANIFEST_FORMAT_REFERENCE_URL } from "../links.js";
import styles from "./HelpMenu.module.css";

export interface HelpMenuProps {
  /** Open with the shortcut list already expanded -- set by AppShell when the profile menu's "Keyboard shortcuts" item is what opened this panel. */
  initialShortcutsExpanded?: boolean;
  /** This panel's own root node -- AppShell.tsx moves focus into it on open and traps Tab inside it while open, both from outside this file (see its own header for why that lives there instead of being duplicated three times). */
  rootRef: RefObject<HTMLDivElement>;
  /** In the CLI's own registration order (view-payload.ts's `cliCommands`). */
  cliCommands: readonly string[];
  cliVersion: string;
}

/**
 * Every keyboard shortcut this app actually handles, transcribed rather than
 * invented -- see this file's own header for where each one comes from.
 * Exported so HelpMenu.test.tsx can assert against the same list this
 * component renders, instead of a second copy typed into the test.
 */
export const KEYBOARD_SHORTCUTS: readonly { keys: string; description: string }[] = [
  { keys: "?", description: "Open this help panel" },
  { keys: "Esc", description: "Close the open menu, popover or page" },
  { keys: "↓ ↑", description: "Move into a grouped tile's popover rows" },
  { keys: "← →", description: "Move between the List and Migrations tabs" },
];

export function HelpMenu({ rootRef, cliCommands, cliVersion, initialShortcutsExpanded = false }: HelpMenuProps) {
  // Collapsed by default: the mockup's own row draws no list at all, and a
  // reader who never asks for it should not be handed one. An expanding
  // section rather than a second state of the whole panel (docs/menus-brief.md
  // left the choice open) -- the two links and the CLI block stay reachable
  // either way, which a full state swap would have hidden.
  //
  // Except when the panel was opened *for* the list: the profile menu's own
  // "Keyboard shortcuts" item lands here, and an item named for the list
  // that opens the panel with the list folded away asks for a second click
  // it promised not to need (validator, 2026-09-05). The panel mounts fresh
  // on every open, so an initial value is the whole mechanism.
  const [shortcutsExpanded, setShortcutsExpanded] = useState(initialShortcutsExpanded);
  const shortcutsListId = useId();

  return (
    <div ref={rootRef} className={styles.panel} role="menu" aria-label="Help">
      <a className={styles.item} role="menuitem" href={DOCUMENTATION_URL} target="_blank" rel="noreferrer">
        <span>Documentation</span>
      </a>
      <a className={styles.item} role="menuitem" href={MANIFEST_FORMAT_REFERENCE_URL} target="_blank" rel="noreferrer">
        <span>Manifest format reference</span>
      </a>
      <button
        type="button"
        role="menuitem"
        className={styles.item}
        aria-expanded={shortcutsExpanded}
        aria-controls={shortcutsListId}
        onClick={() => setShortcutsExpanded((current) => !current)}
      >
        <span>Keyboard shortcuts</span>
        <span className={styles.key} aria-hidden="true">
          ?
        </span>
      </button>

      {shortcutsExpanded && (
        <dl id={shortcutsListId} className={styles.shortcutList}>
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className={styles.shortcutRow}>
              <dt className={styles.shortcutKeys}>{shortcut.keys}</dt>
              <dd className={styles.shortcutDescription}>{shortcut.description}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className={styles.cliBlock}>
        <div className={styles.cliTitle}>catalogus CLI</div>
        {/* Dot-separated, in the CLI's own order, per docs/menus-brief.md --
            not the mockup's two-row layout, which was a fixed 12-command
            list wrapped by hand. */}
        <div className={styles.cliList}>{cliCommands.join(" · ")}</div>
      </div>

      <div className={styles.version}>catalogus {cliVersion}</div>
    </div>
  );
}
