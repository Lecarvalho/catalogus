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

// A second fixture, carrying real service entries, for services.<id>.role
// -- the empty-services SCAFFOLD above can't exercise id resolution at all.
const SCAFFOLD_WITH_SERVICES = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: heroku-api
    service: heroku
    role: hosting
    added: 2024-01-10
  - id: fly-api
    service: fly-io
    role: hosting
    added: 2025-11-02
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

  // The field init used to own exclusively: a wrong project.name guessed
  // from a directory name by `init --yes` had no command that could fix it
  // before this. See this file's module comment.
  it("sets project.name and leaves comments and the modeline intact", async () => {
    const result = await runSet(dir, ["project.name", "Real Project Name"]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("yaml-language-server");
    expect(text).toContain("Hand-written header comment");
    expect(text).toContain("name: Real Project Name");
  });

  it("rejects an empty project.name and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.name", "   "]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("empty");
    expect(await manifestText()).toBe(before);
  });

  it("sets project.slug to a valid slug", async () => {
    const result = await runSet(dir, ["project.slug", "real-project-name"]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("slug: real-project-name");
  });

  it("rejects a project.slug that does not match the slug pattern and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.slug", "Not A Slug"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("not a valid slug");
    expect(await manifestText()).toBe(before);
  });

  describe("services.<id>.role", () => {
    beforeEach(async () => {
      await writeFixtureFile(dir, "dagstree.yaml", SCAFFOLD_WITH_SERVICES);
    });

    it("changes the role on the named entry only", async () => {
      const result = await runSet(dir, ["services.fly-api.role", "database"]);
      expect(result.exitCode).toBe(0);

      const text = await manifestText();
      expect(text).toContain("id: heroku-api");
      expect(text).toMatch(/id: heroku-api[\s\S]*?role: hosting/);
      expect(text).toMatch(/id: fly-api[\s\S]*?role: database/);
    });

    it("sets kind and version, the two per-entry fields added on 2026-08-23", async () => {
      const result = await runSet(dir, ["services.fly-api.kind", "component", "services.fly-api.version", "15.4"]);
      expect(result.exitCode).toBe(0);

      const text = await manifestText();
      expect(text).toMatch(/id: fly-api[\s\S]*?kind: component/);
      expect(text).toMatch(/id: fly-api[\s\S]*?version: "?15\.4"?/);
    });

    it("refuses a kind outside the schema enum, naming the three legal values", async () => {
      const before = await manifestText();
      const result = await runSet(dir, ["services.fly-api.kind", "vendor"]);
      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("!!")).toContain("service, component, stack");
      expect(await manifestText()).toBe(before);
    });

    // version is text, not a slug: "13.1.3" has dots in it, and the slug
    // check every other per-entry field uses would reject the most ordinary
    // version string there is.
    it("accepts a dotted version string", async () => {
      const result = await runSet(dir, ["services.fly-api.version", "13.1.3"]);
      expect(result.exitCode).toBe(0);
      expect(await manifestText()).toMatch(/version: "?13\.1\.3"?/);
    });

    it("rejects an unknown id, exit 1, with known ids listed, and writes nothing", async () => {
      const before = await manifestText();
      const result = await runSet(dir, ["services.nonexistent.role", "database"]);

      expect(result.exitCode).toBe(1);
      const stderr = result.stderr.join("\n");
      expect(stderr).toContain("no service with id");
      expect(stderr).toContain("known ids");
      expect(stderr).toContain("heroku-api");
      expect(stderr).toContain("fly-api");
      expect(await manifestText()).toBe(before);
    });

    it("rejects a malformed role value the same way a malformed slug fails elsewhere", async () => {
      const before = await manifestText();
      const result = await runSet(dir, ["services.fly-api.role", "Not A Role"]);

      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("\n")).toContain("not a valid slug");
      expect(await manifestText()).toBe(before);
    });

    it("rejects a malformed id inside the field name before the manifest is opened", async () => {
      const before = await manifestText();
      const result = await runSet(dir, ["services.Not Valid.role", "database"]);

      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("\n")).toContain("not a valid local id");
      expect(await manifestText()).toBe(before);
    });

    it("leaves the first pair of a two-pair call unwritten when the second names an unknown id", async () => {
      const before = await manifestText();
      const result = await runSet(dir, [
        "services.heroku-api.role",
        "hosting-api",
        "services.nonexistent.role",
        "database",
      ]);

      expect(result.exitCode).toBe(1);
      expect(await manifestText()).toBe(before);
    });

    it("can be combined with a project-level field in one call", async () => {
      const result = await runSet(dir, ["project.pm", "trello-board", "services.fly-api.role", "database"]);
      expect(result.exitCode).toBe(0);

      const text = await manifestText();
      expect(text).toContain("pm: trello-board");
      expect(text).toMatch(/id: fly-api[\s\S]*?role: database/);
    });
  });

  it("names services.<id>.role in the unknown-field message as the shape to fill in", async () => {
    const result = await runSet(dir, ["project.budget", "1000"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("services.<id>.role");
  });
});
