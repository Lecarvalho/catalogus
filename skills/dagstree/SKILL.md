---
name: dagstree
description: Catalog a project's service providers, infrastructure and stack metadata into a dagstree.yaml manifest, using the `dagstree` CLI. Runs the scanner, then fills in what a scan can never reveal — dependency edges, registrar, PM tooling, architecture style, lifecycle — by asking the user the right questions and recording the answers. Use when the user asks to catalog, inventory or map this project's services, dependencies, infrastructure or stack; to create, fill in, audit or update a dagstree.yaml or stack.yaml; to answer "what does this project depend on"; or mentions Dagstree by name.
---

# Dagstree — cataloging a project

Dagstree is a project operations registry. For each project it records the service providers,
infrastructure, dependencies and stack metadata behind it, so questions like "what does this
project depend on", "which projects break if this vendor goes down", and "what am I paying for"
have one answer instead of none.

This skill covers one job: producing an accurate `dagstree.yaml` for the repository you are
currently in.

The scanner gets you perhaps two thirds of the way. The rest — which service talks to which, who
the registrar is, what is being phased out — is not in the repository at all, and no amount of
reading will find it. **That part is your job, and it is the part that makes the manifest worth
having.** A manifest containing only what a scanner found is a list with icons.

## The CLI does the writing

**The `dagstree` CLI is required.** Check it first:

```
dagstree --version
```

If that fails, stop and tell the user the CLI is not installed. **Do not hand-write a manifest from
scratch as a substitute.** The CLI owns the file format, derives ids, checks referential integrity
and acyclicity, and refuses to write private data. A hand-rolled manifest bypasses all of that and
will drift from the schema the moment it changes.

The commands you will use:

```
dagstree detect            # what the scanner can see, grouped by category
dagstree init --yes        # create the manifest: project fields only, no service entries
dagstree add <service> --role <r> [--depends-on <id>...] [--id <id>]
dagstree set <field> <value> [<field> <value> ...]   # project-level fields
dagstree link <from> <to>  # one edge between services that already exist
dagstree deprecate <id> [--status phasing_out] [--replaced-by <id>]
dagstree validate          # schema, referential integrity, acyclicity, private-data guard
dagstree diff              # detected vs declared, both directions
dagstree graph [--mermaid] # render the DAG
```

`dagstree add` is how services and edges get into the file. Do not append service entries by hand:
`add` derives the local id, rejects duplicates, validates before writing, and preserves the comments
and `$schema` modeline that a parse-and-rewrite would destroy.

### There is no hand-edit exception

Every Layer 2 field has a command behind it. Do not open `dagstree.yaml` in an editor:

```
dagstree set project.architecture "modular monolith (.NET 10, vertical slices)"
dagstree set project.pm "Trello kanban"
dagstree set project.vcs.provider github project.vcs.visibility private
dagstree set project.coding_agents claude-code,codex
dagstree link fly-api supabase-db
dagstree deprecate vertex --status phasing_out --replaced-by anthropic-api
```

`project.vcs` takes both halves in one call: the schema requires provider and visibility together,
so neither can be written alone. `set` takes `--path` rather than a positional directory, because
its pair list is variadic.

If a field you need has no command, say so rather than working around it with an editor — a hand
edit is how a manifest ends up failing a client's CI. The shape those commands produce, as a
fragment, for reading rather than copying:

<!-- dagstree:fragment -->
```yaml
project:
  architecture: "modular monolith (.NET 10, vertical slices)"
  pm: "Trello kanban"
  vcs:
    provider: github          # github | gitlab | bitbucket | other
    visibility: private       # private | public
  coding_agents:
    - claude-code
    - codex

services:
  - id: vertex                # an entry dagstree add already created
    status: phasing_out       # active | deprecated | phasing_out | removed
    replaced_by: anthropic-api
```

Every one of those commands validates before it writes and preserves the comments and `$schema`
modeline already in the file, so **run `dagstree validate` to confirm, not to repair.**

## The one rule that matters

`dagstree.yaml` is **Layer 2**: committed to the repository, and it must stay safe to publish in a
public repo.

**Never write into it:** cost or price, billing details, plan tier, renewal dates, account
identifiers, usernames, email addresses, API keys, tokens, passwords, connection strings, or project
and tenant identifiers.

That data is **Layer 3** and belongs in the private overlay, reachable only through
`dagstree push --private`. If the user offers you cost or account information, do not put it in the
file — say where it goes instead. The CLI will refuse it, but it should never get that far.

The practical form of this rule while you work: **read configuration key names, never configuration
values.** `appsettings.json` telling you there is a `Stripe.SecretKey` setting is exactly the
evidence you want. The value of that setting is exactly what you must not look at, quote, or copy.
Prefer commands that list structure over commands that print contents.

A second rule follows: **a service identifier is not a service name.** A Supabase project ref, an
AWS account number, a Fly org slug — these identify a specific live tenant. Record that the project
uses Supabase; never record which Supabase project.

## Procedure

### 1. Scan

```
dagstree detect
```

Read the output critically before using it.

**It reports libraries as well as services.** TypeScript, React, Tailwind, ESLint, Vite and Serilog
are not service dependencies. A useful test: if it cannot have an outage and cannot send an invoice,
it is not a service entry. Languages and frameworks belong in the architecture description, if
anywhere.

**It cannot see anything outside the repo.** The registrar, the PM board, the error tracker someone
set up in a web console — none of it leaves a trace in the files.

### 2. Create the manifest

```
dagstree init --yes
```

This writes `dagstree.yaml` with the project name, VCS provider and coding agents inferred from
detection, and **no service entries**. That is deliberate: a service entry needs a `role` — what
this instance does here, `database`, `hosting-api` — and detection only knows a *category*
(`db`, `ai`, `other`). Services go in one at a time in step 6, each with a role you decided on.

`init` prints how many services detection found and tells you to run `dagstree diff` for the list.

If a manifest already exists, do not re-initialise it — run `dagstree diff` and work from what it
reports as missing or stale. **Never delete `dagstree.yaml` to start over.** It is a committed file
that may hold answers a previous session got from the user, and nothing in this procedure requires
a clean slate.

### 3. Corroborate against configuration

`dagstree detect` reads dependency manifests *and* configuration key names, so most of the table
below is already covered — evidence lines reading `config key: Stripe` are that pass. Read the
files yourself anyway: detection matches provider names it knows, and a provider outside its
catalog leaves a key group nobody claimed. A settings key means someone actually wired the thing
up, which is stronger evidence than a package that may only be a transitive dependency.

| Source | What it proves |
|---|---|
| `appsettings*.json`, `.env.example`, `config/*.yml` | The authoritative service list — one key group per provider |
| `docker-compose.yml` | Local dependencies: databases, caches, queues |
| `fly.toml`, `vercel.json`, `netlify.toml`, `render.yaml`, `wrangler.toml` | Hosting, often one file per deployed app |
| `.github/workflows`, `.gitlab-ci.yml` | CI provider and the deployment chain |
| `docs/ARCHITECTURE.md`, `README.md` | Architecture style and PM method, in prose |

**Separate proven from mentioned.** A provider named in a design document or an ADR is not a
dependency. A provider with a configuration key, an SDK dependency or a client class is. Grepping
documentation produces a longer, wronger list than reading configuration does — when they disagree,
configuration wins, and anything appearing only in prose becomes a question for the user rather than
an entry in the file.

### 4. Work out what is missing

These can never be read out of a repository. They are why this skill asks questions:

- **Dependency edges.** Which service talks to which. The single most valuable thing in the
  manifest — it is what makes impact analysis possible — and nothing in the repo states it.
- **Domain registrar and DNS.**
- **PM tooling and methodology.**
- **Architecture style**, as the owner would describe it rather than as inferred from directory names.
- **Lifecycle**: what is being phased out, what replaces it, what is deprecated.
- **When each dependency was added.** Often recoverable — see below.
- **Anything from Layer 3.** Not your business here.

For `added` dates, try git before asking:

```
git log --diff-filter=A --format=%ad --date=short -- <path> | tail -1
git log -S "<ProviderKeyName>" --format=%ad --date=short --reverse | head -1
```

Offer what you find as a default the user can correct, rather than asking cold.

### 5. Ask the user — well

This is the part that determines whether the manifest is worth anything. Ask once, in a batch, with
your evidence attached, so the user is confirming or correcting rather than composing from nothing.
Do not interrogate one field at a time, and do not ask for anything you could have looked up.

**Resolve prose-only providers:**

> Configuration keys show OpenAI, Anthropic, Gemini/Vertex and ElevenLabs wired in the backend. The
> docs also mention Stability and Replicate, but neither has a config key — are those in use, or
> were they evaluated and dropped?

**Get the edges by proposing a shape rather than asking an open question.** People find it much
easier to correct a wrong diagram than to produce a right one:

> I can see four Fly apps — api, web, grafana, loki. My assumption is web → api, api → everything
> external, grafana → loki. Is anything else talking directly to the database, or does it all go
> through the API?

**Surface contradictions instead of picking a side.** Guessing wrong here corrupts the record:

> The directory is `Clapline` but the .NET namespaces and `docs/ARCHITECTURE.md` say `Sluglin`.
> Which is the project name, and is the other a former name or a separate project?

**Ask about lifecycle**, which is invisible to any scan and is half the point of the registry:

> Is anything here on the way out? If something is being replaced, I can record what replaces it so
> the migration shows up on the phase-out dashboard.

Prefer multiple choice when the plausible answers are few. Reserve open questions for genuinely open
things like architecture style.

### 6. Record the answers

`dagstree diff` is the work list: it prints every detected service not yet in the manifest. Add them
one at a time, each with a real role, plus everything the user told you that detection could not see:

```
dagstree diff
dagstree add supabase --role database --id supabase-db
dagstree add supabase --role auth --id supabase-auth --depends-on supabase-db
```

One service used in two roles is **two entries with distinct ids**, not one entry with two roles.
Four Fly apps are four entries. Edges point from the depender to the dependency:
`--depends-on supabase-db` on the auth entry means auth needs the database.

Project-level answers through the CLI too — architecture, PM tooling, VCS, coding agents via
`dagstree set`; an edge you remember later via `dagstree link`; a phase-out via
`dagstree deprecate`. Nothing gets hand-edited.

### 7. Validate

```
dagstree validate          # exit 0 valid, 1 invalid, 2 usage error such as no manifest found
dagstree validate --strict # warnings become errors; the right setting for CI
dagstree graph             # sanity-check the shape of what you built
```

Run this after every change, not once at the end.

**If validation rejects something that is genuinely ordinary prose, that is a bug in the guard, not
a signal to reword the user's text.** Report it. The manifest should say what is true, and a guard
that pushes users into worse prose needs fixing rather than accommodating.

## Common mistakes

- **Hand-writing the manifest** because the CLI was missing. Stop and say so instead.
- **Listing libraries as services.** React and Tailwind are not service dependencies.
- **Promoting a documentation mention into a dependency.** Configuration is evidence; prose is a
  question.
- **Leaving the manifest with no edges.** The edges are the product. If the user has not given them
  to you, ask.
- **Copying configuration values.** Key names only, always.
- **Recording tenant identifiers** — project refs, account numbers, org slugs.
- **Inventing `added` dates.** Check git, offer a default, or leave the field for the user.
- **Guessing past a contradiction** instead of surfacing it.
- **Rewording good prose to satisfy a validator.** Report the false positive instead.
- **Deleting `dagstree.yaml` and starting over.** There is currently no `dagstree remove`, so a
  wrong `add` cannot be undone by the CLI — say so and let the user decide, rather than clearing
  the file. Everything else in the flow is additive and needs no reset.

## Layer 3

Cost and account data needs the platform and never touches this file. If the user asks where
spending information goes, tell them `dagstree push --private` once they are set up, and leave it
out of the manifest either way.
