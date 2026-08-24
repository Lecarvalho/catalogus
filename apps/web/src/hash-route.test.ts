import { describe, expect, it } from "vitest";

import { hashForServiceId, serviceIdFromHash } from "./hash-route.js";

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
