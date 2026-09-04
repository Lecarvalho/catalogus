// @vitest-environment jsdom
//
// Covers this page's own chrome the same way ServicePage.test.tsx covers
// its sibling: the breadcrumb, the header identity block and its once-only
// facts, the uncatalogued line, and the entries table this page adds that
// ServicePage does not have. What it deliberately does not re-prove is
// anything about `collapseByService`, `groupStatus` or the tile/popover that
// opens this page -- those are bands.ts's and Part A's own files and tests.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BandDefinition, VendorGroup } from "../bands.js";
import { hashForServiceId } from "../hash-route.js";
import { makeViewService as service } from "../test-support/fixtures.js";
import { BrandPage } from "./BrandPage.js";

// A plain literal rather than an import from bands.ts's own `BANDS` array:
// `BandDefinition` is a stable, brief-frozen shape (docs/brand-tile-brief.md,
// "Group shape"), and building the fixture by hand keeps this file's tests
// from depending on anything Part A's concurrent pass might still be editing
// in that file.
const PRODUCTION_BAND: BandDefinition = { id: "production", label: "Runs in production", note: "" };

/**
 * Builds a `VendorGroup` by hand from a non-empty list of entries, rather
 * than through `collapseByService` (bands.ts, Part A's file): `VendorGroup`
 * is a plain data shape frozen by the brief's shared contract, or so
 * assembling one directly here needs nothing from that file but its type.
 * The first entry stands for the group's own name/icon/rollup, the same
 * convention `collapseByService`'s own comment states.
 */
function makeGroup(entries: [ReturnType<typeof service>, ...ReturnType<typeof service>[]]): VendorGroup {
  const [first] = entries;
  return { service: first.service, name: first.name, icon: first.icon, rollup: first.rollup, entries };
}

/**
 * The value cell for a named header fact -- finds the `<dt>` by its label
 * (scoped to that tag, since this page also has an "Entries" *heading*
 * sharing the fact's own label), then reads the `<dd>` beside it in the same
 * wrapping `<div>`. Same convention as ServicePopover.test.tsx's own
 * `factValue`, whose fact grid has the identical one-`<div>`-per-fact shape.
 */
function factValue(label: string): string | null | undefined {
  return screen.getByText(label, { selector: "dt" }).closest("div")?.querySelector("dd")?.textContent;
}

const READ_AT = "2026-08-26T00:00:00.000Z";

function renderPage(group: VendorGroup, props: Partial<Parameters<typeof BrandPage>[0]> = {}) {
  return render(
    <BrandPage
      group={group}
      band={PRODUCTION_BAND}
      projectName="Layout Stress"
      readAt={READ_AT}
      onBack={() => {}}
      onOpenEntry={() => {}}
      {...props}
    />
  );
}

/** The Fly.io fixture the mockup itself draws (candidate-e-brandpage.html, artboard 1 and 2): five entries, one phasing out, none carrying a `replaced_by`. */
function flyGroup(): VendorGroup {
  return makeGroup([
    service({ id: "host-api", service: "fly-io", name: "Fly.io", role: "hosting-api", status: "active" }),
    service({ id: "host-cron", service: "fly-io", name: "Fly.io", role: "hosting-cron", status: "active" }),
    service({ id: "host-preview", service: "fly-io", name: "Fly.io", role: "hosting-preview", status: "phasing_out", version: "3.1" }),
    service({ id: "host-web", service: "fly-io", name: "Fly.io", role: "hosting-web", status: "active" }),
    service({ id: "host-worker", service: "fly-io", name: "Fly.io", role: "hosting-worker", status: "active" }),
  ]);
}

afterEach(() => cleanup());

describe("BrandPage -- the header identity block", () => {
  it("names the brand in the heading the article is labelled by", () => {
    const { container } = renderPage(flyGroup());

    const heading = screen.getByRole("heading", { level: 1, name: "Fly.io" });
    // The link between the two is the assertion, not the heading's mere
    // existence -- an `aria-labelledby` pointing at an id nothing carries
    // leaves the article unnamed and looks identical in the DOM to one that
    // works (ServicePage.test.tsx's identical check).
    expect(container.querySelector("article")?.getAttribute("aria-labelledby")).toBe(heading.getAttribute("id"));
  });

  it("states the catalog slug, mono, beside the name", () => {
    renderPage(flyGroup());
    expect(screen.getByText("fly-io")).not.toBeNull();
  });

  it("offers a way back that names the project, and calls it", () => {
    const onBack = vi.fn();
    renderPage(flyGroup(), { onBack });

    const back = screen.getByRole("button", { name: /Layout Stress/ });
    back.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("states an uncatalogued slug rather than hiding it", () => {
    const group = makeGroup([service({ id: "host-api", service: "fly-io", role: "hosting-api", known: false })]);
    renderPage(group);
    expect(screen.queryByText("No catalog entry for this slug.")).not.toBeNull();
  });

  it("says nothing about the catalog when the slug is catalogued", () => {
    renderPage(flyGroup());
    expect(screen.queryByText("No catalog entry for this slug.")).toBeNull();
  });

  it("renders the brand facts once -- Kind, Band and the entry count -- rather than per row", () => {
    renderPage(flyGroup());

    // Kind: taken from the first entry, per this file's own header comment
    // on why a group carries no `kind` of its own.
    expect(factValue("Kind")).toBe("service");
    expect(factValue("Band")).toBe("Runs in production");
    expect(factValue("Entries")).toBe("5");
  });
});

describe("BrandPage -- the entries table", () => {
  it("renders every entry as a link to its own page, with the right href", () => {
    renderPage(flyGroup());

    for (const id of ["host-api", "host-cron", "host-preview", "host-web", "host-worker"]) {
      const link = screen.getByRole("link", { name: new RegExp(id) });
      expect(link.getAttribute("href")).toBe(hashForServiceId(id));
    }
  });

  it("lists entries in the group's own order -- keyboard order matches the visual one", () => {
    renderPage(flyGroup());

    const ids = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(ids).toEqual(["host-api", "host-cron", "host-preview", "host-web", "host-worker"].map((id) => hashForServiceId(id)));
  });

  it("opens an entry through the callback rather than the browser's own hash navigation", () => {
    const onOpenEntry = vi.fn();
    renderPage(flyGroup(), { onOpenEntry });

    screen.getByRole("link", { name: /host-web/ }).click();
    expect(onOpenEntry).toHaveBeenCalledTimes(1);
    expect(onOpenEntry).toHaveBeenCalledWith("host-web");
  });

  it("shows each entry's role beneath its id", () => {
    renderPage(flyGroup());
    expect(screen.getByRole("link", { name: /host-api/ }).textContent).toContain("hosting-api");
  });

  it("renders 'not tracked', dimmed, rather than an empty cell, when an entry has no version", () => {
    renderPage(flyGroup());
    // host-api carries no version override; host-preview was built with one.
    const apiRow = screen.getByRole("link", { name: /host-api/ });
    expect(apiRow.textContent).toContain("not tracked");
    const previewRow = screen.getByRole("link", { name: /host-preview/ });
    expect(previewRow.textContent).toContain("3.1");
  });

  // The load-bearing difference from the tile and the popover: this is a
  // labelled table column, so it states the norm too, unlike every other
  // status surface in this app (service-tags.ts's whole point).
  it("states Status for every row, including the norm", () => {
    renderPage(flyGroup());
    expect(screen.getByRole("link", { name: /host-api/ }).textContent).toContain("Active");
    expect(screen.getByRole("link", { name: /host-preview/ }).textContent).toContain("Phasing out");
  });

  it("names the four columns once, in a header row that is not itself a link", () => {
    renderPage(flyGroup());
    for (const label of ["Id", "Role", "Status", "Version"]) {
      expect(screen.getByText(label).closest("a")).toBeNull();
    }
  });

  // D3, 2026-09-04: the Entries block carried no width of its own, so its
  // rows spanned the page's full 1280px measure with ~310px columns and a
  // 1296px hover stripe -- see BrandPage.module.css's own `.doc` comment for
  // the validator's numbers and the mockup's citation. jsdom does not
  // compute layout, so this proves only the structure the fix depends on:
  // the heading and the rows table share one ancestor carrying the module
  // class `.doc`'s 68ch rule attaches to, rather than each spanning the
  // page on its own.
  it("wraps the Entries heading and the rows table in one measured column", () => {
    const { container } = renderPage(flyGroup());

    const doc = container.querySelector("section[class*='doc']");
    expect(doc).not.toBeNull();
    expect(doc?.querySelector("h2")?.textContent).toBe("Entries");
    expect(doc?.querySelector("[class*='rows']")).not.toBeNull();
  });
});

describe("BrandPage -- a one-entry group, which never reaches this page in practice", () => {
  // Part A only opens BrandPage for a multi-entry group (docs/brand-tile-
  // brief.md: "a single-entry tile still opens the entry page directly"),
  // so this is a defensive render rather than a reachable one -- the brief
  // asks for it explicitly, and the assertion is what the brief itself
  // predicts: the bare count, never the phrase "1 entry".
  it("renders sanely, and never states the phrase '1 entry'", () => {
    const group = makeGroup([service({ id: "solo-host", service: "solo-vendor", name: "Solo Vendor", role: "hosting-api" })]);
    renderPage(group);

    expect(screen.getByRole("heading", { level: 1, name: "Solo Vendor" })).not.toBeNull();
    expect(factValue("Entries")).toBe("1");
    expect(screen.queryByText("1 entry")).toBeNull();
    expect(screen.queryByText(/1 entry\b/)).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
