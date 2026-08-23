import { describe, expect, it } from "vitest";

import * as cli from "./index.js";

describe("@dagstree/cli public API", () => {
  it("exposes the package name", () => {
    expect(cli.CLI_PACKAGE_NAME).toBe("dagstree");
  });

  it("exposes every command function", () => {
    expect(typeof cli.runInit).toBe("function");
    expect(typeof cli.runDetect).toBe("function");
    expect(typeof cli.runDiff).toBe("function");
    expect(typeof cli.runValidate).toBe("function");
    expect(typeof cli.runGraph).toBe("function");
    expect(typeof cli.runAdd).toBe("function");
  });

  it("exposes the shared building blocks used to construct those commands", () => {
    expect(typeof cli.resolveTargetPath).toBe("function");
    expect(typeof cli.findManifest).toBe("function");
    expect(typeof cli.findCycles).toBe("function");
    expect(typeof cli.deriveLocalId).toBe("function");
    expect(typeof cli.isValidSlug).toBe("function");
    expect(typeof cli.looksLikePrivateFlagName).toBe("function");
  });
});
