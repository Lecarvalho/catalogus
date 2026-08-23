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
    expect(result.stdout.join("\n")).toContain("no services detected");
  });

  // The whole point of the kind split (see this module's header): a real
  // project's package.json names several libraries for every service it
  // actually depends on. Default text output should lead with the service
  // and only summarize the libraries, not list them inline.
  it("leads with services and collapses libraries under a count by default", async () => {
    await writeFixtureFile(dir, "fly.toml", 'app = "example"\n');
    await writeFixtureFile(
      dir,
      "package.json",
      JSON.stringify({ name: "probe", dependencies: { react: "^18.0.0" }, devDependencies: { typescript: "^5.6.0" } })
    );

    const text = (await runDetect(dir)).stdout.join("\n");
    expect(text).toContain("hosting:");
    expect(text).toContain("fly-io");
    expect(text).toMatch(/libraries: \d+ detected/);
    // react/typescript are libraries (specfy type ui_framework/language) --
    // their slugs must not appear as their own bullet lines in the default
    // report, only folded into the collapsed count.
    expect(text).not.toMatch(/^\s+react \(/m);
    expect(text).not.toMatch(/^\s+typescript \(/m);
  });

  it("prints every library inline when --all is passed, without dropping the service section", async () => {
    await writeFixtureFile(dir, "fly.toml", 'app = "example"\n');
    await writeFixtureFile(dir, "package.json", JSON.stringify({ name: "probe", dependencies: { react: "^18.0.0" } }));

    const text = (await runDetect(dir, { all: true })).stdout.join("\n");
    expect(text).toContain("hosting:");
    expect(text).toContain("fly-io");
    expect(text).toMatch(/libraries \(\d+\):/);
    expect(text).toMatch(/^\s+react \(/m);
  });

  // --json is the machine-readable surface and must never lose records
  // the text report chooses not to print -- react shows up in the JSON
  // technologies array (kind: "library") even though the default text
  // report only summarizes it.
  it("--json still carries every technology, library-kind ones included", async () => {
    await writeFixtureFile(dir, "package.json", JSON.stringify({ name: "probe", dependencies: { react: "^18.0.0" } }));

    const payload = JSON.parse((await runDetect(dir, { json: true })).stdout[0] as string);
    const react = payload.technologies.find((t: { specfySlug: string }) => t.specfySlug === "react");
    expect(react).toBeDefined();
    expect(react.kind).toBe("library");
  });
});
