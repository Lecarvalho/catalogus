import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runSet, SETTABLE_FIELDS } from "./set.js";

// Deliberately minimal: `project` carries only what init scaffolds, so
// setting vcs has to build the block rather than edit one that exists.
const SCAFFOLD = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
dagstree: 1
project:
  name: Example App
  slug: example-app
services: []
dependencies: []
`;

describe("runSet", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "dagstree.yaml", SCAFFOLD);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  async function manifestText(): Promise<string> {
    return readFile(join(dir, "dagstree.yaml"), "utf8");
  }

  it("sets a free-text field and leaves comments and the modeline intact", async () => {
    const result = await runSet(dir, ["project.architecture", "two-tier: .NET API + React SPA"]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("yaml-language-server");
    expect(text).toContain("Hand-written header comment");
    expect(text).toContain("two-tier: .NET API + React SPA");
  });

  // The schema requires project.vcs to carry both provider and visibility,
  // so neither half can be written on its own. A setter that only ever took
  // one pair could never write vcs at all, in either order.
  it("writes both halves of project.vcs in one edit", async () => {
    const result = await runSet(dir, [
      "project.vcs.provider",
      "github",
      "project.vcs.visibility",
      "private",
    ]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("provider: github");
    expect(text).toContain("visibility: private");
  });

  it("refuses a half-built vcs block and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.vcs.provider", "github"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("visibility");
    expect(await manifestText()).toBe(before);
  });

  it("takes coding_agents as a comma-separated list", async () => {
    const result = await runSet(dir, ["project.coding_agents", "claude-code, codex"]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("claude-code");
    expect(text).toContain("codex");
  });

  it("rejects an unknown field and names the ones that exist", async () => {
    const result = await runSet(dir, ["project.budget", "1000"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("Unknown field");
    for (const field of SETTABLE_FIELDS) {
      expect(result.stderr.join("\n")).toContain(field);
    }
  });

  it("rejects an odd number of positional tokens", async () => {
    const result = await runSet(dir, ["project.vcs.provider", "github", "project.vcs.visibility"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("<field> <value> pairs");
  });

  it("rejects the same field given twice in one call", async () => {
    const result = await runSet(dir, ["project.pm", "trello", "project.pm", "linear"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("twice");
  });

  it("rejects a non-slug value for a slug field", async () => {
    const result = await runSet(dir, ["project.vcs.provider", "GitHub"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("not a valid slug");
  });

  it("rejects a value the schema's own enum does not allow, and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, [
      "project.vcs.provider",
      "github",
      "project.vcs.visibility",
      "secret",
    ]);
    expect(result.exitCode).toBe(1);
    expect(await manifestText()).toBe(before);
  });

  // Layer 3 data must never reach a file that gets committed. The
  // full-document guard would catch this at write time too; refusing here
  // names the value the user typed.
  it("refuses a value carrying private data and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.pm", "Trello, billed to finance@example.com"]);

    expect(result.exitCode).toBe(2);
    expect(await manifestText()).toBe(before);
  });

  it("validates every pair before touching the file, so a bad second pair leaves the first unwritten", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.pm", "trello-board", "project.architecture", ""]);

    expect(result.exitCode).toBe(2);
    expect(await manifestText()).toBe(before);
  });

  it("fails with exit 2 when there is no manifest to edit", async () => {
    const empty = await createTempDir();
    try {
      const result = await runSet(empty, ["project.pm", "trello"]);
      expect(result.exitCode).toBe(2);
    } finally {
      await removeTempDir(empty);
    }
  });
});
