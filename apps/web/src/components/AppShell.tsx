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
// **`sidePanel`, added 2026-09-04**, is the one addition to that frozen
// structure since: an optional third child of the rail-plus-board row, for
// the entry page's facts panel (docs/candidates/candidate-e-brandpage.html's
// artboard 3, decision 6). It does not reopen the freeze -- nothing about the
// topbar, the rail, the board or the footer changed to make room for it, and
// the row renders exactly as before on every view that passes none. See the
// prop's own comment below for the rest.
//
// **The three menus, built 2026-09-05 (docs/menus-brief.md).** Until this
// pass the cluster's three triggers were the mockup's buttons with no surface
// behind them, and this file's own header called itself "pure -- props in, no
// fetch, no window, no module-level state", which stopped being true the
// moment a menu needed to close on Escape, close on an outside click, and
// trap Tab while open: all three are `document`-level listeners, added and
// removed with the menu's own open lifetime. What stayed true: no fetch, no
// `localStorage` read or write in this file (HelpMenu, SettingsPanel and
// ProfileMenu each own their own facts -- SettingsPanel reads and writes
// preferences.ts's context directly, this file never touches it), and no
// module-level state -- `openMenu` is component state, mounted once per
// render the same as everything else here.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ViewPayload } from "@catalogus/cli";

import { groupIntoBands } from "../bands.js";
import styles from "./AppShell.module.css";
import { BrandMark } from "./BrandMark.js";
import { Footer } from "./Footer.js";
import { HelpMenu } from "./HelpMenu.js";
import { ProfileMenu } from "./ProfileMenu.js";
import { Rail } from "./Rail.js";
import { SettingsPanel } from "./SettingsPanel.js";

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
  /**
   * A panel docked to the right edge of the rail-plus-board row, added
   * 2026-09-04 for the entry page's facts (ServicePage.tsx's
   * `ServicePagePanel`, docs/candidates/candidate-e-brandpage.html's artboard
   * 3, decision 6). A prop rather than a route check in here, on the same
   * reasoning `boardHead` already states: which page has one is App.tsx's
   * decision, made once, not a fact this file re-derives from the URL. Not
   * rendered at all when absent -- see AppShell.module.css's `.shell` for why
   * that keeps every other view's row byte-identical to before this prop
   * existed, and AppShell.test.tsx for the assertion that it does.
   *
   * Rendered as a direct child of `.shell`, after `.board`, so it is a flex
   * sibling of the board rather than something nested inside it -- the
   * mockup's own words are "a sibling of .board, not a child of it" -- and
   * inherits `.shell`'s own `align-items: stretch` the same way the rail
   * does, with no wrapper of this file's own in between. This file supplies
   * no chrome for it; ServicePage.module.css's `.panel` does, the same
   * division of labour `boardHead` already has with whatever renders inside
   * it.
   */
  sidePanel?: ReactNode;
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

/** The three surfaces the cluster can open, one at a time. */
type MenuId = "help" | "settings" | "profile";

export function AppShell({ payload, showBandIndex, boardHead, sidePanel, now, children }: AppShellProps) {
  // Grouped here rather than passed in, from the same `groupIntoBands` the
  // board itself calls on the same services -- a pure function of one input,
  // so two calls cannot disagree, and the rail's counts are the board's counts
  // by construction rather than by a second derivation someone has to keep in
  // step.
  const bands = payload && showBandIndex ? groupIntoBands(payload.services) : [];

  // One state variable for all three menus, not three booleans -- "one open
  // at a time" (docs/menus-brief.md) is then true by construction rather than
  // a rule three setters have to keep honouring, the same reasoning
  // App.tsx's own `peek` state uses for the board's hover popover.
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  // Whether the help panel, when it opens next, should open on its shortcut
  // list: true only when the profile menu's "Keyboard shortcuts" item asked
  // for it. Every other way in (the trigger, `?`) resets it, so the list is
  // folded on an ordinary open the way the mockup draws it.
  const [helpOpensOnShortcuts, setHelpOpensOnShortcuts] = useState(false);

  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const helpSurfaceRef = useRef<HTMLDivElement>(null);
  const settingsSurfaceRef = useRef<HTMLDivElement>(null);
  const profileSurfaceRef = useRef<HTMLDivElement>(null);

  const triggerRefs: Record<MenuId, RefObject<HTMLButtonElement>> = {
    help: helpTriggerRef,
    settings: settingsTriggerRef,
    profile: profileTriggerRef,
  };
  const surfaceRefs: Record<MenuId, RefObject<HTMLDivElement>> = {
    help: helpSurfaceRef,
    settings: settingsSurfaceRef,
    profile: profileSurfaceRef,
  };

  function toggleMenu(id: MenuId) {
    setHelpOpensOnShortcuts(false);
    setOpenMenu((current) => (current === id ? null : id));
  }

  // The global `?` shortcut -- always listening, not scoped to a menu being
  // open, since its whole job is to open one. Gated on `payload`: Help's own
  // content is `payload.cliCommands`/`payload.cliVersion`, and there is
  // nothing yet to show during the load or error state (the same "no answer
  // yet" reasoning `showBandIndex`'s own doc comment states for the rail).
  // The input/contentEditable guard is defensive -- this app has no text
  // field today -- rather than reacting to one that exists; see this
  // component's own header for why that is worth stating rather than
  // silently correct.
  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if (event.key !== "?" || !payload) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      setHelpOpensOnShortcuts(false);
      setOpenMenu("help");
    }
    document.addEventListener("keydown", onGlobalKeyDown);
    return () => document.removeEventListener("keydown", onGlobalKeyDown);
  }, [payload]);

  // The open menu's own behaviour: focus moves into it (the first selected
  // radio, on the settings panel, or its first item otherwise), Tab is
  // trapped inside it, Escape closes it and hands focus back to its trigger,
  // and a pointerdown outside both the surface and its own trigger closes it
  // too. One effect, torn down and rebuilt whenever `openMenu` changes
  // (mounted with the surface it governs, dismounted with it) -- the same
  // "each effect owns the thing it dismisses" shape App.tsx's own peek
  // keydown effect uses, read per this brief's own instruction rather than
  // copied: that effect owns arrow-key navigation *inside* an already-open
  // popover, which this app still needs nowhere in a menu, so nothing here
  // reaches for it.
  //
  // `pointerdown`, not `click`, for the outside check -- it fires before the
  // triggering click's own `onClick` (below) does, which is what lets a click
  // on a *different* trigger close this menu and let that trigger's own
  // handler open the other one in the same gesture, rather than the two
  // racing.
  useEffect(() => {
    if (!openMenu) {
      return;
    }
    const menu = openMenu;
    const surface = surfaceRefs[menu].current;
    if (!surface) {
      return;
    }

    function focusableItems(): HTMLElement[] {
      return Array.from(surface!.querySelectorAll<HTMLElement>('a[href], button, [tabindex]')).filter(
        (element) => element.tabIndex >= 0
      );
    }

    const preferredFirst = surface.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? focusableItems()[0];
    preferredFirst?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        triggerRefs[menu].current?.focus();
        setOpenMenu(null);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const items = focusableItems();
      if (items.length === 0) {
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (surface!.contains(target) || triggerRefs[menu].current?.contains(target)) {
        return;
      }
      setOpenMenu(null);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openMenu]);

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
          Help / settings / profile. Each trigger sits in its own
          `position: relative` wrapper (`.trigger`) so its menu can anchor
          `position: absolute` under it, and carries `aria-haspopup` (`"menu"`
          for the two that open a `role="menu"`, `"true"` for Settings, which
          is a labelled region rather than a menu -- SettingsPanel.tsx's own
          header says why) and `aria-expanded`, both real now that something
          answers them. Settings and Help are gated on `payload`: both render
          payload-derived facts (the manifest path; `cliCommands`/`cliVersion`)
          that do not exist yet during the load or error state, the same "no
          answer yet" reasoning `showBandIndex` states above. Profile carries
          none of that -- there is no account to be a fact about -- so it
          stays open to being toggled regardless.

          The avatar disc is empty on purpose. The mockup fills it with initials
          and its menu with a name, an email and a plan; **there is no account
          system** -- Phase 5 is unbuilt -- so there is no initial, no name and
          no plan to render, and CLAUDE.md's ask-never-guess rule makes an empty
          disc the honest render rather than a degraded one. Nothing in this
          file may name a person.
        */}
        <div className={styles.cluster}>
          <div className={styles.trigger}>
            <button
              type="button"
              ref={helpTriggerRef}
              className={styles.tbBtn}
              aria-haspopup="menu"
              aria-expanded={openMenu === "help"}
              onClick={() => payload && toggleMenu("help")}
            >
              <HelpIcon />
              Help
            </button>
            {openMenu === "help" && payload && (
              <HelpMenu
                rootRef={helpSurfaceRef}
                cliCommands={payload.cliCommands}
                cliVersion={payload.cliVersion}
                initialShortcutsExpanded={helpOpensOnShortcuts}
              />
            )}
          </div>

          <div className={styles.trigger}>
            <button
              type="button"
              ref={settingsTriggerRef}
              className={styles.tbBtn}
              aria-haspopup="true"
              aria-expanded={openMenu === "settings"}
              onClick={() => payload && toggleMenu("settings")}
            >
              <SettingsIcon />
              Settings
            </button>
            {openMenu === "settings" && payload && <SettingsPanel rootRef={settingsSurfaceRef} manifestPath={payload.manifestPath} />}
          </div>

          <div className={styles.trigger}>
            <button
              type="button"
              ref={profileTriggerRef}
              className={styles.tbBtn}
              aria-label="Profile"
              aria-haspopup="menu"
              aria-expanded={openMenu === "profile"}
              onClick={() => toggleMenu("profile")}
            >
              <span className={styles.avatar} />
            </button>
            {openMenu === "profile" && (
              <ProfileMenu
                rootRef={profileSurfaceRef}
                onOpenPreferences={() => setOpenMenu("settings")}
                onOpenKeyboardShortcuts={() => {
                  setHelpOpensOnShortcuts(true);
                  setOpenMenu("help");
                }}
              />
            )}
          </div>
        </div>
      </header>

      {/*
        `.withPanel` on `.shell` only when `sidePanel` is actually rendered --
        AppShell.module.css's own comment on that class explains why this
        stays a modifier rather than an unconditional rule. The conditional
        below picks between two whole strings rather than the
        `.board`/`.headless` idiom's "append or append nothing" two lines
        down, deliberately: that idiom leaves a trailing space in the
        `className` when its own condition is false, which is harmless to
        the cascade but is not byte-identical to `styles.shell` alone -- and
        a board view's row is exactly the string this file rendered before
        this prop existed, not that string plus a space, so AppShell.test.tsx
        can assert it stayed that way.
      */}
      <div className={sidePanel ? `${styles.shell} ${styles.withPanel}` : styles.shell}>
        {payload && <Rail project={payload.project} manifestPath={payload.manifestPath} bands={bands} />}

        <main className={`${styles.board} ${boardHead ? "" : styles.headless}`}>
          {boardHead && <div className={styles.boardHead}>{boardHead}</div>}
          {children}
        </main>

        {sidePanel}
      </div>

      {payload && <Footer payload={payload} now={now} />}
    </div>
  );
}
