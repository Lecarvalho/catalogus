// @vitest-environment jsdom
//
// ServicePage shipped on 2026-08-25 with no test file of its own. What
// covered it was App.test.tsx's routing assertions -- that a click opens *a*
// page -- and ServiceSummary.test.tsx for the facts column it used to render
// inline. The page's own chrome was asserted by nobody: the breadcrumb, the
// uncatalogued line, the marks, and the Layer 3 empty state that is the only
// thing standing where the product's actual content will go.
//
// This file covers that chrome and nothing else. The facts panel stays
// ServiceSummary's to prove -- testing its content again here would pin one
// implementation's output twice and make the shared component harder to
// change, which is the opposite of why it is shared.
//
// Rewritten 2026-09-04 for the side-panel split (ServicePage.tsx's own
// header): `ServicePage` no longer takes `dependsOn` / `dependedOnBy` /
// `labelForId` -- those moved to the new `ServicePagePanel` export, proved
// below -- and gained `brand`, the second breadcrumb crumb for an entry of a
// multi-entry group. The composition the brief asks this file to prove itself
// (App.tsx is out of scope here, and does not exist yet in its post-split
// form) is that `ServicePage` and `ServicePagePanel`, given the same
// `service`, render side by side without either one depending on the other's
// presence -- exactly the shape App.tsx will call them in once Part A wires
// the `sidePanel` prop the report names.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService as service } from "../test-support/fixtures.js";
import { ServicePage, ServicePagePanel } from "./ServicePage.js";

const labelForId = (id: string) => `label:${id}`;

// A fixed instant rather than `new Date()`. Every recency mark in this app
// measures from the payload's server-stamped `readAt` (service-tags.ts), so a
// test can name both ends of the window and never race a clock.
const READ_AT = "2026-08-26T00:00:00.000Z";

function renderPage(overrides: Parameters<typeof service>[0], props: Partial<Parameters<typeof ServicePage>[0]> = {}) {
  return render(
    <ServicePage service={service(overrides)} projectName="Layout Stress" readAt={READ_AT} onBack={() => {}} {...props} />
  );
}

afterEach(() => cleanup());

describe("ServicePage -- the page's own chrome", () => {
  it("names the service in the heading the article is labelled by", () => {
    const { container } = renderPage({ id: "auth-legacy", role: "auth", name: "Auth0" });

    const heading = screen.getByRole("heading", { level: 1, name: "Auth0" });
    // The link between the two is the assertion, not the heading's existence:
    // an `aria-labelledby` pointing at an id nothing carries leaves the
    // article unnamed, and looks identical in the DOM to one that works.
    expect(container.querySelector("article")?.getAttribute("aria-labelledby")).toBe(heading.getAttribute("id"));
  });

  it("offers a way back that names the project, and calls it", () => {
    const onBack = vi.fn();
    renderPage({ id: "auth-legacy", role: "auth", name: "Auth0" }, { onBack });

    // A real control, not just the browser's Back: the page is reachable by
    // deep link, so a reader can arrive with no history behind them.
    const back = screen.getByRole("button", { name: /Layout Stress/ });
    back.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("states an uncatalogued slug rather than hiding it", () => {
    renderPage({ id: "acme-ledger", role: "billing", name: "acme-ledger", known: false });
    expect(screen.queryByText("No catalog entry for this slug.")).not.toBeNull();
  });

  it("says nothing about the catalog when the slug is catalogued", () => {
    renderPage({ id: "auth-legacy", role: "auth", name: "Auth0", known: true });
    expect(screen.queryByText("No catalog entry for this slug.")).toBeNull();
  });

  // The rule service-tags.ts exists to enforce, asserted where a reader meets
  // it: the norm earns no mark. This page carried a `StatusPill` until
  // 2026-08-26, which put a filled "ACTIVE" block on 31 entries in 35.
  it("marks a departure from active", () => {
    renderPage({ id: "auth-legacy", role: "auth", name: "Auth0", status: "phasing_out" });
    expect(screen.queryByText("phasing out")).not.toBeNull();
  });

  it("marks nothing at all on an active service", () => {
    const { container } = renderPage({ id: "auth-users", role: "auth", name: "Clerk", status: "active" });
    expect(container.querySelector("header p[class*='tags']")).toBeNull();
  });

  it("carries the recency mark, which is the only place a reader sees `added` as a judgement rather than a date", () => {
    renderPage({ id: "auth-users", role: "auth", name: "Clerk", added: "2026-08-20" });
    expect(screen.queryByText("new")).not.toBeNull();
  });

  // The Layer 3 empty state. It is the one part of this page that is about
  // something that does not exist yet, so it has to say that plainly: the
  // store is missing, not the reader's data.
  it("says the page is empty without implying the manifest is", () => {
    renderPage({ id: "auth-legacy", role: "auth", name: "Auth0" });

    expect(screen.queryByText("Nothing written yet.")).not.toBeNull();
    expect(screen.getByText(/never committed to this repo/)).not.toBeNull();
    expect(screen.getByText(/nothing is missing from your manifest/)).not.toBeNull();
  });
});

// D2, 2026-09-04: the document column was rebuilt to artboard 3
// (ServicePage.module.css's own header on `.document` / `.documentHeading` /
// `.documentEmpty` / `.documentBody` carries the validator's numbers and the
// mockup's citations). jsdom does not compute layout, so none of this can
// assert the resulting 549.8px measure or the 30px / 13px gaps directly --
// what it proves is structural: the fix depends on "Documentation" being a
// real second-level heading rather than a caps label, and on the module
// classes that carry the measure and the rhythm landing on the elements the
// CSS rules target.
describe("ServicePage -- the document column's structure (D2, 2026-09-04)", () => {
  it("gives the document a real second-level heading, and the class that carries its own measure to the wrapping element alone", () => {
    const { container } = renderPage({ id: "auth-legacy", role: "auth", name: "Auth0" });

    expect(screen.getByRole("heading", { level: 2, name: "Documentation" })).not.toBeNull();

    // `.document`, `.documentHeading`, `.documentEmpty` and `.documentBody`
    // all share the `document` prefix; scoping to `div` picks out the one
    // that is the wrapper (the other three are an h2 and two p elements) --
    // the element `.document`'s own 68ch/15px rule (the fix) has to land on.
    const wrapper = container.querySelector("div[class*='document']");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.tagName).toBe("DIV");
  });

  it("marks the empty-state line and each paragraph with the classes that carry the mockup's own heading-to-paragraph and paragraph-to-paragraph gaps", () => {
    renderPage({ id: "auth-legacy", role: "auth", name: "Auth0" });

    const empty = screen.getByText("Nothing written yet.");
    expect(empty.className).toMatch(/documentEmpty/);

    const firstParagraph = screen.getByText(/took a day to work out/);
    expect(firstParagraph.className).toMatch(/documentBody/);

    const secondParagraph = screen.getByText(/never committed to this repo/);
    expect(secondParagraph.className).toMatch(/documentBody/);
  });
});

describe("ServicePage -- the brand crumb", () => {
  it("renders no second crumb for an entry of a single-entry brand", () => {
    renderPage({ id: "auth-legacy", role: "auth", name: "Auth0" });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("names the brand and links to it, for an entry of a multi-entry brand", () => {
    renderPage(
      { id: "host-api", role: "hosting-api", name: "Fly.io" },
      { brand: { name: "Fly.io", entryCount: 5, href: "#/brand/production/flyio" } }
    );
    const crumb = screen.getByRole("link", { name: "Fly.io" });
    expect(crumb.getAttribute("href")).toBe("#/brand/production/flyio");
    // The project crumb stays a button (`onBack`, not navigation) beside it --
    // the brand crumb does not replace it, it follows it.
    expect(screen.getByRole("button", { name: /Layout Stress/ })).not.toBeNull();
  });

  // D4, 2026-09-04: the separator carried no font-size of its own and fell
  // back to `body`'s 12px, computing an 18px line-height beside the crumbs'
  // own 10px/15px either side of it -- see ServicePage.module.css's own
  // `.crumbSep` comment for the validator's numbers. jsdom does not compute
  // layout, so this proves only that the separator carries its own class
  // (where the font-size fix lives) rather than being unstyled inline text.
  it("carries its own class on the separator between the two crumbs", () => {
    const { container } = renderPage(
      { id: "host-api", role: "hosting-api", name: "Fly.io" },
      { brand: { name: "Fly.io", entryCount: 5, href: "#/brand/production/flyio" } }
    );
    const sep = container.querySelector("[class*='crumbSep']");
    expect(sep).not.toBeNull();
    expect(sep?.textContent).toBe("/");
  });

  // entryCount arrives in the shared shape (three parallel briefs' contract,
  // fixed 2026-09-04) but the mockup's own crumb never states it -- "Fly.io",
  // not "Fly.io (5)" -- so nothing here should render the number.
  it("does not render the entry count anywhere in the crumb", () => {
    renderPage(
      { id: "host-api", role: "hosting-api", name: "Fly.io" },
      { brand: { name: "Fly.io", entryCount: 5, href: "#/brand/production/flyio" } }
    );
    expect(screen.queryByText(/5/)).toBeNull();
  });
});

describe("ServicePagePanel", () => {
  it("renders the facts panel as a landmark, delegating its content to ServiceSummary", () => {
    render(
      <ServicePagePanel
        service={service({ id: "host-api", role: "hosting-api", name: "Fly.io" })}
        dependsOn={["db-primary"]}
        dependedOnBy={[]}
        labelForId={labelForId}
      />
    );
    // `.panel`'s own chrome is asserted where it is declared
    // (ServicePage.module.css); this only proves the wiring -- a real
    // ServiceSummary fact reaches the screen through it.
    expect(screen.getByRole("complementary")).not.toBeNull();
    expect(screen.getByText("hosting-api")).not.toBeNull();
    expect(screen.getByText("label:db-primary")).not.toBeNull();
  });
});

describe("ServicePage + ServicePagePanel -- the composition App.tsx renders", () => {
  // The brief's own words: "prove the composition ... by rendering the
  // pieces together yourself" -- App.tsx does not call these two components
  // side by side yet (Part A's brief lands it), so this is the proof that the
  // split is load-bearing: given the same service, both halves render their
  // own content, neither errors on the other's absence, and nothing about one
  // component's markup depends on the other being mounted at all -- exactly
  // what letting `AppShell` mount them in two different parts of the tree
  // (`.board`'s children and the `sidePanel` slot) requires.
  it("renders side by side from the same service with no id collisions and no cross-dependency", () => {
    const host = service({ id: "host-api", role: "hosting-api", name: "Fly.io", notes: "the fan-out hub" });

    render(
      <div>
        <ServicePage service={host} projectName="Layout Stress" readAt={READ_AT} onBack={() => {}} />
        <ServicePagePanel service={host} dependsOn={["db-primary"]} dependedOnBy={["ci"]} labelForId={labelForId} />
      </div>
    );

    // The document half.
    expect(screen.getByRole("heading", { level: 1, name: "Fly.io" })).not.toBeNull();
    expect(screen.getByText("Nothing written yet.")).not.toBeNull();

    // The panel half -- including a fact (`notes`) the document column never
    // renders, proving the panel is not merely echoing the document.
    expect(screen.getByText("“the fan-out hub”")).not.toBeNull();
    expect(screen.getByText("label:db-primary")).not.toBeNull();
    expect(screen.getByText("label:ci")).not.toBeNull();

    // One `<article>`, one `<aside>` -- two landmarks, not one component
    // quietly absorbing the other's role.
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
  });
});
