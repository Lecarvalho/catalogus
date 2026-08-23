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
    expect(result).toEqual({ slug: "fly-io", category: "hosting", name: "Fly.io", kind: "service", unmapped: false });
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
    // azure.aks is a real, dot-namespaced stack-analyser key with no row of
    // its own in SPECFY_TO_DAGSTREE (unlike aws.lambda, which mapping.ts's
    // breadth rows now cover) -- exactly the "still genuinely unmapped"
    // shape this test needs.
    const result = mapSpecfySlug("azure.aks", "Azure AKS");
    expect(result.unmapped).toBe(true);
    expect(result.slug).toBe("azure-aks");
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

  it("every mapping table entry has a non-empty slug, name, a valid category, and a valid kind", () => {
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
    const kinds = new Set(["service", "library"]);
    for (const [specfySlug, entry] of Object.entries(SPECFY_TO_DAGSTREE)) {
      expect(entry.slug.length, `slug for ${specfySlug}`).toBeGreaterThan(0);
      expect(entry.name.length, `name for ${specfySlug}`).toBeGreaterThan(0);
      expect(categories.has(entry.category), `category for ${specfySlug}`).toBe(true);
      expect(kinds.has(entry.kind), `kind for ${specfySlug}`).toBe(true);
    }
  });
});

describe("classifyDetectionKind (via mapSpecfySlug's unmapped path)", () => {
  it("classifies an unmapped technology whose specfy type is developer tooling as a library", () => {
    // "framework" is a real specfy type (React, Next.js, Django, ...) --
    // see LIBRARY_SPECFY_TYPES in mapping.ts for the full, hand-verified
    // list against @specfy/stack-analyser's own rules/<type>/ layout.
    const result = mapSpecfySlug("some-future-framework", "Some Future Framework", "framework");
    expect(result.unmapped).toBe(true);
    expect(result.kind).toBe("library");
  });

  it("classifies an unmapped technology whose specfy type names a provider or running infrastructure as a service", () => {
    // "monitoring" has no Dagstree category (falls back to "other"), but it
    // is still very much a service -- an error tracker or an uptime check
    // can go down and send an invoice exactly like a database can.
    const result = mapSpecfySlug("some-future-monitor", "Some Future Monitor", "monitoring");
    expect(result.unmapped).toBe(true);
    expect(result.category).toBe("other");
    expect(result.kind).toBe("service");
  });

  it("defaults to service kind when stack-analyser supplies no type at all", () => {
    // Biased toward visibility on purpose: an unclassifiable detection
    // showing up in the services list once is a smaller failure than a
    // real service silently hiding under "library".
    const result = mapSpecfySlug("something-with-no-type", "Something With No Type");
    expect(result.unmapped).toBe(true);
    expect(result.kind).toBe("service");
  });

  it("lets a known catalog row's explicit kind override what its specfy type would otherwise default to", () => {
    // gitlab's own specfy `type` is "tool" -- in LIBRARY_SPECFY_TYPES, so an
    // *unmapped* detection with that type would classify as a library. The
    // known row overrides that: GitLab is a real VCS provider, not a tool a
    // developer merely runs, and the whole point of a known row is that it
    // gets the final say over the type-derived default.
    const result = mapSpecfySlug("gitlab", "Gitlab", "tool");
    expect(result.unmapped).toBe(false);
    expect(result.kind).toBe("service");
  });

  it("lets a known catalog row mark itself a library even though other rows of its own type are services", () => {
    // mcp's specfy type is also "tool" (so this one agrees with the
    // type-derived default) -- included as the flip side of the gitlab
    // case above: known rows are the authority either direction, not just
    // when they need to promote something to "service".
    const result = mapSpecfySlug("mcp", "MCP", "tool");
    expect(result.unmapped).toBe(false);
    expect(result.kind).toBe("library");
  });
});
