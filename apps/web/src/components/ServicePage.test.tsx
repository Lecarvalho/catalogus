// @vitest-environment jsdom
//
// ServicePage shipped on 2026-08-25 with no test file of its own. What
// covered it was App.test.tsx's routing assertions -- that a click opens *a*
// page -- and ServiceSummary.test.tsx for the facts column it borrows. The
// page's own chrome was asserted by nobody: the breadcrumb, the uncatalogued
// line, the marks, and the Layer 3 empty state that is the only thing
// standing where the product's actual content will go.
//
// This file covers that chrome and nothing else. The facts column stays
// ServiceSummary's to prove -- testing it again here would pin one
// implementation's output twice and make the shared component harder to
// change, which is the opposite of why it is shared.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService as service } from "../test-support/fixtures.js";
import { ServicePage } from "./ServicePage.js";

const labelForId = (id: string) => `label:${id}`;

// A fixed instant rather than `new Date()`. Every recency mark in this app
// measures from the payload's server-stamped `readAt` (service-tags.ts), so a
// test can name both ends of the window and never race a clock.
const READ_AT = "2026-08-26T00:00:00.000Z";

function renderPage(overrides: Parameters<typeof service>[0], props: Partial<Parameters<typeof ServicePage>[0]> = {}) {
  return render(
    <ServicePage
      service={service(overrides)}
      projectName="Layout Stress"
      readAt={READ_AT}
      dependsOn={[]}
      dependedOnBy={[]}
      labelForId={labelForId}
      onBack={() => {}}
      {...props}
    />
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
