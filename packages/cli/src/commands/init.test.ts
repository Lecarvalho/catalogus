import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runInit } from "./init.js";

describe("runInit", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("--yes scaffolds a manifest without prompting, prefilled from detection", async () => {
    await writeFixtureFile(dir, "fly.toml", 'app = "example"\n');
    const result = await runInit(dir, { yes: true });
    expect(result.exitCode).toBe(0);

    const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
    expect(text).toContain("# yaml-language-server: $schema=");
    const parsed = parse(text);
    expect(parsed.dagstree).toBe(1);
    expect(parsed.project.name).toBeTruthy();
    expect(parsed.project.slug).toMatch(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/);
    expect(parsed.services.some((s: { service: string }) => s.service === "fly-io")).toBe(true);
  });

  it("never overwrites an existing manifest without --force", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", "dagstree: 1\nproject:\n  name: X\n  slug: x\nservices: []\ndependencies: []\n");
    const result = await runInit(dir, { yes: true });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("--force");
  });

  it("overwrites with --force", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", "dagstree: 1\nproject:\n  name: Old\n  slug: old\nservices: []\ndependencies: []\n");
    const result = await runInit(dir, { yes: true, force: true });
    expect(result.exitCode).toBe(0);
    const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
    const parsed = parse(text);
    expect(parsed.project.slug).not.toBe("old");
  });

  it("interactive mode uses the injected promptFn and honors the answers", async () => {
    const promptFn = async () => ({
      name: "Custom Name",
      slug: "custom-name",
      architecture: "modular monolith",
      pm: "Trello kanban",
      vcsProvider: "github",
    });
    const result = await runInit(dir, { promptFn: promptFn as never });
    expect(result.exitCode).toBe(0);
    const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
    const parsed = parse(text);
    expect(parsed.project.name).toBe("Custom Name");
    expect(parsed.project.slug).toBe("custom-name");
    expect(parsed.project.architecture).toBe("modular monolith");
    expect(parsed.project.pm).toBe("Trello kanban");
    expect(parsed.project.vcs).toEqual({ provider: "github", visibility: "private" });
  });

  it("rejects an invalid slug from interactive input", async () => {
    const promptFn = async () => ({ name: "X", slug: "Not Valid!" });
    const result = await runInit(dir, { promptFn: promptFn as never });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("not a valid slug");
  });

  it("refuses an interactive architecture answer that looks like Layer 3 data, and writes nothing", async () => {
    const promptFn = async () => ({
      name: "X",
      slug: "x",
      architecture: "billing account dsnk@example.com, cost 42 USD/month",
    });
    const result = await runInit(dir, { promptFn: promptFn as never });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("push --private");
    await expect(readFile(join(dir, "dagstree.yaml"), "utf8")).rejects.toThrow();
  });

  it("refuses an interactive pm answer that looks like Layer 3 data (a hard hit), and writes nothing", async () => {
    const promptFn = async () => ({ name: "X", slug: "x", pm: "contact dsnk@example.com about renewal" });
    const result = await runInit(dir, { promptFn: promptFn as never });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("push --private");
    await expect(readFile(join(dir, "dagstree.yaml"), "utf8")).rejects.toThrow();
  });

  it("refuses an interactive name answer that looks like Layer 3 data, and writes nothing", async () => {
    // FIX: `name` (and `vcsProvider`) used to reach only the final
    // validateManifest call, whose failure branch reports a "this is a
    // bug -- please report it" message for a user's own input. Now it's
    // caught by the same early guard as architecture/pm.
    const promptFn = async () => ({ name: "Acme (dsnk@acme.com)", slug: "acme" });
    const result = await runInit(dir, { promptFn: promptFn as never });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("push --private");
    expect(result.stderr.join("\n")).not.toContain("this is a bug");
    await expect(readFile(join(dir, "dagstree.yaml"), "utf8")).rejects.toThrow();
  });

  it("refuses an interactive vcsProvider answer that looks like Layer 3 data, and writes nothing", async () => {
    const promptFn = async () => ({ name: "X", slug: "x", vcsProvider: "github (billing dsnk@acme.com)" });
    const result = await runInit(dir, { promptFn: promptFn as never });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("push --private");
    await expect(readFile(join(dir, "dagstree.yaml"), "utf8")).rejects.toThrow();
  });

  it("accepts a pm answer with a bare soft keyword and writes it, with a warning rather than a refusal", async () => {
    // FIX (write-time gate over-blocking): a soft-only hit ("renewal" with
    // no email/currency/card/API-key nearby) used to be refused outright,
    // with no override -- the exact string `dagstree validate` accepts at
    // exit 0. Now it's written, with the warning surfaced instead of
    // dropped.
    const promptFn = async () => ({ name: "X", slug: "x", pm: "renewal is automated via GitHub Actions" });
    const result = await runInit(dir, { promptFn: promptFn as never });
    expect(result.exitCode).toBe(0);
    const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
    expect(text).toContain("pm: renewal is automated via GitHub Actions");
    expect(result.stderr.join("\n")).toContain("warning:");
  });

  it("treats a cancelled prompt (e.g. Ctrl+C) as an abort, not as 'proceed with defaults'", async () => {
    // The real `prompts` package's default onCancel is a no-op that still
    // resolves with whatever partial answers were collected -- this mock
    // reproduces that by invoking the onCancel runInit passes in and then
    // resolving with nothing, the same shape a cancel on the very first
    // question would produce.
    const promptFn = (async (_questions: unknown, opts?: { onCancel?: () => boolean }) => {
      opts?.onCancel?.();
      return {};
    }) as never;
    const result = await runInit(dir, { promptFn });
    expect(result.exitCode).not.toBe(0);
    await expect(readFile(join(dir, "dagstree.yaml"), "utf8")).rejects.toThrow();
  });

  it("refuses to prompt when stdin is not a TTY, naming --yes instead of hanging silently", async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      const result = await runInit(dir, {});
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.join("\n")).toContain("--yes");
      await expect(readFile(join(dir, "dagstree.yaml"), "utf8")).rejects.toThrow();
    } finally {
      process.stdin.isTTY = originalIsTTY;
    }
  });
});
