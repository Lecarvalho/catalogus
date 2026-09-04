import { describe, expect, it } from "vitest";

import { brandFromHash, hashForBrand, hashForServiceId, serviceIdFromHash } from "./hash-route.js";

describe("serviceIdFromHash", () => {
  it("extracts the id from a well-formed service hash", () => {
    expect(serviceIdFromHash("#/service/fly-api")).toBe("fly-api");
  });

  it("round-trips through hashForServiceId", () => {
    expect(serviceIdFromHash(hashForServiceId("supabase-db"))).toBe("supabase-db");
  });

  it("returns null for an empty hash", () => {
    expect(serviceIdFromHash("")).toBeNull();
  });

  it("returns null for a bare '#'", () => {
    expect(serviceIdFromHash("#")).toBeNull();
  });

  it("returns null for a hash that doesn't address a service at all", () => {
    expect(serviceIdFromHash("#/something-else")).toBeNull();
  });

  it("returns null for the prefix with nothing after it", () => {
    expect(serviceIdFromHash("#/service/")).toBeNull();
  });

  it("decodes a percent-encoded id", () => {
    expect(serviceIdFromHash("#/service/weird%20id")).toBe("weird id");
  });

  // Regression: a hostile or stale hash must never throw, even when it
  // contains a percent-escape decodeURIComponent can't parse.
  it("does not throw on a malformed percent-escape, and returns the raw text instead", () => {
    expect(() => serviceIdFromHash("#/service/%")).not.toThrow();
    expect(serviceIdFromHash("#/service/%")).toBe("%");
  });

  it("does not throw on an arbitrary stale/hostile id", () => {
    expect(() => serviceIdFromHash("#/service/<script>nope</script>")).not.toThrow();
    expect(serviceIdFromHash("#/service/<script>nope</script>")).toBe("<script>nope</script>");
  });
});

describe("hashForServiceId", () => {
  it("builds the #/service/<id> shape", () => {
    expect(hashForServiceId("fly-api")).toBe("#/service/fly-api");
  });

  it("percent-encodes an id with characters that would otherwise change the hash's shape", () => {
    expect(hashForServiceId("weird id")).toBe("#/service/weird%20id");
  });
});

// Added 2026-09-04 for the brand page's own route (docs/brand-tile-brief.md,
// "Shared contract"). Mirrors serviceIdFromHash's own test shapes -- the
// never-throws guarantee, the empty-segment cases -- extended to two
// segments instead of one.
describe("brandFromHash", () => {
  it("extracts the band id and the catalog slug from a well-formed brand hash", () => {
    expect(brandFromHash("#/brand/production/flyio")).toEqual({ band: "production", service: "flyio" });
  });

  it("round-trips through hashForBrand", () => {
    expect(brandFromHash(hashForBrand("holds", "supabase"))).toEqual({ band: "holds", service: "supabase" });
  });

  it("returns null for an empty hash", () => {
    expect(brandFromHash("")).toBeNull();
  });

  it("returns null for a hash that doesn't address a brand page at all", () => {
    expect(brandFromHash("#/service/fly-api")).toBeNull();
  });

  it("returns null for the prefix with nothing after it", () => {
    expect(brandFromHash("#/brand/")).toBeNull();
  });

  it("returns null when the band segment is missing (a bare slug, no slash)", () => {
    expect(brandFromHash("#/brand/flyio")).toBeNull();
  });

  it("returns null when the band segment is empty (a leading slash)", () => {
    expect(brandFromHash("#/brand//flyio")).toBeNull();
  });

  it("returns null when the service segment is empty (a trailing slash)", () => {
    expect(brandFromHash("#/brand/production/")).toBeNull();
  });

  it("decodes a percent-encoded band id and slug", () => {
    expect(brandFromHash("#/brand/runs%20on/weird%20slug")).toEqual({ band: "runs on", service: "weird slug" });
  });

  // Regression: a hostile or stale hash must never throw, the same guarantee
  // serviceIdFromHash makes for its own single segment.
  it("does not throw on a malformed percent-escape in either segment, and returns the raw text instead", () => {
    expect(() => brandFromHash("#/brand/%/flyio")).not.toThrow();
    expect(brandFromHash("#/brand/%/flyio")).toEqual({ band: "%", service: "flyio" });
    expect(() => brandFromHash("#/brand/production/%")).not.toThrow();
    expect(brandFromHash("#/brand/production/%")).toEqual({ band: "production", service: "%" });
  });

  it("does not throw on an arbitrary stale/hostile segment", () => {
    expect(() => brandFromHash("#/brand/<script>/nope")).not.toThrow();
    expect(brandFromHash("#/brand/<script>/nope")).toEqual({ band: "<script>", service: "nope" });
  });

  // A slug is free to contain its own "-"-joined segments (e.g.
  // "google-cloud-storage"); only the FIRST "/" in the remainder ends the
  // band segment, so a slug is never truncated by a "/" it does not contain,
  // and a slug that somehow did contain one would keep everything after the
  // first slash rather than being split again.
  it("splits on the first slash only, leaving the rest of a multi-segment-looking slug intact", () => {
    expect(brandFromHash("#/brand/production/google-cloud-storage")).toEqual({
      band: "production",
      service: "google-cloud-storage",
    });
  });
});

describe("hashForBrand", () => {
  it("builds the #/brand/<bandId>/<service> shape", () => {
    expect(hashForBrand("production", "flyio")).toBe("#/brand/production/flyio");
  });

  it("percent-encodes a band id or slug with characters that would otherwise change the hash's shape", () => {
    expect(hashForBrand("production", "weird slug")).toBe("#/brand/production/weird%20slug");
  });
});
