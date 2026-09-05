// @vitest-environment jsdom
//
// The shell is chrome, so what is worth testing is the boundaries it draws:
// which facts appear where, and which do not appear at all until there is an
// answer. Rail.test.tsx and Footer.test.tsx cover what those two surfaces say;
// this file covers what the shell decides to show them, which is a different
// question and the one that has a wrong answer available.
//
// The pieces that cannot be tested here are named rather than left as gaps.
// The 900px and 480px breakpoints are CSS: jsdom computes no styles and a
// CSS Module class name is synthesised, so nothing in this suite can see
// whether the rail is *visible* at a width -- only whether its content is in
// the document, which is what these assert. The same goes for the board head
// being sticky and for the bar no longer being.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { makeViewPayload, makeViewService } from "../test-support/fixtures.js";
import { AppShell, type AppShellProps } from "./AppShell.js";
import styles from "./AppShell.module.css";

afterEach(() => cleanup());

const PAYLOAD = makeViewPayload({
  project: { name: "Scratch", slug: "scratch", architecture: "An API and one database." },
  services: [
    makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
    makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase", service: "supabase" }),
  ],
  edges: [{ from: "fly-api", to: "supabase-db" }],
});

const NOW = Date.parse(PAYLOAD.readAt);

function renderShell(props: Partial<AppShellProps> = {}) {
  return render(
    <AppShell payload={PAYLOAD} showBandIndex now={NOW} {...props}>
      <p>document body</p>
    </AppShell>,
  );
}

describe("AppShell", () => {
  it("renders the product identity and the children it frames", () => {
    renderShell();
    expect(screen.getByText("Catalogus")).not.toBeNull();
    expect(screen.getByText("document body")).not.toBeNull();
  });

  it("puts the identity in a banner landmark, so the chrome is skippable", () => {
    renderShell();
    const banner = screen.getByRole("banner");
    expect(banner.textContent).toContain("Catalogus");
    // The document is framed by the shell, not inside its banner -- a
    // screen-reader user skipping the banner must not skip the page.
    expect(banner.textContent).not.toContain("document body");
  });

  it("names the project beside the wordmark once a manifest has loaded", () => {
    renderShell();
    expect(screen.getByRole("banner").textContent).toContain("Scratch");
  });

  // The manifest path used to sit in the top bar and moved out with the
  // approved shell: the mockup never shows one there. It is in the rail and
  // the footer instead, and this asserts the bar is not a third copy.
  it("keeps the manifest path out of the top bar, where the approved shell never puts it", () => {
    renderShell();
    expect(screen.getByRole("banner").textContent).not.toContain(PAYLOAD.manifestPath);
    expect(screen.getByRole("contentinfo").textContent).toContain(PAYLOAD.manifestPath);
  });

  // The load and error states pass no payload. At that point there is no
  // answer for any of it, so the rail and the footer are absent rather than
  // rendered with placeholders -- an empty element, an "unknown", or a stale
  // previous path would all pass a test that only checked the loaded case.
  it("renders no rail, no footer and no project name while nothing is loaded", () => {
    renderShell({ payload: undefined });
    expect(screen.getByText("Catalogus")).not.toBeNull();
    expect(screen.getByText("document body")).not.toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByText("Scratch")).toBeNull();
    expect(screen.queryByText("An API and one database.")).toBeNull();
  });

  it("shows the rail's identity block and its band index on the list view", () => {
    renderShell();
    expect(screen.getByText("An API and one database.")).not.toBeNull();
    const bandNav = screen.getByRole("navigation", { name: "Bands" });
    // Scoped to the nav itself, not the whole render -- the footer carries
    // its own link since docs/menus-brief.md (Documentation), and this
    // assertion is about the rail's anchors, not a count of every link on
    // the page.
    expect(within(bandNav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["#band-production", "#band-holds"]);
  });

  /*
   * The graph, the migrations board and a service page mount no band sections,
   * so their anchors would jump nowhere. Neither the mockup nor FIRST VIEWPORT
   * describes a rail for those views, so the rail keeps its identity and drops
   * the index rather than growing a graph index nobody has designed.
   *
   * Asserting that the identity *survives* is the half that matters: hiding the
   * whole rail would also make the anchors go away, and would be a different
   * shell at three of the four destinations.
   */
  it("keeps the rail's identity but drops the band index where the anchors have no target", () => {
    renderShell({ showBandIndex: false });
    // The architecture sentence is the rail's alone -- the bar names the
    // project too, so "Scratch" appears twice and proves nothing about which
    // of the two survived.
    expect(screen.getByText("An API and one database.")).not.toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    // The band index is the rail's only link -- the footer's own
    // Documentation link (Footer.tsx, docs/menus-brief.md) is unrelated to
    // the band index and stays regardless, so this checks that the one link
    // left is the footer's, not that the page carries none at all.
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]!.textContent).toBe("Documentation");
  });

  it("renders the board head above the children when one is handed to it", () => {
    renderShell({ boardHead: <span>view rail</span> });
    const main = screen.getByRole("main");
    expect(main.textContent).toBe("view raildocument body");
  });

  // The service page hands no board head, because the toggle selects between
  // three views of the project and a page is not one of them (App.tsx).
  it("renders no board head at all when none is handed to it", () => {
    renderShell({ boardHead: undefined });
    expect(screen.getByRole("main").textContent).toBe("document body");
  });

  /*
   * The cluster's three triggers, each now claiming a real menu behind it
   * (docs/menus-brief.md, 2026-09-05) -- `aria-haspopup="menu"` for Help and
   * Profile (both `role="menu"`), `"true"` for Settings (a labelled region,
   * not a menu -- SettingsPanel.tsx's own header). `aria-expanded="false"`
   * while closed, never absent: an unbuilt trigger carried no attribute at
   * all (the shape this test used to assert, before this brief), and the
   * built one states its own closed state rather than saying nothing.
   */
  it("renders the three cluster triggers, each claiming its real, closed menu", () => {
    renderShell();
    for (const [name, haspopup] of [
      ["Help", "menu"],
      ["Settings", "true"],
      ["Profile", "menu"],
    ] as const) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-haspopup")).toBe(haspopup);
      expect(button.getAttribute("aria-expanded")).toBe("false");
    }
  });

  /*
   * The avatar carries no initials, and this is the assertion that keeps it
   * that way. There is no account system -- Phase 5 is unbuilt -- so there is
   * no name, no email and no initial to render, and CLAUDE.md's ask-never-guess
   * rule makes an empty disc the honest render. The mockup fills it with a real
   * person's initials and its menu with a real name and email; a shell that
   * copied those would be stating an account fact this repo does not have, and
   * would look exactly right while doing it.
   */
  it("draws the profile disc empty, because there is no account for it to name", () => {
    renderShell();
    const profile = screen.getByRole("button", { name: "Profile" });
    expect(profile.textContent).toBe("");
  });
});

/*
 * The three menus themselves (docs/menus-brief.md, 2026-09-05): what each
 * component's own test file covers is its content (HelpMenu.test.tsx,
 * SettingsPanel.test.tsx, ProfileMenu.test.tsx); what belongs here is the
 * shell behaviour every one of the three shares, because AppShell.tsx is the
 * one file that owns it -- open/close, one at a time, Escape, outside click,
 * and the global `?` shortcut.
 */
describe("AppShell -- the three menus", () => {
  it("opens a surface on click, and its trigger's aria-expanded says so", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Help" });
    expect(screen.queryByRole("menu", { name: "Help" })).toBeNull();

    fireEvent.click(trigger);

    expect(screen.getByRole("menu", { name: "Help" })).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("toggles the same surface closed on a second click of its own trigger", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Help" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Help" })).not.toBeNull();

    fireEvent.click(trigger);
    expect(screen.queryByRole("menu", { name: "Help" })).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape and returns focus to the trigger that opened it", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(trigger);
    expect(screen.getByRole("region", { name: "Display settings" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("region", { name: "Display settings" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a click outside the surface and its own trigger", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(screen.getByRole("menu", { name: "Profile" })).not.toBeNull();

    // "document body" is App.tsx's own content, rendered by AppShell as
    // `children` -- as far outside the cluster as this render gets.
    fireEvent.pointerDown(screen.getByText("document body"));

    expect(screen.queryByRole("menu", { name: "Profile" })).toBeNull();
  });

  // Each surface, not one standing for the three: the outside-click handler is
  // shared, but a test that named only Profile let a mutation removing the
  // handler fail on one assertion where the brief asked for each (validator,
  // 2026-09-05).
  it.each([
    ["Help", "menu"],
    ["Settings", "region"],
  ] as const)("closes the %s surface on a click outside it", (trigger, role) => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    const name = trigger === "Settings" ? "Display settings" : trigger;
    expect(screen.getByRole(role, { name })).not.toBeNull();

    fireEvent.pointerDown(screen.getByText("document body"));

    expect(screen.queryByRole(role, { name })).toBeNull();
  });

  it("opens Help on its shortcut list when the profile menu's Keyboard shortcuts item asked for it, and folded from the trigger", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Keyboard shortcuts" }));

    const help = screen.getByRole("menu", { name: "Help" });
    expect(within(help).getByRole("menuitem", { name: /Keyboard shortcuts/ }).getAttribute("aria-expanded")).toBe("true");

    // Close it and reopen from the trigger: folded again, as the mockup draws it.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const reopened = screen.getByRole("menu", { name: "Help" });
    expect(within(reopened).getByRole("menuitem", { name: /Keyboard shortcuts/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("does not close on a pointerdown inside the open surface itself", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const menu = screen.getByRole("menu", { name: "Help" });

    fireEvent.pointerDown(menu);

    expect(screen.getByRole("menu", { name: "Help" })).not.toBeNull();
  });

  it("keeps exactly one menu open: opening a second closes the first", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("menu", { name: "Help" })).not.toBeNull();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.queryByRole("menu", { name: "Help" })).toBeNull();
    expect(screen.getByRole("region", { name: "Display settings" })).not.toBeNull();
  });

  it("moves focus into the opened surface -- Settings' own first selected radio", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Monochrome" }));
  });

  it("traps Tab inside the open surface, wrapping from the last item back to the first", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const menu = screen.getByRole("menu", { name: "Help" });
    const items = within(menu).getAllByRole("menuitem");
    const last = items[items.length - 1]!;

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(items[0]);
  });

  it("traps Shift+Tab inside the open surface, wrapping from the first item back to the last", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const menu = screen.getByRole("menu", { name: "Help" });
    const items = within(menu).getAllByRole("menuitem");

    items[0]!.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  // The shortcut HelpMenu.tsx itself advertises (its own "Keyboard shortcuts"
  // row) -- this is the assertion that the key actually does what the panel
  // claims, per docs/menus-brief.md's "a shortcut the panel advertises but
  // the app ignores is a lie".
  it("opens the Help menu on '?'", () => {
    renderShell();
    expect(screen.queryByRole("menu", { name: "Help" })).toBeNull();

    fireEvent.keyDown(document, { key: "?" });

    expect(screen.getByRole("menu", { name: "Help" })).not.toBeNull();
  });

  it("does nothing on '?' while nothing has loaded -- there is no cliCommands/cliVersion yet to show", () => {
    renderShell({ payload: undefined });
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.queryByRole("menu", { name: "Help" })).toBeNull();
  });
});

/*
 * `sidePanel`, added 2026-09-04 for the entry page's facts panel
 * (ServicePage.tsx's `ServicePagePanel`, docs/candidates/candidate-e-brandpage.html's
 * artboard 3, decision 6). Two things this brief has to prove that no test
 * above does: that the panel actually lands where the mockup puts it -- a
 * flex sibling of `.board` inside `.shell`, not a child of the board or of
 * this file's own markup -- and that a view which passes none renders a row
 * whose class list and children are exactly what they were before this prop
 * existed, not "the same plus a modifier that happens to do nothing yet".
 * jsdom computes no layout, so "identically" here means the DOM structure and
 * the class *strings* jsdom can see, not a measured pixel -- the same limit
 * this file's own header states for the 900px/480px breakpoints.
 */
describe("AppShell -- the side panel", () => {
  it("mounts the panel as a sibling of the board inside the shell row, not a child of either", () => {
    renderShell({ sidePanel: <aside data-testid="panel">panel content</aside> });

    const main = screen.getByRole("main");
    const panel = screen.getByTestId("panel");
    const shell = main.parentElement;

    // Same parent, and that parent is the shell row -- proven by its other
    // known child, the rail, sitting beside both.
    expect(panel.parentElement).toBe(shell);
    expect(main.parentElement).toBe(shell);
    expect(shell?.contains(screen.getByRole("navigation", { name: "Bands" }))).toBe(true);

    // After the board, per the mockup's own words ("a sibling of .board, not
    // a child of it") and AppShell.tsx's own comment on render order.
    const children = Array.from(shell?.children ?? []);
    expect(children.indexOf(main)).toBeLessThan(children.indexOf(panel));

    // The panel's own content reaches the screen through the slot -- this
    // component supplies no chrome of its own around it (AppShellProps'
    // `sidePanel` comment).
    expect(screen.getByText("panel content")).not.toBeNull();
  });

  it("does not render the panel at all when none is handed to it", () => {
    renderShell({ sidePanel: undefined });
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("marks the shell row `.withPanel` only when a panel is present", () => {
    const { unmount } = renderShell({ sidePanel: <aside data-testid="panel">panel content</aside> });
    const shellWithPanel = screen.getByRole("main").parentElement;
    expect(shellWithPanel?.classList.contains(styles.withPanel ?? "")).toBe(true);
    unmount();

    renderShell({ sidePanel: undefined });
    const shellWithoutPanel = screen.getByRole("main").parentElement;
    expect(shellWithoutPanel?.classList.contains(styles.withPanel ?? "")).toBe(false);
  });

  /*
   * The frozen shell's own promise, restated for this prop: a board view
   * (no `sidePanel`) renders the exact row it rendered before this prop
   * existed. Not "contains the same class plus an empty modifier" -- the
   * class *string* itself, compared for equality, which is what catches the
   * `${styles.shell} ${sidePanel ? styles.withPanel : ""}` shape of bug (a
   * trailing space appended even when there is nothing to append) that an
   * `expect(...).toContain(styles.shell)` assertion would miss entirely.
   */
  // The panel is a rail docked at the window's edge, and the board beside it
  // keeps the wall's left edge by giving the panel's width back out of its
  // cap (AppShell.module.css's own comment on `.withPanel > .board` carries
  // the arithmetic and the two builds the owner declined). jsdom lays nothing
  // out, so what a test can hold is the rule's text: the reduced cap, and
  // no margin on either the board or the panel that would pull the panel off
  // the edge -- that second build was reverted the same evening, and this
  // keeps it from coming back as a plausible tidy-up.
  it("reduces the board's cap by the panel's width, and re-centres nothing", () => {
    const css = readFileSync(fileURLToPath(import.meta.url).replace(/AppShell\.test\.tsx$/, "AppShell.module.css"), "utf8");
    const boardStart = css.indexOf(".withPanel > .board {");
    const boardRule = css.slice(boardStart, css.indexOf("}", boardStart));
    expect(boardStart).toBeGreaterThan(-1);
    expect(boardRule).toMatch(/max-width:\s*calc\(var\(--board-max-width\)\s*-\s*var\(--page-facts-width\)\)/);
    expect(boardRule).not.toMatch(/margin/);
    // No rule against the panel (the board's next sibling) at all: a selector
    // line, not a mention in a comment, is what this looks for.
    expect(css).not.toMatch(/^\.withPanel\s*>\s*\.board\s*\+/m);
  });

  it("keeps the shell row's class string byte-identical to before this prop existed, when no panel is passed", () => {
    renderShell({ sidePanel: undefined });
    const shell = screen.getByRole("main").parentElement;
    expect(shell?.className).toBe(styles.shell);
  });

  it("still renders exactly the rail and the board as the row's children when no panel is passed", () => {
    renderShell({ sidePanel: undefined });
    const shell = screen.getByRole("main").parentElement;
    expect(shell?.children).toHaveLength(2);
  });
});
