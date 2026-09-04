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

import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("navigation", { name: "Bands" })).not.toBeNull();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["#band-production", "#band-holds"]);
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
    expect(screen.queryAllByRole("link")).toHaveLength(0);
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
   * The cluster. Three triggers, no menus -- those are a separate brief -- and
   * the point of this test is what the triggers must *not* claim in the
   * meantime. `aria-haspopup` and `aria-expanded` would each announce a menu
   * that nothing opens, which is worse than announcing nothing: a screen-reader
   * user is told to press for a menu and gets silence.
   */
  it("renders the three cluster triggers, announcing no menu behind them yet", () => {
    renderShell();
    for (const name of ["Help", "Settings", "Profile"]) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-haspopup")).toBeNull();
      expect(button.getAttribute("aria-expanded")).toBeNull();
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
  // The pair is the page (AppShell.module.css's own comment on `.withPanel >
  // .board`): jsdom lays nothing out, so the one thing a test can hold is
  // the rule itself -- the board gives the panel's width back out of its cap
  // and its right margin, the panel takes the auto right margin, and the two
  // centre as one unit exactly as wide as the board alone.
  it("caps board plus panel to the board's own width and centres them as one unit", () => {
    const css = readFileSync(fileURLToPath(import.meta.url).replace(/AppShell\.test\.tsx$/, "AppShell.module.css"), "utf8");
    const boardStart = css.indexOf(".withPanel > .board {");
    const boardRule = css.slice(boardStart, css.indexOf("}", boardStart));
    expect(boardStart).toBeGreaterThan(-1);
    expect(boardRule).toMatch(/max-width:\s*calc\(var\(--board-max-width\)\s*-\s*var\(--page-facts-width\)\)/);
    expect(boardRule).toMatch(/margin-right:\s*0/);
    const panelStart = css.indexOf(".withPanel > .board + * {");
    const panelRule = css.slice(panelStart, css.indexOf("}", panelStart));
    expect(panelStart).toBeGreaterThan(-1);
    expect(panelRule).toMatch(/margin-left:\s*0/);
    expect(panelRule).toMatch(/margin-right:\s*auto/);
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
