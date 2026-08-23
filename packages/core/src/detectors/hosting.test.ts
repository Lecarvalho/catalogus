import { describe, expect, it } from "vitest";

import { detectHosting } from "./hosting.js";
import { fixturePath } from "../test-support/fixture-path.js";

describe("detectHosting", () => {
  it("detects Fly.io from a single fly.toml", async () => {
    const result = await detectHosting(fixturePath("hosting", "fly-single"));
    expect(result).toEqual([{ slug: "fly-io", name: "Fly.io", evidence: [{ file: "fly.toml" }] }]);
  });

  it("folds four fly.toml variants into one Fly.io detection, not four", async () => {
    const result = await detectHosting(fixturePath("hosting", "fly-four-variants"));
    const fly = result.filter((entry) => entry.slug === "fly-io");
    expect(fly).toHaveLength(1);
    expect(fly[0]?.evidence.map((e) => e.file).sort()).toEqual([
      "fly.grafana.toml",
      "fly.loki.toml",
      "fly.toml",
      "fly.web.toml",
    ]);
  });

  it("detects Vercel", async () => {
    const result = await detectHosting(fixturePath("hosting", "vercel"));
    expect(result).toEqual([{ slug: "vercel", name: "Vercel", evidence: [{ file: "vercel.json" }] }]);
  });

  it("detects Netlify", async () => {
    const result = await detectHosting(fixturePath("hosting", "netlify"));
    expect(result).toEqual([{ slug: "netlify", name: "Netlify", evidence: [{ file: "netlify.toml" }] }]);
  });

  it("detects Render", async () => {
    const result = await detectHosting(fixturePath("hosting", "render"));
    expect(result).toEqual([{ slug: "render", name: "Render", evidence: [{ file: "render.yaml" }] }]);
  });

  it("detects Cloudflare Workers from wrangler.toml", async () => {
    const result = await detectHosting(fixturePath("hosting", "wrangler"));
    expect(result).toEqual([
      { slug: "cloudflare-workers", name: "Cloudflare Workers", evidence: [{ file: "wrangler.toml" }] },
    ]);
  });

  it("returns an empty list when no hosting marker is present", async () => {
    const result = await detectHosting(fixturePath("hosting", "none"));
    expect(result).toEqual([]);
  });

  it("does not mistake flyway.toml (a database migration tool) for a Fly.io marker", async () => {
    const result = await detectHosting(fixturePath("hosting", "flyway-negative"));
    expect(result).toEqual([]);
  });
});
