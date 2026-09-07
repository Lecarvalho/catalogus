---
name: catalogus
description: Catalog a project's service providers, infrastructure and stack metadata into a catalogus.yaml manifest, driving Catalogus through its MCP tools when they are connected and through the `catalogus` CLI otherwise. Runs the scanner, then fills in what a scan can never reveal — dependency edges, registrar, PM tooling, architecture style, lifecycle — by asking the user the right questions and recording the answers. Use when the user asks to catalog, inventory or map this project's services, dependencies, infrastructure or stack; to create, fill in, audit or update a catalogus.yaml or stack.yaml; to answer "what does this project depend on"; or mentions Catalogus by name.
---

# Catalogus — cataloging a project

Catalogus is a project operations registry: it records each project's service providers,
infrastructure, dependencies and stack metadata, so "what does this depend on" has one answer. This
skill produces an accurate `catalogus.yaml` — the scanner gets two thirds of the way; the rest (who
talks to whom, the registrar, what's phased out) isn't in the repo, and finding it out is your job.

## Two ways to drive Catalogus, in order

**First:** if the `catalogus` MCP tools are connected, use them. If your harness lists them as
deferred, load them before doing anything else. **Second:** if they are not connected, run
`catalogus --version`; if that fails, stop and tell the user. **Third:** never edit the file by
hand, on either path.

| Tool | Replaces | Notes |
|---|---|---|
| `detect_stack {path?}` | `catalogus detect`, `catalogus diff` | diff object plus `hasDiff`; grouped detection text is CLI-only |
| `read_manifest {path?}` | reading the file | text + parsed object, or `valid: false` with problems |
| `init_manifest {path?, visibility?, force?}` | `catalogus init --yes [--visibility]` | never infers visibility |
| `propose_manifest_edit {path?, edits[]}` | none | diff, per-step results, `commands`, `baseSha256`; writes nothing |
| `apply_manifest_edit {path?, edits[], baseSha256?}` | `add`/`set`/`link`/`unlink`/`deprecate`/`remove`/`rename` | writes for real; refuses a changed file when `baseSha256` is given |
| `validate_manifest {path?, strict?}` | `catalogus validate` | |
| `render_graph {path?, format?}` | `catalogus graph [--mermaid]` | |
| `list_icons {path?}` | `catalogus icons` | |

```
catalogus detect           # what the scanner can see, grouped by category
catalogus init --yes [--visibility <v>]  # create the manifest: project fields only, no service entries
catalogus add <service> --role <r> [--kind <k>] [--version <v>] [--depends-on <id>...] [--id <id>]
catalogus set <field> <value> [<field> <value> ...]  # project fields, or a service's role/kind/version/icon
catalogus link <from> <to> # one edge between services that already exist
catalogus unlink <from> <to> # remove that one edge, leaving both entries in place
catalogus deprecate <id> [--status phasing_out] [--replaced-by <id>]
catalogus remove <id>      # delete a wrong entry, every edge naming it, and its vendored icon
catalogus rename <old> <new> # change a local id, moving its edges, replaced_by and vendored icon with it
catalogus validate         # schema, referential integrity, acyclicity, private-data guard
catalogus diff             # detected vs declared, both directions
catalogus graph [--mermaid] # render the DAG
catalogus icons            # which services have no icon, and where each icon file lives
```

### There is no hand-edit exception

A wrong role/id/edge is `set`, `rename` or `unlink`, never remove-and-re-add. Visibility is asked, never
guessed. On the tool path, `apply_manifest_edit` takes the same `edits` a proposal took — the
fragment below shows the resulting shape, for reading rather than copying:

```
catalogus set project.vcs.visibility private
```

<!-- catalogus:fragment -->
```yaml
project:
  architecture: "modular monolith (.NET 10, vertical slices)"
  vcs:
    visibility: private       # public | private | internal

services:
  - id: board                 # PM tool -- role: pm, not project.pm
    service: trello
    role: pm
  - id: claude-code            # coding agent -- role: coding-agent, no kind (defaults to service)
    service: claude-code
    role: coding-agent
  - id: github                # VCS provider -- role: vcs, not project.vcs.provider
    service: github
    role: vcs
  - id: vertex                # an entry catalogus add already created
    status: phasing_out       # active | deprecated | phasing_out | removed
    replaced_by: anthropic-api
  - id: dotnet
    kind: stack               # service (default) | component | stack
    version: "10"             # free-form: what a tile shows, what an EOL date keys off
  - id: loki                  # a service catalogus icons reported as "none"
    icon: .catalogus/icons/loki.svg  # written by catalogus set services.<id>.icon <url|path>
```

## The one rule that matters

`catalogus.yaml` is **Layer 2**: committed, must stay safe in a public repo. **Never write** cost,
billing, account/tenant identifiers, usernames, emails, API keys, tokens, passwords or connection
strings — that's **Layer 3** (`catalogus push --private`). Read configuration key names, never
values, and remember a service identifier is not a service name.

## Procedure

### 1. Scan

Tool path: call `detect_stack` first — same diff `catalogus diff` prints, plus a `hasDiff` flag. An
entry declared but not visible to detection is a lead to check, never a delete list (see step 3).

```
catalogus detect
```

Read the output as three kinds of node — the kind is the flag you pass to `add` — plus noise:

- **`service`** — a vendor with an account and an outage risk (Supabase, Stripe, Fly.io). Default; no `--kind`.
- **`component`** — infrastructure the project runs itself, on the request path (nginx, an OTel transport). `--kind component`.
- **`stack`** — the language/runtime/framework the code is written in (.NET, React). Attach it by an edge to whatever runs it, and give it `--version`. `--kind stack`.

Noise (ESLint, Vitest) isn't an entry, and detection can't see outside the repo. When it can't tell
what an agent is, ask the owner, then `catalogus add <agent> --role coding-agent`.

### 2. Create the manifest

Tool path: call `init_manifest` — no prompt (a server has none), `visibility` only when given,
`force` to re-create.

```
catalogus init --yes
```

Writes the project name (guessed) and, with `--visibility`, `project.vcs` — no service entries yet
(those need a role, step 6). If a manifest exists already, run `catalogus diff` instead of
re-initialising; `catalogus remove <id>` undoes a wrong entry.

### 3. Corroborate against configuration

`catalogus detect` already reads most of this; read the files yourself too, since a provider outside
its catalog leaves an unclaimed key group:

| Source | What it proves |
|---|---|
| `appsettings*.json`, `.env.example`, `config/*.yml` | The authoritative service list — one key group per provider |
| `docker-compose.yml` | Local dependencies: databases, caches, queues |
| `fly.toml`, `vercel.json`, `netlify.toml`, `render.yaml`, `wrangler.toml` | Hosting, often one file per deployed app |
| `.github/workflows`, `.gitlab-ci.yml` | CI provider and the deployment chain |
| `docs/ARCHITECTURE.md`, `README.md` | Architecture style and PM tool, in prose |
| Dependency registration (`Program.cs`, `DependencyInjection.cs`, a startup/module file) | Providers actually wired, even ones no settings file names |
| Client/adapter classes (`Infrastructure/`, `clients/`, `providers/`) | One class per external system |
| A configuration-guard class | What the app refuses to start without |
| Diagrams under `docs/` | What the team believes, not what's true — a checklist |

A key group's location is an edge (`Stripe` in `Api/appsettings.json` proves `api -> stripe`) — derive
edges this way before step 5. A service can be absent from every readable file; "declared but not
visible" is a lead, not proof of removal, and configuration wins over prose.

### 4. Work out what is missing

- **Edges no config shows**: off-repo wiring, a proxy you can't see through, a dependency no config states.
- **Registrar and DNS.**
- **PM tooling** (the tool, not the methodology).
- **Architecture style**, as the owner would say it.
- **Lifecycle**: what's being phased out, what replaces it.
- **When each dependency was added**: try `git log --diff-filter=A --format=%ad --date=short --
  <path> | tail -1` (or `git log -S "<Key>"` for a config-only add) before asking.

Batch these per service and offer what you find as a default the user can correct.

### 5. Ask the user — well

Ask once, in a batch, with evidence attached, so the user confirms or corrects rather than composes
from nothing. Answer what the repo can settle yourself first (services, who talks to which provider,
CI/hosting, `added` dates, the VCS provider); ask only what a scan can never find: registrar, PM
tooling, lifecycle, off-repo edges, the owner's own description of the architecture.

> Derived from configuration: web → api (`VITE_API_URL`), api → stripe/supabase/openai (key groups
> in `appsettings.json`), github-actions → fly-io (deploy job).

Mark which edges are derived versus guessed. Surface a contradiction only when it changes what gets
written — not a codename differing from the product name; `catalogus set project.name "<answer>"`
corrects the name if `init --yes` guessed wrong.

### 6. Record the answers

Tool path: batch every edit (`add`/`set`/`link`/`unlink`/`deprecate`/`remove`/`rename`) into one
`edits` array and call `propose_manifest_edit` once; show the diff (one, not twenty), then call
`apply_manifest_edit` with the same `edits` plus `baseSha256`. A refusal saying the file changed
means propose again.

CLI path, `catalogus diff` is the work list:

```
catalogus diff
catalogus add supabase --role database --id supabase-db
```

One service in two roles is two entries with distinct ids; edges point from depender to dependency.

#### Naming a role

`role` is free text; start from a base word, reused rather than a new synonym:

```
hosting   database  auth      storage   cache     queue     search
ai        payments  email     sms       monitoring logs     analytics
dns       registrar cdn       vcs       ci        pm        secrets
coding-agent
```

`coding-agent` is fixed for every coding agent; stack/component entries use `runtime`, `language`,
`ui-framework`, `ingress-proxy` or `telemetry-transport` — the text before the first `-` is the rollup key.

### 7. Validate

Tool path: `validate_manifest` (`strict: true`) and `render_graph` (`format: "mermaid"`).

```
catalogus validate         # exit 0 valid, 1 invalid, 2 usage error such as no manifest found
catalogus graph            # sanity-check the shape of what you built
```

Run after every change. `--strict` fails on soft word-matches too; the hard tier (an email, an
amount, an API-key shape) always fails. Report a false-positive rejection instead of rewording.

### 7b. Fill in missing icons

Tool path: `list_icons`, then a `set` edit on `services.<id>.icon`.

```
catalogus icons
```

reports each entry's icon as `local` (vendored), `simple-icons`/`thesvg` (built-in catalogs), or
`none`. For `none`, search the web for the brand's mark and run `catalogus set services.<id>.icon
<https-url-or-path>` — the sanitiser refuses scripts, event handlers, external references and
anything over 256 KB. When nothing turns up, ask instead of approximating a mark; list every icon you
set and its source. Re-run `catalogus icons` after setting one: a row marked `(check: ...)`, the
trailing `icons to check in the viewer` line, or a `check services.<id>.icon renders` line from `set`
itself means the file paints with white or pale ink that can vanish on the viewer's light ground —
don't judge the render yourself, ask the user to open `catalogus view` and confirm it reads well, and
set a different source if it doesn't.

### 8. Hand the viewer to the user — do not run it yourself

`catalogus view` serves the manifest at `127.0.0.1:4180` — tell the user and let them run it; it's a
server, blocking until `Ctrl+C`, same as `catalogus mcp` (wired up once, never by you). **Fenced means
you run it; prose means it's for the user** — neither is ever fenced. Your own check is `catalogus
graph`.

## Common mistakes

- Hand-writing the manifest — say so instead, on either surface.
- Listing libraries as services (React, Tailwind aren't dependencies).
- Promoting a doc mention into a dependency — configuration is evidence, prose is a question.
- Leaving the manifest with no edges — ask if the user hasn't given them.
- Copying configuration values — key names only.
- Recording tenant identifiers (project refs, account numbers, org slugs).
- Inventing `added` dates — check git, offer a default, or ask.
- Inventing or approximating an icon when a web search finds nothing — ask for a URL or file.
- Deciding a `(check: ...)`-flagged icon renders fine yourself — ask the user to look in `catalogus view`.
- Guessing past a contradiction, or rewording prose to satisfy a validator — surface or report it.
- Deleting `catalogus.yaml`, or re-adding an entry, instead of `catalogus remove`/`unlink`.
- Running `catalogus view`/`catalogus mcp` yourself, or the CLI through a shell while tools connect.
- Applying without proposing, or after the file changed: propose again.

## Layer 3

Cost and account data never touches this file — point the user at `catalogus push --private`
(`push_private`, once Phase 5 lands).
