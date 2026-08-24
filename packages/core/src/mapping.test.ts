// Rule registration is a side effect of this import (see specfy.ts) — without
// it, tech.keys below comes back empty regardless of test run order/isolation.
import "@specfy/stack-analyser/dist/autoload.js";
import { tech } from "@specfy/stack-analyser";
import { describe, expect, it } from "vitest";

import { mapSpecfySlug, SPECFY_TO_CATALOGUS } from "./mapping.js";
import { DETECTION_KINDS, SERVICE_CATEGORIES } from "./types.js";

// Mirrors @catalogus/schema's $defs.slug.pattern (packages/schema/src/schema.ts)
// without a cross-package dependency — the CLI's `validate` command rejects
// any manifest slug that fails this, so every slug detect() can emit must
// satisfy it too.
const CATALOGUS_SLUG_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

describe("mapSpecfySlug", () => {
  it("maps a known specfy slug into Catalogus's namespace", () => {
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

  it("normalises a dot-namespaced unmapped slug into the Catalogus schema's slug pattern", () => {
    // azure.aks is a real, dot-namespaced stack-analyser key with no row of
    // its own in SPECFY_TO_CATALOGUS (unlike aws.lambda, which mapping.ts's
    // breadth rows now cover) -- exactly the "still genuinely unmapped"
    // shape this test needs.
    const result = mapSpecfySlug("azure.aks", "Azure AKS");
    expect(result.unmapped).toBe(true);
    expect(result.slug).toBe("azure-aks");
    expect(CATALOGUS_SLUG_PATTERN.test(result.slug)).toBe(true);
  });

  it("converts a camelCase unmapped slug into kebab-case", () => {
    // Synthetic on purpose. This used to use "apacheCordova", the one
    // genuinely camelCase key @specfy/stack-analyser ships -- and then the
    // stack rows added on 2026-08-23 mapped it, so the slug started coming
    // from the table instead of from the converter and the test stopped
    // exercising what it names. Real keys are covered by the whole-index
    // test below, which is the one that must not be narrowed.
    const result = mapSpecfySlug("someVendorTool", "Some Vendor Tool");
    expect(result.unmapped).toBe(true);
    expect(result.slug).toBe("some-vendor-tool");
  });

  it("every real stack-analyser key maps to a slug satisfying @catalogus/schema's slug pattern", () => {
    // Exercises the live tech index, not just this table — this is exactly
    // what would have caught the ~165 offending keys (every aws.*,
    // atlassian.jira, atlassian.trello, adobe.*, camelCase keys like
    // apacheCordova, ...) before a diff/add flow ever tried writing one of
    // them into catalogus.yaml.
    const offenders: string[] = [];
    for (const key of tech.keys) {
      const mapped = mapSpecfySlug(key, key);
      if (!CATALOGUS_SLUG_PATTERN.test(mapped.slug)) {
        offenders.push(`${key} -> ${mapped.slug}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every mapping table entry has a non-empty slug, name, a valid category, and a valid kind", () => {
    // From SERVICE_CATEGORIES rather than retyped here: a second copy of the
    // enum passes green while the spec moves underneath it, which is what
    // this list did until HANDOFF §4 was widened on 2026-08-23.
    const categories = new Set<string>(SERVICE_CATEGORIES);
    // From DETECTION_KINDS for the same reason categories comes from
    // SERVICE_CATEGORIES: this was a hand-typed ["service", "library"] and
    // it stayed green while the union grew "component" and "stack".
    const kinds = new Set<string>(DETECTION_KINDS);
    for (const [specfySlug, entry] of Object.entries(SPECFY_TO_CATALOGUS)) {
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
    // The two questions are independent, and this is the test that they
    // are: "cdn" is not in LIBRARY_SPECFY_TYPES, so it is a service, and it
    // is not in SPECFY_TYPE_TO_CATEGORY either, so it has no Catalogus
    // bucket and lands in "other". Having no category must never imply
    // being a library -- a CDN can go down and send an invoice exactly like
    // a database can.
    //
    // This used to use "monitoring", which stopped being a case of "no
    // category" when HANDOFF §4's enum was widened on 2026-08-23. Left as
    // it was, the test would have kept passing while testing nothing.
    const result = mapSpecfySlug("some-future-cdn", "Some Future CDN", "cdn");
    expect(result.unmapped).toBe(true);
    expect(result.category).toBe("other");
    expect(result.kind).toBe("service");
  });

  // The counterpart to the above, and the case the widening created: a type
  // that now DOES have a bucket must land in it rather than in "other".
  it("gives an unmapped technology the Catalogus category its specfy type maps to, when there is one", () => {
    expect(mapSpecfySlug("some-future-monitor", "Some Future Monitor", "monitoring").category).toBe("monitoring");
    expect(mapSpecfySlug("some-future-queue", "Some Future Queue", "queue").category).toBe("queue");
    expect(mapSpecfySlug("some-future-mailer", "Some Future Mailer", "notification").category).toBe("messaging");
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
