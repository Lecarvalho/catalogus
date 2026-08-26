// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService } from "../test-support/fixtures.js";
import { MigrationList } from "./MigrationList.js";
import { serviceNodeDomId } from "./ServiceNode.js";

afterEach(() => {
  cleanup();
});

describe("MigrationList", () => {
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

  // The most important row on the board: a migration with no destination.
  // It renders as an explicit, plain statement -- not blank, not an error.
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

  it("leaves a removed service off the board entirely -- that migration is finished", () => {
    render(<MigrationList services={[makeViewService({ id: "gone", role: "hosting", status: "removed" })]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /gone/ })).toBeNull();
  });

  it("leaves an active service off the board entirely", () => {
    render(<MigrationList services={[makeViewService({ id: "fine", role: "hosting", status: "active" })]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /fine/ })).toBeNull();
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

  // Replaces "shows each row's status through the same pill the rest of the
  // app uses". That test pinned `StatusPill` on every row -- the exact thing
  // `service-tags.ts`'s header says produced "thirty-five pills, thirty-one
  // of them saying 'active'": a status mark repeated on a set the reader
  // already knows the status of. Here the redundancy is total rather than
  // partial -- `migrations.ts` filters "In flight" to exactly `phasing_out`
  // and "Overdue" to exactly `deprecated`, so a per-row status word states
  // what the heading two lines up already states, for every row, with no
  // exception a mark could ever earn. The section heading is the one place
  // that names the status now.
  it("does not repeat a row's status as text -- the section heading is the only place that names it", () => {
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
    expect(screen.getByRole("button", { name: /old-db/ }).textContent).not.toMatch(/phasing/i);
    expect(screen.getByRole("button", { name: /old-auth/ }).textContent).not.toMatch(/deprecated/i);
  });

  // The status word dropped with StatusPill has to land somewhere a
  // screen-reader user still hears it -- the previous test proves it is off
  // the *visible* row, this one proves it is not gone altogether. Found by a
  // validation agent driving the built app: tabbing button to button, a row
  // announced only "Auth0 auth-legacy" and nothing that said which section
  // it was in. `aria-label` is the fix, built from service-tags.ts's own
  // vocabulary (the same one ServiceTile.tsx draws its identical wordless
  // mark from), not a fourth set of status strings invented here.
  it("names the row's status in its accessible name, even though no row prints the word", () => {
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
    expect(screen.getByRole("button", { name: "Old DB, old-db, phasing out" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Old Auth, old-auth, deprecated" })).not.toBeNull();
  });

  // The row the board exists to surface -- a migration with no destination --
  // must not lose its status word for lacking one. The name and the
  // description are built independently (aria-label vs. aria-describedby),
  // so this is the case most likely to have been missed by a fix that
  // conflated the two.
  it("still names the status in the accessible name when there is no replacement to describe", () => {
    render(
      <MigrationList
        services={[makeViewService({ id: "orphan", role: "hosting", status: "deprecated", name: "Orphan" })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Orphan, orphan, deprecated" })).not.toBeNull();
  });

  // The world's own idiom for this fact (docs/DIRECTION.md, "Mapped from the
  // world's own grammar, not invented"): a struck old price beside a red new
  // one, for `phasing_out` specifically -- the row is a live swap in
  // progress. A `deprecated` row makes a different claim ("should not be
  // used, still present," not "is being replaced this instant") and keeps
  // its name intact.
  it("strikes through a phasing_out row's name, and leaves a deprecated row's name intact", () => {
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
    const phasingName = screen.getByText("Some Service", { selector: `#${serviceNodeDomId("old-db")} *` });
    expect(phasingName.className).toContain("superseded");

    const deprecatedName = screen.getByText("Some Service", { selector: `#${serviceNodeDomId("old-auth")} *` });
    expect(deprecatedName.className).not.toContain("superseded");
  });

  // The other half of the same idiom: the replacement, when a phasing_out
  // row has one on record, carries the signal colour -- the "red new price".
  // A deprecated row's replacement stays ink: DIRECTION maps `deprecated` to
  // a solid *black* tag, not the signal colour, and colouring every row on
  // this board red would be the "35 identical pills" defect wearing new
  // paint, just in one hue instead of four.
  it("marks a phasing_out row's replacement with the signal colour, and a deprecated row's replacement without it", () => {
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
    const phasingReplacement = screen.getByText("new-db (New DB)");
    expect(phasingReplacement.className).toContain("replacementNew");

    const deprecatedReplacement = screen.getByText("new-auth (New Auth)");
    expect(deprecatedReplacement.className).not.toContain("replacementNew");
  });

  // Each section states its own row count in its header, in the same
  // grammar BandModule.module.css's `.count` uses -- a number worth reading
  // before the names, spent in the signal colour. Two rows in one section
  // and one in the other, so a hardcoded 0 or a swapped total is caught.
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

  // The prototype-inheritance defect (CLAUDE.md; Tag.tsx's header)
  // has landed five times in this repo, always through a keyed lookup on a
  // manifest-derived string. This file has no such lookup left -- the
  // phasing_out/deprecated split below is a strict-equality branch, and
  // every DOM id is built by template string, not by indexing a shared
  // object -- but a manifest id of "constructor" is still a legitimate
  // input, and this proves the rendering path never routes it through
  // `Object.prototype` regardless.
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

  // The replacement is the point of the row and it sits outside the control,
  // so that clicking it cannot select the wrong service. That kept it out of
  // the button's accessible name entirely; `aria-describedby` is what puts it
  // back, and the srOnly prefix is what stops the description being a bare
  // name with no relationship attached to it (the arrow is aria-hidden).
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
