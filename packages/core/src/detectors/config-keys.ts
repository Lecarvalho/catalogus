// Dagstree-specific detector for services wired through CONFIGURATION rather
// than through a dependency manifest.
//
// Why this exists. @specfy/stack-analyser reads dependency manifests
// (package.json, requirements.txt, go.mod, ...). A .NET backend is not one,
// and neither is a docker-compose file. Measured against Clapline — a real
// project — the scanner reported Fly.io, GitHub, GitHub Actions, Claude Code
// and Slack, while the project's appsettings*.json key groups showed it
// actually uses Supabase, OpenAI, Anthropic, Gemini, ElevenLabs, xAI, AWS,
// Resend, Stripe and OTLP. Zero overlap: the scan missed the database and
// the payment processor on a live project. Any repo whose backend is not
// Node hits the same wall.
//
// Configuration key NAMES are the authoritative service list for those
// repos, and they are safe to read: a key name is a field label, never a
// credential.
//
// **Values are never read.** Not one, anywhere, for any purpose. The single
// place this module looks at text to the right of a key is the
// `NAME=value` string form of an environment list, where it takes the
// characters before the `=` and discards the rest without inspecting it
// (see `envAssignmentName`). A bare `.env` is skipped outright — only
// `.env.example`-style templates are read — because `.env` is the file most
// likely to hold live credentials, and the cheapest way to never leak one
// is to never open the file.
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import type { ConfigServiceDetection, Evidence, ServiceCategory } from "../types.js";

export interface ConfigKeyDetectionResult {
  services: ConfigServiceDetection[];
  /** e.g. `src/Api/appsettings.json: present but could not be parsed as JSON`. */
  warnings: string[];
}

/**
 * A more specific reading of the same key group, selected by one of the
 * group's own immediate child key names. `AWS` alone says only "some AWS
 * service"; `AWS` with a `Bucket` child says S3. Child names are compared
 * after the same normalisation applied to group names.
 */
interface RefineRule {
  whenChildKey: string[];
  slug: string;
  category: ServiceCategory;
  name: string;
}

interface CatalogEntry {
  slug: string;
  category: ServiceCategory;
  name: string;
  /**
   * Normalised spellings that select this entry: lowercase, letters and
   * digits only, because a key name is matched after being tokenised and
   * rejoined (see `matchCandidates`). "elevenlabs" therefore covers
   * `ElevenLabs`, `ELEVEN_LABS`, `eleven-labs` and `elevenlabs` alike.
   */
  aliases: string[];
  refine?: RefineRule[];
}

/**
 * Configuration key group -> Dagstree catalog entry.
 *
 * Every slug that also appears in mapping.ts uses that table's slug and
 * display name verbatim, so a provider caught by both stack-analyser and a
 * config key merges into one entry downstream rather than two spellings of
 * the same thing.
 *
 * Entries are brand names on purpose. Generic infrastructure words —
 * `Auth`, `Cdn`, `Features`, `Database`, `Cache` — are deliberately absent:
 * they name a role, not a provider, and admitting them would turn every
 * ordinary settings file into a wall of false detections. A role with no
 * provider behind it is exactly what the agent skill's question flow is for.
 */
const CATALOG: CatalogEntry[] = [
  // --- db ------------------------------------------------------------------
  // A `Supabase` config group is the project connection itself, so the
  // database is the one role it always implies. mapping.ts's generic
  // `supabase` row stays "other" because a bare `@supabase/*` dependency
  // genuinely cannot tell db from auth from storage.
  { slug: "supabase", category: "db", name: "Supabase", aliases: ["supabase"] },
  { slug: "postgresql", category: "db", name: "Postgres", aliases: ["postgres", "postgresql"] },
  { slug: "mysql", category: "db", name: "MySQL", aliases: ["mysql"] },
  { slug: "mongodb", category: "db", name: "MongoDB", aliases: ["mongodb", "mongo"] },
  { slug: "redis", category: "db", name: "Redis", aliases: ["redis"] },
  { slug: "upstash", category: "db", name: "Upstash", aliases: ["upstash"] },
  { slug: "neon", category: "db", name: "Neon", aliases: ["neon"] },
  { slug: "planetscale", category: "db", name: "PlanetScale", aliases: ["planetscale"] },

  // --- auth ----------------------------------------------------------------
  { slug: "clerk", category: "auth", name: "Clerk", aliases: ["clerk"] },
  { slug: "auth0", category: "auth", name: "Auth0", aliases: ["auth0"] },
  { slug: "keycloak", category: "auth", name: "Keycloak", aliases: ["keycloak"] },

  // --- ai ------------------------------------------------------------------
  { slug: "openai", category: "ai", name: "OpenAI", aliases: ["openai"] },
  { slug: "anthropic", category: "ai", name: "Anthropic", aliases: ["anthropic"] },
  {
    slug: "google-gemini",
    category: "ai",
    name: "Gemini AI",
    aliases: ["gemini", "googlegemini", "geminiai"],
    // Gemini reached through a GCP project (a project id, a region, a temp
    // bucket) is Vertex AI, not the public Gemini API — a different account,
    // a different bill, and in HANDOFF §5's own example a different slug.
    refine: [
      {
        whenChildKey: ["projectid", "project", "location", "region"],
        slug: "google-vertex-ai",
        category: "ai",
        name: "Vertex AI",
      },
    ],
  },
  { slug: "google-vertex-ai", category: "ai", name: "Vertex AI", aliases: ["vertex", "vertexai", "googlevertexai"] },
  { slug: "elevenlabs", category: "ai", name: "ElevenLabs", aliases: ["elevenlabs"] },
  { slug: "xai", category: "ai", name: "xAI", aliases: ["xai", "grok"] },
  { slug: "mistral", category: "ai", name: "Mistral", aliases: ["mistral", "mistralai"] },
  { slug: "cohere", category: "ai", name: "Cohere", aliases: ["cohere"] },
  { slug: "groq", category: "ai", name: "Groq", aliases: ["groq"] },
  { slug: "openrouter", category: "ai", name: "OpenRouter", aliases: ["openrouter"] },
  { slug: "replicate", category: "ai", name: "Replicate", aliases: ["replicate"] },
  { slug: "huggingface", category: "ai", name: "Hugging Face", aliases: ["huggingface"] },
  { slug: "stability-ai", category: "ai", name: "Stability AI", aliases: ["stability", "stabilityai"] },
  { slug: "deepgram", category: "ai", name: "Deepgram", aliases: ["deepgram"] },

  // --- payments ------------------------------------------------------------
  { slug: "stripe", category: "payments", name: "Stripe", aliases: ["stripe"] },
  { slug: "paddle", category: "payments", name: "Paddle", aliases: ["paddle"] },
  { slug: "lemon-squeezy", category: "payments", name: "Lemon Squeezy", aliases: ["lemonsqueezy"] },
  { slug: "paypal", category: "payments", name: "PayPal", aliases: ["paypal"] },

  // --- storage -------------------------------------------------------------
  { slug: "aws-s3", category: "storage", name: "Amazon S3", aliases: ["s3", "awss3"] },
  { slug: "cloudinary", category: "storage", name: "Cloudinary", aliases: ["cloudinary"] },
  { slug: "backblaze-b2", category: "storage", name: "Backblaze B2", aliases: ["backblaze"] },

  // --- hosting -------------------------------------------------------------
  { slug: "fly-io", category: "hosting", name: "Fly.io", aliases: ["flyio"] },
  { slug: "vercel", category: "hosting", name: "Vercel", aliases: ["vercel"] },
  { slug: "netlify", category: "hosting", name: "Netlify", aliases: ["netlify"] },
  { slug: "render", category: "hosting", name: "Render", aliases: ["render"] },
  { slug: "railway", category: "hosting", name: "Railway", aliases: ["railway"] },
  { slug: "cloudflare", category: "hosting", name: "Cloudflare", aliases: ["cloudflare"] },

  // --- analytics / observability -------------------------------------------
  {
    slug: "opentelemetry",
    category: "analytics",
    name: "OpenTelemetry",
    aliases: ["otlp", "otel", "opentelemetry"],
  },
  { slug: "grafana", category: "analytics", name: "Grafana", aliases: ["grafana"] },
  { slug: "grafana-loki", category: "analytics", name: "Grafana Loki", aliases: ["loki"] },
  { slug: "sentry", category: "analytics", name: "Sentry", aliases: ["sentry"] },
  { slug: "posthog", category: "analytics", name: "PostHog", aliases: ["posthog"] },
  { slug: "datadog", category: "analytics", name: "Datadog", aliases: ["datadog"] },
  { slug: "prometheus", category: "analytics", name: "Prometheus", aliases: ["prometheus"] },

  // --- pm ------------------------------------------------------------------
  { slug: "trello", category: "pm", name: "Trello", aliases: ["trello"] },
  { slug: "linear", category: "pm", name: "Linear", aliases: ["linear"] },
  { slug: "jira", category: "pm", name: "Jira", aliases: ["jira"] },
  { slug: "notion", category: "pm", name: "Notion", aliases: ["notion"] },

  // --- vcs -----------------------------------------------------------------
  { slug: "github", category: "vcs", name: "GitHub", aliases: ["github"] },
  { slug: "gitlab", category: "vcs", name: "GitLab", aliases: ["gitlab"] },

  // --- other ---------------------------------------------------------------
  // AWS names a whole account, not a service. Left in "other" on its own so
  // it still shows up as "you depend on AWS"; a Bucket child promotes it to
  // the concrete thing being paid for.
  {
    slug: "aws",
    category: "other",
    name: "AWS",
    aliases: ["aws", "amazonaws"],
    refine: [
      { whenChildKey: ["bucket", "buckets", "bucketname"], slug: "aws-s3", category: "storage", name: "Amazon S3" },
    ],
  },
  { slug: "resend", category: "other", name: "Resend", aliases: ["resend"] },
  { slug: "sendgrid", category: "other", name: "SendGrid", aliases: ["sendgrid"] },
  { slug: "postmark", category: "other", name: "Postmark", aliases: ["postmark"] },
  { slug: "mailgun", category: "other", name: "Mailgun", aliases: ["mailgun"] },
  { slug: "twilio", category: "other", name: "Twilio", aliases: ["twilio"] },
  { slug: "slack", category: "other", name: "Slack", aliases: ["slack"] },
  { slug: "discord", category: "other", name: "Discord", aliases: ["discord"] },
  { slug: "algolia", category: "other", name: "Algolia", aliases: ["algolia"] },
  { slug: "meilisearch", category: "other", name: "Meilisearch", aliases: ["meilisearch"] },
  { slug: "firebase", category: "other", name: "Firebase", aliases: ["firebase"] },
  { slug: "rabbitmq", category: "other", name: "RabbitMQ", aliases: ["rabbitmq"] },
];

const BY_ALIAS = new Map<string, CatalogEntry>();
for (const entry of CATALOG) {
  for (const alias of entry.aliases) {
    BY_ALIAS.set(alias, entry);
  }
}

/** The catalog, exported so a test can hold it to its own invariants. */
export const CONFIG_KEY_CATALOG: readonly CatalogEntry[] = CATALOG;

/**
 * Splits a key name into lowercase word tokens. `OpenAi` -> [open, ai],
 * `ELEVEN_LABS_API_KEY` -> [eleven, labs, api, key], `XAI` -> [xai],
 * `AWSRegion` -> [aws, region].
 *
 * A digit-then-uppercase boundary splits too, which is what makes
 * `S3Client` and `S3Bucket` read as [s3, ...] rather than as one opaque
 * token. The cost is that a name which merely happens to contain that
 * boundary (`S3PO_DROID`) is read as an s3 key; the shape is rare enough,
 * and the win on real camelCase AWS keys frequent enough, that this is the
 * better trade.
 */
function tokenize(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

/** The whole key name, normalised the same way an alias is. */
function normalizeKey(name: string): string {
  return tokenize(name).join("");
}

/**
 * The alias spellings a key name could legitimately be, longest first:
 * whole-token prefixes of the name, capped at four tokens.
 *
 * Prefixes of whole tokens rather than substrings, because substring
 * matching is how `NOTIONAL_VALUE` becomes a Notion detection.
 * `SUPABASE_URL` yields "supabaseurl" and then "supabase"; the second one
 * matches, and nothing shorter than a whole token ever can.
 */
function matchCandidates(name: string): string[] {
  const tokens = tokenize(name);
  const candidates: string[] = [];
  for (let count = Math.min(tokens.length, 4); count >= 1; count -= 1) {
    candidates.push(tokens.slice(0, count).join(""));
  }
  return candidates;
}

function lookup(name: string): CatalogEntry | undefined {
  for (const candidate of matchCandidates(name)) {
    const entry = BY_ALIAS.get(candidate);
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

/** The catalog entry a hit resolves to, after any child-key refinement. */
function resolve(entry: CatalogEntry, childKeys: readonly string[]): Pick<CatalogEntry, "slug" | "category" | "name"> {
  const normalizedChildren = childKeys.map(normalizeKey);
  for (const rule of entry.refine ?? []) {
    if (rule.whenChildKey.some((wanted) => normalizedChildren.includes(wanted))) {
      return { slug: rule.slug, category: rule.category, name: rule.name };
    }
  }
  return { slug: entry.slug, category: entry.category, name: entry.name };
}

/**
 * The name half of a `NAME=value` environment assignment, or undefined when
 * the line is not one. The value half is never returned, never logged and
 * never inspected — only its position is used, to find where the name ends.
 */
function envAssignmentName(line: string): string | undefined {
  const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
  return match?.[1];
}

// --- file discovery --------------------------------------------------------

/**
 * Directories never descended into. `bin`/`obj` matter specifically for the
 * .NET case this detector exists to serve: a build copies appsettings*.json
 * into both, so without this the same settings file is "found" three times
 * under three paths and the evidence trail stops meaning anything.
 */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "bin",
  "obj",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vs",
  "TestResults",
]);

/**
 * Deepest directory descended into, with the repo root counting as 0. Four
 * because Clapline's own settings file — the case that motivated this
 * detector — sits at `src/backend/Sluglin.Api/appsettings.json`, and a
 * shallower bound would have missed the very thing being fixed.
 */
const MAX_DEPTH = 4;
/** Ceiling on files parsed, so a pathological tree cannot stall a scan. */
const MAX_FILES = 120;
/** Config files are small; anything past this is generated data, not settings. */
const MAX_FILE_BYTES = 512 * 1024;

type FileKind = "json" | "env" | "yaml";

/**
 * The kind of config file `name` is, or undefined if it is not one.
 * `dirName` is the name of the directory holding it, which is what makes a
 * plain `production.yml` interesting inside `config/` and uninteresting
 * anywhere else.
 *
 * A bare `.env` is never a match — see this module's header.
 */
function classify(name: string, dirName: string): FileKind | undefined {
  if (/^appsettings(\.[^.]+)*\.json$/i.test(name)) {
    return "json";
  }
  if (/^\.env\./i.test(name) && /\.(example|sample|template|defaults|dist)(\.[\w-]+)?$/i.test(name)) {
    return "env";
  }
  if (/^(docker-)?compose(\.[^.]+)*\.ya?ml$/i.test(name)) {
    return "yaml";
  }
  if (dirName.toLowerCase() === "config" && /\.ya?ml$/i.test(name)) {
    return "yaml";
  }
  return undefined;
}

interface FoundFile {
  /** Repo-relative, forward-slashed, so evidence reads the same on every platform. */
  relativePath: string;
  absolutePath: string;
  kind: FileKind;
}

async function findConfigFiles(repoPath: string): Promise<FoundFile[]> {
  const found: FoundFile[] = [];

  async function walk(absoluteDir: string, relativeDir: string, depth: number): Promise<void> {
    if (found.length >= MAX_FILES) {
      return;
    }
    let entries;
    try {
      entries = await readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }
    const dirName = relativeDir === "" ? "" : (relativeDir.split("/").pop() as string);

    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (found.length >= MAX_FILES) {
        return;
      }
      if (entry.isDirectory()) {
        if (depth >= MAX_DEPTH || SKIP_DIRS.has(entry.name)) {
          continue;
        }
        await walk(
          join(absoluteDir, entry.name),
          relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`,
          depth + 1
        );
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const kind = classify(entry.name, dirName);
      if (!kind) {
        continue;
      }
      found.push({
        relativePath: relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`,
        absolutePath: join(absoluteDir, entry.name),
        kind,
      });
    }
  }

  await walk(repoPath, "", 0);
  return found;
}

// --- key extraction --------------------------------------------------------

/** One key name found in a config file, with the names of its own immediate children. */
interface FoundKey {
  name: string;
  childKeys: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function childKeysOf(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

/**
 * How many nested levels of key names are collected. Four reaches
 * docker-compose's `services.<name>.environment.<VAR>`, which is the
 * deepest shape worth reading; past that a settings file is describing its
 * own data, not its providers.
 */
const MAX_KEY_DEPTH = 4;

/**
 * Every key name in a parsed JSON/YAML document, down to MAX_KEY_DEPTH
 * levels, plus the names in any `NAME=value` string list (docker-compose's
 * `environment:` list form). Only names are collected; a scalar value is
 * never looked at.
 */
function collectKeys(value: unknown, depth: number, into: FoundKey[]): void {
  if (depth > MAX_KEY_DEPTH) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        const name = envAssignmentName(item);
        if (name) {
          into.push({ name, childKeys: [] });
        }
        continue;
      }
      collectKeys(item, depth, into);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    into.push({ name: key, childKeys: childKeysOf(child) });
    collectKeys(child, depth + 1, into);
  }
}

function collectEnvNames(text: string): FoundKey[] {
  const keys: FoundKey[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith("#")) {
      continue;
    }
    const name = envAssignmentName(line);
    if (name) {
      keys.push({ name, childKeys: [] });
    }
  }
  return keys;
}

// --- the detector ----------------------------------------------------------

/**
 * Scans a repository for services named by configuration key names.
 * Read-only, and never reads a configuration value.
 *
 * Returns one entry per distinct catalog slug, with evidence naming every
 * file and key that proved it. Files that exist but cannot be parsed come
 * back as warnings rather than silence, so "no config-wired services" stays
 * distinguishable from "the settings file has a trailing comma".
 */
export async function detectConfigKeys(repoPath: string): Promise<ConfigKeyDetectionResult> {
  const files = await findConfigFiles(repoPath);
  const warnings: string[] = [];
  const bySlug = new Map<string, ConfigServiceDetection>();

  for (const file of files) {
    let size: number;
    try {
      size = (await stat(file.absolutePath)).size;
    } catch {
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      warnings.push(`${file.relativePath}: skipped, larger than ${MAX_FILE_BYTES} bytes`);
      continue;
    }

    let text: string;
    try {
      text = await readFile(file.absolutePath, "utf8");
    } catch {
      warnings.push(`${file.relativePath}: present but could not be read`);
      continue;
    }

    let keys: FoundKey[];
    if (file.kind === "env") {
      keys = collectEnvNames(text);
    } else {
      let parsed: unknown;
      try {
        parsed = file.kind === "json" ? (JSON.parse(text) as unknown) : (parseYaml(text) as unknown);
      } catch {
        const format = file.kind === "json" ? "JSON" : "YAML";
        warnings.push(`${file.relativePath}: present but could not be parsed as ${format}`);
        continue;
      }
      keys = [];
      collectKeys(parsed, 0, keys);
    }

    for (const key of keys) {
      const entry = lookup(key.name);
      if (!entry) {
        continue;
      }
      const resolved = resolve(entry, key.childKeys);
      const evidence: Evidence = { file: file.relativePath, detail: `config key: ${key.name}` };
      const existing = bySlug.get(resolved.slug);
      if (!existing) {
        bySlug.set(resolved.slug, { ...resolved, evidence: [evidence] });
        continue;
      }
      if (!existing.evidence.some((e) => e.file === evidence.file && e.detail === evidence.detail)) {
        existing.evidence.push(evidence);
      }
    }
  }

  const services = [...bySlug.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.slug.localeCompare(b.slug)
  );
  return { services, warnings };
}
