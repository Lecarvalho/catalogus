// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService } from "../test-support/fixtures.js";
import { ServiceNode, serviceNodeDomId } from "./ServiceNode.js";
import styles from "./ServiceNode.module.css";

afterEach(() => {
  cleanup();
});

describe("ServiceNode -- the control", () => {
  it("is a real <button>, so Tab/Enter/Space keyboard operability comes from native semantics", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").tagName).toBe("BUTTON");
  });

  it("renders the display name and calls onSelect with the id when activated", () => {
    const onSelect = vi.fn();
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api", name: "Fly.io" })} isSelected={false} showId={false} onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: /Fly\.io/ });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith("fly-api");
  });

  it("carries a hover tooltip of exactly name and role -- never more, unchanged by this move", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api", name: "Fly.io" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("title")).toBe("Fly.io — hosting-api");
  });

  it("carries the DOM id App.tsx and MigrationList.tsx both depend on", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").id).toBe(serviceNodeDomId("fly-api"));
    // Reachable by the exact lookup App.tsx performs, not merely present: a
    // focus restore that finds nothing is invisible in a green suite.
    expect(document.getElementById(serviceNodeDomId("fly-api"))).toBe(screen.getByRole("button"));
  });

  it("builds a DOM id that survives a service id a CSS selector would choke on", () => {
    render(<ServiceNode service={makeViewService({ id: "fly.io api", role: "hosting" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(document.getElementById(serviceNodeDomId("fly.io api"))).toBe(screen.getByRole("button"));
  });

  it("names the DOM id format exactly, so a change here cannot silently break MigrationList.tsx's own import", () => {
    expect(serviceNodeDomId("host-api")).toBe("service-node-host-api");
  });
});

describe("ServiceNode -- the mark", () => {
  it("renders the monogram, not a generic fallback glyph, when no brand icon resolved", () => {
    render(
      <ServiceNode
        service={makeViewService({ id: "a", role: "finance-ledger", service: "acme-ledger", name: "acme-ledger", icon: null })}
        isSelected={false}
        showId={false}
        onSelect={vi.fn()}
      />
    );
    // aria-hidden, same as the tile's own squircle -- reached through the
    // DOM directly, not through an accessibility query, for the same
    // reason ServiceTile.test.tsx does this.
    const mark = screen.getByTestId("icon-mark");
    expect(mark.textContent).toBe("AL");
    expect(mark.querySelector("[data-testid=icon-fallback]")).toBeNull();
  });

  it("renders the real brand icon, in colour, when one resolved", () => {
    render(
      <ServiceNode
        service={makeViewService({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io", icon: "M0 0h24v24H0z", iconHex: "#24175B" })}
        isSelected={false}
        showId={false}
        onSelect={vi.fn()}
      />
    );
    const svg = screen.getByTestId("icon-mark").querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Fly.io");
    expect(svg?.querySelector("path")?.getAttribute("fill")).toBe("#24175B");
  });

  it("hides the whole mark from assistive tech, since the button's own aria-label already states everything in it", () => {
    render(<ServiceNode service={makeViewService({ id: "a", role: "hosting", service: "flyio" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByTestId("icon-mark").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("ServiceNode -- status", () => {
  it("active earns no badge, no worded status and no desaturation", () => {
    render(<ServiceNode service={makeViewService({ id: "a", role: "hosting", service: "flyio", status: "active" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.queryByTestId("status-badge")).toBeNull();
    expect(screen.queryByTestId("status-text")).toBeNull();
    expect(screen.getByTestId("icon-mark").className).not.toContain("desaturated");
  });

  it.each([
    ["phasing_out", "Phasing out"],
    ["deprecated", "Deprecated"],
    ["removed", "Removed"],
  ] as const)("marks a %s service with a badge, the worded status '%s', and desaturation", (status, word) => {
    render(<ServiceNode service={makeViewService({ id: "a", role: "hosting", service: "flyio", status })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByTestId("status-badge")).not.toBeNull();
    expect(screen.getByTestId("status-text").textContent).toBe(word);
    expect(screen.getByTestId("icon-mark").className).toContain("desaturated");
  });

  it("names the replacement in the worded status when replaced_by is set", () => {
    render(
      <ServiceNode
        service={makeViewService({ id: "a", role: "auth-legacy", service: "auth0", status: "phasing_out", replaced_by: "auth-users" })}
        isSelected={false}
        showId={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByTestId("status-text").textContent).toBe("Phasing out → auth-users");
  });

  it("states the status word alone when replaced_by is unset", () => {
    render(<ServiceNode service={makeViewService({ id: "a", role: "finance-ledger", service: "acme-ledger", status: "deprecated" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByTestId("status-text").textContent).toBe("Deprecated");
  });

  it.each(["active", "phasing_out", "deprecated", "removed"] as const)("renders without crashing for status '%s'", (status) => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting", status })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button")).not.toBeNull();
  });
});

describe("ServiceNode -- selection", () => {
  it("conveys selection to assistive tech via aria-pressed, not colour alone", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api" })} isSelected={true} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("reflects isSelected=false as aria-pressed=false", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  // aria-pressed above is the assistive-tech signal; this pins the visual
  // one. Known and stated plainly: in the shipped app today this state is
  // unreachable on screen (App.tsx renders `selectedService ? <ServicePage/>
  // : <board|graph|migrations>`, so selecting a node replaces the graph with
  // the detail page rather than highlighting a node inside it). The test is
  // still worth having because `isSelected -> .selected` is this
  // component's own contract regardless of who currently exercises it.
  it("carries the selected class when isSelected is true", () => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting" })} isSelected={true} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").classList.contains(styles.selected ?? "")).toBe(true);
  });

  it("carries no selected class when isSelected is false", () => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").classList.contains(styles.selected ?? "")).toBe(false);
  });
});

describe("ServiceNode -- the disambiguating id", () => {
  it("folds the id into the accessible name, in order, when showId is set", () => {
    render(<ServiceNode service={makeViewService({ id: "supabase-db", role: "database", name: "Supabase" })} isSelected={false} showId={true} onSelect={vi.fn()} />);
    // Exact match, not a substring regex: this catches a transposition
    // (id-before-name) as well as an omission.
    expect(screen.getByRole("button", { name: "Supabase, supabase-db" })).not.toBeNull();
  });

  it("leaves the id out of both the label and the accessible name when showId is not set", () => {
    render(<ServiceNode service={makeViewService({ id: "supabase-db", role: "database", name: "Supabase" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.queryByText("supabase-db")).toBeNull();
    expect(screen.getByRole("button", { name: "Supabase" })).not.toBeNull();
  });

  it("folds id and status into one accessible name, in order, when both apply", () => {
    render(
      <ServiceNode
        service={makeViewService({ id: "supabase-db", role: "database", name: "Supabase", status: "deprecated" })}
        isSelected={false}
        showId={true}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Supabase, supabase-db, Deprecated" })).not.toBeNull();
  });
});

// `kind` (component/stack/service) used to be a shape on this node's own
// outer box -- a dashed border for `component`, a squared corner for
// `stack` -- carried three ways: the shape, a `data-kind` attribute and
// visually-hidden text. All three are gone with this move, matching
// ServiceTile.tsx's own tile, which never carried `kind` at all. See
// ServiceNode.tsx's header for the reasoning; this is the regression guard
// for it, not merely silence where a test used to be.
describe("ServiceNode -- kind is no longer carried on the node", () => {
  it.each(["service", "component", "stack"] as const)("renders identically for kind '%s' -- no data-kind attribute, no shape, no extra text", (kind) => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting", kind })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.hasAttribute("data-kind")).toBe(false);
    expect(button.textContent).not.toMatch(/component|stack/);
  });
});

// The uncatalogued corner dot (and its visually-hidden text) is gone too,
// for the matching reason: ServiceTile.tsx's tile does not surface
// `known: false` on the mark either, only in the hover popover and the
// service page. The graph has no popover, so the fact reaches a reader the
// same way the List already relies on for it -- the click-through page.
describe("ServiceNode -- uncatalogued is no longer marked on the node", () => {
  it("renders the raw slug as the name with no dot, no extra text, and no change to the accessible name", () => {
    render(
      <ServiceNode
        service={makeViewService({ id: "mystery", role: "widget-thing", known: false, name: "some-raw-slug" })}
        isSelected={false}
        showId={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByText(/uncatalogued/i)).toBeNull();
    expect(screen.getByRole("button", { name: "some-raw-slug" })).not.toBeNull();
  });

  it("renders no uncatalogued marker for a catalogued service either -- both paths render the same shape", () => {
    render(<ServiceNode service={makeViewService({ id: "known", role: "hosting", known: true, name: "Fly.io" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.queryByText(/uncatalogued/i)).toBeNull();
  });
});

// A source-level tripwire, and stated as one: CSS Modules resolve to opaque
// class names under jsdom and nothing here computes styles, so the only way
// to assert *what* the selected state paints is to read the stylesheet. It
// guards the same regression docs/PLAN.md records ("the selected state's
// two visual cues are both colour") in this node's new shape: an outline on
// the mark, not a border-and-shadow swap on a box this node no longer has.
describe("ServiceNode.module.css's selected state", () => {
  // Derived from this module's path by string replacement, deliberately not
  // `new URL("./ServiceNode.module.css", import.meta.url)` -- under jsdom
  // the global `URL` resolves a relative reference against the *document*
  // base, so that expression returns http://localhost:3000/... and
  // `node:fs` rejects it. And not `process.cwd()` either -- that is the
  // repo root under `pnpm test` and `apps/web` under a per-package run.
  const css = readFileSync(fileURLToPath(import.meta.url).replace(/ServiceNode\.test\.tsx$/, "ServiceNode.module.css"), "utf8");
  const selectedRuleStart = css.indexOf(".selected .squircle");
  const selectedRule = css.slice(selectedRuleStart, css.indexOf("}", selectedRuleStart));

  it("declares an outline, not a fill, so selection reads as a shape change and survives greyscale", () => {
    expect(selectedRuleStart).toBeGreaterThan(-1);
    expect(selectedRule).toContain("outline");
  });

  it("spends no chromatic colour on selection -- red stays reserved for status only", () => {
    expect(selectedRule).not.toMatch(/--color-signal|--color-accent/);
  });
});

// Two guards used to live here, both gone rather than adapted, because the
// pattern they guarded against no longer exists in this file:
//
//  - The `kind`-shape "declares no colour" tripwires -- there is no more
//    `.kind-*` CSS at all (see the "kind is no longer carried" block
//    above), so a test asserting properties of a rule that does not exist
//    would either be vacuous or would need to assert an *absence*, which
//    the "no data-kind attribute" test already does at the source level.
//  - The two "status-mark tone lookup" tests guarding
//    `MARK_TONE_CLASSES`'s `Map`-based defence against the
//    Object.prototype defect this repo has produced five times (Tag.tsx's
//    header carries the full account). That defence existed because the
//    old node resolved a CSS Modules class name through a manifest-derived
//    string key (`styles[tone]`/`styles[`kind-${service.kind}`]`). This
//    node does neither any more -- the status badge is a `switch` on a
//    closed union (`StatusBadgeGlyph`) and every class applied below is a
//    static `styles.xxx` reference, never a dynamic key -- so the
//    vulnerability class the two tests existed to catch does not apply to
//    this file's current shape. Removed rather than kept as dead weight
//    asserting a pattern that is no longer here to break.
