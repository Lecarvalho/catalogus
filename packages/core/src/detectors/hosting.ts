// Catalogus-specific hosting detector (HANDOFF.md §6). stack-analyser's own
// rules already catch the exact filenames fly.toml/netlify.toml/vercel.json
// (see docs/detection-spike.md), but its fly.toml rule is an exact-name
// match — it does not catch fly.web.toml/fly.grafana.toml/fly.loki.toml,
// the multi-app pattern Clapline actually uses. This detector globs for
// that pattern itself and still folds every matching file into a single
// Fly.io detection, never one per file.
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { pathExists } from "./fs-helpers.js";
import type { HostingDetection } from "../types.js";

interface ExactMarker {
  slug: string;
  name: string;
}

const EXACT_MARKERS: Record<string, ExactMarker> = {
  "vercel.json": { slug: "vercel", name: "Vercel" },
  "netlify.toml": { slug: "netlify", name: "Netlify" },
  "render.yaml": { slug: "render", name: "Render" },
  "wrangler.toml": { slug: "cloudflare-workers", name: "Cloudflare Workers" },
};

// fly.toml, fly.web.toml, fly.grafana.toml, fly.loki.toml, ... — but not
// flyway.toml/flycheck.toml/etc: the variant marker, when present, must
// start right after "fly" with its own ".".
const FLY_TOML_PATTERN = /^fly(?:\.[\w-]+)?\.toml$/i;

export async function detectHosting(repoPath: string): Promise<HostingDetection[]> {
  const byProvider = new Map<string, HostingDetection>();

  let rootFiles: string[] = [];
  try {
    rootFiles = await readdir(repoPath);
  } catch {
    rootFiles = [];
  }

  const flyFiles = rootFiles.filter((name) => FLY_TOML_PATTERN.test(name)).sort();
  if (flyFiles.length > 0) {
    byProvider.set("fly-io", {
      slug: "fly-io",
      name: "Fly.io",
      evidence: flyFiles.map((file) => ({ file })),
    });
  }

  for (const [file, marker] of Object.entries(EXACT_MARKERS)) {
    if (await pathExists(join(repoPath, file))) {
      byProvider.set(marker.slug, { slug: marker.slug, name: marker.name, evidence: [{ file }] });
    }
  }

  return [...byProvider.values()];
}
