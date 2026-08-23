import { describe, expect, it } from "vitest";

import { deriveLocalId, isValidSlug, slugify } from "./slug.js";

describe("isValidSlug", () => {
  it("accepts lowercase words joined by single - or _", () => {
    expect(isValidSlug("supabase")).toBe(true);
    expect(isValidSlug("fly-io")).toBe(true);
    expect(isValidSlug("google_vertex_ai")).toBe(true);
  });

  it("rejects uppercase, doubled separators, and leading/trailing separators", () => {
    expect(isValidSlug("Supabase")).toBe(false);
    expect(isValidSlug("fly--io")).toBe(false);
    expect(isValidSlug("-fly")).toBe(false);
    expect(isValidSlug("fly-")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates human text", () => {
    expect(slugify("My Cool Project")).toBe("my-cool-project");
  });

  it("strips accents", () => {
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
  });

  it("never produces leading/trailing or doubled separators", () => {
    expect(slugify("  --Weird__Name!! ")).toBe("weird-name");
  });

  it("falls back to a non-empty slug for all-symbol input", () => {
    expect(slugify("!!!")).toBe("project");
  });
});

describe("deriveLocalId", () => {
  it("uses the bare service slug when it's free", () => {
    expect(deriveLocalId("supabase", "database", new Set())).toBe("supabase");
  });

  it("falls back to slug-role on collision, matching HANDOFF's supabase-db/supabase-auth convention", () => {
    expect(deriveLocalId("supabase", "auth", new Set(["supabase"]))).toBe("supabase-auth");
  });

  it("adds a numeric suffix when slug-role also collides", () => {
    const existing = new Set(["supabase", "supabase-auth"]);
    expect(deriveLocalId("supabase", "auth", existing)).toBe("supabase-auth-2");
  });

  it("keeps incrementing until it finds a free id", () => {
    const existing = new Set(["supabase", "supabase-auth", "supabase-auth-2", "supabase-auth-3"]);
    expect(deriveLocalId("supabase", "auth", existing)).toBe("supabase-auth-4");
  });

  // Which *ids* are taken is a different question from which *services* the
  // manifest already names. A manifest holding supabase under the explicit id
  // "supabase-db" leaves the bare id free -- and taking it would put
  // "supabase" beside "supabase-db", legal but reading as though they were
  // different kinds of thing.
  it("qualifies by role when the service already appears, even though the bare id is free", () => {
    expect(deriveLocalId("supabase", "auth", new Set(["supabase-db"]), new Set(["supabase"]))).toBe(
      "supabase-auth"
    );
  });

  it("still uses the bare slug for a service the manifest does not name yet", () => {
    expect(deriveLocalId("fly-io", "hosting", new Set(["supabase-db"]), new Set(["supabase"]))).toBe("fly-io");
  });
});
