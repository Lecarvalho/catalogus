import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findManifest, ManifestNotFoundError, readManifestText, writeManifestText } from "./manifest-io.js";
import { createTempDir, removeTempDir, writeFixtureFile } from "./test-support/temp-dir.js";

describe("findManifest / readManifestText / writeManifestText", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("finds catalogus.yaml in the given directory", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", "catalogus: 1\n");
    const found = await findManifest(dir);
    expect(found?.filename).toBe("catalogus.yaml");
    expect(found?.dir).toBe(dir);
  });

  it("falls back to stack.yaml when catalogus.yaml is absent", async () => {
    await writeFixtureFile(dir, "stack.yaml", "catalogus: 1\n");
    const found = await findManifest(dir);
    expect(found?.filename).toBe("stack.yaml");
  });

  it("prefers catalogus.yaml over stack.yaml in the same directory", async () => {
    await writeFixtureFile(dir, "stack.yaml", "# old\n");
    await writeFixtureFile(dir, "catalogus.yaml", "# new\n");
    const found = await findManifest(dir);
    expect(found?.filename).toBe("catalogus.yaml");
  });

  it("walks upward from a subdirectory, the way git finds its root", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", "catalogus: 1\n");
    const sub = join(dir, "a", "b", "c");
    await mkdir(sub, { recursive: true });
    const found = await findManifest(sub);
    expect(found?.dir).toBe(dir);
  });

  it("returns null when nothing is found up to the filesystem root", async () => {
    const found = await findManifest(dir);
    expect(found).toBeNull();
  });

  it("ManifestNotFoundError names the command that creates one", () => {
    const error = new ManifestNotFoundError(dir);
    expect(error.message).toContain("catalogus init");
  });

  it("always writes catalogus.yaml, never stack.yaml", async () => {
    const filePath = await writeManifestText(dir, "catalogus: 1\n");
    expect(filePath).toBe(join(dir, "catalogus.yaml"));
  });

  it("round-trips text through write and read", async () => {
    const text = "catalogus: 1\nproject:\n  name: X\n  slug: x\n";
    await writeManifestText(dir, text);
    const found = await findManifest(dir);
    expect(found).not.toBeNull();
    const read = await readManifestText(found!);
    expect(read).toBe(text);
  });
});
