# Detection spike — @specfy/stack-analyser against real repos

Evidence behind `packages/core/src/mapping.ts`. Every row in that table is
either observed here or named explicitly in HANDOFF.md (marked as such in
the table's own comments).

**Method:** `analyser({ provider: new FSProvider({ path }) })` from
`@specfy/stack-analyser@1.27.6`, walking the raw (un-flattened) `Payload`
tree returned. Read-only against five real repos under `C:/Workspace/repos`:
Clapline, waymark, Pomegr, fixpic, trello-cli. No file that looked like a
credential was opened — `Clapline/key.txt` was never read.

## Gotcha #1 — the rule set has to be loaded explicitly

The first spike run came back completely empty for every repo — 0 childs,
0 techs, in 2–96ms (too fast to have scanned anything real):

```
===== C:/Workspace/repos/Clapline (96ms) =====
root name: flatten, tech: null
techs (root): []
childs: 0
```

Cause: `@specfy/stack-analyser`'s rule set (`rules.list`, 743 entries) is
only populated as a side effect of importing its `autoload.js` module —
`import { analyser } from "@specfy/stack-analyser"` alone leaves
`registeredRules` empty, so every rule matcher silently matches nothing.
The library's own CLI (`dist/cli.js`) imports `autoload.js` first; anyone
using the programmatic API has to do the same. HANDOFF.md's own sample
(`analyser({ provider: new FSProvider(...) })`, `flatten(result)`) does not
mention this — worth flagging for whoever reads this next.

Fix, and what `packages/core/src/specfy.ts` does:

```ts
import "@specfy/stack-analyser/dist/autoload.js"; // side effect: registers rules
import { analyser, FSProvider, tech } from "@specfy/stack-analyser";
```

After the fix, `rules registered: 743` and every repo produced real output
(see below).

## Gotcha #2 — `flatten()` discards evidence

`flatten()` is the library's documented way to deduplicate components found
in multiple folders. It does that correctly, but its internal `copy()` and
`combine()` (`payload/index.js`) never touch `Payload.reason`:

```js
// copy() — constructs a fresh Payload without passing `reason`, so the
// copy's reason Set starts empty and never gets the original's contents.
copy() {
  const cp = new Payload({ id: this.id, name: this.name, folderPath: this.path,
    parent: this.parent, tech: this.tech, dependencies: this.dependencies });
  cp.techs = new Set(this.techs);
  // ...no cp.reason assignment...
  return cp;
}
```

Confirmed empirically: running `flatten(result, { merge: false })` on
Pomegr and dumping `toJson()` shows every child's `"reason": []`, even
though the same nodes carry real `reason` arrays (e.g.
`["cloudflare matched: /^@cloudflare\\//"]`) before flattening. `merge:
true` is worse — it also wipes the root's own `reason`.

Since HANDOFF.md §6 requires "which file proved it" on every detection,
`packages/core/src/specfy.ts` does **not** call `flatten()`. It walks the
raw tree itself and deduplicates by tech key into a `Map`, which gives the
same cross-folder deduplication `flatten()` provides while keeping every
`reason` string that fed into it.

## Gotcha #3 — evidence attribution needed a second pass

`Payload.reason` is a per-*node* bag, not a per-*tech* one: when a
directory scan matches several techs at once (e.g. a `package.json` that
matches `react`, `typescript`, `vite`, and also happens to be the same node
where `fly.toml` was matched), all their reason strings land in one shared
`Set` on that node. Dependency/env-var matches embed the tech key in the
reason text ("`react matched: /^react$/`"), but plain file/extension
matches don't ("`matched file: fly.toml`" — no "flyio" prefix).

First cut of the evidence walker took every node's `techs` bag (which
`addTech()` populates for *every* detected tech, including ones already
promoted to their own component `Payload`) and, when no tech-prefixed
reason existed, fell back to the *entire* node reason list. Smoke-testing
the built package against Clapline caught the resulting bug directly:

```json
{
  "slug": "fly-io",
  "specfySlug": "flyio",
  "evidence": [
    { "file": "fly.toml", "detail": "matched file: fly.toml" },
    { "file": ".dockerignore", "detail": "matched file: .dockerignore" },
    { "file": "nginx.conf", "detail": "matched file: nginx.conf" },
    { "file": "openapi.json", "detail": "matched file: openapi.json" },
    { "file": "*.cs", "detail": "matched extension: .cs" }
    /* ...5 more, none of them about Fly.io */
  ]
}
```

That directly violates the "why does it think I use Fly.io" requirement.
Fix: `packages/core/src/specfy.ts` collects every `node.tech` key across
the whole tree first (`collectComponentKeys`), then skips those keys when
processing the generic `techs` bag, so a precisely-evidenced component
(Fly.io, GitHub, Nginx, Slack — anything promoted to its own `Payload`)
never gets contaminated by an unrelated sibling's reasons. After the fix,
the same scan gives:

```json
{ "slug": "fly-io", "specfySlug": "flyio",
  "evidence": [{ "file": "fly.toml", "detail": "matched file: fly.toml" }] }
```

Known remaining limitation, accepted for v1: techs that never get promoted
to their own component (plain languages/build tools like `css`, `bash`,
`javascript`, `docker`) still share one node's whole reason list as
evidence when they have no tech-specific reason string of their own. This
only affects `unmapped: true` pass-through entries (not services worth
cataloging), so it's noise, not misattribution to a real service.

## Gotcha #4 — Windows path handling in `toJson()`

`cleanPath` (`common/helpers.js`) relativizes paths with a plain
`path.replace(root, '')` — a string prefix strip, not a path-aware one.
`FSProvider` builds child paths with `node:path.join`, which produces
backslash-separated paths on Windows (`C:\Workspace\repos\Clapline\...`).
Passing `root` as `C:/Workspace/repos/Clapline` (forward slashes, as
`detect()`'s caller naturally would) means the prefix never matches, and
`toJson(root)` silently returns full absolute paths instead of relative
ones. Not a problem for us in practice — `packages/core` never reads
`Payload.path`/`toJson()` output for evidence, only `Payload.reason`, whose
strings are already bare filenames — but worth flagging for whoever builds
the CLI's `graph`/`diff` output on top of this package later.

## Per-repo results

| Repo | Scan time | stack-analyser detections | Dagstree-specific detections |
|---|---|---|---|
| Clapline | 155ms | flyio, github, nginx, slack, + 14 languages/frameworks in `src/frontend` | Claude Code, AGENTS.md; Fly.io (4 files → 1 detection); VCS github (remote), CI github-actions |
| waymark | 10ms | nextjs, react, eslint, tailwind, typescript, vite, + languages | Claude Code, AGENTS.md; no hosting marker; VCS github (remote), no CI marker |
| Pomegr | 48ms | cloudflare, cloudflare.workers (root + `landing/`, deduplicated to one each), github, electron, zod, + languages, across 2 package.json | Claude Code, AGENTS.md, Cursor; no hosting marker; VCS github (remote), CI github-actions |
| fixpic | 40ms | supabase (package.json dep *and* `.env.example`, deduplicated), geminiai, lucideicons, express, react, + languages | no coding-agent/MCP/hosting markers (negative case); VCS github (remote), no CI marker |
| trello-cli | 2ms | bash, csharp only (no package.json) | no coding-agent/MCP/hosting markers (negative case); VCS github (remote), no CI marker |

All five scans completed in under 200ms — well within "don't burn the task
on one repo" territory. `IGNORED_DIVE_PATHS` (`provider/base.js`) already
hard-excludes `node_modules`, `dist`, `build`, `.git`, and friends
regardless of the `ignorePaths` option, which is why even Pomegr (a large
repo with `node_modules` and a stray empty `NVIDIA Corporation/` folder)
scanned in 48ms.

### Clapline — real output (after the autoload fix)

```
===== C:/Workspace/repos/Clapline (raw 155ms) =====
raw root techs: ["bash","csharp","css","docker","flyio","github","javascript","nginx","openapi","slack"]
raw root childs: 5
  raw child: name=Flyio tech=flyio path=["/"]
  raw child: name=GitHub tech=github path=["/"]
  raw child: name=Nginx tech=nginx path=["/","...ops/docker-compose.mock.yml","...ops/.env.example"]
  raw child: name=Slack tech=slack path=["...ops/.env.example"]
  raw child: name=sluglin tech=null path=["...src/frontend/package.json"]
    techs: bash,css,esbuild,eslint,javascript,jsx,nodejs,npm,prettier,react,reactrouterdom,tailwind,typescript,vite
```

Flyio's `reason` was exactly `["matched file: fly.toml"]` — one entry, even
though Clapline has `fly.toml`, `fly.web.toml`, `fly.grafana.toml`, and
`fly.loki.toml` at its root. stack-analyser's own `flyio` rule (`files:
['fly.toml']`) is an **exact filename match**, so it only ever sees the
literal `fly.toml` — the three variants are invisible to it. That's exactly
why HANDOFF.md §6 asks for a Dagstree-specific hosting detector rather than
relying on stack-analyser alone: `packages/core/src/detectors/hosting.ts`
globs for `/^fly[\w.-]*\.toml$/i` at the repo root and folds every match
into one `Fly.io` detection with all four filenames as evidence —
confirmed via `detect()` against the real Clapline directory:

```json
"hosting": [{
  "slug": "fly-io",
  "name": "Fly.io",
  "evidence": [
    { "file": "fly.grafana.toml" },
    { "file": "fly.loki.toml" },
    { "file": "fly.toml" },
    { "file": "fly.web.toml" },
    { "file": "fly.toml", "detail": "matched file: fly.toml" }
  ]
}]
```

(The fifth evidence entry is stack-analyser's own single detection, merged
in by `detect()` rather than discarded — see `mergeHosting()` in
`packages/core/src/index.ts`.)

Coding-agent markers: `CLAUDE.md`, `.claude/`, `AGENTS.md`, `.agents/` all
present at Clapline's root (`.codex/` also exists but isn't one of the
markers HANDOFF.md §6 lists, so it's left undetected by design). VCS: `git
remote -v` → `https://github.com/Lecarvalho/Clapline.git`, correctly
resolved to `github`. CI: `.github/workflows/{ci,observability}.yml`
present → `github-actions`. No `.mcp.json` at the root, and
`.claude/settings.json` has keys `["permissions","hooks","enabledPlugins",
"autoMemoryEnabled"]` — no MCP servers configured, a genuine negative.

### waymark — real output

```
===== C:/Workspace/repos/waymark (raw 10ms) =====
raw root childs: 1
  raw child: name=waymark tech=null path=["...package.json"]
    techs: css,eslint,javascript,jsx,nextjs,nodejs,npm,react,tailwind,typescript,vite
```

**Missed, correctly:** waymark has `drizzle/` and `db/` directories, but
both are empty (`drizzle/meta` has no files; `db/` has no files), and
`package.json` has no `drizzle-orm`/`drizzle-kit` dependency. Detection
here is dependency- and file-content based, not directory-name based, so
"no drizzle-orm in package.json" correctly yields no `drizzle` detection —
this isn't a gap in the tool, it's an accurate read of an unfinished
integration. Coding-agent markers `CLAUDE.md`, `.claude/`, `AGENTS.md`,
`.agents/` all present. `git remote` → `git@github.com:Lecarvalho/
Waymark.git` (SSH form) → `github`. No `.github/workflows/`, so no CI
provider detected — also a genuine negative (waymark has no CI configured).

### Pomegr — real output

```
===== C:/Workspace/repos/Pomegr (raw 48ms) =====
raw root childs: 1
  raw child: name=pomegr tech=null path=["...package.json","...landing/.env.example"]
    techs: bash,cloudflare,cloudflare.workers,css,electron,esbuild,eslint,github,
           javascript,jsx,nextjs,nodejs,npm,react,tailwind,testinglibrary,
           typescript,vite,vitest,zod
    childs:
      - @pomegr/claude-code-plugin (plugins/claude-code/package.json)
      - Cloudflare (tech=cloudflare)
      - Cloudflare Workers (tech=cloudflare.workers, inComponent=Cloudflare)
      - GitHub (tech=github)
      - pomegr-landing (landing/package.json)
          childs: Cloudflare, Cloudflare Workers (same techs, deduplicated
          against the root-level ones rather than becoming duplicates)
```

**Missed:** `plugins/claude-code/package.json` depends on
`@modelcontextprotocol/server@2.0.0`. stack-analyser's built-in `mcp` rule
(`rules/tool/mcp.js`) only matches the dependency name
`@modelcontextprotocol/sdk` (npm), `mcp` (python/ruby) — an exact-name
regex — so `@modelcontextprotocol/server` doesn't match and no `mcp` tech
fires. This is a real false negative in stack-analyser's generic rule, and
it's exactly why `mapping.ts` treats the generic `mcp` tech as a weak,
supplementary signal (category `other`) rather than the source of truth for
"MCP servers configured" — that's `detectMcpServers()`
(`packages/core/src/detectors/mcp-servers.ts`), which reads actual server
*names* out of `.mcp.json`/`.claude/settings.json` instead of inferring
from a dependency name. Neither file exists at Pomegr's root, so
`mcpServers` correctly comes back empty for it too — genuinely no MCP
servers configured there yet.

Coding-agent markers: `CLAUDE.md`, `.claude/`, `AGENTS.md`, `.agents/`,
`.cursor/` all present. `git remote` → `git@github.com:Lecarvalho/
Pomegr.git` → `github`. `.github/workflows/release.yml` present →
`github-actions`.

### fixpic — real output

```
===== C:/Workspace/repos/fixpic (raw 40ms) =====
raw root techs: ["csharp","supabase"]
raw root childs: 2
  raw child: name=Supabase tech=supabase reason=["supabase matched env: SUPABASE_"]
             path=["...src/frontend/.env.example"]
  raw child: name=react-example tech=null path=["...src/frontend/package.json"]
    techs: css,express,geminiai,jsx,lucideicons,nodejs,npm,react,
           reactrouterdom,supabase,tailwind,typescript,vite
    childs:
      - Gemini AI (tech=geminiai, reason=["geminiai matched: /^@google\\/genai$/"])
      - Lucide Icons (tech=lucideicons)
      - Supabase (tech=supabase, reason=["supabase matched: /^@supabase\\//"])
```

Supabase was detected twice independently — once from the `SUPABASE_` env
var prefix in `.env.example`, once from the `@supabase/supabase-js`
dependency in `package.json` — and `packages/core/src/specfy.ts` correctly
merges them into one `specfySlug: "supabase"` entry with both reasons as
evidence (bucket keyed by tech, `Set` dedupes the two paths to the same
node naturally). No coding-agent, MCP, or hosting markers present — a
genuine negative case, useful as a fixture-equivalent baseline. `git
remote` → `git@github.com:DinosaurSnake/FixPic.git` → `github`; no
`.github/workflows/`, so no CI provider detected.

### trello-cli — real output

```
===== C:/Workspace/repos/trello-cli (raw 2ms) =====
root techs: ["bash","csharp"]
root childs: 0
```

No `package.json`, so nothing beyond language detection. No coding-agent
or MCP markers present. `git remote` → `https://github.com/Lecarvalho/
trello-cli.git` → `github`; no `.github/workflows/`, so no CI provider.
Confirms the "nothing to detect" path doesn't error or hang — `detect()`
returns well-formed empty arrays rather than throwing (see
`packages/core/src/index.test.ts`, "returns an empty-but-well-formed
result").

## Slugs confirmed to exist (or not) in stack-analyser's own list

Checked directly against `tech.indexed` (743 entries total) before adding
rows to `mapping.ts`, so nothing in the table references a slug that
doesn't actually exist in the library:

| specfy key | name | type | in mapping.ts? |
|---|---|---|---|
| `flyio` | Flyio | cloud | yes → `fly-io` / hosting |
| `vercel` | Vercel | cloud | yes → `vercel` / hosting |
| `netlify` | Netlify | cloud | yes → `netlify` / hosting |
| `render` | Render | hosting | yes → `render` / hosting |
| `cloudflare.workers` | Cloudflare Workers | hosting | yes → `cloudflare-workers` / hosting |
| `supabase` | Supabase | cloud | yes → `supabase` / other |
| `supabase.auth` | Supabase Auth | auth | yes → `supabase` / auth |
| `supabase.postgres` | Supabase Postgres | db | yes → `supabase` / db |
| `supabase.storage` | Supabase Storage | storage | yes → `supabase` / storage |
| `supabase.functions` | Supabase Functions | hosting | yes → `supabase` / hosting |
| `supabase.realtime` | Supabase Realtime | queue | yes → `supabase` / other (no `queue` category in Dagstree's enum) |
| `postgresql` | Postgres | db | yes → `postgresql` / db |
| `vercel.postgres` | Vercel Postgres | db | yes → `vercel-postgres` / db |
| `anthropic` | Anthropic | ai | yes → `anthropic` / ai |
| `openai` | Openai | ai | yes → `openai` / ai |
| `geminiai` | Gemini AI | ai | yes → `google-gemini` / ai |
| `gcp.vertex` | Vertex AI | ai | yes → `google-vertex-ai` / ai (this is the slug behind HANDOFF.md §5's `google-vertex-ai` example) |
| `stripe` | Stripe | payment | yes → `stripe` / payments |
| `github` | GitHub | saas | yes → `github` / vcs |
| `gitlab` | Gitlab | tool | yes → `gitlab` / vcs |
| `gitlab.ci` | (ci rule) | ci | yes → `gitlab-ci` / ci |
| `wrangler` | — | — | **does not exist as its own key** — `wrangler.toml` maps to `cloudflare.workers` in stack-analyser's own rule (`rules/hosting/cloudflare.workers.js`) |
| `namecheap` | — | — | **not in stack-analyser's 743 techs at all** — confirms HANDOFF.md's "Known ceiling: domain registrar... not detectable"; Namecheap can only ever be a manual Layer 2/3 entry, never a `mapping.ts` row |

## What this means for `mapping.ts`

- Every "hosting" row in the table is backed by a real stack-analyser rule
  file (`rules/cloud/flyio.js`, `rules/cloud/vercel.js`,
  `rules/cloud/netlify.js`, `rules/hosting/render.js`,
  `rules/hosting/cloudflare.workers.js`) — confirmed by reading the rule
  source, not assumed from the tech name.
- The `supabase.*` sub-slugs all share the catalog slug `supabase` but get
  distinct `category` values (auth/db/storage/hosting/other) — this is
  exactly HANDOFF.md's "one service, two roles → two entries" decision,
  applied at the detection layer: fixpic's `.env.example` and
  `package.json` both trigger the generic `supabase` slug (category
  `other`, since a bare `@supabase/supabase-js` import doesn't say *which*
  Supabase product it's using), while a project using `@supabase/auth-js`
  directly would get the more specific `supabase.auth` → category `auth`.
- Namecheap, and cost/billing/account data generally, cannot appear in
  `mapping.ts` — there is no stack-analyser slug to map *from*. That's
  Layer 2 (manual `service: namecheap` entry in `dagstree.yaml`) and Layer
  3 (private overlay) territory, exactly as HANDOFF.md §6 says.
- Everything stack-analyser detects that isn't in `mapping.ts` (languages,
  frameworks, build tools — `react`, `typescript`, `vite`, `docker`, `css`,
  ...) still comes back from `detect()` as an `unmapped: true` pass-through
  rather than being silently dropped — confirmed for `vue` (a real
  stack-analyser key with no `mapping.ts` row) in
  `packages/core/src/specfy.test.ts`.
