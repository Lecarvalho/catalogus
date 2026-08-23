import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runLink } from "./link.js";

const MANIFEST = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
dagstree: 1
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
`;

describe("runLink", () => {
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

  it("adds an edge between two existing services, keeping comments intact", async () => {
    const result = await runLink(dir, "fly-api", "supabase-auth");
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("Hand-written header comment");
    expect(text).toContain("[fly-api, supabase-auth]");
    expect(text).toContain("[fly-api, supabase-db]");
  });

  it("is a no-op, at exit 0, when the edge is already there", async () => {
    const before = await manifestText();
    const result = await runLink(dir, "fly-api", "supabase-db");

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("already depends on");
    expect(await manifestText()).toBe(before);
  });

  it("refuses an id that does not exist and lists the ones that do", async () => {
    const before = await manifestText();
    const result = await runLink(dir, "fly-api", "stripe");

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain('"stripe"');
    expect(result.stderr.join("\n")).toContain("known ids");
    expect(await manifestText()).toBe(before);
  });

  // The pre-write validation would catch this as a cycle, but "cyclic
  // dependency: a -> a" reads like a bug in the tool rather than in the
  // command that was typed.
  it("refuses a self-edge in its own words", async () => {
    const result = await runLink(dir, "fly-api", "fly-api");
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("cannot depend on itself");
  });

  it("refuses an edge that would close a cycle, and writes nothing", async () => {
    expect((await runLink(dir, "supabase-auth", "supabase-db")).exitCode).toBe(0);
    const before = await manifestText();

    const result = await runLink(dir, "supabase-db", "supabase-auth");
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("cyclic");
    expect(await manifestText()).toBe(before);
  });

  it("rejects an argument that is not a legal local id", async () => {
    const result = await runLink(dir, "fly-api", "../elsewhere");
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("not a valid local id");
  });

  it("fails with exit 2 when there is no manifest to edit", async () => {
    const empty = await createTempDir();
    try {
      const result = await runLink(empty, "a", "b");
      expect(result.exitCode).toBe(2);
    } finally {
      await removeTempDir(empty);
    }
  });
});
