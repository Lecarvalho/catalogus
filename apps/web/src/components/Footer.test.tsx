// @vitest-environment jsdom
//
// The footer states seven facts about one `catalogus view` invocation, and
// almost all of them are numbers or literals somebody could plausibly have
// typed in. So these tests are mostly about *provenance*: the version is the
// payload's rather than the package's, the schema URL is the payload's rather
// than a string in this app, and the counts are derived from the services and
// edges actually handed over rather than from anything cached.
//
// The documentation link is the odd one out and is tested by its absence. The
// mockup draws the word; this repo has no URL to point it at, and CLAUDE.md's
// standing rule makes an omitted link the correct render rather than a
// degraded one. A test that only checked the six facts present would go on
// passing the day somebody invented an href, which is the failure this one
// exists to catch.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { makeViewPayload, makeViewService } from "../test-support/fixtures.js";
import { Footer, distinctRollupCount, withoutScheme } from "./Footer.js";

afterEach(() => cleanup());

const READ_AT = "2026-08-24T00:00:00.000Z";
const NOW = Date.parse(READ_AT);

const SERVICES = [
  makeViewService({ id: "fly-api", role: "hosting-api", rollup: "hosting", service: "flyio" }),
  makeViewService({ id: "fly-web", role: "hosting-web", rollup: "hosting", service: "flyio" }),
  makeViewService({ id: "supabase-db", role: "database", rollup: "database", service: "supabase" }),
  makeViewService({ id: "resend", role: "email", rollup: "email", service: "resend" }),
];

function renderFooter(overrides: Parameters<typeof makeViewPayload>[0] = {}, now = NOW) {
  return render(<Footer payload={makeViewPayload({ readAt: READ_AT, services: SERVICES, ...overrides })} now={now} />);
}

/**
 * One string per fact the strip states, in reading order.
 *
 * Not the footer's whole `textContent`: the facts are separate elements with no
 * whitespace between them (a flex gap draws the space, and JSX drops the
 * newlines), so a concatenation reads "4 services1 dependency" and every
 * substring assertion against it is one character away from passing for the
 * wrong reason. Splitting per element makes each assertion an exact match.
 */
function footerFacts(): string[] {
  return Array.from(screen.getByRole("contentinfo").children).flatMap((group) =>
    Array.from(group.children).map((fact) => fact.textContent!.replace(/\s+/g, " ").trim()),
  );
}

describe("Footer", () => {
  it("names the file being served", () => {
    renderFooter();
    expect(screen.getByText("C:/scratch/project/catalogus.yaml")).not.toBeNull();
  });

  it("states how stale the snapshot is, measured from the payload's own readAt", () => {
    renderFooter({}, NOW + 3 * 60 * 60 * 1000);
    expect(footerFacts()).toContain("read 3 hours ago");
  });

  // relative-time.ts returns null for a stamp it cannot parse, and the caller's
  // half of that contract is rendering nothing -- not "read", not a bare dot,
  // and certainly not "read Invalid Date".
  it("says nothing about the read time when the timestamp does not parse, rather than 'read Invalid Date'", () => {
    renderFooter({ readAt: "not-a-timestamp" });
    const facts = footerFacts();
    expect(facts.some((fact) => fact.startsWith("read"))).toBe(false);
    // The separator goes with the phrase: the left group is the path alone.
    expect(facts[0]).toBe("C:/scratch/project/catalogus.yaml");
    expect(facts[1]).not.toBe("\u00b7");
  });

  it("counts the services, the dependency edges and the distinct rollups it was handed", () => {
    renderFooter({ edges: [{ from: "fly-api", to: "supabase-db" }] });
    const facts = footerFacts();
    expect(facts).toContain("4 services");
    expect(facts).toContain("1 dependency");
    // Three rollups from four services: `hosting` twice, `database`, `email`.
    // The rollup count is deliberately not the service count and not the band
    // count, and a fixture where all three differ is what proves it.
    expect(facts).toContain("3 rollups");
  });

  it("says 'dependency' and 'service' in the singular at one, which is the case no mockup can show", () => {
    renderFooter({ services: [SERVICES[0]!], edges: [{ from: "fly-api", to: "fly-api" }] });
    const facts = footerFacts();
    expect(facts).toContain("1 service");
    expect(facts).toContain("1 dependency");
    expect(facts).toContain("1 rollup");
  });

  it("counts nothing as zero rather than omitting the line, on a manifest with no services at all", () => {
    renderFooter({ services: [], edges: [] });
    const facts = footerFacts();
    expect(facts).toContain("0 services");
    expect(facts).toContain("0 dependencies");
    expect(facts).toContain("0 rollups");
  });

  // The version is the *payload's*. The fixture's default is 9.9.9 precisely
  // so this cannot pass by matching whatever version @catalogus/cli's
  // package.json happens to carry today.
  it("states the CLI version the payload carries, not one this app knows", () => {
    renderFooter({ cliVersion: "1.2.3" });
    expect(footerFacts()).toContain("catalogus 1.2.3");
  });

  it("states the payload's schema URL, without the scheme, keeping the whole string reachable", () => {
    renderFooter({ schemaUrl: "https://catalogus.dev/schema/v1.json" });
    const schema = screen.getByText("catalogus.dev/schema/v1.json");
    expect(schema.getAttribute("title")).toBe("https://catalogus.dev/schema/v1.json");
  });

  // Not a link. Whether catalogus.dev serves anything is not a fact this repo
  // holds, and an `<a>` is a claim that it does.
  it("renders the schema URL as text, and renders no link anywhere in the strip", () => {
    renderFooter();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  // The mockup draws "Documentation" between the version and the schema URL.
  // There is no URL for it in this repo and none may be invented, so the word
  // is not rendered -- and this is the test that fails the day one appears
  // without the owner having named it.
  it("renders no documentation link, because no documentation URL exists to point one at", () => {
    renderFooter();
    expect(footerFacts().join(" ")).not.toContain("Documentation");
  });

  it("is a contentinfo landmark, so the chrome at the foot of the page is skippable", () => {
    renderFooter();
    expect(screen.getByRole("contentinfo")).not.toBeNull();
  });
});

describe("distinctRollupCount", () => {
  it("counts each rollup once however many services share it", () => {
    expect(distinctRollupCount(SERVICES)).toBe(3);
  });

  it("is zero for no services", () => {
    expect(distinctRollupCount([])).toBe(0);
  });

  // `role: constructor` is schema-valid, so `rollup` can be "constructor" --
  // the same class of bug that has blanked this viewer once already through a
  // plain object literal used as a lookup. A Set has no prototype chain to
  // collide with; this is the test that says so.
  it("treats a rollup named after an Object.prototype member as an ordinary value", () => {
    const services = [
      makeViewService({ id: "a", role: "constructor", rollup: "constructor", service: "a" }),
      makeViewService({ id: "b", role: "constructor-thing", rollup: "constructor", service: "b" }),
      makeViewService({ id: "c", role: "toString", rollup: "toString", service: "c" }),
    ];
    expect(distinctRollupCount(services)).toBe(2);
  });
});

describe("withoutScheme", () => {
  it("drops https:// and http://, which is the mockup's own rendering of the schema URL", () => {
    expect(withoutScheme("https://catalogus.dev/schema/v1.json")).toBe("catalogus.dev/schema/v1.json");
    expect(withoutScheme("http://catalogus.dev/schema/v1.json")).toBe("catalogus.dev/schema/v1.json");
  });

  it("leaves a URL with no scheme, and one with an unfamiliar scheme, exactly as it found them", () => {
    expect(withoutScheme("catalogus.dev/schema/v1.json")).toBe("catalogus.dev/schema/v1.json");
    expect(withoutScheme("file:///C:/schema/v1.json")).toBe("file:///C:/schema/v1.json");
  });

  it("strips only a leading scheme, never one appearing inside the string", () => {
    expect(withoutScheme("catalogus.dev/r?u=https://example.com")).toBe("catalogus.dev/r?u=https://example.com");
  });
});
