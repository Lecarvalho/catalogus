// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeViewService } from "../test-support/fixtures.js";
import { ServiceDetailPanel } from "./ServiceDetailPanel.js";

const identity = (id: string) => id;

afterEach(() => {
  cleanup();
});

describe("ServiceDetailPanel", () => {
  it("is a labelled region", () => {
    render(
      <ServiceDetailPanel
        service={makeViewService({ id: "fly-api", role: "hosting-api", name: "Fly.io" })}
        dependsOn={[]}
        dependedOnBy={[]}
        labelForId={identity}
        onClose={vi.fn()}
      />
    );
    const region = screen.getByRole("region");
    expect(region.getAttribute("aria-labelledby")).not.toBeNull();
  });

  it("renders role, kind (only for a non-service kind), version, added and replaced_by -- everything moved off the node", () => {
    render(
      <ServiceDetailPanel
        service={makeViewService({
          id: "dotnet",
          role: "runtime-backend",
          kind: "stack",
          version: "10",
          added: "2025-11-02",
          replaced_by: undefined,
        })}
        dependsOn={[]}
        dependedOnBy={[]}
        labelForId={identity}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("runtime-backend")).not.toBeNull();
    expect(screen.getByText("stack")).not.toBeNull();
    expect(screen.getByText("10")).not.toBeNull();
    expect(screen.getByText("2025-11-02")).not.toBeNull();
  });

  it("shows no kind row for the default kind ('service')", () => {
    render(
      <ServiceDetailPanel
        service={makeViewService({ id: "vendor", role: "payments", kind: "service" })}
        dependsOn={[]}
        dependedOnBy={[]}
        labelForId={identity}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText("service")).toBeNull();
  });

  it("renders replaced_by through labelForId", () => {
    render(
      <ServiceDetailPanel
        service={makeViewService({ id: "legacy-mailer", role: "email", replaced_by: "mailer" })}
        dependsOn={[]}
        dependedOnBy={[]}
        labelForId={(id) => `label-for-${id}`}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("label-for-mailer")).not.toBeNull();
  });

  it("renders notes, and depends-on / depended-on-by through labelForId", () => {
    render(
      <ServiceDetailPanel
        service={makeViewService({ id: "host-api", role: "hosting-api", notes: "runs the API container" })}
        dependsOn={["supabase-db"]}
        dependedOnBy={["host-web"]}
        labelForId={identity}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("runs the API container")).not.toBeNull();
    expect(screen.getByText(/supabase-db/)).not.toBeNull();
    expect(screen.getByText(/host-web/)).not.toBeNull();
  });

  it("shows an uncatalogued marker for a service the catalog has no row for", () => {
    render(
      <ServiceDetailPanel
        service={makeViewService({ id: "mystery", role: "widget-thing", known: false, name: "raw-slug" })}
        dependsOn={[]}
        dependedOnBy={[]}
        labelForId={identity}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/uncatalogued/)).not.toBeNull();
  });

  // The Layer 3 empty state. What these guard is the *claim*, not the
  // layout: the panel must say the overlay is absent, must not offer an
  // action against something that does not exist, and must not offer the
  // section at all for a kind that can never carry the data.
  describe("the Layer 3 cost and account overlay", () => {
    it("says the private overlay is not connected, and names the command that will fill it", () => {
      render(
        <ServiceDetailPanel
          service={makeViewService({ id: "fly-api", role: "hosting-api" })}
          dependsOn={[]}
          dependedOnBy={[]}
          labelForId={identity}
          onClose={vi.fn()}
        />
      );
      expect(screen.getByRole("heading", { name: /cost & account/i })).not.toBeNull();
      expect(screen.getByText("Not connected")).not.toBeNull();
      expect(screen.getByText("catalogus push --private")).not.toBeNull();
    });

    // Not a wording nit. An empty state that offers a connect action against
    // a backend Phase 4 has not decided on yet is the plausible-default
    // failure this repo keeps correcting -- there is nothing to click, so
    // there must be nothing that looks clickable. The close button is the
    // panel's only control and stays that way.
    it("offers no action against a backend that does not exist", () => {
      render(
        <ServiceDetailPanel
          service={makeViewService({ id: "fly-api", role: "hosting-api" })}
          dependsOn={[]}
          dependedOnBy={[]}
          labelForId={identity}
          onClose={vi.fn()}
        />
      );
      expect(screen.getAllByRole("button")).toHaveLength(1);
      expect(screen.getByRole("button", { name: /close/i })).not.toBeNull();
      expect(screen.queryByRole("link")).toBeNull();
    });

    // HANDOFF.md's 2026-08-23 amendment: only `service` rows can carry a cost
    // or an account reference. Showing "not connected" under a component or a
    // stack would promise a field that is never coming.
    it.each(["component", "stack"] as const)("renders nothing for kind: %s, which can never carry a cost", (kind) => {
      render(
        <ServiceDetailPanel
          service={makeViewService({ id: "dotnet", role: "runtime-backend", kind })}
          dependsOn={[]}
          dependedOnBy={[]}
          labelForId={identity}
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByRole("heading", { name: /cost & account/i })).toBeNull();
      expect(screen.queryByText("Not connected")).toBeNull();
    });

    // The panel's own heading is the service name at h2; this section sits
    // under it, so h3 is the level that keeps the outline unbroken rather
    // than a size chosen by eye.
    it("nests its heading under the panel's own, at h3", () => {
      render(
        <ServiceDetailPanel
          service={makeViewService({ id: "fly-api", role: "hosting-api" })}
          dependsOn={[]}
          dependedOnBy={[]}
          labelForId={identity}
          onClose={vi.fn()}
        />
      );
      expect(screen.getByRole("heading", { name: /cost & account/i }).tagName).toBe("H3");
    });

    // The panel as a whole is the one labelled region (see the first test in
    // this file). This section is a plain div on purpose: a named <section>
    // would nest a second region inside it, which is both a worse outline
    // for a screen reader and enough to break that test.
    it("adds no second region to the panel", () => {
      render(
        <ServiceDetailPanel
          service={makeViewService({ id: "fly-api", role: "hosting-api" })}
          dependsOn={[]}
          dependedOnBy={[]}
          labelForId={identity}
          onClose={vi.fn()}
        />
      );
      expect(screen.getAllByRole("region")).toHaveLength(1);
    });
  });

  it("calls onClose when the close button is activated", () => {
    const onClose = vi.fn();
    render(
      <ServiceDetailPanel
        service={makeViewService({ id: "fly-api", role: "hosting-api" })}
        dependsOn={[]}
        dependedOnBy={[]}
        labelForId={identity}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
