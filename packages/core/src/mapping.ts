import type { ServiceCategory } from "./types.js";

export interface MappingEntry {
  /** Dagstree catalog slug — Dagstree's own namespace, not stack-analyser's. */
  slug: string;
  category: ServiceCategory;
  name: string;
}

/**
 * specfySlug -> Dagstree catalog entry.
 *
 * Derived from a real spike run of @specfy/stack-analyser against Clapline,
 * waymark, Pomegr, fixpic and trello-cli — see docs/detection-spike.md for
 * the raw evidence behind every row marked "observed" below. Rows marked
 * "HANDOFF" were not seen live in the spike but are named explicitly in
 * HANDOFF.md (the fly.toml/vercel.json/netlify.toml/render.yaml/wrangler.toml
 * hosting detectors in §6, and the supabase/anthropic/google-vertex-ai
 * example in §5) and were confirmed to exist as real stack-analyser tech
 * keys before being added here.
 *
 * This table only covers slugs worth cataloging as a service/provider.
 * Everything else stack-analyser detects (languages, frameworks, build
 * tools) still comes back from detect() as an `unmapped: true` pass-through
 * — see mapSpecfySlug — rather than being silently dropped.
 */
export const SPECFY_TO_DAGSTREE: Record<string, MappingEntry> = {
  // --- hosting ---------------------------------------------------------
  flyio: { slug: "fly-io", category: "hosting", name: "Fly.io" }, // observed: Clapline fly.toml
  vercel: { slug: "vercel", category: "hosting", name: "Vercel" }, // HANDOFF §6
  netlify: { slug: "netlify", category: "hosting", name: "Netlify" }, // HANDOFF §6
  render: { slug: "render", category: "hosting", name: "Render" }, // HANDOFF §6
  cloudflare: { slug: "cloudflare", category: "hosting", name: "Cloudflare" }, // observed: Pomegr @cloudflare/*
  "cloudflare.workers": {
    slug: "cloudflare-workers",
    category: "hosting",
    name: "Cloudflare Workers",
  }, // observed: Pomegr wrangler dep + wrangler.toml

  // --- db ----------------------------------------------------------------
  postgresql: { slug: "postgresql", category: "db", name: "Postgres" },
  "vercel.postgres": { slug: "vercel-postgres", category: "db", name: "Vercel Postgres" },
  "supabase.postgres": { slug: "supabase", category: "db", name: "Supabase Postgres" },

  // --- auth ----------------------------------------------------------------
  "supabase.auth": { slug: "supabase", category: "auth", name: "Supabase Auth" },

  // --- storage ---------------------------------------------------------
  "supabase.storage": { slug: "supabase", category: "storage", name: "Supabase Storage" },

  // --- supabase, generic (role not distinguishable from this signal alone)
  supabase: { slug: "supabase", category: "other", name: "Supabase" }, // observed: fixpic @supabase/* dep, SUPABASE_ env
  "supabase.functions": { slug: "supabase", category: "hosting", name: "Supabase Functions" },
  "supabase.realtime": { slug: "supabase", category: "other", name: "Supabase Realtime" },

  // --- ai ------------------------------------------------------------------
  anthropic: { slug: "anthropic", category: "ai", name: "Anthropic" }, // HANDOFF §5 example
  openai: { slug: "openai", category: "ai", name: "OpenAI" },
  geminiai: { slug: "google-gemini", category: "ai", name: "Gemini AI" }, // observed: fixpic @google/genai dep
  "gcp.vertex": { slug: "google-vertex-ai", category: "ai", name: "Vertex AI" }, // HANDOFF §5 example

  // --- payments --------------------------------------------------------
  stripe: { slug: "stripe", category: "payments", name: "Stripe" },

  // --- vcs / ci --------------------------------------------------------
  github: { slug: "github", category: "vcs", name: "GitHub" }, // observed: Clapline & Pomegr .github/
  gitlab: { slug: "gitlab", category: "vcs", name: "GitLab" },
  "gitlab.ci": { slug: "gitlab-ci", category: "ci", name: "GitLab CI" },

  // --- other -------------------------------------------------------------
  nginx: { slug: "nginx", category: "other", name: "Nginx" }, // observed: Clapline ops/nginx.conf
  slack: { slug: "slack", category: "other", name: "Slack" }, // observed: Clapline SLACK_ env
  lucideicons: { slug: "lucide-icons", category: "other", name: "Lucide Icons" }, // observed: fixpic
  mcp: { slug: "mcp", category: "other", name: "MCP SDK" }, // Model Context Protocol SDK dependency
};

/**
 * Best-effort category for a specfySlug that has no row above. Stack-analyser
 * tags every tech with its own `type` (e.g. "db", "ai", "payment") — where
 * that type overlaps cleanly with Dagstree's category enum we reuse it
 * instead of dumping every unmapped detection into "other".
 */
const SPECFY_TYPE_TO_CATEGORY: Partial<Record<string, ServiceCategory>> = {
  db: "db",
  auth: "auth",
  ai: "ai",
  hosting: "hosting",
  payment: "payments",
  analytics: "analytics",
  storage: "storage",
  ci: "ci",
};

/**
 * Normalises a raw stack-analyser key into a string that satisfies
 * @dagstree/schema's slug pattern (`^[a-z0-9]+(?:[_-][a-z0-9]+)*$`, the
 * same pattern the CLI's `validate` command enforces on dagstree.yaml).
 * stack-analyser's own namespace allows things that pattern rejects — dot
 * namespacing (`aws.lambda`) and camelCase (`apacheCordova`) among them; of
 * its 743 keys, roughly a fifth fail the schema's pattern as-is. Verified
 * empirically against the live tech index that this produces a valid,
 * collision-free slug for every one of them: camelCase boundaries and any
 * run of non-[a-z0-9] characters become a single `-`.
 */
function normalizeToDagstreeSlug(specfySlug: string): string {
  return specfySlug
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Maps a raw stack-analyser slug into Dagstree's namespace. Never discards —
 * an unrecognized slug survives as a pass-through entry flagged `unmapped`,
 * so a gap in this table shows up as "unknown service" rather than silently
 * vanishing from detect() output. The pass-through `slug` is normalised into
 * Dagstree's own namespace (see normalizeToDagstreeSlug) rather than reusing
 * the raw key verbatim, so every technology detect() emits — mapped or not —
 * is something the CLI could actually write into dagstree.yaml without its
 * own `validate` command rejecting it; the untouched stack-analyser key is
 * still available separately as DetectedTechnology.specfySlug.
 */
export function mapSpecfySlug(
  specfySlug: string,
  fallbackName: string,
  specfyType?: string
): MappingEntry & { unmapped: boolean } {
  const known = SPECFY_TO_DAGSTREE[specfySlug];
  if (known) {
    return { ...known, unmapped: false };
  }
  const category = (specfyType && SPECFY_TYPE_TO_CATEGORY[specfyType]) || "other";
  return { slug: normalizeToDagstreeSlug(specfySlug), category, name: fallbackName, unmapped: true };
}
