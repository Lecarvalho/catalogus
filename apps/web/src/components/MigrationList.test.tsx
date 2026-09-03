// @vitest-environment jsdom
//
// MigrationList moved into candidate E, the home screen, on 2026-08-31 --
// see MigrationList.tsx's header for the full account. This suite replaces
// the previous one rather than patching it: the row it renders no longer
// strikes a name through or colours a replacement red, and the status word
// is now printed (Title Case, matching ServiceTile's own wording) instead
// of living only in the accessible name. Tests that asserted the retired
// `.superseded`/`.replacementNew` treatment are gone with the treatment;
// what replaces them asserts the badge+word pairing and the replacement's
// own labelled fact, each resolved through its own scoped query rather than
// "this text exists somewhere on the page" -- the distinction CLAUDE.md and
// this repo's own history (five Object.prototype defects, two dropped-focus
// regressions) keep proving matters.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FLYIO_ICON_FIXTURE, makeViewService } from "../test-support/fixtures.js";
import { MigrationList } from "./MigrationList.js";
import { serviceNodeDomId } from "./ServiceNode.js";

afterEach(() => {
  cleanup();
});

describe("MigrationList -- sections", () => {
  it("lists a phasing_out service under 'In flight', with its replacement named", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "old-db", role: "database", status: "phasing_out", replaced_by: "new-db" }),
          makeViewService({ id: "new-db", role: "database", name: "New DB" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { level: 2, name: "In flight" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /old-db/ })).not.toBeNull();
    expect(screen.getByText("new-db (New DB)")).not.toBeNull();
  });

  it("lists a deprecated service under 'Overdue', with its replacement named", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "old-auth", role: "auth", status: "deprecated", replaced_by: "new-auth" }),
          makeViewService({ id: "new-auth", role: "auth", name: "New Auth" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { level: 2, name: "Overdue" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /old-auth/ })).not.toBeNull();
    expect(screen.getByText("new-auth (New Auth)")).not.toBeNull();
  });

  it("says plainly that nothing needs a decision when there is nothing phasing_out or deprecated", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "fine", role: "hosting", status: "active" }),
          makeViewService({ id: "gone", role: "hosting", status: "removed" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.getByText(/Nothing needs a migration decision/)).not.toBeNull();
  });

  it("says plainly that nothing is deprecated, when the in-flight section still has rows", () => {
    render(
      <MigrationList
        services={[makeViewService({ id: "old-db", role: "database", status: "phasing_out" })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { level: 2, name: "In flight" })).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Overdue" })).not.toBeNull();
    expect(screen.getByText("Nothing is deprecated right now.")).not.toBeNull();
  });

  it("leaves a removed service off the board entirely -- that migration is finished", () => {
    render(<MigrationList services={[makeViewService({ id: "gone", role: "hosting", status: "removed" })]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /gone/ })).toBeNull();
  });

  it("leaves an active service off the board entirely", () => {
    render(<MigrationList services={[makeViewService({ id: "fine", role: "hosting", status: "active" })]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /fine/ })).toBeNull();
  });

  // Both sections, not just the first: the sort is applied per section, so
  // exercising only the in-flight one left the overdue sort held by a single
  // assertion in migrations.test.ts and none here.
  it("ordinal-sorts each section by id", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "z-svc", role: "hosting", status: "phasing_out" }),
          makeViewService({ id: "a-svc", role: "hosting", status: "phasing_out" }),
          makeViewService({ id: "z-old", role: "hosting", status: "deprecated" }),
          makeViewService({ id: "a-old", role: "hosting", status: "deprecated" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("id"))).toEqual([
      serviceNodeDomId("a-svc"),
      serviceNodeDomId("z-svc"),
      serviceNodeDomId("a-old"),
      serviceNodeDomId("z-old"),
    ]);
  });

  // Catches a transposed section count as surely as a swapped total: two
  // rows in one section, one in the other, each read from inside its own
  // section rather than off the page as a whole.
  it("states each section's row count in its header", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "a-svc", role: "hosting", status: "phasing_out" }),
          makeViewService({ id: "b-svc", role: "hosting", status: "phasing_out" }),
          makeViewService({ id: "c-old", role: "hosting", status: "deprecated" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const inFlightSection = screen.getByRole("heading", { level: 2, name: "In flight" }).closest("section")!;
    const overdueSection = screen.getByRole("heading", { level: 2, name: "Overdue" }).closest("section")!;
    expect(within(inFlightSection).getByText("2")).not.toBeNull();
    expect(within(overdueSection).getByText("1")).not.toBeNull();
  });
});

describe("MigrationList -- the mark", () => {
  // Mirrors ServiceTile's own "no-brand-icon case" test: a row with no
  // verified icon renders the shared monogramFor helper, not Icon's own
  // generic rollup fallback -- catches a regression that swapped in Icon's
  // fallback glyph (or dropped the mark's fallback branch) by asserting
  // both what is present and what is absent.
  it("renders the monogram, not Icon's generic fallback glyph, when the service has no verified icon", () => {
    render(
      <MigrationList
        services={[makeViewService({ id: "old-ledger", role: "finance-ledger", service: "acme-ledger", status: "deprecated", icon: null })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const mark = screen.getByTestId("mark");
    expect(within(mark).getByText("AL")).not.toBeNull();
    expect(within(mark).queryByTestId("icon-fallback")).toBeNull();
  });

  // D6: the fallback mark carries the dashed/sunken treatment
  // (MigrationList.module.css's `.markFallback`), matching the mockup's own
  // `.pop-mark--fallback` -- and a row with a real icon carries neither,
  // catching a regression that applied the class unconditionally as surely
  // as one that dropped it.
  it("puts the fallback treatment class on the mark when there is no verified icon, and not when there is", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "old-ledger", role: "finance-ledger", service: "acme-ledger", status: "deprecated", icon: null }),
          makeViewService({ id: "host-api", role: "hosting-api", service: "flyio", status: "phasing_out", icon: FLYIO_ICON_FIXTURE }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    // Resolved through each row's own DOM id, not array position -- the two
    // rows land in different sections (In flight, Overdue), so the render
    // order is the sections' own, not the fixture's.
    const fallbackMark = within(document.getElementById(serviceNodeDomId("old-ledger"))!).getByTestId("mark");
    const iconMark = within(document.getElementById(serviceNodeDomId("host-api"))!).getByTestId("mark");
    expect(fallbackMark.className).toContain("markFallback");
    expect(iconMark.className).not.toContain("markFallback");
  });

  // The colour prop and the resolved brand fill both reach the mark --
  // catches a regression that dropped `colour` (leaving every mark
  // monochrome, contradicting candidate E's own reversal on this) or that
  // passed the wrong service's icon into the wrong row.
  it("renders the real brand icon, coloured, when one resolved", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "host-api", role: "hosting-api", service: "flyio", status: "phasing_out", icon: FLYIO_ICON_FIXTURE }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const svg = screen.getByTestId("mark").querySelector("svg");
    // See ServiceTile.test.tsx's identical assertion for why this is the
    // normalised rgb() form of FLYIO_ICON_FIXTURE.hex ("#24175B") rather
    // than the hex string itself.
    expect(svg?.style.color).toBe("rgb(36, 23, 91)");
  });
});

describe("MigrationList -- status, badge and word", () => {
  // Resolved inside each row's own status wrapper, not "this text is on the
  // page somewhere" -- catches the status word and glyph being swapped
  // between the two rows, which a page-wide `getByText` could not.
  it("shows 'Phasing out' on a phasing_out row's status, and 'Deprecated' on a deprecated row's, never the other's", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "old-db", role: "database", status: "phasing_out", name: "Old DB" }),
          makeViewService({ id: "old-auth", role: "auth", status: "deprecated", name: "Old Auth" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const phasingButton = document.getElementById(serviceNodeDomId("old-db"))!;
    const deprecatedButton = document.getElementById(serviceNodeDomId("old-auth"))!;

    const phasingStatus = within(phasingButton).getByTestId("status");
    expect(within(phasingStatus).getByText("Phasing out")).not.toBeNull();
    expect(within(phasingStatus).queryByText("Deprecated")).toBeNull();

    const deprecatedStatus = within(deprecatedButton).getByTestId("status");
    expect(within(deprecatedStatus).getByText("Deprecated")).not.toBeNull();
    expect(within(deprecatedStatus).queryByText("Phasing out")).toBeNull();
  });

  // The status glyph is aria-hidden svg with no accessible text of its own,
  // so the only way to prove the two statuses render two different shapes
  // is to compare the markup directly -- catches StatusGlyph collapsing to
  // one shape for both branches (a copy-paste of one case over the other).
  it("draws a different glyph for phasing_out than for deprecated", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "old-db", role: "database", status: "phasing_out" }),
          makeViewService({ id: "old-auth", role: "auth", status: "deprecated" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const phasingGlyph = within(document.getElementById(serviceNodeDomId("old-db"))!).getByTestId("status").querySelector("svg")!;
    const deprecatedGlyph = within(document.getElementById(serviceNodeDomId("old-auth"))!).getByTestId("status").querySelector("svg")!;
    expect(phasingGlyph.innerHTML).not.toBe(deprecatedGlyph.innerHTML);
  });

  // The word printed on screen and the word spoken in the accessible name
  // must be the same word -- see the file header's addendum on why this
  // moved off service-tags.ts's lower-case "phasing out"/"deprecated" onto
  // ServiceTile's own Title Case. Catches the visible text and the
  // aria-label drifting onto two different vocabularies for the same fact.
  it("names the row's status in its accessible name, in the same words the status line prints", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "old-db", role: "database", status: "phasing_out", name: "Old DB" }),
          makeViewService({ id: "old-auth", role: "auth", status: "deprecated", name: "Old Auth" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Old DB, old-db, Phasing out" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Old Auth, old-auth, Deprecated" })).not.toBeNull();
  });

  // The row the board exists to surface -- a migration with no destination --
  // must not lose its status word for lacking one.
  it("still names the status in the accessible name when there is no replacement to describe", () => {
    render(
      <MigrationList
        services={[makeViewService({ id: "orphan", role: "hosting", status: "deprecated", name: "Orphan" })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Orphan, orphan, Deprecated" })).not.toBeNull();
  });

  // The row's own visible text never repeats the status word outside the
  // status wrapper -- catches a stray second copy (e.g. appended to the
  // name) that the scoped queries above would not, since they only look
  // inside the wrapper they already found.
  it("prints the status word exactly once per row, not duplicated onto the name", () => {
    render(
      <MigrationList
        services={[makeViewService({ id: "old-db", role: "database", status: "phasing_out", name: "Old DB" })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const button = document.getElementById(serviceNodeDomId("old-db"))!;
    expect((button.textContent!.match(/Phasing out/g) ?? []).length).toBe(1);
  });
});

describe("MigrationList -- the replacement fact", () => {
  it("shows 'no replacement recorded' for a service with no replaced_by, rather than leaving it blank", () => {
    render(
      <MigrationList
        services={[makeViewService({ id: "orphan", role: "hosting", status: "phasing_out" })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("no replacement recorded")).not.toBeNull();
  });

  // A rendering bug must degrade to the id rather than crash.
  it("shows the bare id when replaced_by names a service absent from the manifest", () => {
    render(
      <MigrationList
        services={[makeViewService({ id: "old-cache", role: "cache", status: "phasing_out", replaced_by: "does-not-exist" })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("does-not-exist")).not.toBeNull();
  });

  // Every row -- deprecated as well as phasing_out -- carries the same
  // "Replacement" caption above its value: catches the caption being
  // rendered only for one status, which the retired strike-through/red
  // treatment used to differ on but this fact deliberately does not.
  it("captions the replacement fact 'Replacement' on both a phasing_out row and a deprecated row", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "old-db", role: "database", status: "phasing_out", replaced_by: "new-db" }),
          makeViewService({ id: "new-db", role: "database", name: "New DB" }),
          makeViewService({ id: "old-auth", role: "auth", status: "deprecated", replaced_by: "new-auth" }),
          makeViewService({ id: "new-auth", role: "auth", name: "New Auth" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getAllByText("Replacement")).toHaveLength(2);
  });

  it("puts the replacement in the row's accessible description, not just beside it", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "old-db", role: "database", status: "phasing_out", replaced_by: "new-db" }),
          makeViewService({ id: "new-db", role: "database", name: "New DB" }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const describedBy = screen.getByRole("button", { name: /old-db/ }).getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy!)?.textContent).toBe("replaced by new-db (New DB)");
  });

  it("describes a row with no replacement as unanswered rather than leaving it undescribed", () => {
    render(
      <MigrationList
        services={[makeViewService({ id: "old-db", role: "database", status: "phasing_out" })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const describedBy = screen.getByRole("button", { name: /old-db/ }).getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)?.textContent).toBe("no replacement recorded");
  });
});

describe("MigrationList -- prototype-pollution safety", () => {
  // The prototype-inheritance defect (CLAUDE.md; Tag.tsx's header) has
  // landed five times in this repo, always through a keyed lookup on a
  // manifest-derived string. This file has two now (STATUS_WORDS and the
  // StatusGlyph switch), both keyed on `service.status` -- a schema-closed
  // enum, not free text, so `service.id` is the field to prove safe here,
  // exactly as before.
  it("renders a service id of 'constructor' as an ordinary row, not as an inherited Object.prototype member", () => {
    render(
      <MigrationList
        services={[makeViewService({ id: "constructor", role: "hosting", status: "phasing_out" })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const row = screen.getByRole("button", { name: /constructor/ });
    expect(row.getAttribute("id")).toBe(serviceNodeDomId("constructor"));
    expect(row.textContent).not.toContain("function");
  });
});

describe("MigrationList -- focus and selection", () => {
  // App.tsx restores focus on panel close by looking this id up. A row
  // without one drops focus to `<body>` -- see App.test.tsx, where the
  // end-to-end version of this lives. Held here too because this component
  // owns the id, and the failure is silent everywhere else.
  it("gives each row the DOM id App.tsx restores focus through", () => {
    render(
      <MigrationList
        services={[makeViewService({ id: "old-db", role: "database", status: "phasing_out" })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /old-db/ }).getAttribute("id")).toBe(serviceNodeDomId("old-db"));
  });

  it("calls onSelect with the row's own service id when it is activated -- the same contract the list and canvas use", () => {
    const onSelect = vi.fn();
    render(
      <MigrationList
        services={[makeViewService({ id: "old-db", role: "database", status: "phasing_out", replaced_by: "new-db" })]}
        selectedId={null}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /old-db/ }));
    expect(onSelect).toHaveBeenCalledWith("old-db");
  });

  it("marks the row matching selectedId as pressed, and no other", () => {
    render(
      <MigrationList
        services={[
          makeViewService({ id: "svc-a", role: "hosting", status: "phasing_out", name: "Service A" }),
          makeViewService({ id: "svc-b", role: "hosting", status: "phasing_out", name: "Service B" }),
        ]}
        selectedId="svc-a"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /Service A/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Service B/ }).getAttribute("aria-pressed")).toBe("false");
  });
});
