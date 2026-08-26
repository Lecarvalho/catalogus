// @vitest-environment jsdom
//
// The shell is chrome, so what is worth testing is the boundary it draws:
// the brand is always present, and the manifest path appears only when there
// actually is one. The second half is the ask-never-guess rule applied to a
// render -- during a load there is no answer, and a placeholder would be a
// plausible default.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppShell } from "./AppShell.js";

afterEach(() => cleanup());

describe("AppShell", () => {
  it("renders the product identity and the children it frames", () => {
    render(
      <AppShell manifestPath="C:/scratch/project/catalogus.yaml">
        <p>document body</p>
      </AppShell>,
    );

    expect(screen.getByText("Catalogus")).not.toBeNull();
    expect(screen.getByText("document body")).not.toBeNull();
  });

  it("puts the identity in a banner landmark, so the chrome is skippable", () => {
    render(
      <AppShell manifestPath="C:/scratch/project/catalogus.yaml">
        <p>document body</p>
      </AppShell>,
    );

    const banner = screen.getByRole("banner");
    expect(banner.textContent).toContain("Catalogus");
    // The document is framed by the shell, not inside its banner -- a
    // screen-reader user skipping the banner must not skip the page.
    expect(banner.textContent).not.toContain("document body");
  });

  it("shows the manifest path when one is being served", () => {
    render(
      <AppShell manifestPath="C:/scratch/project/catalogus.yaml">
        <p>body</p>
      </AppShell>,
    );

    const path = screen.getByText("C:/scratch/project/catalogus.yaml");
    // The bar truncates from the left, so the full string has to survive
    // somewhere a reader can get at it.
    expect(path.getAttribute("title")).toBe("C:/scratch/project/catalogus.yaml");
  });

  // The load and error states pass no path, because at that point there is
  // no answer. This asserts absence rather than a placeholder: an empty
  // element, an "unknown", or a stale previous path would all pass a test
  // that only checked the loaded case.
  it("renders no path element at all while nothing is loaded", () => {
    const { container } = render(
      <AppShell>
        <p>body</p>
      </AppShell>,
    );

    expect(screen.getByText("Catalogus")).not.toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.getByRole("banner").querySelector("p")).toBeNull();
  });
});
