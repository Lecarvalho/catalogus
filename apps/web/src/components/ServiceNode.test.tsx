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

  // aria-pressed above is the assistive-tech signal; this pins the visual
  // one, which nothing did before this test. The
  // "ServiceNode.module.css's selected state" describe block below reads
  // the stylesheet as text and asserts the `.selected` rule's declarations
  // -- it would stay green even if this class never reached an element,
  // which is this repo's own named failure shape: a test that proves the
  // thing asserted rather than the thing wanted. Deleting
  // `${isSelected ? styles.selected : ""}` from the className line left the
  // suite green (1152/70) before this test existed; GraphCanvas.test.tsx and
  // ServiceList.test.tsx's own "marks the node matching selectedId" tests
  // check `aria-pressed` only, not this class, so neither caught it either.
  //
  // Known and stated plainly rather than left to be discovered later: in the
  // shipped app today this state is unreachable on screen. App.tsx renders
  // `selectedService ? <ServicePage/> : <board|graph|migrations>`, so
  // selecting a node replaces the graph with the detail page rather than
  // highlighting a node inside it -- a selected `ServiceNode` is never
  // simultaneously on screen for a user to see. The test is still worth
  // having, because `isSelected -> .selected` is this component's own
  // contract regardless of who currently exercises it, and the app's
  // routing is not this component's concern; a comment claiming a user sees
  // this today would be false, so this one does not make that claim.
  it("carries the selected class when isSelected is true", () => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting" })} isSelected={true} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").classList.contains(styles.selected ?? "")).toBe(true);
  });

  it("carries no selected class when isSelected is false", () => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").classList.contains(styles.selected ?? "")).toBe(false);
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

  // Status used to be a coloured ring around the icon, one rule per exact
  // status value including `active` -- the thing service-tags.ts's header
  // says a real manifest cannot afford (31 of 35 entries active; marking the
  // norm is what made the four departures invisible). It is now the same
  // bar ServiceTile.module.css's `.mark` draws on the board, and `active`
  // draws nothing at all.
  it.each([
    ["phasing_out", "signal-outline"],
    ["deprecated", "ink-solid"],
    ["removed", "grey-solid"],
  ] as const)("marks a %s service with a status bar in the %s tone, not a ring", (status, tone) => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting", status })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    // `known: true` (the fixture default) means the mark is the only
    // aria-hidden child -- the uncatalogued dot is the only other thing that
    // carries this attribute, and it is absent here.
    const mark = screen.getByRole("button").querySelector('[aria-hidden="true"]');
    expect(mark).not.toBeNull();
    expect(mark?.classList.contains(styles.mark ?? "")).toBe(true);
    expect(mark?.classList.contains(styles[tone] ?? "")).toBe(true);
  });

  it("renders no status mark for 'active' -- the norm earns no mark, the same rule the tag vocabulary enforces", () => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting", status: "active" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button").querySelector('[aria-hidden="true"]')).toBeNull();
  });

  // ServiceNode.tsx forces `kind: "service"` into the object it hands
  // `tagsFor` -- the node already carries kind as a shape (the `.kind-*`
  // rules) and a screen-reader-only word, so a kind tag here would be a
  // second, worse vocabulary for the same fact. Delete that override and an
  // *active* component or stack earns `tagsFor`'s "component"/"stack" tag
  // (tone `quiet-outline`) as its only tag; `[mark]` destructures it as the
  // mark; and `MARK_TONE_CLASSES`, built for the three status tones only,
  // has no entry for `quiet-outline`. `markToneClass` comes back
  // `undefined`, `?? ""` swallows it, and the mark still renders --
  // `styles.mark` alone, with no tone-specific background: a real 3px bar
  // painted with nothing, on top of whatever colour sits behind it. Not a
  // crash and not a missing element, which is exactly why a screenshot would
  // not catch it either. Deleting `kind: "service"` from the tagsFor call
  // left the suite green (1152/70) before this test existed.
  it.each(["component", "stack"] as const)(
    "renders no status mark for an active %s -- the suppressed kind tag must not leak into the mark slot",
    (kind) => {
      render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting", kind, status: "active" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
      expect(screen.getByRole("button").querySelector('[aria-hidden="true"]')).toBeNull();
    }
  );

  // The companion suppression, `added: undefined`, cannot be pinned the same
  // way the test above pins `kind`: ServiceNode.tsx hardcodes `readAt` to
  // `""` in the same tagsFor call, and `Date.parse("")` is `NaN`, so
  // `isRecentlyAdded` returns `false` from its own `Number.isNaN(readMs)`
  // check regardless of what `added` holds -- real value or not, recency can
  // never actually fire through this call site today (see the comment above
  // the call itself). Rendering the result would prove nothing either way,
  // so this pins the call's arguments directly instead: whatever `added` and
  // `kind` the real service carries, `tagsFor` must receive `added:
  // undefined` and `kind: "service"`, not the service's own values --
  // exactly what the source comment claims and what neither override was
  // pinned against before this test. `tagsFor` is replaced wholesale rather
  // than spied on in place, the same substitution the "does not resolve an
  // unrecognised tone" test below makes, and for the same reason:
  // service-tags.js has no other export ServiceNode.tsx uses.
  it("suppresses kind and added before calling tagsFor, regardless of what the real service carries", async () => {
    const tagsForSpy = vi.fn((_service: Record<string, unknown>, _readAt: string) => [] as unknown[]);
    vi.doMock("../service-tags.js", () => ({ tagsFor: tagsForSpy }));
    vi.resetModules();

    const { ServiceNode: ServiceNodeWithSpy } = await import("./ServiceNode.js");
    const { makeViewService: makeService } = await import("../test-support/fixtures.js");

    const service = makeService({ id: "svc", role: "hosting", kind: "component", status: "phasing_out", added: "2026-08-01T00:00:00.000Z" });
    render(<ServiceNodeWithSpy service={service} isSelected={false} showId={false} onSelect={vi.fn()} />);

    expect(tagsForSpy).toHaveBeenCalledTimes(1);
    const [passedService] = tagsForSpy.mock.calls[0]!;
    expect(passedService.kind).toBe("service");
    expect(passedService.added).toBeUndefined();
    // The rest of the service passes through unchanged -- these two fields
    // are suppressed, not the whole object replaced by something else.
    expect(passedService.id).toBe("svc");
    expect(passedService.status).toBe("phasing_out");

    vi.doUnmock("../service-tags.js");
    vi.resetModules();
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

  it.each([
    ["service", null],
    ["component", /component -- infrastructure this project runs itself/],
    ["stack", /stack -- what the code is written in/],
  ] as const)("carries kind '%s' as a data attribute, and as text for the two non-default kinds", (kind, textPattern) => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting", kind })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    // The shape cue is CSS, which jsdom does not compute -- this attribute is
    // the machine-readable half of the same fact, and the sr-only text is the
    // half a screen reader gets. A shape alone would be neither.
    expect(screen.getByRole("button").getAttribute("data-kind")).toBe(kind);
    if (textPattern) {
      expect(screen.getByRole("button").textContent).toMatch(textPattern);
    } else {
      expect(screen.getByRole("button").textContent).not.toMatch(/component|stack/);
    }
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

  // The two colour cues above must not be the one chromatic colour in the
  // system. Selection is a UI state, not a departure from normal -- red is
  // reserved for the latter (tokens.css's header) -- and ServiceNode used to
  // spend it here anyway, which is the defect this slice closes.
  it("spends no chromatic colour on selection -- red stays reserved for a departure from normal", () => {
    expect(selectedRule).not.toMatch(/--color-signal|--color-accent/);
  });

  // Same kind of tripwire, same limits, one rule further: kind is carried by
  // shape precisely because colour on this node is already spoken for twice
  // (the status mark, the selected state). A `.kind-*` rule that starts
  // setting a colour is the drift this catches.
  it.each([".kind-component", ".kind-stack"])("declares %s as a shape rule, not a colour one", (selector) => {
    const rule = css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
    expect(rule.length).toBeGreaterThan(selector.length + 2);
    expect(rule).not.toMatch(/color|background/);
  });

  it("declares no rule for kind-service, so the default tile has exactly one definition", () => {
    expect(css).not.toContain(".kind-service");
  });

  // The legacy-alias guard that used to live here -- one `it.each` naming
  // the nine identifiers tokens.css's migration bridge used to carry -- is
  // gone: it protected only this one stylesheet, and covered 2 of the
  // component stylesheets under apps/web/src in total, which is how
  // `--color-surface-raised` could be (and, in a validator's reproduction,
  // was) reintroduced into a *different* stylesheet with the suite still
  // green. `apps/web/src/token-references.test.ts` replaces it: it discovers
  // every `*.module.css` file rather than naming one, and derives the
  // forbidden set from tokens.css's own declarations rather than a
  // hand-typed list that rots one deletion at a time.
});

// The prototype-inheritance defect class, landed five times in this repo
// (Tag.tsx's header carries the full account). `mark.tone` is the same
// shape of lookup Tag.tsx *used* to guard with
// `Object.prototype.hasOwnProperty.call(styles, key)`, until it was
// rewritten on 2026-08-26 to the identical `Map` form ServiceNode.tsx
// already used below -- built and run against this exact test file, that
// own-property guard came back `false` for a key the stylesheet really does
// define, not only for a hostile one. This project's CSS-module handling
// under vitest hands a component a null-prototype value whose `get`
// resolves any key to a real generated class name but whose
// `hasOwnProperty`/`Object.keys` do not agree that key exists -- so the
// own-property guard was not a safe default that happened to reject unknown
// keys, it was a guard that rejected *every* key, real ones included, under
// this harness. That would have shipped a node that never paints a status
// mark, silently, with the existing test suite unable to notice, because
// nothing before this file checked that a real tone actually produced a
// real class (Tag.test.tsx checked text and labels only until 2026-08-26,
// never the applied class). ServiceNode.tsx's `MARK_TONE_CLASSES` Map exists
// because of that finding, not as a style preference -- see its own comment.
//
// What follows is two tests rather than Tag.test.tsx's one, because the
// Map closes off two different failure modes and either needs its own
// mutation to see fail:
//
//  1. A legitimate tone must still resolve to a real class under this exact
//     harness -- the failure mode just described, which a mock-everything
//     test cannot see because it would mock the very thing that was wrong.
//  2. A tone this Map was never given an entry for must not resolve through
//     any prototype chain -- the classic defect, which does need the
//     stylesheet mocked to a real object, the same substitution
//     Tag.test.tsx's own guard makes.
describe("ServiceNode's status-mark tone lookup", () => {
  // Test 1: no mocking at all, deliberately -- this is the real
  // ServiceNode.module.css import, the same one every other test in this
  // file renders against. Mutate MARK_TONE_CLASSES back to an
  // `Object.prototype.hasOwnProperty`-guarded read of `styles` directly and
  // this goes red under `pnpm test`, even though nothing about it looks
  // wrong by reading the source -- the failure only exists at run time,
  // under this specific test harness, which is exactly why it needs a test
  // and not a code review.
  it("resolves a real tone to a real class under this project's own test harness", () => {
    render(<ServiceNode service={makeViewService({ id: "svc", role: "hosting", status: "deprecated" })} isSelected={false} showId={false} onSelect={vi.fn()} />);
    const mark = screen.getByRole("button").querySelector('[aria-hidden="true"]');
    expect(mark?.classList.contains(styles["ink-solid"] ?? "")).toBe(true);
  });

  // Test 2: the classic shape, stylesheet and `tagsFor` both mocked to real
  // values -- that substitution is this half's whole point. A real `{}` has
  // a real prototype chain, so if `MARK_TONE_CLASSES` were ever rebuilt as a
  // plain object indexed directly by `mark.tone`, `styles["constructor"]` on
  // it would resolve to the `Object` function and splice its stringified
  // form into a className. A `Map.get("constructor")` on a Map that was
  // never given that key cannot do this regardless of what `styles` is --
  // which is the property this test is actually pinning, not merely
  // "renders without throwing".
  it("does not resolve an unrecognised tone through Object.prototype", async () => {
    vi.doMock("./ServiceNode.module.css", () => ({ default: { node: "node", label: "label", name: "name", iconWrap: "iconWrap" } }));
    // `tagsFor`'s real STATUS_TAGS map is a closed vocabulary of three
    // tones, none of them "constructor" -- so this stands in for a manifest
    // that has somehow gotten past schema validation, the same posture
    // Tag.tsx's own guard takes rather than trusting that it cannot
    // happen. Replaced wholesale rather than spread over the real module:
    // ServiceNode.tsx imports only `tagsFor` from this file, so there is
    // nothing else the dynamic import below needs from it.
    vi.doMock("../service-tags.js", () => ({
      tagsFor: () => [{ id: "hostile", label: "x", tone: "constructor", title: "x" }],
    }));
    vi.resetModules();

    const { ServiceNode: ServiceNodeWithRealStyles } = await import("./ServiceNode.js");
    const { makeViewService: makeService } = await import("../test-support/fixtures.js");

    render(<ServiceNodeWithRealStyles service={makeService({ id: "svc", role: "hosting" })} isSelected={false} showId={false} onSelect={vi.fn()} />);

    const mark = screen.getByRole("button").querySelector('[aria-hidden="true"]');
    const className = mark?.getAttribute("class") ?? "";
    expect(className).not.toContain("function");
    expect(className).not.toContain("[native code]");

    vi.doUnmock("./ServiceNode.module.css");
    vi.doUnmock("../service-tags.js");
    vi.resetModules();
  });
});
