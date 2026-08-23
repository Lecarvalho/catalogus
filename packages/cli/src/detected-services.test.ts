import { describe, expect, it } from "vitest";

import { collectAllDetectedServices, collectDetectedServices, groupAllDetections } from "./detected-services.js";
import type { DetectionResult } from "@dagstree/core";

function baseResult(overrides: Partial<DetectionResult> = {}): DetectionResult {
  return {
    repoPath: "/repo",
    scannedAt: new Date().toISOString(),
    technologies: [],
    codingAgents: [],
    mcpServers: [],
    hosting: [],
    configServices: [],
    vcs: null,
    ci: null,
    warnings: [],
    ...overrides,
  };
}

describe("collectDetectedServices", () => {
  it("excludes unmapped technologies but keeps mapped ones", () => {
    const result = baseResult({
      technologies: [
        { slug: "supabase", category: "other", name: "Supabase", specfySlug: "supabase", unmapped: false, evidence: [{ file: "package.json" }] },
        { slug: "typescript", category: "other", name: "TypeScript", specfySlug: "typescript", unmapped: true, evidence: [{ file: "*.ts" }] },
      ],
    });
    const services = collectDetectedServices(result);
    expect(services.map((s) => s.slug)).toEqual(["supabase"]);
  });

  it("includes hosting-detector entries, tagged category hosting", () => {
    const result = baseResult({
      hosting: [{ slug: "fly-io", name: "Fly.io", evidence: [{ file: "fly.toml" }] }],
    });
    const services = collectDetectedServices(result);
    expect(services).toEqual([{ slug: "fly-io", category: "hosting", name: "Fly.io", evidence: [{ file: "fly.toml" }] }]);
  });

  it("merges evidence when the same slug appears in both technologies and hosting", () => {
    const result = baseResult({
      technologies: [
        { slug: "fly-io", category: "hosting", name: "Fly.io", specfySlug: "flyio", unmapped: false, evidence: [{ file: "flyio matched: fly.toml" }] },
      ],
      hosting: [{ slug: "fly-io", name: "Fly.io", evidence: [{ file: "fly.toml" }] }],
    });
    const services = collectDetectedServices(result);
    expect(services).toHaveLength(1);
    expect(services[0]?.evidence).toHaveLength(2);
  });

  it("de-duplicates evidence that reaches the same slug twice with an identical file+detail", () => {
    // core's own hosting merge (mergeHosting in @dagstree/core) can already
    // fold a stack-analyser "hosting" detection into the same
    // HostingDetection it's about to be merged with here again via
    // `technologies` -- without de-duplication the same file prints
    // multiple times in `dagstree detect`/`dagstree diff` output.
    const result = baseResult({
      technologies: [
        {
          slug: "fly-io",
          category: "hosting",
          name: "Fly.io",
          specfySlug: "flyio",
          unmapped: false,
          evidence: [{ file: "fly.toml", detail: "matched file: fly.toml" }],
        },
      ],
      hosting: [
        {
          slug: "fly-io",
          name: "Fly.io",
          evidence: [{ file: "fly.toml" }, { file: "fly.toml", detail: "matched file: fly.toml" }, { file: "fly.web.toml" }],
        },
      ],
    });
    const services = collectDetectedServices(result);
    expect(services).toHaveLength(1);
    // The technologies pass runs first and seeds the entry with its one
    // (file: "fly.toml", detail: "matched file: fly.toml") evidence item;
    // the hosting pass then merges in its own evidence, skipping the entry
    // that exactly duplicates it (same file+detail) and keeping the
    // genuinely different file-only and fly.web.toml ones.
    expect(services[0]?.evidence).toEqual([
      { file: "fly.toml", detail: "matched file: fly.toml" },
      { file: "fly.toml" },
      { file: "fly.web.toml" },
    ]);
  });

  // A config-key detection is catalog-known by construction, so unlike an
  // unmapped technology it belongs in the candidate list -- and it is the
  // only list a .NET or Rails backend's providers can reach, since no
  // dependency manifest names them.
  it("offers config-key detections as candidates", () => {
    const result = baseResult({
      configServices: [
        {
          slug: "supabase",
          category: "db",
          name: "Supabase",
          evidence: [{ file: "src/Api/appsettings.json", detail: "config key: Supabase" }],
        },
      ],
    });
    expect(collectDetectedServices(result)).toEqual([
      {
        slug: "supabase",
        category: "db",
        name: "Supabase",
        evidence: [{ file: "src/Api/appsettings.json", detail: "config key: Supabase" }],
      },
    ]);
  });

  it("merges a service found by both a dependency and a config key into one entry, keeping both trails", () => {
    const result = baseResult({
      technologies: [
        {
          slug: "stripe",
          category: "payments",
          name: "Stripe",
          specfySlug: "stripe",
          unmapped: false,
          evidence: [{ file: "package.json" }],
        },
      ],
      configServices: [
        {
          slug: "stripe",
          category: "payments",
          name: "Stripe",
          evidence: [{ file: "src/Api/appsettings.json", detail: "config key: Stripe" }],
        },
      ],
    });
    const services = collectDetectedServices(result);
    expect(services).toHaveLength(1);
    expect(services[0]?.evidence).toEqual([
      { file: "package.json" },
      { file: "src/Api/appsettings.json", detail: "config key: Stripe" },
    ]);
  });
});

describe("collectAllDetectedServices", () => {
  it("includes unmapped technologies, unlike collectDetectedServices", () => {
    const result = baseResult({
      technologies: [
        { slug: "typescript", category: "other", name: "TypeScript", specfySlug: "typescript", unmapped: true, evidence: [{ file: "*.ts" }] },
      ],
    });
    expect(collectDetectedServices(result)).toEqual([]);
    expect(collectAllDetectedServices(result).map((s) => s.slug)).toEqual(["typescript"]);
  });

  it("sorts by category then slug, same as collectDetectedServices", () => {
    const result = baseResult({
      technologies: [
        { slug: "zeta", category: "other", name: "Zeta", specfySlug: "zeta", unmapped: true, evidence: [{ file: "a" }] },
        { slug: "alpha", category: "other", name: "Alpha", specfySlug: "alpha", unmapped: true, evidence: [{ file: "b" }] },
        { slug: "supabase", category: "db", name: "Supabase", specfySlug: "supabase.postgres", unmapped: false, evidence: [{ file: "c" }] },
      ],
    });
    expect(collectAllDetectedServices(result).map((s) => s.slug)).toEqual(["supabase", "alpha", "zeta"]);
  });
});

describe("groupAllDetections", () => {
  it("includes unmapped technologies, unlike collectDetectedServices", () => {
    const result = baseResult({
      technologies: [
        { slug: "typescript", category: "other", name: "TypeScript", specfySlug: "typescript", unmapped: true, evidence: [{ file: "*.ts" }] },
      ],
    });
    const grouped = groupAllDetections(result);
    expect(grouped.get("other")?.map((e) => e.slug)).toEqual(["typescript"]);
  });

  it("groups by category and sorts each group's entries by slug", () => {
    const result = baseResult({
      technologies: [
        { slug: "zeta", category: "other", name: "Zeta", specfySlug: "zeta", unmapped: false, evidence: [{ file: "a" }] },
        { slug: "alpha", category: "other", name: "Alpha", specfySlug: "alpha", unmapped: false, evidence: [{ file: "b" }] },
        { slug: "supabase", category: "db", name: "Supabase", specfySlug: "supabase.postgres", unmapped: false, evidence: [{ file: "c" }] },
      ],
    });
    const grouped = groupAllDetections(result);
    expect(grouped.get("other")?.map((e) => e.slug)).toEqual(["alpha", "zeta"]);
    expect(grouped.get("db")?.map((e) => e.slug)).toEqual(["supabase"]);
  });
});
