// @vitest-environment jsdom
//
// ServiceTile is one manifest entry, rendered as a bare home-screen icon
// (candidate E, approved 2026-08-26): the mark, a two-line label (name then
// id), and -- only when the entry is not `active` -- a corner badge, the
// mark desaturated, and the status spelled out in words. No card, no entry
// count; a tile is one entry now, not a collapsed vendor.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FLYIO_ICON_FIXTURE, makeViewService as service } from "../test-support/fixtures.js";
import { monogramFor, ServiceTile, serviceTileDomId } from "./ServiceTile.js";

const readAt = "2026-08-24T00:00:00.000Z";

afterEach(() => cleanup());

function renderTile(overrides: Partial<Parameters<typeof ServiceTile>[0]> & { service: ReturnType<typeof service> }) {
  const onActivate = vi.fn();
  const onPeek = vi.fn();
  const onPeekEnd = vi.fn();
  const result = render(<ServiceTile readAt={readAt} selected={false} onActivate={onActivate} onPeek={onPeek} onPeekEnd={onPeekEnd} {...overrides} />);
  return { onActivate, onPeek, onPeekEnd, unmount: result.unmount };
}

describe("ServiceTile -- the two-line label", () => {
  it("renders both the vendor name and the manifest id", () => {
    renderTile({ service: service({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }) });
    expect(screen.getByText("Fly.io")).not.toBeNull();
    expect(screen.getByText("host-api")).not.toBeNull();
  });

  it("renders two same-vendor entries distinguishably by id, since the name alone would render them the same", () => {
    const { unmount } = renderTile({
      service: service({ id: "host-api", role: "hosting-api", service: "flyio", name: "Fly.io" }),
    });
    expect(screen.getByText("host-api")).not.toBeNull();
    expect(screen.queryByText("host-web")).toBeNull();
    unmount();

    renderTile({ service: service({ id: "host-web", role: "hosting-web", service: "flyio", name: "Fly.io" }) });
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

describe("ServiceTile -- the no-brand-icon case", () => {
  it("renders the monogram, not the generic rollup glyph", () => {
    renderTile({ service: service({ id: "a", role: "finance-ledger", service: "acme-ledger", name: "acme-ledger", icon: null }) });
    expect(screen.getByText("AL")).not.toBeNull();
    // Icon.tsx stamps its own fallback with this testid -- its absence
    // proves the tile never handed Icon a null path, not merely that a
    // monogram happens to also be on screen.
    expect(screen.queryByTestId("icon-fallback")).toBeNull();
  });

  it("renders the real brand icon, not a monogram, when one resolved", () => {
    renderTile({ service: service({ id: "a", role: "hosting-api", service: "flyio", name: "Fly.io", icon: FLYIO_ICON_FIXTURE }) });
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

describe("ServiceTile -- status", () => {
  it("active earns no badge, no worded status and no desaturation", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "active" }) });
    expect(screen.queryByTestId("status-badge")).toBeNull();
    expect(screen.queryByTestId("status-text")).toBeNull();
    expect(screen.getByTestId("icon-mark").className).not.toContain("desaturated");
  });

  it("phasing_out earns a badge, the worded status, and desaturation", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "phasing_out" }) });
    expect(screen.getByTestId("status-badge")).not.toBeNull();
    expect(screen.getByTestId("status-text").textContent).toBe("Phasing out");
    expect(screen.getByTestId("icon-mark").className).toContain("desaturated");
  });

  it("deprecated earns a badge, the worded status, and desaturation", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "deprecated" }) });
    expect(screen.getByTestId("status-badge")).not.toBeNull();
    expect(screen.getByTestId("status-text").textContent).toBe("Deprecated");
    expect(screen.getByTestId("icon-mark").className).toContain("desaturated");
  });

  it("removed earns a badge, the worded status, and desaturation", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "removed" }) });
    expect(screen.getByTestId("status-badge")).not.toBeNull();
    expect(screen.getByTestId("status-text").textContent).toBe("Removed");
    expect(screen.getByTestId("icon-mark").className).toContain("desaturated");
  });

  it("names the replacement in the worded status when replaced_by is set", () => {
    renderTile({ service: service({ id: "a", role: "auth-legacy", service: "auth0", status: "phasing_out", replaced_by: "auth-users" }) });
    expect(screen.getByTestId("status-text").textContent).toBe("Phasing out → auth-users");
  });

  it("states the status word alone when replaced_by is unset", () => {
    renderTile({ service: service({ id: "a", role: "finance-ledger", service: "acme-ledger", status: "deprecated" }) });
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
describe("ServiceTile -- status, the active + replaced_by ruling", () => {
  // The regression this whole ruling is scoped around not disturbing: the
  // rule an `active` service with *no* replacement earns nothing at all is
  // the norm-suppression rule DIRECTION.md exists to protect ("tagging the
  // norm is what produced thirty-five identical marks before"). This is a
  // second, more targeted copy of the "active earns no badge..." test above
  // -- kept as its own case here, next to the exception it is the control
  // for, rather than trusted to the pre-existing one alone.
  it("still renders no badge, no worded status and no desaturation for active with no replaced_by", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "active", replaced_by: undefined }) });
    expect(screen.queryByTestId("status-badge")).toBeNull();
    expect(screen.queryByTestId("status-text")).toBeNull();
    expect(screen.getByTestId("icon-mark").className).not.toContain("desaturated");
    expect(screen.getByRole("button").getAttribute("aria-label")).not.toMatch(/Active/);
  });

  it("shows the replacement, worded 'Active → <replaced_by>', when active carries replaced_by", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "active", replaced_by: "db-primary" }) });
    expect(screen.getByTestId("status-text").textContent).toBe("Active → db-primary");
  });

  it("reaches the accessible name with the replacement, for active + replaced_by", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", name: "Fly.io", status: "active", replaced_by: "db-primary" }) });
    expect(screen.getByRole("button", { name: "Fly.io, a, Active → db-primary" })).not.toBeNull();
  });

  // The badge is keyed to one of three mockup-drawn pictograms, none of them
  // captioned `active` -- decided in ServiceTile.tsx's own comment rather
  // than invented a fourth shape. This is the regression guard for that
  // decision: a corner badge must not appear here even though the word does.
  it("renders no corner badge for active + replaced_by, even though the word appears", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "active", replaced_by: "db-primary" }) });
    expect(screen.getByTestId("status-text")).not.toBeNull();
    expect(screen.queryByTestId("status-badge")).toBeNull();
  });

  // Desaturation is documented as status signal 2 of 3, keyed to the same
  // three non-active statuses as the badge -- not extended to this case for
  // the identical "no source for a fourth" reason. Guarded separately from
  // the badge test above since the two are independent CSS classes on
  // independent elements.
  it("does not desaturate the mark for active + replaced_by", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status: "active", replaced_by: "db-primary" }) });
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
describe("ServiceTile -- status badge glyphs are distinct shapes", () => {
  function badgeSvgMarkup(status: "phasing_out" | "deprecated" | "removed") {
    const { unmount } = renderTile({ service: service({ id: "a", role: "hosting", service: "flyio", status }) });
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

describe("ServiceTile -- selection", () => {
  it("marks aria-current when selected", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio" }), selected: true });
    expect(screen.getByRole("button").getAttribute("aria-current")).toBe("true");
  });

  it("carries no aria-current attribute at all when not selected", () => {
    renderTile({ service: service({ id: "a", role: "hosting", service: "flyio" }), selected: false });
    expect(screen.getByRole("button").hasAttribute("aria-current")).toBe(false);
  });
});

describe("ServiceTile -- activation and peeking", () => {
  it("calls onActivate with the exact service on click", () => {
    const entry = service({ id: "a", role: "hosting", service: "flyio" });
    const { onActivate } = renderTile({ service: entry });
    fireEvent.click(screen.getByRole("button"));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]![0]).toBe(entry);
  });

  it("peeks on pointer enter (mouse) and ends the peek on pointer leave", () => {
    const { onPeek, onPeekEnd } = renderTile({ service: service({ id: "a", role: "hosting", service: "flyio" }) });
    const tile = screen.getByRole("button");
    fireEvent.pointerOver(tile, { pointerType: "mouse" });
    expect(onPeek).toHaveBeenCalledTimes(1);
    fireEvent.pointerOut(tile, { relatedTarget: document.body });
    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });

  // Touch has no hover at all -- a popover a touch user cannot dismiss would
  // be worse than none, so touch skips straight past peeking to the click.
  it("does not peek on a touch pointer", () => {
    const { onPeek } = renderTile({ service: service({ id: "a", role: "hosting", service: "flyio" }) });
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
    const { onPeek, onPeekEnd } = renderTile({ service: service({ id: "a", role: "hosting", service: "flyio" }) });
    const tile = screen.getByRole("button");
    fireEvent.focus(tile);
    expect(onPeek).toHaveBeenCalledTimes(1);
    fireEvent.blur(tile);
    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });
});

describe("serviceTileDomId", () => {
  it("keys the DOM id on the manifest entry id, and the button carries exactly that id", () => {
    renderTile({ service: service({ id: "host-api", role: "hosting", service: "flyio" }) });
    expect(screen.getByRole("button").id).toBe(serviceTileDomId("host-api"));
    expect(serviceTileDomId("host-api")).toBe("service-tile-host-api");
  });
});
