// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  // The row's status is shown through StatusPill rather than a second status
  // vocabulary invented here -- and until the validation pass, deleting the
  // pill entirely left the whole suite green.
  it("shows each row's status through the same pill the rest of the app uses", () => {
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
    expect(screen.getByRole("button", { name: /old-db/ }).textContent).toContain("phasing out");
    expect(screen.getByRole("button", { name: /old-auth/ }).textContent).toContain("deprecated");
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
