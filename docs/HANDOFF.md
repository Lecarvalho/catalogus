# CATALOGUS — Project Operations Registry
## Handoff Document for Claude Code

> **Status:** Concept fully designed, ready for implementation planning.
> **Owner:** Dsnk
> **Date:** 2026-08-22
> **Working name:** Catalogus (the intact Latin word for "catalog", which is what the product does; one stable spelling, so there is no homophone to register)

**Amendments since 2026-08-22.** This document is the source of truth, so a change to it is recorded
here rather than made silently.

- *2026-08-23, §4* — the `services.category` enum gained `monitoring`, `queue` and `messaging`.
  Dogfooding put Sentry, Datadog, New Relic, SQS, RabbitMQ, Resend, SendGrid, Mailgun and Twilio all
  in `other` despite every one of them being a service by this document's own test: it can go down,
  and it sends an invoice. `messaging` rather than `email` because Twilio is SMS and voice, so an
  email-only bucket does not hold it. Approved by the owner.

- *2026-08-23, §4 and §5* — `project_services` / `services[]` gained **`kind`**
  (`service` | `component` | `stack`, treated as `service` when absent) and **`version`**
  (free-form string). The catalog gained a `stack` category.

  The rule this replaces was "if it cannot have an outage and cannot send an invoice, it is not a
  service entry; languages and frameworks belong in the architecture description". Dogfooding
  showed it wrong in both halves. It excluded nginx and OpenTelemetry — both on the request path,
  both able to fail, neither with a vendor behind it — so a real project's topology was missing
  its ingress and its log transport. And it put the stack in free text, where nothing can render a
  tile or key an end-of-life date off it; `project.architecture` is the *shape* (modular monolith,
  vertical slices), which is not the stack. A runtime reaching EOL is the same impact-analysis
  question §4.2 already asks about a vendor sunset, so stack entries are nodes, attached by an
  ordinary edge to whatever runs them (`[fly-api, dotnet]`).

  The dividing line is now **runtime topology, not vendor relationship**: on the request path, or
  what the code is written in, is a node; build-time and developer-machine tooling (ESLint,
  Prettier, Vitest) is not an entry in any kind. `kind` remains the axis Layer 3 needs — only
  `service` rows can carry a cost or an account reference. Approved by the owner.

- *2026-08-23, §5 and §6* — **Catalogus does not guess.** Where a fact is not in the repo, the
  CLI asks, or records nothing and names the command that fills the gap. It does not write a
  plausible default.

  Two defects motivated this, both found by validating a manifest the skill had just written.
  `init` hardcoded `visibility: private` with a comment in the output owning up to the guess —
  right on the repo it was written against, which is the worst case, because a wrong default that
  looks correct is never revisited. Detection cannot help here (nothing in a checkout says whether
  its remote is public) and shelling out to `gh` would answer only for GitHub while failing quietly
  for GitLab, Bitbucket, Azure DevOps or a plain origin. So `init` prompts, `init --yes` takes
  `--visibility`, and with neither it omits `project.vcs` entirely rather than filling it in.

  Separately, `AGENTS.md` / `.agents/` used to be reported as a coding agent literally named
  `agents-md` — a file convention in a field that names agents, and self-confirming because it
  appeared beside the real agents on every repo that had any. Those markers are now reported as
  *unidentified*: they prove an agent works here and not which one, which is a question for the
  owner. A `.codex` marker was added at the same time; without it a correctly-declared `codex`
  entry was reported as drift by `catalogus diff` on every single run. Approved by the owner.

- *2026-08-24, §4, §5, §6 and Appendix A* — `project.pm`, `project.coding_agents` and
  `project.vcs.provider` are removed. **Anything with an identity and an icon is a service entry; `role` gives its section.**
  A Trello board was stated twice — free-text `project.pm` *and* a service entry
  (`id: board, service: trello, role: pm`) — and so was GitHub — `project.vcs.provider` *and*
  `id: github, service: github, role: vcs`. The governing constraint is that **a project-level
  field can never be an edge target**: `[github-actions, github]` is a real edge in
  `examples/reference.catalogus.yaml`, so the VCS provider has to be a service entry to be one of
  its endpoints, and the same reasoning now extends to the PM tool and to coding agents, which were
  never expressible as service entries before this change.

  Concretely: `project.pm` (free-text methodology, e.g. "kanban board, one card per shipped
  change") is dropped with no replacement field — the methodology itself was never more than a
  comment, and the PM *tool* is the part worth recording, as a service entry (`role: pm`).
  `project.coding_agents` (a raw string list) is dropped; each coding agent is now a service entry
  (`role: coding-agent`, no `kind` — it defaults to `service`, correctly, since Claude Code, Cursor
  and GitHub Copilot are vendor products with subscriptions, so a Layer 3 cost can attach the same
  way one attaches to Fly.io or Supabase). `project.vcs.provider` is dropped; `project.vcs` keeps
  only `visibility`, which has no identity and is never an edge target, so it stays a project field.

  `catalogus: 1` is unchanged — this amends v1 in place rather than bumping to v2. The schema URL
  the modeline points at (`https://catalogus.dev/schema/v1.json`) does not resolve yet, and no
  manifest outside this repo is known to exist at the time of this amendment: the one this project
  had been reasoning about, `C:/Workspace/repos/Clapline/catalogus.yaml`, was checked directly
  while writing this entry and is not there — the directory is, the manifest is not. So there is
  nothing to migrate, and bumping a version nobody can fetch buys nothing. Recorded rather than
  left implicit because the earlier "exactly one real manifest exists" phrasing was inherited from
  a stale note rather than verified, which is the defect class the 2026-08-23 amendment above
  exists to stop. `catalogus validate` names what moved
  (`MOVED_FIELD_HINTS` in `packages/schema/src/validate.ts`; `set` carries its own,
  differently-shaped table in `packages/cli/src/commands/set.ts` for the same three names) rather
  than reporting a bare "additional property" error on a manifest still in the old shape. Approved
  by the owner.

- *2026-08-24, §2 and throughout* — **the product is renamed from Dagstree to Catalogus.** Decided
  by the owner after a name search; §2 records the reasoning. The rename is total, and several
  parts of it are format changes rather than cosmetics: the manifest filename becomes
  `catalogus.yaml`, its required top-level key becomes `catalogus: 1` (the schema sets
  `additionalProperties: false`, so a manifest in the old shape is now rejected outright), the
  schema file becomes `catalogus.v1.json` and its `$id` becomes
  `https://catalogus.dev/schema/v1.json`, and the shipped skill moves to `skills/catalogus/`,
  installing to `.claude/skills/catalogus/SKILL.md`. The CLI ships **scoped** as `@catalogus/cli`
  because the unscoped npm name is an npm-owned security holding package; the binary it installs is
  still plain `catalogus`, so every command line in this document is unchanged apart from the word
  itself. **No migration path from `dagstree.yaml` was written, and none is needed:** the owner
  confirmed on 2026-08-24 that no manifest exists outside this repo and that nothing consumes the
  old name anywhere. `findManifest` (`packages/cli/src/manifest-io.ts`) therefore looks only for
  `catalogus.yaml` and `stack.yaml`, and a stray `dagstree.yaml` is correctly invisible to it rather
  than silently honoured. This is recorded because it is a deliberate decision with a confirmed
  basis, not an oversight — if the assumption ever turns out to be wrong, the fallback goes there.

---

## 1. What This Is

A **project operations registry**: an app + CLI that catalogs, for every one of the owner's app projects, all the service providers, infrastructure companies, dependencies, and stack/meta information — rendered with brand icons, dependency graphs, and cost visibility.

**The problem it solves:** A solo dev / small agency running many projects (Clapline, Sluglin, FixPic, Lookout, DSPrintWorks3D site, multiple YouTube channel pipelines...) has no single place to answer:

- Which services does project X depend on?
- Which projects depend on service Y? (impact analysis: "Supabase is down → what's red?")
- What am I paying, per service and in total, across all projects?
- Which account/identity do I use to connect to each service? (reference only, never secrets)
- When was a dependency added? Is it deprecated? What replaces it?
- What coding agents, source control provider, architecture style, and PM methodology does each project use?

**Why nothing existing works** (validated by research, Aug 2026):

| Tool | What it covers | Why it falls short |
|---|---|---|
| StackShare | Public stack listings with icons | Community/public-facing; no cost, no auth refs, no dependency graph, no lifecycle, no meta-tooling |
| @specfy/stack-analyser | OSS CLI, detects 500–700+ techs from repo files | Detection only; the Specfy SaaS dashboard on top was **archived in 2024** |
| Backstage / Port / OpsLevel | Service catalogs, ownership, lifecycle, dependency graphs | Enterprise-heavy, painful setup, no pricing/cost layer, wrong audience |
| Cledara / Torii (SaaS spend) | Subscription cost tracking | Finance-team oriented; not per-project, no stack/dependency model |
| Renovate / Dependabot | Package staleness | Package-level only; no service/SaaS/institutional-knowledge layer |

**Market note:** there is a plausible indie product here. ICP = solo devs and small agencies juggling 5–15 projects.

---

## 2. Name & Brand

- **Product:** Catalogus — the intact Latin word for "catalog", which is exactly what the product does: it catalogs each project's service providers, infrastructure, dependencies and stack metadata.
- **Why it wins:** one stable spelling — there is no second plausible way to write it, which the previous name and most of the alternatives considered could not claim.
- **Why the earlier name was dropped:** the owner decided to rename on 2026-08-24. Two concerns were raised in that discussion and are recorded here as the reasoning behind the call, not as findings: that `Dagstree` admits two readings (`dag-stree` and `dags-tree`), which §2 had previously settled by fiat rather than by the spelling; and that `dag` is crowded in developer tooling, where Dagster is an established orchestrator and Airflow has made "DAG" read as "pipeline step graph" to that audience. Whether either would have cost anything in practice was not measured.
- **Known collision:** `catalogus` is also the ordinary Dutch word for catalogue. The owner accepted this on 2026-08-24. How much Dutch-language search traffic it actually competes with has not been measured.
- **Logo concept:** open. The reconnecting-tree mark was a pun on the old name and does not carry over; nothing has been chosen to replace it.
- **CLI binary:** `catalogus`. The npm name is not claimable (see action items), so the package ships scoped as `@catalogus/cli` while the binary it installs is plain `catalogus`. No short alias has been settled.

### Action items (do before/alongside dev)
- [x] Domains — **`catalogus.dev` was registered on 2026-08-24 and is owned.** It is the load-bearing one: the schema `$id` and the `$schema` modeline the CLI writes into every manifest both point at it. `catalogus.io` was **not** acquired — its $20 aftermarket figure was a minimum-offer threshold rather than a price, and a $20 offer through Sedo drew a $7,500 counter, which was declined. `catalogus.com` was listed at $12,000 and was declined for the same reason. Nothing further is pending; a dev tool on `.dev` does not need the others.
- [x] npm package name — `catalogus` cannot be claimed: verified against the registry on 2026-08-24, it is an npm-owned security holding package (maintainer `npm`, repo `npm/security-holder`, version `0.0.1-security`, 2 downloads/month). The CLI therefore ships as `@catalogus/cli`, binary `catalogus`.
- [ ] Reserve GitHub org `catalogus`
- [ ] Quick CIPO/USPTO knock-out search, Nice Class 9 + 42 (same drill as CLAPLINE — word mark. Unlike CLAPLINE this is not a coined term: `catalogus` is an existing word in Latin and in Dutch, so the distinctiveness question is a different one and is not answered yet.)

---

## 3. Three-Layer Data Model

This is the core architectural decision. Every piece of data belongs to exactly one layer, and each layer has a different home and trust model.

### Layer 1 — Auto-detected (machine-owned)
- **Source:** repo scan (stack-analyser style detection engine).
- **Examples:** languages, frameworks, SDKs present, `fly.toml` → Fly.io, `supabase/` dir → Supabase, `.mcp.json` → MCP servers in use, `CLAUDE.md` → Claude Code as coding agent, `.github/workflows` → GitHub Actions, lockfiles → package dependencies.
- **Rules:** regenerated on every scan; never hand-edited; diffs against previous scan drive agent suggestions ("I see you added the Anthropic SDK — add it to the manifest?").

### Layer 2 — Manual but shareable (`stack.yaml`, lives in the repo)
- **Source:** human- or agent-written, committed to the repo. Safe in a public repo.
- **Contents:** architecture style (e.g., "modular monolith", "vertical slices + MediatR"), PM methodology (e.g., "Trello kanban via PAUTA agent"), source control provider, coding agents used, service list with `added_at`, lifecycle status, `replaced_by` notes, human annotations.
- **Rules:** validated against a published JSON Schema (also gives free editor autocomplete via `$schema`). Portable — works even for someone who clones the repo without the platform.

### Layer 3 — Private overlay (platform DB only, per-user, behind auth)
- **Source:** user or agent via authenticated CLI push. **Never touches the repo.**
- **Contents:** cost, currency, billing cycle, renewal dates, plan/tier, account reference ("auth via GitHub SSO", "billing account: dsnk@…"), private notes.
- **Rules:** Supabase with RLS, row ownership per user. Joined to projects/services by ID at render time.
- **Hard rule — no secrets:** store *references* to identity, never credentials, API keys, or passwords. Those stay in a password manager. Rationale: a file/DB listing every service + cost + how to log in is a high-value target; the registry must never become that.

---

## 4. Domain Model (DAG, service-to-service)

**Decision made:** dependencies are **service-to-service within a project**, not just project-to-service. This is a directed acyclic graph, not a flat list. It's harder than a flat v1 but it's what makes impact analysis and phase-out planning real.

### Entities

```
users
  id, ...

projects
  id, owner_id, name, slug, repo_url, description, created_at

services            -- GLOBAL catalog (see §4.1)
  id, name, slug, icon_ref, category,        -- category: db|auth|ai|hosting|dns|payments|analytics|monitoring|queue|messaging|storage|ci|agent|pm|vcs|stack|other
  pricing_model,                              -- free|freemium|subscription|usage|one_time
  vendor_url, status,                         -- active|deprecated|sunset
  sunset_date, successor_service_id           -- vendor-level deprecation ("service X is sunsetting")

project_services    -- a service *instance* inside a project (node in the DAG)
  id, project_id, service_id,
  role,                                       -- e.g. "db", "auth" (Supabase can appear twice with different roles)
  kind,                                       -- service|component|stack (default service; see the amendment log)
  version,                                    -- free-form, e.g. "10", "19.2" -- what a tile shows, what an EOL date keys off
  added_at, status,                           -- active|deprecated|phasing_out|removed
  replaced_by_project_service_id,             -- project-level phase-out plan
  detected | manual,                          -- provenance flag (Layer 1 vs Layer 2)
  notes

service_dependencies  -- EDGES: who depends on who
  id, project_id,
  from_project_service_id, to_project_service_id,
  added_at, status, replaced_by_edge_id, notes
  -- constraint: acyclic within project (enforce in app layer / CLI validation)

user_service_accounts -- PRIVATE overlay (RLS: owner only)
  id, user_id, service_id, project_id (nullable = account spans projects),
  account_ref,          -- "GitHub SSO", "dsnk@... billing"
  plan_tier, cost_amount, cost_currency, billing_cycle,   -- monthly|yearly|usage
  renewal_date, started_at, notes_private

project_meta        -- Layer 2 mirror in DB (synced from catalogus.yaml)
  project_id, architecture_style, vcs_visibility,
  -- pm_method, vcs_provider and coding_agents[] are gone (2026-08-24
  -- amendment below): the PM tool, the VCS provider and each coding agent
  -- are project_services rows now (role: pm/vcs/coding-agent), not columns
  -- here. PM methodology itself has no column at all -- it was never more
  -- than a comment and has no Layer 2 home.
  extra jsonb
```

### 4.1 Global service catalog — key strategic decision
The `services` table is **global and community-maintainable**, not per-user. This is where long-term value compounds: "Namecheap raised .com renewal prices" or "vendor X announced sunset" is updated once and every user's dashboard reflects it. Per-user catalogs would fragment this. Seed it manually for v1 (the ~30–50 services Dsnk actually uses), open contribution later.

### 4.2 Queries the model must answer (acceptance tests)
1. All services for project X, grouped by category, with icons.
2. All projects depending on service Y (direct or transitive) → impact analysis / blast radius.
3. Total monthly cost across all projects; cost per project; cost per service. (Private layer, owner only.)
4. All edges/nodes marked `phasing_out`, with their `replaced_by` targets → migration dashboard.
5. Everything added in the last N days (from `added_at`).
6. Which projects use coding agent Z / architecture style W / PM tool V (each a `project_services`
   row with the matching `role`, since the 2026-08-24 amendment below — not a `project_meta` column).

---

## 5. `stack.yaml` — Public Manifest

Lives at repo root. Draft shape (v1 — iterate in implementation):

```yaml
# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
catalogus: 1
project:
  name: Clapline
  slug: clapline
  architecture: "modular monolith (.NET 10, vertical slices)"
  vcs: { visibility: private }

services:
  # PM tool, VCS provider and coding agents are service entries -- anything
  # with an identity and an icon is (2026-08-24 amendment above). PM
  # methodology itself ("Trello kanban") has no Layer 2 field; only the tool
  # does.
  - id: board
    service: trello
    role: pm
    added: 2025-11-02
  - id: github
    service: github
    role: vcs
    added: 2025-11-02
  - id: claude-code
    service: claude-code
    role: coding-agent
    added: 2025-11-02
  - id: pauta
    service: pauta
    role: coding-agent
    added: 2025-11-02
  - id: supabase-db          # local id, unique within file
    service: supabase        # slug into global catalog
    role: database
    added: 2025-11-02
  - id: supabase-auth
    service: supabase
    role: auth
    added: 2025-11-02
  - id: vertex
    service: google-vertex-ai
    role: ai-models
    added: 2026-01-15
    status: phasing_out
    replaced_by: anthropic-api
  - id: anthropic-api
    service: anthropic
    role: ai-models
    added: 2026-06-01
  - id: fly
    service: fly-io
    role: hosting
    added: 2025-11-02
  - id: namecheap
    service: namecheap
    role: dns
    added: 2025-11-02
  - id: nginx
    service: nginx
    kind: component        # runs on our own box; no account, no invoice
    role: ingress-proxy
    added: 2025-11-02
  - id: dotnet
    service: dotnet
    kind: stack            # what the code is written in
    version: "10"
    role: runtime-backend
    added: 2025-11-02

dependencies:              # edges, from → to
  - [supabase-auth, supabase-db]
  - [fly, supabase-db]
  - [fly, anthropic-api]
  - [nginx, fly]
  - [fly, dotnet]          # "what breaks when .NET 10 goes EOL?"
```

### Schema guardrail (critical)
The published JSON Schema **must reject private-looking keys** in this file: `cost`, `price`, `account`, `username`, `token`, `key`, `password`, `billing`, `renewal`, etc. The CLI validation refuses to write them and redirects to the private channel with a clear message. **Rationale:** coding agents are helpful to a fault and will otherwise happily commit billing info to a public repo. Make the safe path the only path — the tool enforces the boundary, not agent discipline.

---

## 6. CLI — `catalogus`

### Commands (v1 surface)
```
catalogus init                 # scaffold stack.yaml (interactive or --yes)
catalogus detect               # scan repo, print detected stack (Layer 1)
catalogus diff                 # detected vs stack.yaml — what's missing/stale
catalogus add <service> --role=<r> [--depends-on=<id>...]   # edit stack.yaml
catalogus validate             # schema + acyclicity check (CI-friendly, exit codes)
catalogus graph                # ASCII/mermaid render of the project DAG
catalogus push                 # sync stack.yaml + detection to platform
catalogus push --private key=value ...   # write to private overlay (authenticated)
catalogus login                # device flow auth (see below)
catalogus mcp                  # run as MCP server (stdio)
```

### Auth design (decided)
- CLI gets **its own scoped token** via device flow (`gh auth login` pattern: show code, user approves in browser).
- Token stored in **OS keychain** (Windows Credential Manager / macOS Keychain / libsecret) — **never in any file an agent can read into context**.
- The agent invokes `catalogus push --private cost=...`; the **CLI holds the credential, the agent never sees it**.
- Supabase Auth can back this (device-flow-style exchange, or PKCE + local callback as fallback).

### MCP server mode (the agent workflow — this is the differentiator)
`catalogus mcp` exposes tools so Claude Code (and other agents) can:
- `detect_stack` → run detection, return structured diff vs manifest
- `read_manifest` / `propose_manifest_edit` → agent infers Layer 2 facts mid-session ("this repo has CLAUDE.md and .mcp.json → a service entry `claude-code` with `role: coding-agent`; MCP servers: X, Y") and proposes edits
- `push_private` → routes through the CLI's credential; input validated so no secrets are accepted, only the allowed private-overlay fields

Typical loop: during any coding session, the agent runs detect → diff → proposes "I see you added the Anthropic SDK — add it to stack.yaml?" → on approval, edits the manifest → `catalogus push`.

### Detection engine
- Reference/foundation: **`@specfy/stack-analyser`** (MIT, TypeScript, npm: `@specfy/stack-analyser`, still maintained as of Jan 2026). Detects 500–700+ technologies from `package.json`, `docker-compose.yml`, `go.mod`, lockfiles, config files. Usable via `npx` or programmatically (`analyser({ provider: new FSProvider({...}) })`, `flatten(result)`).
- Options: (a) depend on it directly and map its output slugs → Catalogus catalog slugs; (b) vendor the rules; (c) reimplement a smaller ruleset. **Recommend (a) for v1** — mapping table `specfy_slug → catalogus_service_slug`.
- Add Catalogus-specific detectors stack-analyser won't have: `CLAUDE.md` / `.claude/` / `.agents/` → coding agents; `.mcp.json` → MCP servers; `fly.toml`, `vercel.json`, `netlify.toml` → hosting; `.github/` vs `.gitlab-ci.yml` → VCS/CI provider.
- Known ceiling: domain registrar (Namecheap), PM tool, costs are **not detectable** — that's Layers 2/3 by design.

---

## 7. Platform (backend + viewer)

### Backend
- **Supabase** (Postgres + RLS + Auth) — matches owner's existing expertise and infrastructure.
- RLS: `projects`, `project_services`, `service_dependencies`, `project_meta`, `user_service_accounts` owner-scoped. `services` catalog readable by all, writable by admin (later: moderated contributions).
- API surface: PostgREST is likely enough for v1; add edge functions only where logic demands (e.g., transitive dependency queries, cost rollups — or do those client-side / in SQL views).
- Useful SQL views: `v_project_costs` (sum private costs per project), `v_service_blast_radius` (recursive CTE over edges), `v_phaseouts`.

### Viewer (web app)
- Per-project page: DAG of service nodes with **brand icons**, edges, status colors (active / phasing_out red-amber / deprecated).
- Portfolio page: all projects, cost totals (private layer), service usage matrix ("which projects touch Vertex").
- Migration dashboard: everything `phasing_out` + `replaced_by` targets.
- **Graph layout:** `dagre` or `elkjs` (both handle DAG layout; elkjs better for larger graphs). Render with React Flow or plain SVG.
- **Icons:** `simple-icons` (3,000+ brand SVGs, free, slug-addressable) as primary source; fallback generic category icons for services not in the set. Store `icon_ref` in catalog as simple-icons slug or URL.
- Stack choice open: owner is .NET-native but the detection engine is TS. Pragmatic split: **CLI + detection in TypeScript/Node** (reuses stack-analyser, npm distribution, MCP SDK availability), **viewer as web app** (React), backend Supabase. A .NET CLI wrapper is possible later but adds no v1 value.

---

## 8. Scope Cut

### v1 (ship this)
1. `stack.yaml` schema v1 + published JSON Schema (with private-key rejection).
2. CLI: `init`, `detect` (via stack-analyser + custom detectors), `diff`, `validate`, `graph` (mermaid output), `login`, `push`.
3. Supabase schema + RLS as in §4.
4. Seeded global catalog (~40 services Dsnk actually uses, with simple-icons refs, pricing_model, category).
5. Viewer: project list, per-project DAG with icons, private-overlay panel (cost/account ref) for logged-in owner.
6. MCP server mode with `detect_stack`, `read_manifest`, `propose_manifest_edit`.

### v1.5
- `push --private`, cost rollups, renewal-date reminders.
- Migration dashboard (phase-out view).
- Cross-project blast radius view.

### v2 / later
- Community catalog contributions + moderation.
- Vendor sunset feed (catalog-level `status`/`sunset_date` updates).
- GitHub Action (`catalogus validate` + `push` in CI).
- Multi-user / team sharing.
- Public profile pages (opt-in, Layer 1+2 only — never Layer 3).

### Explicit non-goals
- Storing secrets/credentials. Ever.
- Uptime monitoring (IncidentHub et al. exist; maybe integrate later, don't build).
- Package-level dependency management (Renovate's job).

---

## 9. Open Decisions (make these early in implementation)

1. **Catalog slug taxonomy** — adopt specfy's slugs wholesale vs own namespace with mapping table. (Leaning: own slugs + mapping.)
2. **Acyclicity enforcement point** — CLI validate only, or also DB trigger? (Leaning: CLI + app layer; DB trigger later.)
3. **`stack.yaml` vs `catalogus.yaml`** filename. (`stack.yaml` is generic/collision-prone; `catalogus.yaml` is unambiguous and brand-reinforcing. Leaning: `catalogus.yaml`, accept `stack.yaml` as fallback read.)
4. **Same service, multiple roles**: modeled as two `project_services` rows (supabase-db, supabase-auth) — confirm this holds up in UI grouping.
5. **Monorepo handling**: one `catalogus.yaml` at root with per-app sections, or one per app dir? (Punt to v1.5 unless it bites immediately.)
6. **Auth provider for the platform itself**: Supabase Auth with GitHub OAuth is the obvious fit for the audience.

---

## 10. Suggested First Claude Code Session

1. `npm create` a monorepo (pnpm workspaces): `packages/cli`, `packages/schema`, `apps/web`, `supabase/`.
2. Write the JSON Schema for `catalogus.yaml` v1 **first** (it's the contract everything else consumes) — include the private-key rejection patterns and acyclicity note.
3. Spike: run `@specfy/stack-analyser` programmatically against 2–3 real repos (Clapline, Sluglin), inspect `flatten(result)` output, draft the slug mapping table from real data.
4. Implement `catalogus detect` + `catalogus validate` + `catalogus graph --mermaid`.
5. Supabase migration files for §4 schema + RLS policies.
6. Then MCP mode, then viewer.

Recommended model split (per owner's established practice): Sonnet for ~80% of implementation, frontier model for the schema design and RLS policy review.

---

## Appendix A — Metadata fields the product must support (original requirements checklist)

- [x] Pricing model of each dependency (Free / Subscription / Usage) → `services.pricing_model`
- [x] How much I pay → `user_service_accounts.cost_*` (private)
- [x] Username/identity used to connect → `user_service_accounts.account_ref` (private, reference only, never secrets)
- [x] Who depends on who (service-to-service) → `service_dependencies` edges (DAG)
- [x] When the dependency was added → `project_services.added_at` / `added` in yaml
- [x] Deprecated / phasing out / replaced by what → `status` + `replaced_by_*` at node, edge, and vendor level
- [x] Coding agents used → `project_services` row(s) with `role: coding-agent`, one per agent (+
      auto-detect via CLAUDE.md/.agents/) — `project_meta.coding_agents` until the 2026-08-24
      amendment above
- [x] Source control + provider → `project_services` row with `role: vcs` (+ auto-detect);
      `project_meta.vcs_visibility` for repo visibility — `project_meta.vcs_provider` until the
      2026-08-24 amendment above
- [x] Architecture style → `project_meta.architecture_style` (manual, Layer 2)
- [x] PM tool → `project_services` row with `role: pm` — `project_meta.pm_method` until the
      2026-08-24 amendment above; the methodology itself ("Trello kanban, one card per shipped
      change") has no Layer 2 field and never did more than sit in a comment
- [x] Brand icons per service → `services.icon_ref` (simple-icons)
- [x] Multi-project portfolio view → portfolio page + cross-project queries
- [x] Easy out-of-the-box / CLI setup → `catalogus init` + agent-assisted population via MCP

## Appendix B — Provenance rules (agent trust model)

| Layer | Written by | Validated by | Lives in | Visible to |
|---|---|---|---|---|
| 1 Auto-detected | CLI scanner | detection rules | scan output / DB cache | anyone with repo access |
| 2 Manifest | human or agent (approved) | JSON Schema (rejects private keys) | repo (`catalogus.yaml`) | anyone with repo access |
| 3 Private overlay | human or agent via authed CLI | field allow-list, no secrets | Supabase (RLS) | owner only |

Credential rule: CLI token in OS keychain via device flow; agents invoke commands but never read the credential.
