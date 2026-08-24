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
      JSON.stringify({ name: "probe", dependencies: { react: "^18.0.0" }, devDependencies: { prettier: "^3.0.0" } })
    );

    const text = (await runDetect(dir)).stdout.join("\n");
    expect(text).toContain("hosting:");
    expect(text).toContain("fly-io");
    expect(text).toMatch(/libraries: \d+ detected/);
    // A formatter is the library here. react used to be the example and is
    // not one any more: as of 2026-08-23 what the project is written in is
    // a node (kind "stack"), so it leads rather than being collapsed.
    expect(text).not.toMatch(/^\s+prettier \(/m);
  });

  it("leads with stack and component nodes too, naming the kind so it can be added correctly", async () => {
    // The regression this covers: the grouping filter was `kind === "service"`,
    // which dropped component- and stack-kind detections out of *both* the
    // leading list and the collapsed library count -- detected, and invisible.
    await writeFixtureFile(dir, "package.json", JSON.stringify({ name: "probe", dependencies: { react: "^18.0.0" } }));

    const text = (await runDetect(dir)).stdout.join("\n");
    expect(text).toContain("stack:");
    expect(text).toMatch(/^\s+react \(React\) \[stack\]/m);
  });

  it("prints every library inline when --all is passed, without dropping the service section", async () => {
    await writeFixtureFile(dir, "fly.toml", 'app = "example"\n');
    await writeFixtureFile(dir, "package.json", JSON.stringify({ name: "probe", devDependencies: { prettier: "^3.0.0" } }));

    const text = (await runDetect(dir, { all: true })).stdout.join("\n");
    expect(text).toContain("hosting:");
    expect(text).toContain("fly-io");
    expect(text).toMatch(/libraries \(\d+\):/);
    expect(text).toMatch(/^\s+prettier \(/m);
  });

  // --json is the machine-readable surface and must never lose records
  // the text report chooses not to print -- prettier shows up in the JSON
  // technologies array (kind: "library") even though the default text
  // report only summarizes it.
  it("--json still carries every technology, library-kind ones included", async () => {
    await writeFixtureFile(dir, "package.json", JSON.stringify({ name: "probe", devDependencies: { prettier: "^3.0.0" } }));

    const payload = JSON.parse((await runDetect(dir, { json: true })).stdout[0] as string);
    const prettier = payload.technologies.find((t: { specfySlug: string }) => t.specfySlug === "prettier");
    expect(prettier).toBeDefined();
    expect(prettier.kind).toBe("library");
  });
});
