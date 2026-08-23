import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runDetect } from "./detect.js";

describe("runDetect", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("groups detections by category and shows evidence in text mode", async () => {
    await writeFixtureFile(dir, "fly.toml", 'app = "example"\n');
    const result = await runDetect(dir);
    expect(result.exitCode).toBe(0);
    const text = result.stdout.join("\n");
    expect(text).toContain("hosting:");
    expect(text).toContain("fly-io");
    expect(text).toContain("fly.toml");
  });

  it("emits a JSON DetectionResult with --json", async () => {
    await writeFixtureFile(dir, "fly.toml", 'app = "example"\n');
    const result = await runDetect(dir, { json: true });
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout[0] as string);
    expect(payload.repoPath).toBe(dir);
    expect(Array.isArray(payload.hosting)).toBe(true);
  });

  it("reports a clean empty result for a repo with nothing to detect", async () => {
    await writeFixtureFile(dir, "README.md", "# Nothing here\n");
    const result = await runDetect(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("no technologies detected");
  });
});
