import type { DetectionKind, ServiceCategory } from "./types.js";

export interface MappingEntry {
  /** Catalogus catalog slug — Catalogus's own namespace, not stack-analyser's. */
  slug: string;
  category: ServiceCategory;
  name: string;
  /**
   * "service" for something with an owner-facing identity — it can have an
   * outage, it can send an invoice — versus "library" for code the project
   * imports or a tool a developer runs locally. Set explicitly here rather
   * than derived, because a handful of catalog-worthy rows are libraries
   * despite being worth their own row (`mcp`, `lucideicons`), and at least
   * one (`gitlab`) is a service despite stack-analyser filing its own
   * `type` under "tool" — see classifyDetectionKind's own doc comment for
   * why the derived default would have gotten that one wrong.
   */
  kind: DetectionKind;
}

/**
 * specfySlug -> Catalogus catalog entry.
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
 * Rows marked "verified" are a third tier, added later than the first two:
 * real services the spike's five repos never happened to use and HANDOFF.md
 * never named, but that plainly belong in the table on the same "is this
 * actually a service" test the plan applies everywhere else — a database, an
 * auth provider, a payments processor, an email sender, someone's hosting
 * account. Each one is cited against the exact rule source file in
 * @specfy/stack-analyser (`rules/<type>/<file>.js`) confirming its tech key,
 * display name and type, the same verification "HANDOFF" rows already
 * require — the only difference is what justifies including it: not a live
 * spike hit or literal HANDOFF prose, but the category breadth the plan
 * itself asks for (hosting, db, auth, payments, email, analytics,
 * monitoring, storage, queue, CDN, CI, VCS, AI providers). Nothing here was
 * typed from memory; every tech key was read out of the installed package.
 *
 * This table only covers slugs worth cataloging as a service/provider.
 * Everything else stack-analyser detects (languages, frameworks, build
 * tools) still comes back from detect() as an `unmapped: true` pass-through
 * — see mapSpecfySlug — rather than being silently dropped.
 */
export const SPECFY_TO_CATALOGUS: Record<string, MappingEntry> = {
  // --- hosting ---------------------------------------------------------
  flyio: { slug: "fly-io", category: "hosting", name: "Fly.io", kind: "service" }, // observed: Clapline fly.toml
  vercel: { slug: "vercel", category: "hosting", name: "Vercel", kind: "service" }, // HANDOFF §6
  netlify: { slug: "netlify", category: "hosting", name: "Netlify", kind: "service" }, // HANDOFF §6
  render: { slug: "render", category: "hosting", name: "Render", kind: "service" }, // HANDOFF §6
  cloudflare: { slug: "cloudflare", category: "hosting", name: "Cloudflare", kind: "service" }, // observed: Pomegr @cloudflare/*
  "cloudflare.workers": {
    slug: "cloudflare-workers",
    category: "hosting",
    name: "Cloudflare Workers",
    kind: "service",
  }, // observed: Pomegr wrangler dep + wrangler.toml
  railway: { slug: "railway", category: "hosting", name: "Railway", kind: "service" }, // verified: rules/cloud/railway.js
  heroku: { slug: "heroku", category: "hosting", name: "Heroku", kind: "service" }, // verified: rules/cloud/heroku.js
  digitalocean: { slug: "digitalocean", category: "hosting", name: "DigitalOcean", kind: "service" }, // verified: rules/hosting/digitalocean.js
  "aws.lambda": { slug: "aws-lambda", category: "hosting", name: "AWS Lambda", kind: "service" }, // verified: rules/hosting/aws.lambda.js
  "aws.ec2": { slug: "aws-ec2", category: "hosting", name: "AWS EC2", kind: "service" }, // verified: rules/hosting/aws.ec2.js
  fastly: { slug: "fastly", category: "hosting", name: "Fastly", kind: "service" }, // verified: rules/hosting/fastly.js

  // --- db ----------------------------------------------------------------
  postgresql: { slug: "postgresql", category: "db", name: "Postgres", kind: "service" },
  "vercel.postgres": { slug: "vercel-postgres", category: "db", name: "Vercel Postgres", kind: "service" },
  "supabase.postgres": { slug: "supabase", category: "db", name: "Supabase Postgres", kind: "service" },
  mongodb: { slug: "mongodb", category: "db", name: "MongoDB", kind: "service" }, // verified: rules/db/mongodb.js
  redis: { slug: "redis", category: "db", name: "Redis", kind: "service" }, // verified: rules/db/redis.js
  mysql: { slug: "mysql", category: "db", name: "MySQL", kind: "service" }, // verified: rules/db/mysql.js
  mssql: { slug: "sql-server", category: "db", name: "SQL Server", kind: "service" }, // verified: rules/db/mssql.js
  sqlite: { slug: "sqlite", category: "db", name: "SQLite", kind: "service" }, // verified: rules/db/sqlite.js
  planetscale: { slug: "planetscale", category: "db", name: "PlanetScale", kind: "service" }, // verified: rules/db/planetscale.js
  neondb: { slug: "neon", category: "db", name: "Neon", kind: "service" }, // verified: rules/db/neondb.js
  cockroachdb: { slug: "cockroachdb", category: "db", name: "CockroachDB", kind: "service" }, // verified: rules/db/cockroachdb.js
  elasticsearch: { slug: "elasticsearch", category: "db", name: "Elasticsearch", kind: "service" }, // verified: rules/db/elasticsearch.js
  pinecone: { slug: "pinecone", category: "db", name: "Pinecone", kind: "service" }, // verified: rules/db/pinecone.js
  "upstash.redis": { slug: "upstash-redis", category: "db", name: "Upstash Redis", kind: "service" }, // verified: rules/db/upstash.redis.js

  // --- auth ----------------------------------------------------------------
  "supabase.auth": { slug: "supabase", category: "auth", name: "Supabase Auth", kind: "service" },
  auth0: { slug: "auth0", category: "auth", name: "Auth0", kind: "service" }, // verified: rules/auth/auth0.js
  clerk: { slug: "clerk", category: "auth", name: "Clerk", kind: "service" }, // verified: rules/auth/clerk.js
  workos: { slug: "workos", category: "auth", name: "WorkOS", kind: "service" }, // verified: rules/auth/workos.js
  okta: { slug: "okta", category: "auth", name: "Okta", kind: "service" }, // verified: rules/auth/okta.js
  "aws.cognito": { slug: "aws-cognito", category: "auth", name: "AWS Cognito", kind: "service" }, // verified: rules/auth/aws.cognito.js

  // --- storage ---------------------------------------------------------
  "supabase.storage": { slug: "supabase", category: "storage", name: "Supabase Storage", kind: "service" },
  "aws.cloudfront": { slug: "aws-cloudfront", category: "storage", name: "AWS CloudFront", kind: "service" }, // verified: rules/storage/aws.cloudfront.js
  "aws.s3": { slug: "aws-s3", category: "storage", name: "AWS S3", kind: "service" }, // verified: rules/storage/aws.s3.js
  "cloudflare.r2": { slug: "cloudflare-r2", category: "storage", name: "Cloudflare R2", kind: "service" }, // verified: rules/storage/cloudflare.r2.js
  "gcp.gcs": { slug: "google-cloud-storage", category: "storage", name: "Google Cloud Storage", kind: "service" }, // verified: rules/storage/gcp.gcs.js
  "azure.storage": { slug: "azure-storage", category: "storage", name: "Azure Storage", kind: "service" }, // verified: rules/storage/azure.storage.js

  // --- supabase, generic (role not distinguishable from this signal alone)
  supabase: { slug: "supabase", category: "other", name: "Supabase", kind: "service" }, // observed: fixpic @supabase/* dep, SUPABASE_ env
  "supabase.functions": {
    slug: "supabase",
    category: "hosting",
    name: "Supabase Functions",
    kind: "service",
  },
  // Realtime is a message channel, not a database read -- the enum gained a
  // `queue` bucket on 2026-08-23 and this is what it is for.
  "supabase.realtime": { slug: "supabase", category: "queue", name: "Supabase Realtime", kind: "service" },

  // --- ai ------------------------------------------------------------------
  anthropic: { slug: "anthropic", category: "ai", name: "Anthropic", kind: "service" }, // HANDOFF §5 example
  openai: { slug: "openai", category: "ai", name: "OpenAI", kind: "service" },
  geminiai: { slug: "google-gemini", category: "ai", name: "Gemini AI", kind: "service" }, // observed: fixpic @google/genai dep
  "gcp.vertex": { slug: "google-vertex-ai", category: "ai", name: "Vertex AI", kind: "service" }, // HANDOFF §5 example
  mistralai: { slug: "mistral-ai", category: "ai", name: "Mistral AI", kind: "service" }, // verified: rules/ai/mistralai.js
  cohereai: { slug: "cohere", category: "ai", name: "Cohere", kind: "service" }, // verified: rules/ai/cohere.js
  groq: { slug: "groq", category: "ai", name: "Groq", kind: "service" }, // verified: rules/ai/groq.js
  perplexityai: { slug: "perplexity", category: "ai", name: "Perplexity", kind: "service" }, // verified: rules/ai/perplexityai.js
  replicate: { slug: "replicate", category: "ai", name: "Replicate", kind: "service" }, // verified: rules/ai/replicate.js
  huggingface: { slug: "hugging-face", category: "ai", name: "Hugging Face", kind: "service" }, // verified: rules/ai/huggingface.js
  elevenlabs: { slug: "elevenlabs", category: "ai", name: "ElevenLabs", kind: "service" }, // verified: rules/ai/elevenlabs.js
  xai: { slug: "xai", category: "ai", name: "xAI", kind: "service" }, // verified: rules/ai/xai.js

  // --- payments --------------------------------------------------------
  stripe: { slug: "stripe", category: "payments", name: "Stripe", kind: "service" },
  paypal: { slug: "paypal", category: "payments", name: "PayPal", kind: "service" }, // verified: rules/payment/paypal.js
  paddle: { slug: "paddle", category: "payments", name: "Paddle", kind: "service" }, // verified: rules/payment/paddle.js
  lemonsqueezy: { slug: "lemon-squeezy", category: "payments", name: "Lemon Squeezy", kind: "service" }, // verified: rules/payment/lemonsqueezy.js
  chargebee: { slug: "chargebee", category: "payments", name: "Chargebee", kind: "service" }, // verified: rules/payment/chargebee.js

  // --- vcs / ci --------------------------------------------------------
  github: { slug: "github", category: "vcs", name: "GitHub", kind: "service" }, // observed: Clapline & Pomegr .github/
  gitlab: { slug: "gitlab", category: "vcs", name: "GitLab", kind: "service" },
  "atlassian.bitbucket": { slug: "bitbucket", category: "vcs", name: "Bitbucket", kind: "service" }, // verified: rules/saas/atlassian.bitbucket.js
  "gitlab.ci": { slug: "gitlab-ci", category: "ci", name: "GitLab CI", kind: "service" },
  circleci: { slug: "circleci", category: "ci", name: "CircleCI", kind: "service" }, // verified: rules/ci/circleci.js
  travisci: { slug: "travis-ci", category: "ci", name: "Travis CI", kind: "service" }, // verified: rules/ci/travisci.js
  jenkins: { slug: "jenkins", category: "ci", name: "Jenkins", kind: "service" }, // verified: rules/ci/jenkins.js

  // --- analytics ---------------------------------------------------------
  "google.analytics": { slug: "google-analytics", category: "analytics", name: "Google Analytics", kind: "service" }, // verified: rules/analytics/google.analytics.js
  posthog: { slug: "posthog", category: "analytics", name: "PostHog", kind: "service" }, // verified: rules/analytics/posthog.js
  mixpanel: { slug: "mixpanel", category: "analytics", name: "Mixpanel", kind: "service" }, // verified: rules/analytics/mixpanel.js
  segment: { slug: "segment", category: "analytics", name: "Segment", kind: "service" }, // verified: rules/analytics/segment.js
  amplitude: { slug: "amplitude", category: "analytics", name: "Amplitude", kind: "service" }, // verified: rules/analytics/amplitude.js

  // --- other (real services with no matching Catalogus category) --------
  nginx: { slug: "nginx", category: "other", name: "Nginx", kind: "component" }, // observed: Clapline ops/nginx.conf -- serves the SPA and reverse-proxies; no account, no invoice
  lucideicons: { slug: "lucide-icons", category: "other", name: "Lucide Icons", kind: "library" }, // observed: fixpic
  mcp: { slug: "mcp", category: "other", name: "MCP SDK", kind: "library" }, // Model Context Protocol SDK dependency

  // --- monitoring ----------------------------------------------------------
  // Observability that exists to tell you the system is broken, as opposed
  // to `analytics`, which tells you how it is being used. Every row here was
  // in "other" until HANDOFF §4's enum was widened on 2026-08-23; they are
  // services by that document's own test -- an error tracker or an uptime
  // check can go down and send an invoice just as much as a database can.
  sentry: { slug: "sentry", category: "monitoring", name: "Sentry", kind: "service" }, // verified: rules/monitoring/sentry.js
  datadog: { slug: "datadog", category: "monitoring", name: "Datadog", kind: "service" }, // verified: rules/monitoring/datadog.js
  newrelic: { slug: "new-relic", category: "monitoring", name: "New Relic", kind: "service" }, // verified: rules/monitoring/newrelic.js

  // --- queue ---------------------------------------------------------------
  "aws.sqs": { slug: "aws-sqs", category: "queue", name: "AWS SQS", kind: "service" }, // verified: rules/queue/aws.sqs.js
  rabbitmq: { slug: "rabbitmq", category: "queue", name: "RabbitMQ", kind: "service" }, // verified: rules/queue/rabbitmq.js

  // --- messaging -----------------------------------------------------------
  // Transactional email, SMS and voice, plus the chat platform a project
  // posts alerts into. `messaging` rather than `email` because Twilio is SMS
  // and voice and Slack is neither -- a bucket that cannot hold them would
  // have left the same gap one row further along. Kept identical to
  // detectors/config-keys.ts's rows for the same slugs: the same service
  // arriving under a different category depending on which detector found it
  // is a bug this widening was partly done to close.
  slack: { slug: "slack", category: "messaging", name: "Slack", kind: "service" }, // observed: Clapline SLACK_ env
  resend: { slug: "resend", category: "messaging", name: "Resend", kind: "service" }, // verified: rules/notification/resend.js
  sendgrid: { slug: "sendgrid", category: "messaging", name: "SendGrid", kind: "service" }, // verified: rules/notification/sendgrid.js
  mailgun: { slug: "mailgun", category: "messaging", name: "Mailgun", kind: "service" }, // verified: rules/notification/mailgun.js
  twilio: { slug: "twilio", category: "messaging", name: "Twilio", kind: "service" }, // verified: rules/notification/twilio.js

  // --- stack ---------------------------------------------------------------
  // Languages, frameworks and runtimes: what the code is written in, as
  // opposed to what it talks to. These were deliberately absent until
  // 2026-08-23 -- the rule was that a language "belongs in the architecture
  // description, if anywhere" -- and that was wrong twice over. It put the
  // stack in free text where nothing can render a tile or key an
  // end-of-life date off it, and it conflated two different questions:
  // `architecture` is the shape (modular monolith, vertical slices), which
  // is not the stack. A runtime reaching EOL is the same impact-analysis
  // question a vendor sunset is, so these are nodes, attached by an edge to
  // whatever runs them (`[fly-api, dotnet]`).
  //
  // Curated, not exhaustive: every row below was read out of the installed
  // @specfy/stack-analyser and cites its rule file, same discipline as the
  // service rows above. css, scss, jsx, glsl and bash are deliberately
  // omitted -- they are markers inside a stack, not a choice of one. Note
  // stack-analyser has no rule for Python, Go, Ruby, PHP or Node itself in
  // 1.27.6, so those reach a manifest only through a manual `catalogus add`.

  // languages
  ada: { slug: "ada", category: "stack", name: "Ada", kind: "stack" }, // verified: rules/language/ada.js
  aspnet: { slug: "aspnet", category: "stack", name: "ASP.NET", kind: "stack" }, // verified: rules/language/aspnet.js
  c: { slug: "c", category: "stack", name: "C", kind: "stack" }, // verified: rules/language/c.js
  clojure: { slug: "clojure", category: "stack", name: "Clojure", kind: "stack" }, // verified: rules/language/clojure.js
  cobol: { slug: "cobol", category: "stack", name: "COBOL", kind: "stack" }, // verified: rules/language/cobol.js
  coffeescript: { slug: "coffeescript", category: "stack", name: "CoffeeScript", kind: "stack" }, // verified: rules/language/coffeescript.js
  cplusplus: { slug: "cpp", category: "stack", name: "C++", kind: "stack" }, // verified: rules/language/cplusplus.js
  csharp: { slug: "csharp", category: "stack", name: "C#", kind: "stack" }, // verified: rules/language/csharp.js
  dart: { slug: "dart", category: "stack", name: "Dart", kind: "stack" }, // verified: rules/language/dart.js
  elixir: { slug: "elixir", category: "stack", name: "Elixir", kind: "stack" }, // verified: rules/language/elixir.js
  haskell: { slug: "haskell", category: "stack", name: "Haskell", kind: "stack" }, // verified: rules/language/haskell.js
  java: { slug: "java", category: "stack", name: "Java", kind: "stack" }, // verified: rules/language/java.js
  javascript: { slug: "javascript", category: "stack", name: "JavaScript", kind: "stack" }, // verified: rules/language/javascript.js
  kotlin: { slug: "kotlin", category: "stack", name: "Kotlin", kind: "stack" }, // verified: rules/language/kotlin.js
  lua: { slug: "lua", category: "stack", name: "Lua", kind: "stack" }, // verified: rules/language/lua.js
  matlab: { slug: "matlab", category: "stack", name: "MATLAB", kind: "stack" }, // verified: rules/language/matlab.js
  objectivec: { slug: "objectivec", category: "stack", name: "Objective-C", kind: "stack" }, // verified: rules/language/objectivec.js
  perl: { slug: "perl", category: "stack", name: "Perl", kind: "stack" }, // verified: rules/language/perl.js
  r: { slug: "r", category: "stack", name: "R", kind: "stack" }, // verified: rules/language/r.js
  scala: { slug: "scala", category: "stack", name: "Scala", kind: "stack" }, // verified: rules/language/scala.js
  swift: { slug: "swift", category: "stack", name: "Swift", kind: "stack" }, // verified: rules/language/swift.js
  typescript: { slug: "typescript", category: "stack", name: "TypeScript", kind: "stack" }, // verified: rules/language/typescript.js
  visualbasicnet: { slug: "visualbasicnet", category: "stack", name: "Visual Basic .NET", kind: "stack" }, // verified: rules/language/visualbasicnet.js
  vuejs: { slug: "vue", category: "stack", name: "Vue.js", kind: "stack" }, // verified: rules/language/vue.js

  // frameworks (server-side)
  apiplatform: { slug: "apiplatform", category: "stack", name: "Api Platform", kind: "stack" }, // verified: rules/framework/apiplatform.js
  blitzjs: { slug: "blitzjs", category: "stack", name: "Blitzjs", kind: "stack" }, // verified: rules/framework/blitzjs.js
  dioxus: { slug: "dioxus", category: "stack", name: "Dioxus", kind: "stack" }, // verified: rules/framework/dioxus.js
  django: { slug: "django", category: "stack", name: "Django", kind: "stack" }, // verified: rules/framework/django.js
  laravel: { slug: "laravel", category: "stack", name: "Laravel", kind: "stack" }, // verified: rules/framework/laravel.js
  meteorjs: { slug: "meteorjs", category: "stack", name: "Meteor", kind: "stack" }, // verified: rules/framework/meteorjs.js
  nestjs: { slug: "nestjs", category: "stack", name: "NestJS", kind: "stack" }, // verified: rules/framework/nestjs.js
  nextjs: { slug: "nextjs", category: "stack", name: "Next.js", kind: "stack" }, // verified: rules/framework/nextjs.js
  nuxtjs: { slug: "nuxtjs", category: "stack", name: "Nuxt.js", kind: "stack" }, // verified: rules/framework/nuxtjs.js
  rails: { slug: "rails", category: "stack", name: "Rails", kind: "stack" }, // verified: rules/framework/rails.js
  redwoodjs: { slug: "redwoodjs", category: "stack", name: "RedwoodJs", kind: "stack" }, // verified: rules/framework/redwoodjs.js
  remixrun: { slug: "remixrun", category: "stack", name: "Remix", kind: "stack" }, // verified: rules/framework/remixrun.js
  remult: { slug: "remult", category: "stack", name: "Remult", kind: "stack" }, // verified: rules/framework/remult.js
  sveltekit: { slug: "sveltekit", category: "stack", name: "SvelteKit", kind: "stack" }, // verified: rules/framework/sveltekit.js
  symfony: { slug: "symfony", category: "stack", name: "Symfony", kind: "stack" }, // verified: rules/framework/symfony.js
  tanstackstart: { slug: "tanstackstart", category: "stack", name: "Tanstack Start", kind: "stack" }, // verified: rules/framework/tanstackstart.js
  tauri: { slug: "tauri", category: "stack", name: "Tauri", kind: "stack" }, // verified: rules/framework/tauri.js
  wasp: { slug: "wasp", category: "stack", name: "Wasp", kind: "stack" }, // verified: rules/framework/wasp.js
  yii2: { slug: "yii2", category: "stack", name: "Yii2", kind: "stack" }, // verified: rules/framework/yii2.js

  // ui frameworks
  alpinejs: { slug: "alpinejs", category: "stack", name: "Alpine.js", kind: "stack" }, // verified: rules/ui_framework/alpinejs.js
  angular: { slug: "angular", category: "stack", name: "Angular", kind: "stack" }, // verified: rules/ui_framework/angular.js
  emberjs: { slug: "emberjs", category: "stack", name: "Ember", kind: "stack" }, // verified: rules/ui_framework/emberjs.js
  expojs: { slug: "expojs", category: "stack", name: "ExpoJS", kind: "stack" }, // verified: rules/ui_framework/expojs.js
  htmx: { slug: "htmx", category: "stack", name: "HTMX", kind: "stack" }, // verified: rules/ui_framework/htmx.js
  infernojs: { slug: "infernojs", category: "stack", name: "Inferno", kind: "stack" }, // verified: rules/ui_framework/infernojs.js
  ionic: { slug: "ionic", category: "stack", name: "Ionic", kind: "stack" }, // verified: rules/ui_framework/ionic.js
  litjs: { slug: "litjs", category: "stack", name: "Lit", kind: "stack" }, // verified: rules/ui_framework/litjs.js
  mithriljs: { slug: "mithriljs", category: "stack", name: "Mithril", kind: "stack" }, // verified: rules/ui_framework/mithriljs.js
  preactjs: { slug: "preactjs", category: "stack", name: "Preact", kind: "stack" }, // verified: rules/ui_framework/preactjs.js
  qwikjs: { slug: "qwikjs", category: "stack", name: "Qwik", kind: "stack" }, // verified: rules/ui_framework/qwikjs.js
  react: { slug: "react", category: "stack", name: "React", kind: "stack" }, // verified: rules/ui_framework/react.js
  solidjs: { slug: "solidjs", category: "stack", name: "SolidJS", kind: "stack" }, // verified: rules/ui_framework/solidjs.js
  stenciljs: { slug: "stenciljs", category: "stack", name: "Stencil", kind: "stack" }, // verified: rules/ui_framework/stenciljs.js
  sveltejs: { slug: "sveltejs", category: "stack", name: "Svelte", kind: "stack" }, // verified: rules/ui_framework/sveltejs.js
  umijs: { slug: "umijs", category: "stack", name: "UmiJS", kind: "stack" }, // verified: rules/ui_framework/umijs.js
  vue: { slug: "vue", category: "stack", name: "Vue.js", kind: "stack" }, // verified: rules/ui_framework/vue.js

  // static site generators
  assemble: { slug: "assemble", category: "stack", name: "Assemble", kind: "stack" }, // verified: rules/ssg/assemble.js
  astro: { slug: "astro", category: "stack", name: "Astro", kind: "stack" }, // verified: rules/ssg/astro.js
  docsify: { slug: "docsify", category: "stack", name: "Docsify", kind: "stack" }, // verified: rules/ssg/docsify.js
  docusaurus: { slug: "docusaurus", category: "stack", name: "Docusaurus", kind: "stack" }, // verified: rules/ssg/docusaurus.js
  eleventy: { slug: "eleventy", category: "stack", name: "Eleventy", kind: "stack" }, // verified: rules/ssg/eleventy.js
  builtwithfern: { slug: "fern", category: "stack", name: "Fern", kind: "stack" }, // verified: rules/ssg/fern.js
  fumadocs: { slug: "fumadocs", category: "stack", name: "FumaDocs", kind: "stack" }, // verified: rules/ssg/fumadocs.js
  gatsby: { slug: "gatsby", category: "stack", name: "Gatsby", kind: "stack" }, // verified: rules/ssg/gatsby.js
  gridsome: { slug: "gridsome", category: "stack", name: "Gridsome", kind: "stack" }, // verified: rules/ssg/gridsome.js
  hexojs: { slug: "hexojs", category: "stack", name: "HexoJS", kind: "stack" }, // verified: rules/ssg/hexojs.js
  hugo: { slug: "hugo", category: "stack", name: "Hugo", kind: "stack" }, // verified: rules/ssg/hugo.js
  jekyll: { slug: "jekyll", category: "stack", name: "Jekyll", kind: "stack" }, // verified: rules/ssg/jekyll.js
  mintlify: { slug: "mintlify", category: "stack", name: "Mintlify", kind: "stack" }, // verified: rules/ssg/mintlify.js
  mkdocs: { slug: "mkdocs", category: "stack", name: "MkDocs", kind: "stack" }, // verified: rules/ssg/mkdocs.js
  readthedocs: { slug: "readthedocs", category: "stack", name: "Read The Docs", kind: "stack" }, // verified: rules/ssg/readthedocs.js
  slatedocs: { slug: "slatedocs", category: "stack", name: "Slate", kind: "stack" }, // verified: rules/ssg/slatedocs.js
  vitepress: { slug: "vitepress", category: "stack", name: "VitePress", kind: "stack" }, // verified: rules/ssg/vitepress.js
  vuepress: { slug: "vuepress", category: "stack", name: "VuePress", kind: "stack" }, // verified: rules/ssg/vuepress.js

  // runtimes / shells
  apacheCordova: { slug: "cordova", category: "stack", name: "Cordova", kind: "stack" }, // verified: rules/runtime/apacheCordova.js
  bunsh: { slug: "bun", category: "stack", name: "Bun", kind: "stack" }, // verified: rules/runtime/bunsh.js
  capacitorjs: { slug: "capacitorjs", category: "stack", name: "Capacitor", kind: "stack" }, // verified: rules/runtime/capacitorjs.js
  electron: { slug: "electron", category: "stack", name: "Electron", kind: "stack" }, // verified: rules/runtime/electron.js
};

/**
 * Best-effort category for a specfySlug that has no row above. Stack-analyser
 * tags every tech with its own `type` (e.g. "db", "ai", "payment") — where
 * that type overlaps cleanly with Catalogus's category enum we reuse it
 * instead of dumping every unmapped detection into "other". "cloud" and
 * "network" are stack-analyser's own umbrella types for top-level
 * cloud/PaaS providers (aws, gcp, railway, ...) and DNS records
 * respectively — confirmed against the installed package's rule source,
 * not guessed from the name.
 */
const SPECFY_TYPE_TO_CATEGORY: Partial<Record<string, ServiceCategory>> = {
  db: "db",
  auth: "auth",
  ai: "ai",
  hosting: "hosting",
  cloud: "hosting",
  payment: "payments",
  analytics: "analytics",
  storage: "storage",
  ci: "ci",
  network: "dns",
  // Three of stack-analyser's own type directories that had no Catalogus
  // bucket until HANDOFF §4's enum was widened. Its "notification" type is
  // the transactional email/SMS providers, which is what `messaging` names.
  monitoring: "monitoring",
  queue: "queue",
  notification: "messaging",
};

/**
 * specfy `type` values that name developer tooling and code a project
 * imports, rather than a provider or a running piece of infrastructure it
 * depends on operationally. Enumerated by hand against every type value
 * @specfy/stack-analyser@1.27.6 actually registers (its own
 * `rules/<type>/` directory layout, 39 distinct values at the time this was
 * written) so this is a closed, deliberate decision rather than a guess
 * re-derived from a handful of examples.
 *
 * A type NOT in this set — including a type this package has never seen,
 * or no type at all — defaults to "service" in classifyDetectionKind below.
 * That default is deliberately biased toward visibility: hiding a real
 * service under an unfamiliar type is a worse failure than showing one
 * unexpected entry in the services list, and the whole point of this
 * classification is to stop burying services, not to invent a new way to
 * do it.
 */
const LIBRARY_SPECFY_TYPES = new Set([
  "builder", // webpack, vite, esbuild, babel, swc, turborepo — build tooling
  "framework", // React, Next.js, Django, Rails — application code frameworks
  "iac", // terraform, pulumi, ansible, helm — manage infrastructure, aren't infrastructure themselves
  "iconset", // icon component libraries
  "language", // programming languages
  "linter", // eslint, prettier, biome
  "orm", // prisma, typeorm, drizzle
  "package_manager", // npm, yarn, pnpm
  "runtime", // node/deno/bun/electron/cordova — local execution runtimes
  "spec", // openapi/graphql spec tooling
  "ssg", // static site generators — these are frameworks (astro, gatsby, hugo)
  "test", // jest, vitest, playwright's own "test" registration, storybook
  "tool", // generic dev tooling — express, fastify, mcp sdk, migration CLIs
  "ui", // UI component/styling libraries
  "ui_framework", // React/Vue/Svelte etc. registered specifically as UI frameworks
  "validation", // zod, yup, joi
]);

function classifyDetectionKind(specfyType: string | undefined): DetectionKind {
  return specfyType !== undefined && LIBRARY_SPECFY_TYPES.has(specfyType) ? "library" : "service";
}

/**
 * Normalises a raw stack-analyser key into a string that satisfies
 * @catalogus/schema's slug pattern (`^[a-z0-9]+(?:[_-][a-z0-9]+)*$`, the
 * same pattern the CLI's `validate` command enforces on catalogus.yaml).
 * stack-analyser's own namespace allows things that pattern rejects — dot
 * namespacing (`aws.lambda`) and camelCase (`apacheCordova`) among them; of
 * its 743 keys, roughly a fifth fail the schema's pattern as-is. Verified
 * empirically against the live tech index that this produces a valid,
 * collision-free slug for every one of them: camelCase boundaries and any
 * run of non-[a-z0-9] characters become a single `-`.
 */
function normalizeToCatalogusSlug(specfySlug: string): string {
  return specfySlug
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Maps a raw stack-analyser slug into Catalogus's namespace. Never discards —
 * an unrecognized slug survives as a pass-through entry flagged `unmapped`,
 * so a gap in this table shows up as "unknown service" rather than silently
 * vanishing from detect() output. The pass-through `slug` is normalised into
 * Catalogus's own namespace (see normalizeToCatalogusSlug) rather than reusing
 * the raw key verbatim, so every technology detect() emits — mapped or not —
 * is something the CLI could actually write into catalogus.yaml without its
 * own `validate` command rejecting it; the untouched stack-analyser key is
 * still available separately as DetectedTechnology.specfySlug.
 */
export function mapSpecfySlug(
  specfySlug: string,
  fallbackName: string,
  specfyType?: string
): MappingEntry & { unmapped: boolean } {
  const known = SPECFY_TO_CATALOGUS[specfySlug];
  if (known) {
    return { ...known, unmapped: false };
  }
  const category = (specfyType && SPECFY_TYPE_TO_CATEGORY[specfyType]) || "other";
  return {
    slug: normalizeToCatalogusSlug(specfySlug),
    category,
    name: fallbackName,
    kind: classifyDetectionKind(specfyType),
    unmapped: true,
  };
}
