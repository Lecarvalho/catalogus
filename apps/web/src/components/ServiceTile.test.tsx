// @vitest-environment jsdom
//
// ServiceTile is one vendor's tile on the wall, rendered as a bare
// home-screen icon (candidate E, approved 2026-08-26; the group form,
// docs/brand-tile-brief.md, approved 2026-09-04): a single entry keeps its
// original, unchanged treatment -- the mark, a two-line label (name then
// id), and, only when not `active`, a corner badge, the mark desaturated,
// and the status spelled out in words. A group of several entries sharing
// one catalog slug in this band gets a second, narrower treatment: the mark
// stays in colour always, the second label line is the entry count, and the
// status word (when the group's worst status is not `active`) names the one
// entry that departs, no arrow.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VendorGroup } from "../bands.js";
import { FLYIO_ICON_FIXTURE, makeViewService as service } from "../test-support/fixtures.js";
import { monogramFor, ServiceTile, serviceTileDomId } from "./ServiceTile.js";

const readAt = "2026-08-24T00:00:00.000Z";

afterEach(() => cleanup());

/** A one-entry `VendorGroup`, the shape every single-entry test below renders -- built from one `makeViewService` the same way bands.ts's own `collapseByService` would build it for a band with no repeats. */
function soloGroup(overrides: Parameters<typeof service>[0]): VendorGroup {
  const entry = service(overrides);
  return { service: entry.service, name: entry.name, icon: entry.icon, rollup: entry.rollup, entries: [entry] };
}

/** A multi-entry `VendorGroup`: every entry must already share one `service` slug, the same invariant `collapseByService` guarantees its own output. */
function multiGroup(entries: ReturnType<typeof service>[]): VendorGroup {
  const [first, ...rest] = entries as [ReturnType<typeof service>, ...ReturnType<typeof service>[]];
  return { service: first.service, name: first.name, icon: first.icon, rollup: first.rollup, entries: [first, ...rest] };
}

function renderTile(overrides: Partial<Parameters<typeof ServiceTile>[0]> & { group: VendorGroup }) {
  const onActivate = vi.fn();
  const onPeek = vi.fn();
  const onPeekEnd = vi.fn();
  const result = render(
    <ServiceTile bandId="production" readAt={readAt} selected={false} onActivate={onActivate} onPeek={onPeek} onPeekEnd={onPeekEnd} {...overrides} />
  );
  return { onActivate, onPeek, onPeekEnd, unmount: result.unmount };
}

describe("ServiceTile -- the two-line label, single entry", () => {
  it("renders both the vendor name and the manifest id", () => {
    renderTile({ group: soloGroup({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }) });
    expect(screen.getByText("Fly.io")).not.toBeNull();
    expect(screen.getByText("host-api")).not.toBeNull();
  });

  it("renders two same-vendor single-entry tiles distinguishably by id, since the name alone would render them the same", () => {
    const { unmount } = renderTile({
      group: soloGroup({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }),
    });
    expect(screen.getByText("host-api")).not.toBeNull();
    expect(screen.queryByText("host-web")).toBeNull();
    unmount();

    renderTile({ group: soloGroup({ id: "host-web", role: "hosting-web", service: "flyio", name: "Fly.io" }) });
    expect(screen.getByText("host-web")).not.toBeNull();
    expect(screen.queryByText("host-api")).toBeNull();
    // Both renders share the same vendor name -- that repetition is exactly
    // the case the id line exists to disambiguate.
    expect(screen.getByText("Fly.io")).not.toBeNull();
  });
});

// A source-level tripwire, in ServiceNode.test.tsx's own style: CSS Modules
// resolve to opaque class names under jsdom and nothing in this suite
// computes real layout, so the only way to see a box-model defect is to
// read the stylesheet itself. This guards D1 (docs/PLAN.md): `.name`, `.id`
// and `.status` are `<span>`s -- inline boxes by default -- and
// `margin-top` does not apply to a non-replaced inline box at all (CSS 2.1
// SS8.3). A `.label` rule that sets only `margin-top`, with no blockifying
// `display`, leaves the three lines running together with none of
// `--icon-id-gap` / `--icon-status-gap` actually rendering -- and no test
// above this one would notice, because `label.textContent` reads as the
// three facts concatenated either way: `textContent` ignores box layout
// entirely, which is exactly why a text-content-only assertion cannot see
// this defect. (Confirmed against the shipped bundle at commit e1f7dba:
// `._label_1dr9u_255{margin-top:var(--icon-label-gap)}`, no `display` at
// all, and `label.textContent === "MongoDBdb-legacyDeprecated → db-primary"`.)
describe("ServiceTile.module.css's label stack", () => {
  const css = readFileSync(fileURLToPath(import.meta.url).replace(/ServiceTile\.test\.tsx$/, "ServiceTile.module.css"), "utf8");
  const labelRuleStart = css.indexOf(".label {");
  const labelRule = css.slice(labelRuleStart, css.indexOf("}", labelRuleStart));

  it("blockifies the label's children rather than leaving them inline, where CSS 2.1 SS8.3 discards margin-top", () => {
    expect(labelRuleStart).toBeGreaterThan(-1);
    expect(labelRule).toMatch(/display:\s*(flex|grid)/);
  });
});

describe("ServiceTile -- the no-brand-icon case, single entry", () => {
  it("renders the monogram, not the generic rollup glyph", () => {
    renderTile({ group: soloGroup({ id: "a", role: "finance-ledger", service: "acme-ledger", name: "acme-ledger", icon: null }) });
    expect(screen.getByText("AL")).not.toBeNull();
    // Icon.tsx stamps its own fallback with this testid -- its absence
    // proves the tile never handed Icon a null path, not merely that a
    // monogram happens to also be on screen.
    expect(screen.queryByTestId("icon-fallback")).toBeNull();
  });

  it("renders the real brand icon, not a monogram, when one resolved", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io", icon: FLYIO_ICON_FIXTURE }) });
    expect(screen.queryByText("AL")).toBeNull();
    // The squircle is aria-hidden (the button's own aria-label is the one
    // accessible name), so the icon's own role="img" is deliberately
    // unreachable by an accessibility query here -- read the DOM directly
    // instead, the same way the "not.toContain" style checks elsewhere in
    // this file reach past the a11y tree to the render itself.
    const mark = screen.getByTestId("icon-mark").querySelector("svg");
    expect(mark?.getAttribute("aria-label")).toBe("Fly.io");
    // `colour` is on and FLYIO_ICON_FIXTURE.hex is set, so the mark's own
    // brand colour reaches it as the svg's inline `color` (Icon.tsx's one
    // JS-side colour value) -- jsdom's cssstyle normalises the hex to
    // rgb(...) the moment it is set through the DOM style object, so this is
    // that normalised form of "#24175B", not a hand-rolled expectation. The
    // path's own `fill` attribute stays "currentColor" -- see Icon.module.css
    // for why a fill is never rewritten by hand.
    expect(mark?.style.color).toBe("rgb(36, 23, 91)");
    expect(mark?.querySelector("path")?.getAttribute("fill")).toBe("currentColor");
  });
});

describe("monogramFor", () => {
  it("takes the first letter of each of the slug's first two segments", () => {
    expect(monogramFor("acme-ledger")).toBe("AL");
  });

  it("reads underscore-separated segments the same way as dashes", () => {
    expect(monogramFor("acme_ledger")).toBe("AL");
  });

  it("takes a one-word slug's own first two letters", () => {
    expect(monogramFor("vercel")).toBe("VE");
  });

  it("doubles a single-character segment rather than returning one letter", () => {
    expect(monogramFor("x")).toBe("XX");
  });

  it("reads only the first two segments of a slug with more than two", () => {
    expect(monogramFor("hosting-api-eu")).toBe("HA");
  });

  it("never throws and never returns an empty string, even for a degenerate slug", () => {
    expect(monogramFor("")).toBe("??");
    expect(monogramFor("-")).toBe("??");
    expect(monogramFor("--")).toBe("??");
  });
});

describe("ServiceTile -- status, single entry", () => {
  it("active earns no badge, no worded status and no desaturation", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio", status: "active" }) });
    expect(screen.queryByTestId("status-badge")).toBeNull();
    expect(screen.queryByTestId("status-text")).toBeNull();
    expect(screen.getByTestId("icon-mark").className).not.toContain("desaturated");
  });

  it("phasing_out earns a badge, the worded status, and desaturation", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio", status: "phasing_out" }) });
    expect(screen.getByTestId("status-badge")).not.toBeNull();
    expect(screen.getByTestId("status-text").textContent).toBe("Phasing out");
    expect(screen.getByTestId("icon-mark").className).toContain("desaturated");
  });

  it("deprecated earns a badge, the worded status, and desaturation", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio", status: "deprecated" }) });
    expect(screen.getByTestId("status-badge")).not.toBeNull();
    expect(screen.getByTestId("status-text").textContent).toBe("Deprecated");
    expect(screen.getByTestId("icon-mark").className).toContain("desaturated");
  });

  it("removed earns a badge, the worded status, and desaturation", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio", status: "removed" }) });
    expect(screen.getByTestId("status-badge")).not.toBeNull();
    expect(screen.getByTestId("status-text").textContent).toBe("Removed");
    expect(screen.getByTestId("icon-mark").className).toContain("desaturated");
  });

  it("names the replacement in the worded status when replaced_by is set", () => {
    renderTile({ group: soloGroup({ id: "a", role: "auth-legacy", service: "auth0", status: "phasing_out", replaced_by: "auth-users" }) });
    expect(screen.getByTestId("status-text").textContent).toBe("Phasing out → auth-users");
  });

  it("states the status word alone when replaced_by is unset", () => {
    renderTile({ group: soloGroup({ id: "a", role: "finance-ledger", service: "acme-ledger", status: "deprecated" }) });
    expect(screen.getByTestId("status-text").textContent).toBe("Deprecated");
  });
});

// The owner's 2026-08-31 ruling (docs/DIRECTION.md, "Signal red: the rule
// stands..."): an `active` service that also carries `replaced_by` -- the
// schema permits the combination -- shows the replacement here, matching
// ServicePopover.tsx (off-limits to this pass, already rendering it as
// "Active → db-primary (PostgreSQL)"). The badge and the desaturation are
// deliberately not extended to this case; see ServiceTile.tsx's own comment
// on `statusPhrase` for why.
describe("ServiceTile -- status, the active + replaced_by ruling, single entry", () => {
  // The regression this whole ruling is scoped around not disturbing: the
  // rule an `active` service with *no* replacement earns nothing at all is
  // the norm-suppression rule DIRECTION.md exists to protect ("tagging the
  // norm is what produced thirty-five identical marks before"). This is a
  // second, more targeted copy of the "active earns no badge..." test above
  // -- kept as its own case here, next to the exception it is the control
  // for, rather than trusted to the pre-existing one alone.
  it("still renders no badge, no worded status and no desaturation for active with no replaced_by", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio", status: "active", replaced_by: undefined }) });
    expect(screen.queryByTestId("status-badge")).toBeNull();
    expect(screen.queryByTestId("status-text")).toBeNull();
    expect(screen.getByTestId("icon-mark").className).not.toContain("desaturated");
    expect(screen.getByRole("button").getAttribute("aria-label")).not.toMatch(/Active/);
  });

  it("shows the replacement, worded 'Active → <replaced_by>', when active carries replaced_by", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio", status: "active", replaced_by: "db-primary" }) });
    expect(screen.getByTestId("status-text").textContent).toBe("Active → db-primary");
  });

  it("reaches the accessible name with the replacement, for active + replaced_by", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio", name: "Fly.io", status: "active", replaced_by: "db-primary" }) });
    expect(screen.getByRole("button", { name: "Fly.io, a, Active → db-primary" })).not.toBeNull();
  });

  // The badge is keyed to one of three mockup-drawn pictograms, none of them
  // captioned `active` -- decided in ServiceTile.tsx's own comment rather
  // than invented a fourth shape. This is the regression guard for that
  // decision: a corner badge must not appear here even though the word does.
  it("renders no corner badge for active + replaced_by, even though the word appears", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio", status: "active", replaced_by: "db-primary" }) });
    expect(screen.getByTestId("status-text")).not.toBeNull();
    expect(screen.queryByTestId("status-badge")).toBeNull();
  });

  // Desaturation is documented as status signal 2 of 3, keyed to the same
  // three non-active statuses as the badge -- not extended to this case for
  // the identical "no source for a fourth" reason. Guarded separately from
  // the badge test above since the two are independent CSS classes on
  // independent elements.
  it("does not desaturate the mark for active + replaced_by", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio", status: "active", replaced_by: "db-primary" }) });
    expect(screen.getByTestId("icon-mark").className).not.toContain("desaturated");
  });
});

// D11 (docs/PLAN.md): the three tests above each prove *a* badge exists for
// its own status in isolation -- none of them prove the three are actually
// different pictograms, which is the whole point of StatusBadgeGlyph
// (ServiceTile.tsx's own comment: "one distinct shape per status so it
// reads before any word does"). A `StatusBadgeGlyph` edited to fall through
// to no glyph at all for one status -- an empty `<span data-testid="status-badge">`
// wrapping nothing, which is what "an empty circle" means here: the `.badge`
// span's own CSS (border-radius: 50%, a border) already draws a ring with
// or without an svg inside it -- would pass every test above, since each
// only checks that the wrapper span exists and the worded text is right.
// This does not pin any path's `d` data, which a legitimate redraw is free
// to change; it only pins that the three remain distinguishable from each
// other and that none of them is contentless.
describe("ServiceTile -- status badge glyphs are distinct shapes, single entry", () => {
  function badgeSvgMarkup(status: "phasing_out" | "deprecated" | "removed") {
    const { unmount } = renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio", status }) });
    const markup = screen.getByTestId("status-badge").querySelector("svg")?.innerHTML ?? "";
    unmount();
    return markup;
  }

  it("renders a non-empty pictogram for every non-active status", () => {
    expect(badgeSvgMarkup("phasing_out").length).toBeGreaterThan(0);
    expect(badgeSvgMarkup("deprecated").length).toBeGreaterThan(0);
    expect(badgeSvgMarkup("removed").length).toBeGreaterThan(0);
  });

  it("renders a different pictogram for each of the three statuses, pairwise", () => {
    const phasingOut = badgeSvgMarkup("phasing_out");
    const deprecated = badgeSvgMarkup("deprecated");
    const removed = badgeSvgMarkup("removed");

    expect(phasingOut).not.toBe(deprecated);
    expect(phasingOut).not.toBe(removed);
    expect(deprecated).not.toBe(removed);
  });
});

describe("ServiceTile -- selection, single entry", () => {
  it("marks aria-current when selected", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio" }), selected: true });
    expect(screen.getByRole("button").getAttribute("aria-current")).toBe("true");
  });

  it("carries no aria-current attribute at all when not selected", () => {
    renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio" }), selected: false });
    expect(screen.getByRole("button").hasAttribute("aria-current")).toBe(false);
  });
});

describe("ServiceTile -- activation and peeking, single entry", () => {
  it("calls onActivate with the entry's own one-entry group on click", () => {
    const entry = service({ id: "a", role: "hosting", service: "flyio" });
    const group = multiGroup([entry]);
    const { onActivate } = renderTile({ group });
    fireEvent.click(screen.getByRole("button"));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]![0]).toBe(group);
  });

  it("peeks on pointer enter (mouse) and ends the peek on pointer leave", () => {
    const { onPeek, onPeekEnd } = renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio" }) });
    const tile = screen.getByRole("button");
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    expect(onPeek).toHaveBeenCalledTimes(1);
    fireEvent.pointerOut(tile, { relatedTarget: document.body });
    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });

  // Touch has no hover at all -- a popover a touch user cannot dismiss would
  // be worse than none, so touch skips straight past peeking to the click.
  it("does not peek on a touch pointer", () => {
    const { onPeek } = renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio" }) });
    const tile = screen.getByRole("button");
    // jsdom (25.0.1) has no PointerEvent constructor, so fireEvent.pointerOver's
    // {pointerType} init is silently dropped (testing-library falls back to
    // plain Event). Build the event and patch the property on by hand.
    const event = new Event("pointerover", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    fireEvent(tile, event);
    expect(onPeek).not.toHaveBeenCalled();
  });

  it("peeks on keyboard focus, for parity with hover, and ends on blur", () => {
    const { onPeek, onPeekEnd } = renderTile({ group: soloGroup({ id: "a", role: "hosting", service: "flyio" }) });
    const tile = screen.getByRole("button");
    fireEvent.focus(tile);
    expect(onPeek).toHaveBeenCalledTimes(1);
    fireEvent.blur(tile);
    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });
});

describe("serviceTileDomId", () => {
  it("keys a single-entry group's DOM id on the manifest entry id alone, and the button carries exactly that id", () => {
    const group = soloGroup({ id: "host-api", role: "hosting", service: "flyio" });
    renderTile({ group });
    expect(screen.getByRole("button").id).toBe(serviceTileDomId("production", group));
    expect(serviceTileDomId("production", group)).toBe("service-tile-host-api");
  });

  it("keys a multi-entry group's DOM id on the band and the catalog slug, not on any one entry's id", () => {
    const group = multiGroup([
      service({ id: "host-api", role: "hosting-api", service: "flyio" }),
      service({ id: "host-web", role: "hosting-web", service: "flyio" }),
    ]);
    expect(serviceTileDomId("production", group)).toBe("service-tile-production-flyio");
  });

  // The reason a band qualifier exists at all: collapseByService runs per
  // band (bands.ts's own header), so the identical slug can name two
  // different groups in two different bands -- Supabase as `supabase-auth`
  // (production) and `supabase-db` (holds). Without the band in the id the
  // two tiles would collide.
  it("gives the same slug two different ids in two different bands", () => {
    const group = multiGroup([
      service({ id: "supabase-auth", role: "auth", service: "supabase" }),
      service({ id: "supabase-auth-2", role: "auth", service: "supabase" }),
    ]);
    expect(serviceTileDomId("production", group)).toBe("service-tile-production-supabase");
    expect(serviceTileDomId("holds", group)).toBe("service-tile-holds-supabase");
    expect(serviceTileDomId("production", group)).not.toBe(serviceTileDomId("holds", group));
  });
});

// ---------------------------------------------------------------------------
// The multi-entry group tile (docs/brand-tile-brief.md, Part A; the mockup's
// artboard 1, the Fly.io tile standing for five entries). One tile per
// vendor per band, restored 2026-09-04 after standing at one-tile-per-entry
// since 2026-08-26 -- see this file's own header for the full history and
// the owner's reasoning.
// ---------------------------------------------------------------------------

const flyGroup = (statuses: Array<{ id: string; status?: "active" | "phasing_out" | "deprecated" | "removed" }>) =>
  multiGroup(statuses.map(({ id, status }) => service({ id, role: `hosting-${id}`, service: "flyio", name: "Fly.io", status })));

describe("ServiceTile -- the multi-entry group tile, the second label line", () => {
  it("renders the entry count, not any one entry's id, in the id line's slot", () => {
    renderTile({ group: flyGroup([{ id: "host-api" }, { id: "host-web" }, { id: "host-worker" }]) });
    expect(screen.getByTestId("entry-count").textContent).toBe("3 entries");
    expect(screen.queryByText("host-api")).toBeNull();
    expect(screen.queryByText("host-web")).toBeNull();
  });

  it("renders no mono font-family on the count line -- a count is not a literal, unlike an id", () => {
    // A source-level check, the same shape as the label-stack tripwire above:
    // jsdom's CSS Modules proxy carries no real stylesheet, so the only way
    // to see the mono face is absent is to read the rule the class name maps
    // to, not the rendered DOM.
    const css = readFileSync(fileURLToPath(import.meta.url).replace(/ServiceTile\.test\.tsx$/, "ServiceTile.module.css"), "utf8");
    const countRuleStart = css.indexOf(".count {");
    const countRule = css.slice(countRuleStart, css.indexOf("}", countRuleStart));
    expect(countRuleStart).toBeGreaterThan(-1);
    expect(countRule).not.toMatch(/font-family/);
  });
});

describe("ServiceTile -- the multi-entry group tile, status", () => {
  it("shows no badge and no status line when every entry is active", () => {
    renderTile({ group: flyGroup([{ id: "host-api" }, { id: "host-web" }]) });
    expect(screen.queryByTestId("status-badge")).toBeNull();
    expect(screen.queryByTestId("status-text")).toBeNull();
  });

  // The owner's decision on review of the first draft: the mark stays in
  // colour for a group, whatever the group's worst status is -- desaturating
  // the whole mark reads as dimming four live apps because one is departing.
  it("never desaturates the mark, even when the group's worst status is deprecated", () => {
    renderTile({ group: flyGroup([{ id: "host-api" }, { id: "host-web", status: "deprecated" }]) });
    expect(screen.getByTestId("icon-mark").className).not.toContain("desaturated");
  });

  it("carries the badge for the group's worst status", () => {
    renderTile({ group: flyGroup([{ id: "host-api" }, { id: "host-preview", status: "phasing_out" }]) });
    expect(screen.getByTestId("status-badge")).not.toBeNull();
  });

  // decision 3 of the mockup's own leading comment: id first, the word
  // lower-cased, no arrow -- the arrow already means "replaced by <target>"
  // everywhere else on this tile.
  it("names the departing entry before the lower-cased word, with no arrow", () => {
    renderTile({
      group: flyGroup([{ id: "host-api" }, { id: "host-preview", status: "phasing_out" }, { id: "host-web" }]),
    });
    const statusText = screen.getByTestId("status-text");
    expect(statusText.textContent).toBe("host-preview phasing out");
    expect(statusText.textContent).not.toContain("→");
    expect(statusText.textContent).not.toMatch(/^Phasing/);
  });

  it("carries the departing entry's id in the accessible name", () => {
    renderTile({
      group: flyGroup([{ id: "host-api" }, { id: "host-preview", status: "phasing_out" }]),
    });
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain("host-preview phasing out");
  });

  it("takes the most consequential status among the entries, not the first one", () => {
    renderTile({
      group: flyGroup([
        { id: "host-api", status: "removed" },
        { id: "host-preview", status: "phasing_out" },
      ]),
    });
    // phasing_out outranks removed (bands.ts's STATUS_SEVERITY) -- this is
    // the same rule groupStatus already guards in bands.test.ts, exercised
    // here through the tile that actually renders it.
    expect(screen.getByTestId("status-text").textContent).toBe("host-preview phasing out");
  });

  it("deprecated and removed each render their own worded status", () => {
    renderTile({ group: flyGroup([{ id: "host-api" }, { id: "host-web", status: "deprecated" }]) });
    expect(screen.getByTestId("status-text").textContent).toBe("host-web deprecated");

    cleanup();

    renderTile({ group: flyGroup([{ id: "host-api" }, { id: "host-worker", status: "removed" }]) });
    expect(screen.getByTestId("status-text").textContent).toBe("host-worker removed");
  });
});

describe("ServiceTile -- the multi-entry group tile, activation and peeking", () => {
  it("calls onActivate with the whole group, not one entry, on click", () => {
    const group = flyGroup([{ id: "host-api" }, { id: "host-web" }]);
    const { onActivate } = renderTile({ group });
    fireEvent.click(screen.getByRole("button"));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]![0]).toBe(group);
  });

  it("peeks with the whole group on hover", () => {
    const group = flyGroup([{ id: "host-api" }, { id: "host-web" }]);
    const { onPeek } = renderTile({ group });
    fireEvent.pointerOver(screen.getByRole("button"), { pointerType: "mouse" });
    expect(onPeek).toHaveBeenCalledTimes(1);
    expect(onPeek.mock.calls[0]![0]).toBe(group);
  });
});

describe("ServiceTile -- the multi-entry group tile, one button either way", () => {
  it("renders exactly one button for a five-entry group, not five", () => {
    renderTile({
      group: flyGroup([{ id: "host-api" }, { id: "host-cron" }, { id: "host-preview", status: "phasing_out" }, { id: "host-web" }, { id: "host-worker" }]),
    });
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("renders selected exactly as told -- which id counts as a match is BandModule.tsx's own decision, not this component's", () => {
    renderTile({ group: flyGroup([{ id: "host-api" }, { id: "host-web" }]), selected: true });
    expect(screen.getByRole("button").getAttribute("aria-current")).toBe("true");
  });
});
