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
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { makeViewPayload, makeViewService } from "../test-support/fixtures.js";
import { AppShell, type AppShellProps } from "./AppShell.js";

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
