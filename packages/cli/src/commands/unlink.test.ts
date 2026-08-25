import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runLink } from "./link.js";
import { runUnlink } from "./unlink.js";
import { runValidate } from "./validate.js";

// Dependencies mix both legal edge shapes on purpose, the same way
// remove.test.ts's fixture does -- the tuple form and the object form with
// a `notes` annotation -- so the lookup is exercised against both, not just
// the tuple form.
const MANIFEST = `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: fly-api
    service: fly-io
    role: hosting
    added: 2025-11-02
  - id: supabase-db
    service: supabase
    role: database
    added: 2025-11-02
  - id: supabase-auth
    service: supabase
    role: auth
    added: 2025-11-02
dependencies:
  - [fly-api, supabase-db]
  - from: supabase-auth
    to: supabase-db
    notes: "auth reads session state directly from the users table"
`;

describe("runUnlink", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", MANIFEST);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  async function manifestText(): Promise<string> {
    return readFile(join(dir, "catalogus.yaml"), "utf8");
  }

  it("removes a tuple-form edge, keeping comments and the other edge intact", async () => {
    const result = await runUnlink(dir, "fly-api", "supabase-db");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain('Unlinked "fly-api" -> "supabase-db"');

    const text = await manifestText();
    expect(text).toContain("Hand-written header comment");
    expect(text).toContain("$schema=https://catalogus.dev/schema/v1.json");
    expect(text).not.toContain("[fly-api, supabase-db]");
    expect(text).toContain("supabase-auth");
    expect(text).toContain("auth reads session state directly from the users table");

    const validated = await runValidate(dir, {});
    expect(validated.exitCode).toBe(0);
  });

  it("removes an object-form edge and reports the discarded notes", async () => {
    const result = await runUnlink(dir, "supabase-auth", "supabase-db");
    expect(result.exitCode).toBe(0);
    const out = result.stdout.join("\n");
    expect(out).toContain('Unlinked "supabase-auth" -> "supabase-db"');
    expect(out).toContain("discarded notes:");
    expect(out).toContain("auth reads session state directly from the users table");

    const text = await manifestText();
    expect(text).not.toContain("auth reads session state directly from the users table");
    expect(text).toContain("[fly-api, supabase-db]");
  });

  it("is a no-op, at exit 0, when the edge is not there, and does not blame the manifest", async () => {
    const before = await manifestText();
    const result = await runUnlink(dir, "fly-api", "supabase-auth");

    expect(result.exitCode).toBe(0);
    const out = result.stdout.join("\n");
    expect(out).toContain('"fly-api" does not depend on "supabase-auth"');
    expect(out).toContain("nothing to do");
    expect(await manifestText()).toBe(before);
  });

  it("refuses an id that does not exist and lists the ones that do, at exit 1", async () => {
    const before = await manifestText();
    const result = await runUnlink(dir, "fly-api", "stripe");

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain('"stripe"');
    expect(result.stderr.join("\n")).toContain("known ids");
    expect(await manifestText()).toBe(before);
  });

  it("refuses two unknown ids and names both", async () => {
    const result = await runUnlink(dir, "bogus-a", "bogus-b");
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain('"bogus-a"');
    expect(result.stderr.join("\n")).toContain('"bogus-b"');
  });

  it("rejects an argument that is not a legal local id, at exit 2", async () => {
    const result = await runUnlink(dir, "fly-api", "../elsewhere");
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("not a valid local id");
  });

  it("fails with exit 2 and points at the ancestor when an explicit subdirectory holds no manifest of its own", async () => {
    await mkdir(join(dir, "sub"), { recursive: true });
    const before = await manifestText();

    const result = await runUnlink(join(dir, "sub"), "fly-api", "supabase-db");

    expect(result.exitCode).toBe(2);
    const stderr = result.stderr.join(" ");
    expect(stderr).toContain("No catalogus.yaml in");
    expect(stderr).toContain(join(dir, "sub"));
    expect(stderr).toContain(join(dir, "catalogus.yaml"));
    // The whole point of the check: it must not silently retarget the edit
    // at the ancestor's manifest.
    expect(await manifestText()).toBe(before);
  });

  it("fails with exit 2 when there is no manifest to edit anywhere", async () => {
    const empty = await createTempDir();
    try {
      const result = await runUnlink(empty, "a", "b");
      expect(result.exitCode).toBe(2);
    } finally {
      await removeTempDir(empty);
    }
  });

  it("is link's exact mirror: link then unlink returns the manifest to its prior text", async () => {
    const before = await manifestText();
    expect((await runLink(dir, "fly-api", "supabase-auth")).exitCode).toBe(0);
    expect((await runUnlink(dir, "fly-api", "supabase-auth")).exitCode).toBe(0);
    expect(await manifestText()).toBe(before);
  });

  // A comment written directly above the first item in a YAMLSeq belongs to
  // the sequence node itself, not to that item (see remove.ts's own
  // handling of the identical hazard on services[]). Unlinking the first
  // edge must not lose that comment, but it also cannot honestly claim the
  // comment now belongs to whatever edge is first afterward -- so it stays
  // put and is reported as stranded.
  describe("comment attachment on the dependencies list", () => {
    it("reports a header comment above the first edge as stranded when that edge is removed", async () => {
      const headeredDir = await createTempDir();
      try {
        const manifest = `catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: fly-api
    service: fly-io
    role: hosting
    added: 2025-11-02
  - id: supabase-db
    service: supabase
    role: database
    added: 2025-11-02
dependencies:
  # dependencies this project has today
  - [fly-api, supabase-db]
`;
        await writeFixtureFile(headeredDir, "catalogus.yaml", manifest);

        const result = await runUnlink(headeredDir, "fly-api", "supabase-db");
        expect(result.exitCode).toBe(0);
        expect(result.stdout.join("\n")).toContain("stayed behind");
        expect(result.stdout.join("\n")).toContain("sits above nothing");

        const text = await readFile(join(headeredDir, "catalogus.yaml"), "utf8");
        expect(text).toContain("dependencies this project has today");
      } finally {
        await removeTempDir(headeredDir);
      }
    });

    it("does not mention a stranded comment when the removed edge is not first", async () => {
      const headeredDir = await createTempDir();
      try {
        const manifest = `catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: fly-api
    service: fly-io
    role: hosting
    added: 2025-11-02
  - id: supabase-db
    service: supabase
    role: database
    added: 2025-11-02
  - id: supabase-auth
    service: supabase
    role: auth
    added: 2025-11-02
dependencies:
  # dependencies this project has today
  - [fly-api, supabase-db]
  - [fly-api, supabase-auth]
`;
        await writeFixtureFile(headeredDir, "catalogus.yaml", manifest);

        const result = await runUnlink(headeredDir, "fly-api", "supabase-auth");
        expect(result.exitCode).toBe(0);
        expect(result.stdout.join("\n")).not.toContain("stayed behind");

        const text = await readFile(join(headeredDir, "catalogus.yaml"), "utf8");
        expect(text).toContain("dependencies this project has today");
        expect(text).toContain("[fly-api, supabase-db]");
      } finally {
        await removeTempDir(headeredDir);
      }
    });
  });
});
