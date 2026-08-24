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
