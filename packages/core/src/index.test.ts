import { describe, expect, it } from "vitest";

import { CORE_PACKAGE_NAME, detect, InvalidRepoPathError } from "./index.js";
import { fixturePath } from "./test-support/fixture-path.js";

describe("@catalogus/core", () => {
  it("exposes its package name", () => {
    expect(CORE_PACKAGE_NAME).toBe("@catalogus/core");
  });
});

describe("detect", () => {
  it("combines every signal from a repo into one result, each entry carrying its evidence", async () => {
    const repoPath = fixturePath("kitchen-sink");
    const result = await detect(repoPath);

    expect(result.repoPath).toBe(repoPath);
    expect(new Date(result.scannedAt).toString()).not.toBe("Invalid Date");

    expect(result.codingAgents).toEqual([
      { agent: "claude-code", name: "Claude Code", evidence: [{ file: "CLAUDE.md" }] },
    ]);

    expect(result.mcpServers).toEqual([{ name: "trello", evidence: [{ file: ".mcp.json" }] }]);
    expect(result.warnings).toEqual([]);

    // kitchen-sink's own .git/config lives under a committable dotgit/
    // fixture and isn't materialised for this test (see vcs.test.ts for
    // that), so this exercises the .github/workflows fallback path.
    expect(result.vcs?.provider).toBe("github");
    expect(result.ci).toEqual({ provider: "github-actions", evidence: [{ file: ".github/workflows" }] });

    // Fly.io was caught by both Catalogus's own hosting.ts and stack-analyser's
    // flyio rule; detect() merges them into one entry rather than two
    // competing hosting detections. kitchen-sink has a single fly.toml, so
    // the merge should also dedupe the two evidence entries the two
    // detectors independently produce for that one file down to one,
    // keeping stack-analyser's richer, detail-carrying record.
    const flyHosting = result.hosting.filter((entry) => entry.slug === "fly-io");
    expect(flyHosting).toHaveLength(1);
    expect(flyHosting[0]?.evidence).toEqual([{ file: "fly.toml", detail: "matched file: fly.toml" }]);

    const supabase = result.technologies.find((tech) => tech.specfySlug === "supabase");
    expect(supabase?.slug).toBe("supabase");
    expect(supabase?.kind).toBe("service");

    // Every detection must carry evidence — never an empty trail.
    for (const tech of result.technologies) {
      expect(tech.evidence.length, `evidence for ${tech.specfySlug}`).toBeGreaterThan(0);
    }
  });

  it("returns an empty-but-well-formed result for a repo with no signals at all", async () => {
    const result = await detect(fixturePath("stack-analyser", "empty"));
    expect(result.technologies).toEqual([]);
    expect(result.codingAgents).toEqual([]);
    expect(result.mcpServers).toEqual([]);
    expect(result.hosting).toEqual([]);
    expect(result.configServices).toEqual([]);
    expect(result.vcs).toBeNull();
    expect(result.ci).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  // The gap dogfooding exposed: a .NET backend wires its providers through
  // appsettings*.json, which is not a dependency manifest, so
  // @specfy/stack-analyser sees none of them. detect() has to surface what
  // the config-key detector found, or the miss survives one layer up.
  it("surfaces services that are only wired through configuration, which the dependency scanner cannot see", async () => {
    const result = await detect(fixturePath("config-keys", "dotnet-backend"));

    expect(result.technologies.map((tech) => tech.slug)).not.toContain("supabase");
    expect(result.configServices.map((service) => service.slug)).toEqual(
      expect.arrayContaining(["supabase", "stripe", "openai", "anthropic", "aws-s3"])
    );
  });

  it("round-trips through JSON without loss", async () => {
    const result = await detect(fixturePath("kitchen-sink"));
    const roundTripped = JSON.parse(JSON.stringify(result));
    expect(roundTripped).toEqual(result);
  });

  it("does not promote a hosting-category detection into `hosting` when its marker file isn't at the repo root", async () => {
    // A nested netlify.toml (a test fixture, a docs/ sample, an example
    // app) must not read as "this project is hosted on Netlify" — but it
    // should still be visible in `technologies`, just not asserted as a
    // project-level fact.
    const result = await detect(fixturePath("hosting", "nested-not-root"));
    expect(result.hosting).toEqual([]);
    const netlifyTech = result.technologies.find((tech) => tech.slug === "netlify");
    expect(netlifyTech).toBeDefined();
    expect(netlifyTech?.category).toBe("hosting");
  });

  it("dedupes hosting evidence by file when both detectors flag the same file", async () => {
    // fly.toml is caught by both Catalogus's own fly*.toml pattern detector
    // and stack-analyser's exact-filename flyio rule; the other three
    // variants (fly.grafana.toml, fly.loki.toml, fly.web.toml) are only
    // caught by the pattern detector. A naive concatenation would list
    // fly.toml twice -- once bare, once with stack-analyser's "matched
    // file: ..." detail.
    const result = await detect(fixturePath("hosting", "fly-four-variants"));
    const fly = result.hosting.filter((entry) => entry.slug === "fly-io");
    expect(fly).toHaveLength(1);

    const files = fly[0]?.evidence.map((e) => e.file) ?? [];
    expect(files.sort()).toEqual(["fly.grafana.toml", "fly.loki.toml", "fly.toml", "fly.web.toml"]);
    expect(new Set(files).size).toBe(files.length);

    // When the two sources disagree on richness for the same file, the
    // merge keeps the one carrying `detail` rather than the bare one.
    const flyToml = fly[0]?.evidence.find((e) => e.file === "fly.toml");
    expect(flyToml?.detail).toBeDefined();
  });

  it("rejects a repoPath that does not exist", async () => {
    await expect(detect(fixturePath("does-not-exist-anywhere"))).rejects.toThrow(InvalidRepoPathError);
  });

  it("rejects a repoPath that is a file, not a directory", async () => {
    await expect(detect(fixturePath("kitchen-sink", "package.json"))).rejects.toThrow(InvalidRepoPathError);
  });

  it("rejects a relative repoPath", async () => {
    await expect(detect("./packages/core/test/fixtures/kitchen-sink")).rejects.toThrow(InvalidRepoPathError);
  });
});
