import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runSet, SETTABLE_FIELDS } from "./set.js";

// Deliberately minimal: `project` carries only what init scaffolds, so
// setting vcs has to build the block rather than edit one that exists.
const SCAFFOLD = `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
catalogus: 1
project:
  name: Example App
  slug: example-app
services: []
dependencies: []
`;

// A second fixture, carrying real service entries, for services.<id>.role
// -- the empty-services SCAFFOLD above can't exercise id resolution at all.
const SCAFFOLD_WITH_SERVICES = `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
catalogus: 1
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
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  async function manifestText(): Promise<string> {
    return readFile(join(dir, "catalogus.yaml"), "utf8");
  }

  it("sets a free-text field and leaves comments and the modeline intact", async () => {
    const result = await runSet(dir, ["project.architecture", "two-tier: .NET API + React SPA"]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("yaml-language-server");
    expect(text).toContain("Hand-written header comment");
    expect(text).toContain("two-tier: .NET API + React SPA");
  });

  // project.vcs carries only visibility as of the 2026-08-24 amendment (the
  // provider is a service entry now, added with `catalogus add <provider>
  // --role vcs`) -- so setting visibility alone is enough; there is no
  // second half to write together, and no half-built state to refuse.
  it("writes project.vcs.visibility on its own", async () => {
    const result = await runSet(dir, ["project.vcs.visibility", "private"]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("visibility: private");
    expect(text).not.toContain("provider:");
  });

  it("rejects project.pm, project.vcs.provider and project.coding_agents, naming the `catalogus add` command that replaced each", async () => {
    const expectations: Array<[string, string]> = [
      ["project.pm", "catalogus add trello --role pm"],
      ["project.vcs.provider", "catalogus add github --role vcs"],
      ["project.coding_agents", "catalogus add claude-code --role coding-agent"],
    ];
    for (const [field, hint] of expectations) {
      const result = await runSet(dir, [field, "github"]);
      expect(result.exitCode).toBe(2);
      const stderr = result.stderr.join("\n");
      expect(stderr).toContain("no longer a settable field");
      expect(stderr).toContain(hint);
    }
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
    const result = await runSet(dir, ["project.architecture", "two-tier", "project.vcs.visibility"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("<field> <value> pairs");
  });

  it("rejects the same field given twice in one call", async () => {
    const result = await runSet(dir, ["project.architecture", "two-tier", "project.architecture", "monolith"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("twice");
  });

  it("rejects a non-slug value for a slug field", async () => {
    const result = await runSet(dir, ["project.vcs.visibility", "Not A Slug"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("not a valid slug");
  });

  it("rejects a value the schema's own enum does not allow, and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.vcs.visibility", "secret"]);
    expect(result.exitCode).toBe(1);
    expect(await manifestText()).toBe(before);
  });

  // Layer 3 data must never reach a file that gets committed. The
  // full-document guard would catch this at write time too; refusing here
  // names the value the user typed.
  it("refuses a value carrying private data and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.architecture", "Trello, billed to finance@example.com"]);

    expect(result.exitCode).toBe(2);
    expect(await manifestText()).toBe(before);
  });

  it("validates every pair before touching the file, so a bad second pair leaves the first unwritten", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.name", "Real Name", "project.architecture", ""]);

    expect(result.exitCode).toBe(2);
    expect(await manifestText()).toBe(before);
  });

  it("fails with exit 2 when there is no manifest to edit", async () => {
    const empty = await createTempDir();
    try {
      const result = await runSet(empty, ["project.architecture", "two-tier"]);
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
      await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD_WITH_SERVICES);
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
      const result = await runSet(dir, ["project.architecture", "two-tier", "services.fly-api.role", "database"]);
      expect(result.exitCode).toBe(0);

      const text = await manifestText();
      expect(text).toContain("architecture: two-tier");
      expect(text).toMatch(/id: fly-api[\s\S]*?role: database/);
    });
  });

  it("names services.<id>.role in the unknown-field message as the shape to fill in", async () => {
    const result = await runSet(dir, ["project.budget", "1000"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("services.<id>.role");
  });

  // The prototype-inheritance case. `field` comes straight off the command
  // line and is looked up in two plain tables (FIELDS, then
  // MOVED_FIELD_HINTS), so before those were built on Object.create(null)
  // this took the *known-field* branch: `FIELDS["constructor"]` resolved
  // through Object.prototype to the `Object` function, which is truthy, so
  // the command built an edit with an undefined path and got as far as the
  // pre-write validation -- reporting `[schema] / must be object` at exit 1,
  // pointing the caller at their manifest, which was the one thing that was
  // fine. Confirmed against the built binary, not just the source, and
  // confirmed non-destructive: manifest-edit.ts refuses to write anything
  // that would fail validate, and that guard held throughout.
  //
  // Every name here is a real Object.prototype member and every one of them
  // is a legal thing to type. The assertion is on the exit code as much as
  // the message: 2 is `usage error`, which is what a bad field name is; 1 is
  // "your manifest is invalid", which was the lie.
  it.each(["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"])(
    "reports %s as an unknown field, rather than inheriting it from Object.prototype",
    async (field) => {
      const before = await manifestText();
      const result = await runSet(dir, [field, "boom"]);

      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("\n")).toContain(`Unknown field "${field}"`);
      expect(result.stderr.join("\n")).not.toContain("must be object");
      expect(await manifestText()).toBe(before);
    },
  );
});
