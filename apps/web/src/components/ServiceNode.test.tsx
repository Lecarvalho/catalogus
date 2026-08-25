// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService } from "../test-support/fixtures.js";
import { ServiceNode, serviceNodeDomId } from "./ServiceNode.js";

afterEach(() => {
  cleanup();
});

describe("ServiceNode", () => {
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

  it("carries a hover tooltip of exactly name and role -- never more", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api", name: "Fly.io" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("title")).toBe("Fly.io — hosting-api");
  });

  it("conveys selection to assistive tech via aria-pressed, not colour alone", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api" })} isSelected={true} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("reflects isSelected=false as aria-pressed=false", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  it("marks an uncatalogued service with reachable text, not just a decorative dot", () => {
    render(
      <ServiceNode
        service={makeViewService({ id: "mystery", role: "widget-thing", known: false, name: "some-raw-slug" })}
        isSelected={false} showId={false}
        onSelect={vi.fn()}
      />
    );
    // The accessible name includes the sr-only text -- reachable to
    // assistive tech even though nothing renders the old full-word pill.
    expect(screen.getByRole("button", { name: /some-raw-slug.*uncatalogued/ })).not.toBeNull();
  });

  it("renders no uncatalogued marker text for a catalogued service", () => {
    render(<ServiceNode service={makeViewService({ id: "known", role: "hosting", known: true, name: "Fly.io" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.queryByText(/uncatalogued/)).toBeNull();
  });

  it.each(["active", "phasing_out", "deprecated", "removed"] as const)("renders without crashing for status '%s'", (status) => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting", status })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button")).not.toBeNull();
  });

  it("renders the local id under the name when showId is set, so two entries of one vendor are told apart", () => {
    render(<ServiceNode service={makeViewService({ id: "supabase-db", role: "database", name: "Supabase" })} isSelected={false} showId={true} onSelect={vi.fn()} />);
    // In the accessible name too, not only on screen -- the button is what
    // assistive tech announces, and "Supabase" twice is as ambiguous there.
    expect(screen.getByRole("button", { name: /Supabase.*supabase-db/ })).not.toBeNull();
  });

  it("renders no id when showId is not set -- the compact node was shrunk to drop it", () => {
    render(<ServiceNode service={makeViewService({ id: "supabase-db", role: "database", name: "Supabase" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.queryByText("supabase-db")).toBeNull();
    expect(screen.getByRole("button").textContent).toBe("Supabase");
  });

  it("carries the DOM id App.tsx restores focus to when a deep-linked panel closes", () => {
    render(<ServiceNode service={makeViewService({ id: "fly-api", role: "hosting-api" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").id).toBe(serviceNodeDomId("fly-api"));
    // Reachable by the exact lookup App.tsx performs, not merely present:
    // a focus restore that finds nothing is invisible in a green suite.
    expect(document.getElementById(serviceNodeDomId("fly-api"))).toBe(screen.getByRole("button"));
  });

  it("builds a DOM id that survives a service id a CSS selector would choke on", () => {
    render(<ServiceNode service={makeViewService({ id: "fly.io api", role: "hosting" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(document.getElementById(serviceNodeDomId("fly.io api"))).toBe(screen.getByRole("button"));
  });
});

// A source-level tripwire, and stated as one: CSS Modules resolve to opaque
// class names under jsdom and nothing here computes styles, so the only way
// to assert *what* the selected state paints is to read the stylesheet. It
// guards one specific regression -- docs/PLAN.md's "the selected state's two
// visual cues are both colour" -- by requiring the third cue, edge weight,
// to still be declared. It cannot tell whether the result looks right; it
// can tell whether the non-colour cue was deleted, which is what happened
// last time.
describe("ServiceNode.module.css's selected state", () => {
  // Derived from this module's path by string replacement, deliberately not
  // `new URL("./ServiceNode.module.css", import.meta.url)`: under jsdom the
  // global `URL` resolves a relative reference against the *document* base,
  // so that expression returns http://localhost:3000/... and node:fs
  // rejects it. And not process.cwd() either -- that is the repo root under
  // `pnpm test` and apps/web under a per-package vitest run.
  const css = readFileSync(fileURLToPath(import.meta.url).replace(/ServiceNode\.test\.tsx$/, "ServiceNode.module.css"), "utf8");
  const selectedRule = css.slice(css.indexOf(".selected {"), css.indexOf("}", css.indexOf(".selected {")));

  it("declares a cue that is not a colour, so the selection survives greyscale", () => {
    expect(selectedRule).toContain("box-shadow");
  });

  it("still declares the two colour cues alongside it", () => {
    expect(selectedRule).toContain("border-color");
    expect(selectedRule).toContain("background");
  });
});
