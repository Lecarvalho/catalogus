import { describe, expect, it } from "vitest";

import { runStackAnalyser } from "./specfy.js";
import { fixturePath } from "./test-support/fixture-path.js";

function find(technologies: Awaited<ReturnType<typeof runStackAnalyser>>, specfySlug: string) {
  return technologies.find((tech) => tech.specfySlug === specfySlug);
}

describe("runStackAnalyser", () => {
  it("maps a dependency-detected service into Dagstree's namespace with evidence", async () => {
    const technologies = await runStackAnalyser(fixturePath("stack-analyser", "supabase-project"));

    const supabase = find(technologies, "supabase");
    expect(supabase?.slug).toBe("supabase");
    expect(supabase?.unmapped).toBe(false);
    expect(supabase?.kind).toBe("service");
    expect(supabase?.evidence).toContainEqual(
      expect.objectContaining({ detail: "supabase matched: /^@supabase\\//" })
    );

    const gemini = find(technologies, "geminiai");
    expect(gemini?.slug).toBe("google-gemini");
    expect(gemini?.category).toBe("ai");
  });

  it("passes an unrecognized slug through instead of discarding it", async () => {
    const technologies = await runStackAnalyser(fixturePath("stack-analyser", "unmapped-vue"));

    const vue = find(technologies, "vue");
    expect(vue).toBeDefined();
    expect(vue?.unmapped).toBe(true);
    expect(vue?.slug).toBe("vue");
    expect(vue?.evidence.length).toBeGreaterThan(0);
    // Vue is a UI framework in stack-analyser's own classification
    // (specfy type "ui_framework") -- code the project imports, not a
    // provider it depends on, so it comes back "library" rather than
    // burying a real service's worth of visibility on something that
    // can't have an outage or send an invoice.
    expect(vue?.kind).toBe("library");
  });

  it("returns an empty list for a repo with nothing detectable", async () => {
    const technologies = await runStackAnalyser(fixturePath("stack-analyser", "empty"));
    expect(technologies).toEqual([]);
  });

  it("folds four fly.toml variants into one Flyio detection, not four", async () => {
    const technologies = await runStackAnalyser(fixturePath("hosting", "fly-four-variants"));
    const flyDetections = technologies.filter((tech) => tech.specfySlug === "flyio");
    expect(flyDetections).toHaveLength(1);
    expect(flyDetections[0]?.slug).toBe("fly-io");
  });

  it("carries the reason string as evidence so 'why' is answerable without re-scanning", async () => {
    const technologies = await runStackAnalyser(fixturePath("hosting", "fly-single"));
    const flyio = find(technologies, "flyio");
    expect(flyio?.evidence).toEqual([{ file: "fly.toml", detail: "matched file: fly.toml" }]);
  });

  it("does not misattribute unrelated root files to a tech that never gets its own component", async () => {
    // gitlab.ci (type "ci") is in stack-analyser's notAComponent set, so it
    // never gets promoted to its own Payload the way flyio/github/nginx do
    // — its only detection signal is the generic "matched file: X" bag on
    // whichever node scanned the directory. Sharing that node with
    // package.json/Dockerfile/main.tf must not fold their reasons in too.
    const technologies = await runStackAnalyser(fixturePath("stack-analyser", "gitlab-ci-misattribution"));
    const gitlabCi = find(technologies, "gitlab.ci");
    expect(gitlabCi?.unmapped).toBe(false);
    expect(gitlabCi?.evidence).toEqual([{ file: ".gitlab-ci.yml", detail: "matched file: .gitlab-ci.yml" }]);
  });
});
