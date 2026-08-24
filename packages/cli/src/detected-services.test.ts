import { describe, expect, it } from "vitest";

import { collectAllDetectedServices, collectDetectedServices, groupAllDetections } from "./detected-services.js";
import type { DetectionResult } from "@dagstree/core";

function baseResult(overrides: Partial<DetectionResult> = {}): DetectionResult {
  return {
    repoPath: "/repo",
    scannedAt: new Date().toISOString(),
    technologies: [],
    codingAgents: [],
    unidentifiedCodingAgents: [],
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
        { slug: "supabase", category: "other", name: "Supabase", specfySlug: "supabase", unmapped: false, kind: "service", evidence: [{ file: "package.json" }] },
        { slug: "typescript", category: "other", name: "TypeScript", specfySlug: "typescript", unmapped: true, kind: "library", evidence: [{ file: "*.ts" }] },
      ],
    });
    const services = collectDetectedServices(result);
    expect(services.map((s) => s.slug)).toEqual(["supabase"]);
  });

  it("includes hosting-detector entries, tagged category hosting and kind service", () => {
    const result = baseResult({
      hosting: [{ slug: "fly-io", name: "Fly.io", evidence: [{ file: "fly.toml" }] }],
    });
    const services = collectDetectedServices(result);
    expect(services).toEqual([
      { slug: "fly-io", category: "hosting", name: "Fly.io", evidence: [{ file: "fly.toml" }], kind: "service" },
    ]);
  });

  it("merges evidence when the same slug appears in both technologies and hosting", () => {
    const result = baseResult({
      technologies: [
        { slug: "fly-io", category: "hosting", name: "Fly.io", specfySlug: "flyio", unmapped: false, kind: "service", evidence: [{ file: "flyio matched: fly.toml" }] },
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
          kind: "service",
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
  it("offers config-key detections as candidates, tagged kind service", () => {
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
        kind: "service",
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
          kind: "service",
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

  // Hosting and config-key detections are always kind "service" by
  // construction (see DetectedServiceCandidate's own doc comment). A slug
  // whose only known-row is marked "library" (mcp, lucide-icons today)
  // reaching this list via one of those two sources as well must not stay
  // "library" -- silently downgrading a confirmed service is exactly the
  // failure mergeKind exists to rule out.
  it("upgrades a library-kind technology to service when the same slug also arrives as a config-key detection", () => {
    const result = baseResult({
      technologies: [
        {
          slug: "mcp",
          category: "other",
          name: "MCP SDK",
          specfySlug: "mcp",
          unmapped: false,
          kind: "library",
          evidence: [{ file: "package.json" }],
        },
      ],
      configServices: [
        { slug: "mcp", category: "other", name: "MCP SDK", evidence: [{ file: "settings.json", detail: "config key: Mcp" }] },
      ],
    });
    const services = collectDetectedServices(result);
    expect(services).toHaveLength(1);
    expect(services[0]?.kind).toBe("service");
  });
});

describe("collectAllDetectedServices", () => {
  it("includes unmapped technologies, unlike collectDetectedServices", () => {
    const result = baseResult({
      technologies: [
        { slug: "typescript", category: "other", name: "TypeScript", specfySlug: "typescript", unmapped: true, kind: "library", evidence: [{ file: "*.ts" }] },
      ],
    });
    expect(collectDetectedServices(result)).toEqual([]);
    expect(collectAllDetectedServices(result).map((s) => s.slug)).toEqual(["typescript"]);
  });

  it("sorts by category then slug, same as collectDetectedServices", () => {
    const result = baseResult({
      technologies: [
        { slug: "zeta", category: "other", name: "Zeta", specfySlug: "zeta", unmapped: true, kind: "library", evidence: [{ file: "a" }] },
        { slug: "alpha", category: "other", name: "Alpha", specfySlug: "alpha", unmapped: true, kind: "library", evidence: [{ file: "b" }] },
        { slug: "supabase", category: "db", name: "Supabase", specfySlug: "supabase.postgres", unmapped: false, kind: "service", evidence: [{ file: "c" }] },
      ],
    });
    expect(collectAllDetectedServices(result).map((s) => s.slug)).toEqual(["supabase", "alpha", "zeta"]);
  });

  it("carries each technology's own kind through unfiltered", () => {
    const result = baseResult({
      technologies: [
        { slug: "typescript", category: "other", name: "TypeScript", specfySlug: "typescript", unmapped: true, kind: "library", evidence: [{ file: "*.ts" }] },
        { slug: "stripe", category: "payments", name: "Stripe", specfySlug: "stripe", unmapped: false, kind: "service", evidence: [{ file: "package.json" }] },
      ],
    });
    const bySlug = new Map(collectAllDetectedServices(result).map((s) => [s.slug, s.kind]));
    expect(bySlug.get("typescript")).toBe("library");
    expect(bySlug.get("stripe")).toBe("service");
  });
});

describe("groupAllDetections", () => {
  it("includes unmapped technologies, unlike collectDetectedServices", () => {
    const result = baseResult({
      technologies: [
        { slug: "typescript", category: "other", name: "TypeScript", specfySlug: "typescript", unmapped: true, kind: "library", evidence: [{ file: "*.ts" }] },
      ],
    });
    const grouped = groupAllDetections(result);
    expect(grouped.get("other")?.map((e) => e.slug)).toEqual(["typescript"]);
  });

  it("groups by category and sorts each group's entries by slug", () => {
    const result = baseResult({
      technologies: [
        { slug: "zeta", category: "other", name: "Zeta", specfySlug: "zeta", unmapped: false, kind: "service", evidence: [{ file: "a" }] },
        { slug: "alpha", category: "other", name: "Alpha", specfySlug: "alpha", unmapped: false, kind: "service", evidence: [{ file: "b" }] },
        { slug: "supabase", category: "db", name: "Supabase", specfySlug: "supabase.postgres", unmapped: false, kind: "service", evidence: [{ file: "c" }] },
      ],
    });
    const grouped = groupAllDetections(result);
    expect(grouped.get("other")?.map((e) => e.slug)).toEqual(["alpha", "zeta"]);
    expect(grouped.get("db")?.map((e) => e.slug)).toEqual(["supabase"]);
  });
});
