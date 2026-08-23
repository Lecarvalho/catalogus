// Rule registration is a side effect of this import (see specfy.ts) — without
// it, tech.keys below comes back empty regardless of test run order/isolation.
import "@specfy/stack-analyser/dist/autoload.js";
import { tech } from "@specfy/stack-analyser";
import { describe, expect, it } from "vitest";

import { mapSpecfySlug, SPECFY_TO_DAGSTREE } from "./mapping.js";

// Mirrors @dagstree/schema's $defs.slug.pattern (packages/schema/src/schema.ts)
// without a cross-package dependency — the CLI's `validate` command rejects
// any manifest slug that fails this, so every slug detect() can emit must
// satisfy it too.
const DAGSTREE_SLUG_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

describe("mapSpecfySlug", () => {
  it("maps a known specfy slug into Dagstree's namespace", () => {
    const result = mapSpecfySlug("flyio", "Flyio");
    expect(result).toEqual({ slug: "fly-io", category: "hosting", name: "Fly.io", unmapped: false });
  });

  it("gives supabase's role-specific sub-techs distinct categories under the same slug", () => {
    const auth = mapSpecfySlug("supabase.auth", "Supabase Auth");
    const db = mapSpecfySlug("supabase.postgres", "Supabase Postgres");
    expect(auth.slug).toBe("supabase");
    expect(auth.category).toBe("auth");
    expect(db.slug).toBe("supabase");
    expect(db.category).toBe("db");
  });

  it("never discards an unrecognized slug — it survives as an unmapped pass-through", () => {
    const result = mapSpecfySlug("some-future-tech", "Some Future Tech");
    expect(result.unmapped).toBe(true);
    expect(result.slug).toBe("some-future-tech");
    expect(result.name).toBe("Some Future Tech");
  });

  it("uses stack-analyser's own type as a category hint for unmapped slugs", () => {
    const result = mapSpecfySlug("some-future-db", "Some Future DB", "db");
    expect(result.unmapped).toBe(true);
    expect(result.category).toBe("db");
  });

  it("falls back to 'other' when the type hint has no equivalent category", () => {
    const result = mapSpecfySlug("some-framework", "Some Framework", "framework");
    expect(result.unmapped).toBe(true);
    expect(result.category).toBe("other");
  });

  it("normalises a dot-namespaced unmapped slug into the Dagstree schema's slug pattern", () => {
    const result = mapSpecfySlug("aws.lambda", "AWS Lambda");
    expect(result.unmapped).toBe(true);
    expect(result.slug).toBe("aws-lambda");
    expect(DAGSTREE_SLUG_PATTERN.test(result.slug)).toBe(true);
  });

  it("converts a camelCase unmapped slug into kebab-case", () => {
    const result = mapSpecfySlug("apacheCordova", "Apache Cordova");
    expect(result.slug).toBe("apache-cordova");
  });

  it("every real stack-analyser key maps to a slug satisfying @dagstree/schema's slug pattern", () => {
    // Exercises the live tech index, not just this table — this is exactly
    // what would have caught the ~165 offending keys (every aws.*,
    // atlassian.jira, atlassian.trello, adobe.*, camelCase keys like
    // apacheCordova, ...) before a diff/add flow ever tried writing one of
    // them into dagstree.yaml.
    const offenders: string[] = [];
    for (const key of tech.keys) {
      const mapped = mapSpecfySlug(key, key);
      if (!DAGSTREE_SLUG_PATTERN.test(mapped.slug)) {
        offenders.push(`${key} -> ${mapped.slug}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every mapping table entry has a non-empty slug, name, and a valid category", () => {
    const categories = new Set([
      "db",
      "auth",
      "ai",
      "hosting",
      "dns",
      "payments",
      "analytics",
      "storage",
      "ci",
      "agent",
      "pm",
      "vcs",
      "other",
    ]);
    for (const [specfySlug, entry] of Object.entries(SPECFY_TO_DAGSTREE)) {
      expect(entry.slug.length, `slug for ${specfySlug}`).toBeGreaterThan(0);
      expect(entry.name.length, `name for ${specfySlug}`).toBeGreaterThan(0);
      expect(categories.has(entry.category), `category for ${specfySlug}`).toBe(true);
    }
  });
});
