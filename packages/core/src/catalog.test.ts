import { getIconsData } from "simple-icons/sdk";
import { describe, expect, it } from "vitest";

import { CATALOGUS_CATALOG, deriveBaseCatalog, getCatalogEntry, ICON_OVERLAY } from "./catalog.js";
import type { MappingEntry } from "./mapping.js";
import { SPECFY_TO_CATALOGUS } from "./mapping.js";

/** Builds a minimal, valid MappingEntry for deriveBaseCatalog test fixtures. */
function mappingEntry(slug: string, name: string): MappingEntry {
  return { slug, name, category: "other", kind: "service" };
}

describe("deriveBaseCatalog", () => {
  it("rule 1: uses the shared name when every row collapsing onto a slug agrees", () => {
    const derived = deriveBaseCatalog({
      "probe.a": mappingEntry("probe", "Probe"),
      "probe.b": mappingEntry("probe", "Probe"),
    });
    expect(derived.probe).toEqual({ name: "Probe" });
  });

  it("rule 2: a bare specfy key equal to the catalogus slug wins over disagreeing role-specific rows, regardless of declaration order", () => {
    const inOneOrder = deriveBaseCatalog({
      "probe.role-a": mappingEntry("probe", "Probe Role A"),
      probe: mappingEntry("probe", "Probe"),
      "probe.role-b": mappingEntry("probe", "Probe Role B"),
    });
    expect(inOneOrder.probe).toEqual({ name: "Probe" });

    // Swapping declaration order must not change the result -- this is
    // exactly the order-dependence the earlier version of this function had.
    const inReverseOrder = deriveBaseCatalog({
      "probe.role-b": mappingEntry("probe", "Probe Role B"),
      probe: mappingEntry("probe", "Probe"),
      "probe.role-a": mappingEntry("probe", "Probe Role A"),
    });
    expect(inReverseOrder.probe).toEqual({ name: "Probe" });
  });

  it("rule 3: throws, naming the slug and the competing names, when rows disagree with no bare key to resolve it", () => {
    expect(() =>
      deriveBaseCatalog({
        "probe.role-a": mappingEntry("probe", "Probe Role A"),
        "probe.role-b": mappingEntry("probe", "Probe Role B"),
      })
    ).toThrowError(/probe/);

    // Swapping declaration order must not change *whether* it throws --
    // this reproduces the shape of the adversarial probe that proved the
    // old fallback picked a winner by declaration order instead of failing.
    // (The message's own listing order for the competing rows naturally
    // follows input order; that's not the defect -- silently picking a
    // *different winning row* on reorder, with no error at all, was.)
    for (const mapping of [
      {
        "probe.role-a": mappingEntry("probe", "Probe Role A"),
        "probe.role-b": mappingEntry("probe", "Probe Role B"),
      },
      {
        "probe.role-b": mappingEntry("probe", "Probe Role B"),
        "probe.role-a": mappingEntry("probe", "Probe Role A"),
      },
    ]) {
      let message = "";
      try {
        deriveBaseCatalog(mapping);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).not.toBe("");
      expect(message).toContain("probe");
      expect(message).toContain("probe.role-a");
      expect(message).toContain("Probe Role A");
      expect(message).toContain("probe.role-b");
      expect(message).toContain("Probe Role B");
    }
  });

  it("agrees on name for every real catalogus slug targeted by more than one specfy key, except the documented supabase exception, and derives every slug without dropping one", () => {
    // Runs the real rule against the real table rather than a constructed
    // fixture: this is the integration check that SPECFY_TO_CATALOGUS itself
    // still only has the one known, resolvable disagreement.
    const derived = deriveBaseCatalog(SPECFY_TO_CATALOGUS);
    const expectedSlugs = new Set(Object.values(SPECFY_TO_CATALOGUS).map((e) => e.slug));
    expect(new Set(Object.keys(derived))).toEqual(expectedSlugs);
  });

  it("resolves the real supabase disagreement to the generic row (bare 'supabase' specfy key), not an arbitrary sub-tech", () => {
    const derived = deriveBaseCatalog(SPECFY_TO_CATALOGUS);
    expect(derived.supabase).toEqual({ name: "Supabase" });
  });
});

describe("CATALOGUS_CATALOG invariants", () => {
  it("every row has a non-empty slug and name, and a key matching its own slug", () => {
    for (const [key, entry] of Object.entries(CATALOGUS_CATALOG)) {
      expect(entry.slug, `key ${key} should equal its own entry.slug`).toBe(key);
      expect(entry.slug.length, `slug for ${key}`).toBeGreaterThan(0);
      expect(entry.name.length, `name for ${key}`).toBeGreaterThan(0);
    }
  });

  it("carries no kind field on any row", () => {
    // CatalogEntry deliberately has no `kind` -- see catalog.ts's interface
    // doc comment. This guards against one being added back by accident.
    for (const entry of Object.values(CATALOGUS_CATALOG)) {
      expect("kind" in entry).toBe(false);
    }
  });

  it("carries no category field on any row", () => {
    // CatalogEntry deliberately has no `category` -- role, a per-project
    // fact on the manifest entry, already answers that question. This
    // guards against a category being reintroduced by accident.
    for (const entry of Object.values(CATALOGUS_CATALOG)) {
      expect("category" in entry).toBe(false);
    }
  });

  it("includes every EXTRA_ROWS slug used in examples/reference.catalogus.yaml", () => {
    for (const slug of ["dotnet", "opentelemetry", "namecheap", "trello", "github-actions", "claude-code"]) {
      expect(getCatalogEntry(slug), `expected an extra row for ${slug}`).toBeDefined();
    }
  });

  // Added 2026-08-24 alongside the amendment that made coding agents service
  // entries: claude-code, cursor and github-copilot have a verified
  // simple-icons mark; codex does not (see catalog.ts's ICON_OVERLAY comment)
  // and must fall back to the viewer's generic icon rather than a guessed one.
  it("gives every coding-agent catalog row a name, and an icon only where simple-icons actually has the mark", () => {
    expect(getCatalogEntry("claude-code")).toEqual({ slug: "claude-code", name: "Claude Code", icon: "claudecode" });
    expect(getCatalogEntry("cursor")).toEqual({ slug: "cursor", name: "Cursor", icon: "cursor" });
    expect(getCatalogEntry("github-copilot")).toEqual({
      slug: "github-copilot",
      name: "GitHub Copilot",
      icon: "githubcopilot",
    });
    const codex = getCatalogEntry("codex");
    expect(codex).toBeDefined();
    expect(codex?.icon).toBeUndefined();
    expect(codex && "icon" in codex).toBe(false);
  });
});

describe("getCatalogEntry", () => {
  it("returns undefined for a slug with no catalog row -- not a synthesised placeholder", () => {
    expect(getCatalogEntry("some-slug-nobody-has-catalogued")).toBeUndefined();
  });

  it("returns the fly-io row with its verified icon", () => {
    expect(getCatalogEntry("fly-io")).toEqual({ slug: "fly-io", name: "Fly.io", icon: "flydotio" });
  });

  it("omits the icon field entirely for a slug with no verified icon, rather than a falsy placeholder", () => {
    const entry = getCatalogEntry("openai");
    expect(entry).toBeDefined();
    expect(entry?.icon).toBeUndefined();
    expect(entry && "icon" in entry).toBe(false);
  });

  it("returns undefined for Object.prototype property names instead of resolving through the prototype chain", () => {
    // CATALOGUS_CATALOG is a plain object keyed by an open-vocabulary slug
    // (@catalogus/schema's slug pattern admits "constructor" etc.), so a
    // lookup that isn't guarded against Object.prototype would return the
    // inherited function/property instead of undefined -- and a caller
    // checking truthiness would treat that as a known service. Demonstrated
    // end to end: a manifest with `service: constructor` validates against
    // the real built CLI, exit 0.
    for (const slug of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
      expect(getCatalogEntry(slug), `getCatalogEntry(${JSON.stringify(slug)})`).toBeUndefined();
    }
  });
});

describe("icon verification against the installed simple-icons package", () => {
  it("resolves every catalog `icon` to a real slug in the installed simple-icons package", async () => {
    // This is the tripwire: it re-derives the same real, installed
    // simple-icons data set catalog.ts's ICON_OVERLAY was built against (not
    // a hand-copied list) and fails loudly if any icon slug stops existing
    // -- including the real future event this guards against: simple-icons
    // has removed brand marks under trademark pressure before (this slice's
    // own pass found OpenAI's mark already gone from the installed v16.28.0
    // package).
    const icons = await getIconsData();
    const installedSlugs = new Set(icons.map((icon) => icon.slug));

    const brokenEntries: string[] = [];
    for (const [slug, entry] of Object.entries(CATALOGUS_CATALOG)) {
      if (entry.icon !== undefined && !installedSlugs.has(entry.icon)) {
        brokenEntries.push(`${slug} -> icon "${entry.icon}" not found in installed simple-icons`);
      }
    }
    expect(brokenEntries).toEqual([]);
  });

  it("has at least one catalog row with an icon and at least one without, so this test suite cannot pass vacuously", async () => {
    const withIcon = Object.values(CATALOGUS_CATALOG).filter((e) => e.icon !== undefined);
    const withoutIcon = Object.values(CATALOGUS_CATALOG).filter((e) => e.icon === undefined);
    expect(withIcon.length).toBeGreaterThan(0);
    expect(withoutIcon.length).toBeGreaterThan(0);
  });

  it("lands every ICON_OVERLAY key as an icon on a real catalog row -- none silently swallowed by a typo'd key matching no slug", () => {
    // The build loop in catalog.ts (`if (catalog[slug]) { ... }`) only
    // applies an overlay entry when the key already names a real catalog
    // row; a typo'd key (e.g. "stripe" -> "strpe") matches nothing, is
    // silently skipped, and the row it was meant for loses its icon with no
    // error anywhere. The icon-resolution test above only checks that icons
    // which *did* land point at real simple-icons slugs -- it says nothing
    // about entries that never landed at all. This test closes that gap
    // directly: every key this table declares must have actually produced
    // an icon on the catalog row of the same slug.
    const missing: string[] = [];
    for (const [slug, icon] of Object.entries(ICON_OVERLAY)) {
      const entry = getCatalogEntry(slug);
      if (entry === undefined) {
        missing.push(`${slug}: no catalog row exists at all`);
      } else if (entry.icon !== icon) {
        missing.push(`${slug}: catalog row has icon ${JSON.stringify(entry.icon)}, expected ${JSON.stringify(icon)}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
