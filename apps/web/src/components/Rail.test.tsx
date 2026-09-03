// @vitest-environment jsdom
//
// The rail's two jobs are identity and finding, and each has one way to be
// silently wrong. Identity fails by *filling* a field nobody answered -- a
// visibility chip on a project whose manifest declares none reads as an answer
// (CLAUDE.md, ask-never-guess), and absence is what has to be asserted, not
// presence. Finding fails by pointing somewhere that does not exist: an anchor
// whose target is not on the page produces no error, no console warning and a
// click that looks like a page which failed to scroll.
//
// Whether the rail is *visible* at a given width is not tested here and cannot
// be: it is one `display: none` in a media query, jsdom computes no styles, and
// a test asserting on a CSS Module's synthesised class name proves only that
// the class was applied. What is testable is the content, so that is what these
// cover.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BANDS, groupIntoBands } from "../bands.js";
import { makeViewService } from "../test-support/fixtures.js";
import { BandModule } from "./BandModule.js";
import { Rail, bandSectionDomId } from "./Rail.js";

afterEach(() => cleanup());

const MANIFEST_PATH = "C:/scratch/project/catalogus.yaml";

/** Two entries that land in two different bands -- `hosting` -> production, `database` -> holds. */
const SERVICES = [
  makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", name: "Fly.io", service: "flyio" }),
  makeViewService({ id: "fly-web", role: "hosting-web", rollup: "hosting", name: "Fly.io", service: "flyio" }),
  makeViewService({ id: "supabase-db", role: "database", rollup: "database", name: "Supabase", service: "supabase" }),
];

function renderRail(overrides: { project?: Parameters<typeof Rail>[0]["project"]; bands?: Parameters<typeof Rail>[0]["bands"] } = {}) {
  return render(
    <Rail
      project={overrides.project ?? { name: "Scratch", slug: "scratch" }}
      manifestPath={MANIFEST_PATH}
      bands={overrides.bands ?? groupIntoBands(SERVICES)}
    />,
  );
}

describe("Rail", () => {
  it("names the project and the file being served", () => {
    renderRail();
    expect(screen.getByText("Scratch")).not.toBeNull();
    expect(screen.getByText(MANIFEST_PATH)).not.toBeNull();
  });

  // Not an `<h1>`. The document's heading belongs to whatever the board is
  // showing -- on a service page that is the service -- and App.tsx's masthead
  // comment records what two `<h1>`s on one document cost.
  it("sets the project name as chrome, not as the document's heading", () => {
    renderRail();
    expect(screen.queryByRole("heading", { name: "Scratch" })).toBeNull();
  });

  it("shows the visibility the manifest declares", () => {
    renderRail({ project: { name: "Scratch", slug: "scratch", vcs: { visibility: "private" } } });
    // The manifest's own lower-case word is what the DOM carries; the chip is
    // uppercased in CSS, so a reader copying it out gets the manifest's value.
    expect(screen.getByText("private")).not.toBeNull();
  });

  // The half that matters. A chip reading "private" on a project nobody
  // answered for is a wrong answer that looks like a right one, and it is the
  // exact defect CLAUDE.md records `init` shipping.
  it("shows no visibility chip at all when the manifest declares none", () => {
    // Rendered with no band index, so the chip is the only `<span>` this rail
    // could produce: asserting on the element's absence rather than on the
    // absence of three guessed words is what makes this fail for a chip
    // reading anything at all, including an empty one.
    const { container } = renderRail({ project: { name: "Scratch", slug: "scratch" }, bands: [] });
    expect(container.querySelector("span")).toBeNull();
  });

  it("shows the architecture sentence when someone wrote one", () => {
    renderRail({ project: { name: "Scratch", slug: "scratch", architecture: "An API and one database." } });
    expect(screen.getByText("An API and one database.")).not.toBeNull();
  });

  it("renders no sentence element when the manifest has no architecture, rather than an empty paragraph", () => {
    const { container } = renderRail({ project: { name: "Scratch", slug: "scratch" } });
    expect(container.querySelector("p")).toBeNull();
  });

  it("indexes one anchor per band that has services, in the board's own order, with its count", () => {
    renderRail();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Runs in production2", "Holds data1"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["#band-production", "#band-holds"]);
  });

  // Empty bands are dropped by `groupIntoBands` and the rail must not
  // reintroduce them: a project with no queue should not be shown a hole where
  // a queue would go (bands.ts's own reasoning).
  it("indexes only the bands that have services, not all eight", () => {
    renderRail();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(BANDS.length).toBeGreaterThan(2);
  });

  // The graph, the migrations board and a service page mount no band sections,
  // so the caller passes an empty list. The identity block stays; the index and
  // its divider go, rather than a heading standing over nothing.
  it("drops the index, its heading and its divider when there are no bands to point at", () => {
    renderRail({ bands: [] });
    expect(screen.getByText("Scratch")).not.toBeNull();
    expect(screen.queryByText("Bands")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  // A navigation landmark holding a project name and nothing to navigate to
  // announces a promise the element does not keep, which is why the rail is a
  // plain `<div>` and only the index is a `<nav>`.
  it("puts the index in a named navigation landmark, and nothing else in one", () => {
    renderRail();
    const nav = screen.getByRole("navigation", { name: "Bands" });
    expect(nav.textContent).not.toContain("Scratch");
    expect(nav.textContent).not.toContain(MANIFEST_PATH);
  });

  /*
   * The anchor actually lands.
   *
   * `BandModule` builds its section's `id` from the same `band-<id>` scheme
   * this file's `bandSectionDomId` writes, in a file this brief could not edit,
   * so the scheme is written twice and nothing in either file couples them.
   * This is the coupling: a real `BandModule` is rendered and the rail's own
   * href is resolved against the document. Change either half and this goes
   * red -- which is the only thing standing between the index and the shape of
   * defect this repo has shipped twice, a lookup by a duplicated id scheme that
   * silently finds nothing.
   */
  it("points at the id BandModule actually emits, resolved against a real one", () => {
    const production = groupIntoBands(SERVICES)[0]!;
    render(
      <BandModule
        band={production.band}
        services={production.services}
        readAt="2026-08-24T00:00:00.000Z"
        selectedId={null}
        onActivate={vi.fn()}
        onPeek={vi.fn()}
        onPeekEnd={vi.fn()}
      />,
    );
    renderRail();

    const href = screen.getByRole("link", { name: /Runs in production/ }).getAttribute("href")!;
    expect(href.startsWith("#")).toBe(true);
    const target = document.getElementById(href.slice(1));
    expect(target, `nothing on the page has the id ${href} -- the anchor jumps nowhere`).not.toBeNull();
    expect(target!.tagName.toLowerCase()).toBe("section");
  });

  it("builds the anchor id from the band id and nothing else", () => {
    expect(bandSectionDomId("production")).toBe("band-production");
    expect(bandSectionDomId("unplaced")).toBe("band-unplaced");
  });
});
