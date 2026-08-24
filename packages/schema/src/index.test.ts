import { describe, expect, it } from "vitest";
import {
  catalogusSchemaV1,
  parseManifest,
  validateManifest,
  edgeEndpoints,
  edgePairs,
  looksLikePrivateKey,
  MANIFEST_FILENAME,
  MANIFEST_FILENAME_FALLBACK,
} from "./index.js";

describe("@catalogus/schema public API", () => {
  it("exports the raw schema object", () => {
    expect(catalogusSchemaV1.$id).toBe("https://catalogus.dev/schema/v1.json");
    expect(catalogusSchemaV1.properties.catalogus.const).toBe(1);
  });

  it("exports validate/parse, the edge helpers, and the private-key check", () => {
    expect(typeof validateManifest).toBe("function");
    expect(typeof parseManifest).toBe("function");
    expect(typeof edgeEndpoints).toBe("function");
    expect(typeof edgePairs).toBe("function");
    expect(looksLikePrivateKey("cost")).toBe(true);
  });

  it("exports the manifest filename contract", () => {
    expect(MANIFEST_FILENAME).toBe("catalogus.yaml");
    expect(MANIFEST_FILENAME_FALLBACK).toBe("stack.yaml");
  });

  it("parses and validates a minimal manifest end to end", () => {
    const result = parseManifest(
      "catalogus: 1\nproject:\n  name: X\n  slug: x\nservices: []\ndependencies: []\n",
    );
    expect(result.valid).toBe(true);
  });
});
