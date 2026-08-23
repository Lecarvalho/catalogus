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

  // Config-key evidence is one record per matching key, so a settings file
  // naming four of a provider's keys contributes four records naming the
  // same file. The text report shows files, so it has to show that file
  // once; --json still carries every record, key names included.
  it("names an evidence file once per detection however many keys in it proved the service", async () => {
    await writeFixtureFile(
      dir,
      "appsettings.json",
      JSON.stringify({ Stripe: { SecretKey: "" }, StripeWebhook: { Secret: "" } }, null, 2)
    );

    const text = (await runDetect(dir)).stdout.join("\n");
    const stripeLine = text.split("\n").find((line) => line.includes("stripe (Stripe)")) ?? "";
    expect(stripeLine).toContain("appsettings.json");
    expect(stripeLine.match(/appsettings\.json/g)).toHaveLength(1);

    const payload = JSON.parse((await runDetect(dir, { json: true })).stdout[0] as string);
    const stripe = payload.configServices.find((s: { slug: string }) => s.slug === "stripe");
    expect(stripe.evidence.map((e: { detail: string }) => e.detail)).toEqual([
      "config key: Stripe",
      "config key: StripeWebhook",
    ]);
  });

  it("reports a clean empty result for a repo with nothing to detect", async () => {
    await writeFixtureFile(dir, "README.md", "# Nothing here\n");
    const result = await runDetect(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("no technologies detected");
  });
});
