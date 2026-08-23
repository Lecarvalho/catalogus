import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runDeprecate } from "./deprecate.js";

const MANIFEST = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: heroku-api # the old home
    service: heroku
    role: hosting
    added: 2024-01-10
  - id: fly-api
    service: fly-io
    role: hosting
    added: 2025-11-02
    status: active
dependencies: []
`;

describe("runDeprecate", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  async function manifestText(): Promise<string> {
    return readFile(join(dir, "dagstree.yaml"), "utf8");
  }

  it("adds status: deprecated to an entry that had none, keeping its inline comment", async () => {
    const result = await runDeprecate(dir, "heroku-api");
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("# the old home");
    expect(text).toContain("status: deprecated");
  });

  it("records a phase-out with its replacement", async () => {
    const result = await runDeprecate(dir, "heroku-api", { status: "phasing_out", replacedBy: "fly-api" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("fly-api");

    const text = await manifestText();
    expect(text).toContain("status: phasing_out");
    expect(text).toContain("replaced_by: fly-api");
  });

  it("overwrites an existing status rather than adding a second key", async () => {
    const result = await runDeprecate(dir, "fly-api", { status: "phasing_out" });
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("status: phasing_out");
    expect(text).not.toContain("status: active");
  });

  it("refuses an id that does not exist and lists the ones that do", async () => {
    const before = await manifestText();
    const result = await runDeprecate(dir, "stripe");

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("known ids");
    expect(await manifestText()).toBe(before);
  });

  it("refuses a --replaced-by target that does not exist, and writes nothing", async () => {
    const before = await manifestText();
    const result = await runDeprecate(dir, "heroku-api", { replacedBy: "render-api" });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain('"render-api"');
    expect(await manifestText()).toBe(before);
  });

  it("refuses an entry replaced by itself", async () => {
    const result = await runDeprecate(dir, "fly-api", { replacedBy: "fly-api" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("replaced by itself");
  });

  // `active` is the absence of a phase-out and `removed` means the entry
  // should be gone rather than annotated, so neither belongs to a command
  // whose whole job is recording that something is on its way out.
  it("rejects a status outside deprecated | phasing_out", async () => {
    const result = await runDeprecate(dir, "fly-api", { status: "active" });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("deprecated");
  });

  it("fails with exit 2 when there is no manifest to edit", async () => {
    const empty = await createTempDir();
    try {
      const result = await runDeprecate(empty, "anything");
      expect(result.exitCode).toBe(2);
    } finally {
      await removeTempDir(empty);
    }
  });
});
