// The Dagstree service catalog: what a manifest's `service:` slug IS, for
// display. Keyed by Dagstree's own slug namespace, same as SPECFY_TO_DAGSTREE
// in mapping.ts -- but a different table answering a different question.
// mapping.ts is a *detection* mapping: given a raw @specfy/stack-analyser
// key, what Dagstree slug/category/kind does it become? This module never
// runs during detect() and carries no `kind` and no `category` -- it answers
// "given a slug already sitting in dagstree.yaml, what name and brand icon
// does the viewer show for it?", a question detection never has to answer
// and that a slug detection can never produce (an off-repo registrar someone
// named, a stack entry) still needs answered for.
//
// No `category` here, deliberately, and this is a design correction: an
// earlier version of this module carried one. A category is not a property
// of a vendor. Supabase is a database *and* auth *and* storage *and* a
// queue; AWS, Azure and Firebase are the same. Which one a given project is
// using it for depends on what that project does with it, and that is a
// per-project fact the client already states: `role`, a required field on
// every service entry in the manifest schema (see
// packages/schema/src/schema.ts), whose own doc note reads "The same
// catalog service can appear more than once under different roles/ids --
// e.g. supabase-db and supabase-auth both service: supabase." docs/PLAN.md
// settled that the viewer groups on the segment of `role` before the first
// "-". Grouping never needed a catalog category; carrying one here was only
// ever a second, weaker answer to a question `role` already answers.
// ServiceCategory (types.ts) remains exactly correct where it already lives
// -- mapping.ts and the config-key detectors -- because there it buckets
// *detection output* ("what sort of thing did I just find?"), a different
// question this module never asks.
//
// Every row's `name` comes from one of two places:
//
//  1. Derived from SPECFY_TO_DAGSTREE at module load (deriveBaseCatalog
//     below) -- not retyped, so the two tables cannot drift apart the way a
//     hand-copied second table would the first time someone edited one and
//     not the other. mapping.ts's own module doc comment carries the
//     provenance for every row this pulls from (spike-observed / HANDOFF /
//     verified against the installed @specfy/stack-analyser rule files);
//     nothing here re-justifies what that file already justifies.
//
//  2. EXTRA_ROWS below, by hand, for the slugs mapping.ts structurally
//     cannot cover -- see that constant's own doc comment.
//
// A slug's icon, when present, is a third and separate layer (ICON_OVERLAY)
// applied on top of both: see that constant's doc comment for what "present"
// is required to mean.
import { SPECFY_TO_DAGSTREE } from "./mapping.js";
import type { MappingEntry } from "./mapping.js";

/**
 * One row of the display catalog for a Dagstree slug -- what a manifest's
 * `service:` (or `component:`/`stack:`) field holds.
 *
 * Deliberately has no `category` and no `kind`.
 *
 * No `category`: see this module's top comment -- `role`, a per-project
 * fact on the manifest entry itself, already answers what category question
 * a viewer would otherwise ask this table, and a vendor doesn't have one
 * true category to give back.
 *
 * No `kind`: MappingEntry.kind ("service" vs "library") is a *detection*
 * concept -- whether a raw stack-analyser hit earns a node at all. A
 * CatalogEntry only ever exists for a slug that already earned one -- the
 * manifest entry itself carries the authoritative `kind` (`service` |
 * `component` | `stack`, see @dagstree/schema and
 * examples/reference.dagstree.yaml), set by whoever wrote that entry, not
 * re-derived here. Re-adding a kind field to this table would let two
 * different `kind`s exist for the same slug and disagree with each other.
 */
export interface CatalogEntry {
  /** Dagstree catalog slug — what a manifest's `service:` field holds. */
  slug: string;
  /** Human-facing display name, e.g. "Fly.io". */
  name: string;
  /** simple-icons slug, present only when verified to exist. */
  icon?: string;
}

/**
 * Collapses a specfySlug -> MappingEntry table (many-to-one onto dagstree
 * slug) into one display `name` per dagstree slug.
 *
 * Takes the mapping table as a parameter rather than closing over the
 * SPECFY_TO_DAGSTREE import so a test can construct a conflicting input
 * directly and self-contained, without mutating mapping.ts to manufacture a
 * disagreement.
 *
 * The collapse is a no-op for the overwhelming majority of slugs: only two
 * dagstree slugs today are targeted by more than one specfy key ("vue" and
 * "supabase"). "vue" agrees (both keys say "Vue.js"). "supabase" disagrees
 * on name across its six specfy keys, because each key is a *per-role
 * signal* ("supabase.auth" proves auth, not "this project uses Supabase for
 * X"), not a claim about what the one catalog row for "supabase" should say.
 *
 * The resolution rule is explicit and total, in this order:
 *
 *  1. If every row collapsing onto the slug agrees on `name`, use it.
 *  2. Else, if exactly one of the specfy keys collapsing onto the slug is
 *     literally equal to the dagstree slug, that row's name wins -- a bare
 *     key is the vendor's own generic row, not a per-role sub-detection, so
 *     it is the one entitled to speak for the slug as a whole. (This is how
 *     "supabase" resolves: the bare `supabase` specfy key gives "Supabase".)
 *  3. Else, throw. There is no fallback rule, and there must not be one: an
 *     earlier version of this function fell through to whichever entry
 *     Object.entries() happened to visit first for an unresolved
 *     disagreement, which is nothing but mapping.ts's own declaration
 *     order -- adversarial testing proved this by adding two probe keys and
 *     swapping their order, which swapped the resulting row. An
 *     unresolvable disagreement has no safe silent answer; it must fail
 *     loudly, naming the slug and the competing names, and force a fix in
 *     mapping.ts (add a bare key, or align the names) rather than a widened
 *     allow-list here.
 */
export function deriveBaseCatalog(mapping: Record<string, MappingEntry>): Record<string, { name: string }> {
  const rowsBySlug = new Map<string, { name: string; specfyKey: string }[]>();
  for (const [specfyKey, entry] of Object.entries(mapping)) {
    const rows = rowsBySlug.get(entry.slug);
    if (rows) {
      rows.push({ name: entry.name, specfyKey });
    } else {
      rowsBySlug.set(entry.slug, [{ name: entry.name, specfyKey }]);
    }
  }

  const derived: Record<string, { name: string }> = {};
  for (const [slug, rows] of rowsBySlug) {
    let agreedName: string | undefined;
    let disagrees = false;
    for (const row of rows) {
      if (agreedName === undefined) {
        agreedName = row.name;
      } else if (row.name !== agreedName) {
        disagrees = true;
      }
    }
    if (agreedName !== undefined && !disagrees) {
      derived[slug] = { name: agreedName };
      continue;
    }

    const bareKeyRow = rows.find((row) => row.specfyKey === slug);
    if (bareKeyRow) {
      derived[slug] = { name: bareKeyRow.name };
      continue;
    }

    const competing = rows.map((row) => `${row.specfyKey} -> "${row.name}"`).join(", ");
    throw new Error(
      `deriveBaseCatalog: dagstree slug "${slug}" has disagreeing names with no bare "${slug}" specfy key to resolve it: ${competing}`
    );
  }
  return derived;
}

/**
 * Rows for slugs a manifest legitimately uses that detect() structurally
 * cannot ever produce: off-repo services a person named (no scan finds a
 * domain registrar or a Trello board) and `kind: stack`/`kind: component`
 * entries no @specfy/stack-analyser rule or Dagstree detector emits.
 *
 * Sourced from examples/reference.dagstree.yaml, the repo's own evidence of
 * what a real manifest's open vocabulary looks like -- every slug below
 * appears there under a `service:` key with no row anywhere else in this
 * package. Each row's slug is independently justified by that actual
 * manifest use (see the trailing comment on each) rather than a guess at
 * what might someday appear.
 */
const EXTRA_ROWS: CatalogEntry[] = [
  // .NET the runtime/platform, not a specific language row (csharp already
  // covers the language) or framework row (aspnet already covers that) --
  // reference.dagstree.yaml uses it as `kind: stack, role: runtime-backend`.
  { slug: "dotnet", name: ".NET" },
  // reference.dagstree.yaml uses this as `kind: component, role: telemetry-transport`.
  { slug: "opentelemetry", name: "OpenTelemetry" },
  // A domain registrar -- reference.dagstree.yaml uses this exact slug with
  // `role: dns, notes: "apex domain and DNS records"`.
  { slug: "namecheap", name: "Namecheap" },
  // Kanban/project-management tool, `role: pm` in reference.dagstree.yaml.
  { slug: "trello", name: "Trello" },
  // Detected today only as a raw provider string by the CI detector
  // (detectCi in detectors/vcs.ts returns provider: "github-actions" with no
  // name attached) -- never through SPECFY_TO_DAGSTREE, so it has no catalog
  // row from deriveBaseCatalog above despite being real, detectable, and
  // present in reference.dagstree.yaml (`role: ci`).
  { slug: "github-actions", name: "GitHub Actions" },
  // Coding agents, added 2026-08-24 alongside the amendment that removed
  // project.coding_agents: a coding agent is now a service entry (`role:
  // coding-agent`), so it needs a display row like any other vendor. Never
  // through SPECFY_TO_DAGSTREE either -- coding agents are a Dagstree-
  // specific detector (detectors/coding-agents.ts), not a stack-analyser
  // technology, so they have no MappingEntry to derive from. The four slugs
  // below are exactly detectCodingAgents' MARKERS table (agent-code.ts) --
  // adding a fifth here with no matching detector row would be a display
  // entry for something detect() can never actually find.
  { slug: "claude-code", name: "Claude Code" },
  // No icon: simple-icons@16.28.0 carries neither "codex" nor "openai" (the
  // latter was removed under trademark pressure -- see ICON_OVERLAY's own
  // comment). Confirmed against the installed package, not recalled --
  // falls back to the viewer's generic icon, which is the correct outcome,
  // not a gap to fill in later.
  { slug: "codex", name: "Codex" },
  { slug: "cursor", name: "Cursor" },
  { slug: "github-copilot", name: "GitHub Copilot" },
];

/**
 * slug -> simple-icons slug. Present only for a slug whose brand mark was
 * read out of the installed `simple-icons` package (v16.28.0) and confirmed
 * to be that exact brand -- never recalled or inferred from the catalog
 * name. Verification method: simple-icons' own icons.json data
 * (`simple-icons/icons.json`, the package's public subpath export) was
 * loaded and matched against every catalog row's `name` and `slug`,
 * normalised the same way simple-icons normalises a title into a slug
 * (`+`->"plus", `#`->"sharp", `.`->"dot", `&`->"and", strip the rest) to
 * avoid a naive-normalise collision -- an earlier pass of this exact match
 * folded "C", "C++" and "C#" onto the same normalised key and silently
 * picked whichever one the Map saw last, which is precisely the defect this
 * whole table exists to prevent. Every candidate match was then read back
 * against the source data by hand before being written below; a match
 * found only by a looser signal (a bare substring, a shared word) was
 * rejected rather than included. catalog.test.ts re-derives this same
 * icons.json data at test time and asserts every slug below still resolves
 * to a real, installed simple-icons entry.
 *
 * A handful of rows below carry a simple-icons `title` that reads
 * differently from this catalog's `name` -- each was individually confirmed
 * to be the same brand (a company name for its flagship/sole product, a
 * version-name shorthand, or a specfy-key naming convention), not a
 * near-match:
 *   - postgresql: catalog name "Postgres", icon title "PostgreSQL" -- same DB.
 *   - supabase: name here is "Supabase" (see deriveBaseCatalog's comment);
 *     icon title "Supabase" -- exact.
 *   - google-gemini: catalog name "Gemini AI", icon title "Google Gemini".
 *   - mcp: catalog name "MCP SDK", icon title "Model Context Protocol" --
 *     the icon's own aliases.aka lists "MCP", confirming the SDK the
 *     mapping.ts row detects and the protocol simple-icons drew a mark for
 *     are the same thing.
 *   - nuxtjs: catalog name "Nuxt.js", icon title "Nuxt" -- the project's own
 *     rebrand; the icon's aliases.aka lists "Nuxt.js".
 *   - emberjs: catalog name "Ember", icon title "Ember.js" -- same framework.
 *   - cockroachdb: catalog name "CockroachDB", icon title "Cockroach Labs" --
 *     the company's sole product is the database of the same name.
 *   - rails: catalog name "Rails", icon title "Ruby on Rails" -- same
 *     framework, common shorthand.
 *   - yii2: catalog name "Yii2", icon slug "yii" -- Yii2 is a version of
 *     the Yii framework, same mark.
 *   - expojs/hexojs: specfy's "*js" key-naming convention over the plain
 *     brand names "Expo" and "Hexo" simple-icons uses.
 *   - cordova: catalog name "Cordova", icon title "Apache Cordova".
 *   - solidjs: catalog name "SolidJS", icon title "Solid" -- confirmed via
 *     the icon's own `source` field pointing at solidjs.com, not guessed
 *     from the name alone.
 *
 * Rows deliberately left without an icon despite a same-ish-named simple-
 * icons entry existing, because that entry is a *parent* or unrelated brand
 * rather than the thing this slug names:
 *   - tanstackstart: only "TanStack" (slug tanstack) exists -- the
 *     multi-project umbrella (Router/Query/Table/Start/Form), not a mark
 *     for Start specifically.
 *   - gitlab-ci: only "GitLab" (slug gitlab) exists -- CI is a feature of
 *     GitLab, not a separately-marked product; using it here would collide
 *     with the same icon already used for the separate "gitlab" catalog row.
 *   - mkdocs: only "Material for MkDocs" (slug materialformkdocs) exists --
 *     a third-party theme, a different thing from MkDocs itself.
 *   - upstash-redis: only "Upstash" (slug upstash) exists -- the company
 *     mark spans a multi-product line (Redis/Kafka/QStash/Vector), not a
 *     mark for Redis specifically.
 *   - xai: the only close string match is "X" (slug x, the ex-Twitter
 *     mark) -- an unrelated company, not xAI.
 *
 * And rows confirmed genuinely absent from the installed package entirely
 * (not even a near-match) rather than merely unmatched by the normaliser:
 * every aws-* and azure-* row, openai (only "OpenAI Gym" exists -- a
 * retired, unrelated product), codex (no entry at all, bare or near-match --
 * checked 2026-08-24 alongside the coding-agent rows below), csharp, aspnet,
 * java, cobol, matlab, objectivec, visualbasicnet, and a long tail of
 * smaller frameworks. See this slice's implementation report for the full
 * list checked.
 */
const ICON_OVERLAY: Record<string, string> = {
  ada: "ada",
  alpinejs: "alpinedotjs",
  angular: "angular",
  anthropic: "anthropic",
  astro: "astro",
  auth0: "auth0",
  bitbucket: "bitbucket",
  bun: "bun",
  c: "c",
  capacitorjs: "capacitor",
  circleci: "circleci",
  "claude-code": "claudecode",
  clerk: "clerk",
  clojure: "clojure",
  cloudflare: "cloudflare",
  "cloudflare-workers": "cloudflareworkers",
  cockroachdb: "cockroachlabs",
  coffeescript: "coffeescript",
  cordova: "apachecordova",
  cpp: "cplusplus",
  cursor: "cursor",
  dart: "dart",
  datadog: "datadog",
  digitalocean: "digitalocean",
  django: "django",
  docsify: "docsify",
  docusaurus: "docusaurus",
  dotnet: "dotnet",
  elasticsearch: "elasticsearch",
  electron: "electron",
  elevenlabs: "elevenlabs",
  eleventy: "eleventy",
  elixir: "elixir",
  emberjs: "emberdotjs",
  expojs: "expo",
  fastly: "fastly",
  "fly-io": "flydotio",
  gatsby: "gatsby",
  github: "github",
  "github-actions": "githubactions",
  "github-copilot": "githubcopilot",
  gitlab: "gitlab",
  "google-analytics": "googleanalytics",
  "google-cloud-storage": "googlecloudstorage",
  "google-gemini": "googlegemini",
  gridsome: "gridsome",
  haskell: "haskell",
  hexojs: "hexo",
  htmx: "htmx",
  "hugging-face": "huggingface",
  hugo: "hugo",
  ionic: "ionic",
  javascript: "javascript",
  jekyll: "jekyll",
  jenkins: "jenkins",
  kotlin: "kotlin",
  laravel: "laravel",
  "lemon-squeezy": "lemonsqueezy",
  litjs: "lit",
  lua: "lua",
  "lucide-icons": "lucide",
  mailgun: "mailgun",
  mcp: "modelcontextprotocol",
  meteorjs: "meteor",
  mintlify: "mintlify",
  "mistral-ai": "mistralai",
  mixpanel: "mixpanel",
  mongodb: "mongodb",
  mysql: "mysql",
  namecheap: "namecheap",
  neon: "neon",
  nestjs: "nestjs",
  netlify: "netlify",
  "new-relic": "newrelic",
  nextjs: "nextdotjs",
  nginx: "nginx",
  nuxtjs: "nuxt",
  okta: "okta",
  opentelemetry: "opentelemetry",
  paddle: "paddle",
  paypal: "paypal",
  perl: "perl",
  perplexity: "perplexity",
  planetscale: "planetscale",
  postgresql: "postgresql",
  posthog: "posthog",
  preactjs: "preact",
  qwikjs: "qwik",
  r: "r",
  rabbitmq: "rabbitmq",
  rails: "rubyonrails",
  railway: "railway",
  react: "react",
  readthedocs: "readthedocs",
  redis: "redis",
  redwoodjs: "redwoodjs",
  remixrun: "remix",
  render: "render",
  replicate: "replicate",
  resend: "resend",
  scala: "scala",
  sentry: "sentry",
  solidjs: "solid",
  sqlite: "sqlite",
  stenciljs: "stencil",
  stripe: "stripe",
  supabase: "supabase",
  sveltejs: "svelte",
  swift: "swift",
  symfony: "symfony",
  tauri: "tauri",
  "travis-ci": "travisci",
  trello: "trello",
  typescript: "typescript",
  vercel: "vercel",
  vitepress: "vitepress",
  vue: "vuedotjs",
  yii2: "yii",
};

/**
 * Exported only for catalog.test.ts, so it can assert every key here landed
 * a row in DAGSTREE_CATALOG (see the build IIFE below) without duplicating
 * this table or re-deriving it from the built catalog, which could not tell
 * "landed" from "never tried". Not part of this package's public API surface
 * -- packages/core/src/index.ts does not re-export it.
 */
export { ICON_OVERLAY };

/**
 * The full Dagstree service catalog, keyed by dagstree slug: the derived
 * base (deriveBaseCatalog), overlaid with EXTRA_ROWS, overlaid with an
 * `icon` wherever ICON_OVERLAY has one. Built once at module load.
 *
 * Built on a null-prototype record (Object.create(null)), not a plain `{}`
 * object literal. A plain object's lookups fall through to Object.prototype
 * for any key it doesn't own -- `catalog["constructor"]` on a `{}` resolves
 * to the `Object` constructor function, which is truthy, so a caller
 * checking `if (catalog[slug])` would treat "constructor" as a known
 * service. That is not hypothetical here: the schema's slug pattern
 * (`^[a-z0-9]+(?:[_-][a-z0-9]+)*$`) admits "constructor" as a valid
 * `service:` value, and it was demonstrated end to end -- a manifest naming
 * `service: constructor` validated against the real built CLI, exit 0. A
 * null-prototype record has no Object.prototype in its chain at all, so
 * every one of those keys (constructor, toString, __proto__, valueOf,
 * hasOwnProperty, ...) is simply absent, same as any other slug nobody has
 * catalogued.
 */
export const DAGSTREE_CATALOG: Record<string, CatalogEntry> = (() => {
  const catalog: Record<string, CatalogEntry> = Object.create(null) as Record<string, CatalogEntry>;
  for (const [slug, base] of Object.entries(deriveBaseCatalog(SPECFY_TO_DAGSTREE))) {
    catalog[slug] = { slug, name: base.name };
  }
  for (const row of EXTRA_ROWS) {
    catalog[row.slug] = { ...row };
  }
  for (const [slug, icon] of Object.entries(ICON_OVERLAY)) {
    if (catalog[slug]) {
      catalog[slug] = { ...catalog[slug], icon };
    }
  }
  return catalog;
})();

/**
 * Looks up a Dagstree slug's catalog entry. Returns undefined for a slug
 * with no row -- not a synthesised placeholder -- because a manifest's
 * `service:` field is open vocabulary (@dagstree/schema accepts any slug
 * matching its pattern) and the viewer must already render an unknown slug
 * with a generic fallback rather than a fabricated name.
 *
 * A plain property read (`DAGSTREE_CATALOG[slug]`), not `catalog[slug] ??
 * undefined` or similar -- safe against Object.prototype keys precisely
 * because DAGSTREE_CATALOG itself is null-prototype (see its own doc
 * comment); there is nothing here to fix, the fix lives in how the table
 * was built.
 */
export function getCatalogEntry(slug: string): CatalogEntry | undefined {
  return DAGSTREE_CATALOG[slug];
}
