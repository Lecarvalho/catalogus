---
name: catalogus
description: Catalog a project's service providers, infrastructure and stack metadata into a catalogus.yaml manifest, using the `catalogus` CLI. Runs the scanner, then fills in what a scan can never reveal — dependency edges, registrar, PM tooling, architecture style, lifecycle — by asking the user the right questions and recording the answers. Use when the user asks to catalog, inventory or map this project's services, dependencies, infrastructure or stack; to create, fill in, audit or update a catalogus.yaml or stack.yaml; to answer "what does this project depend on"; or mentions Catalogus by name.
---

# Catalogus — cataloging a project

Catalogus is a project operations registry. For each project it records the service providers,
infrastructure, dependencies and stack metadata behind it, so questions like "what does this
project depend on", "which projects break if this vendor goes down", and "what am I paying for"
have one answer instead of none.

This skill covers one job: producing an accurate `catalogus.yaml` for the repository you are
currently in.

The scanner gets you perhaps two thirds of the way. The rest — which service talks to which, who
the registrar is, what is being phased out — is not in the repository at all, and no amount of
reading will find it. **That part is your job, and it is the part that makes the manifest worth
having.** A manifest containing only what a scanner found is a list with icons.

## The CLI does the writing

**The `catalogus` CLI is required.** Check it first:

```
catalogus --version
```

If that fails, stop and tell the user the CLI is not installed. **Do not hand-write a manifest from
scratch as a substitute.** The CLI owns the file format, derives ids, checks referential integrity
and acyclicity, and refuses to write private data. A hand-rolled manifest bypasses all of that and
will drift from the schema the moment it changes.

The commands you will use:

```
catalogus detect           # what the scanner can see, grouped by category
catalogus init --yes [--visibility <v>]  # create the manifest: project fields only, no service entries
catalogus add <service> --role <r> [--kind <k>] [--version <v>] [--depends-on <id>...] [--id <id>]
catalogus set <field> <value> [<field> <value> ...]  # project fields, or a service's role/kind/version/icon
catalogus link <from> <to> # one edge between services that already exist
catalogus unlink <from> <to> # remove that one edge, leaving both entries in place
catalogus deprecate <id> [--status phasing_out] [--replaced-by <id>]
catalogus remove <id>      # delete a wrong entry, and every edge naming it
catalogus rename <old> <new> # change a local id, moving its edges and replaced_by with it
catalogus validate         # schema, referential integrity, acyclicity, private-data guard
catalogus diff             # detected vs declared, both directions
catalogus graph [--mermaid] # render the DAG
catalogus icons            # which services have no icon, and where each icon file lives
```

`catalogus add` is how services and edges get into the file. Do not append service entries by hand:
`add` derives the local id, rejects duplicates, validates before writing, and preserves the comments
and `$schema` modeline that a parse-and-rewrite would destroy.

### There is no hand-edit exception

Every Layer 2 field has a command behind it. Do not open `catalogus.yaml` in an editor:

```
catalogus set project.architecture "modular monolith (.NET 10, vertical slices)"
catalogus set project.vcs.visibility private
catalogus add trello --role pm
catalogus add claude-code --role coding-agent
catalogus add github --role vcs
catalogus set project.name "Sluglin" project.slug sluglin
catalogus set services.supabase-db.role database
catalogus set services.dotnet.version 10
catalogus set services.loki.icon https://example.com/brand/loki.svg
catalogus link fly-api supabase-db
catalogus deprecate vertex --status phasing_out --replaced-by anthropic-api
```

`project.name` and `project.slug` are settable even though `init` writes them first: its `--yes`
value is a directory name, which is a guess, and this is how you correct it once you know better.
A service's `role` is settable the same way — a wrong role is a `set`, not a remove-and-re-add.
A wrong *id* is a `catalogus rename <old> <new>`, not a remove-and-re-add either: it moves both
endpoints of every edge and any other entry's `replaced_by` along with the entry, which is the part
a delete-and-recreate loses. A single edge that has gone stale — an entry's role changed and one of
its dependencies no longer applies — is a `catalogus unlink <from> <to>`, not a remove-and-re-add of
the entry either: the entry itself is still correct, and `remove` would delete it along with every
other edge that names it.

`project.vcs` carries only `visibility` now — the PM tool, the VCS provider and each coding agent
are service entries (`role: pm`, `role: vcs`, `role: coding-agent`), added with `catalogus add`, not
project fields written with `set`. This is the 2026-08-24 change: the manifest used to state some
things twice (`github` as both `project.vcs.provider` and a `role: vcs` service entry; Trello as
both free-text `project.pm` and a `role: pm` service entry), and a project-level field can never be
an edge target — `[github-actions, github]` is a real edge, so the VCS provider has to be a service
entry to be one of its endpoints. `set` takes `--path` rather than a positional directory regardless,
because its pair list is variadic.

**Visibility is asked, never guessed.** `init` prompts for it, and `init --yes` writes
`project.vcs` only if you passed `--visibility`; otherwise it omits the block and tells you the
`set` command that fills it. Nothing in a checkout says whether its remote is public, so if you do
not know, ask the owner — one question is cheaper than a wrong value in a committed file, and a
wrong default that happens to look right is one nobody ever goes back and checks.

If a field you need has no command, say so rather than working around it with an editor — a hand
edit is how a manifest ends up failing a client's CI. The shape those commands produce, as a
fragment, for reading rather than copying:

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

Every one of those commands validates before it writes and preserves the comments and `$schema`
modeline already in the file, so **run `catalogus validate` to confirm, not to repair.**

## The one rule that matters

`catalogus.yaml` is **Layer 2**: committed to the repository, and it must stay safe to publish in a
public repo.

**Never write into it:** cost or price, billing details, plan tier, renewal dates, account
identifiers, usernames, email addresses, API keys, tokens, passwords, connection strings, or project
and tenant identifiers.

That data is **Layer 3** and belongs in the private overlay, reachable only through
`catalogus push --private`. If the user offers you cost or account information, do not put it in the
file — say where it goes instead. The CLI will refuse it, but it should never get that far.

The practical form of this rule while you work: **read configuration key names, never configuration
values.** `appsettings.json` telling you there is a `Stripe.SecretKey` setting is exactly the
evidence you want. The value of that setting is exactly what you must not look at, quote, or copy.
Prefer commands that list structure over commands that print contents.

A second rule follows: **a service identifier is not a service name.** A Supabase project ref, an
AWS account number, a Fly org slug — these identify a specific live tenant. Record that the project
uses Supabase; never record which Supabase project.

## Procedure

**Run `catalogus detect` before you read anything.** It is the first action, not a step you reach
after orienting yourself. It reads dependency manifests and configuration key names across the tree
and reports each finding with the file that proved it, which is most of a manual exploration pass
already done — and its output tells you which files are worth opening. Exploring first means
re-deriving by hand what one command produces in a second, and burning the context you need for the
part that actually requires judgement.

**Then work in parallel, because almost none of what follows is ordered.** The corroboration files
in step 3 do not depend on each other, and the `added` date for one service does not depend on
another's. Issue them as one batch rather than a chain: on a repo with twenty services, walking them
one at a time is the difference between a minute and twenty, and the result is identical. A batch is
either form — several tool calls in a single response where your harness runs them concurrently, or
one command that covers many files (`for f in fly.toml fly.web.toml ...; do ...; done`). The second
is often better for reading files, since it is one round trip rather than several. What matters is
not issuing twenty round trips for twenty independent questions. Only the CLI writes in step 6 are genuinely sequential, because they share one file and
`--depends-on` needs its target to exist first.

If your harness can delegate a read-only research pass to a separate context, that is better still —
the reads are large and their answers are small, so delegating keeps your own context for step 5,
which is the part that carries the value. Two conditions if you do. Seed it with what
`catalogus detect` already found rather than sending it in blind, or it will re-derive by hand what
one command already produced. And give it the same rule you work under: key names and file paths,
never configuration values, and evidence attached to every claim rather than conclusions.

### 1. Scan

```
catalogus detect
```

Read the output critically before using it.

**Read it as three kinds of node plus noise.** `detect` names the kind of anything that is not
noise, and the kind is a flag you pass straight to `add`:

- **`service`** — a vendor. It has an account, it can bill you, and someone else's outage is your
  outage. Supabase, Stripe, Fly.io, a registrar. This is the default; `add` writes no `kind` line
  for it.
- **`component`** — infrastructure the project runs itself. No account and no invoice, but it is on
  the request path and it can fail: nginx inside the web image, an OpenTelemetry transport carrying
  logs to Loki. `--kind component`.
- **`stack`** — the language, runtime or framework the code is written in. .NET, React, Python,
  Angular. Attach it by an edge to whatever runs it (`--depends-on` from the API entry, or
  `catalogus link fly-api dotnet`), and give it `--version` — that is the number a tile shows and
  the one an end-of-life date keys off. `--kind stack`.
- **noise** — ESLint, Prettier, Vitest, a build tool. Code a developer runs, not something the
  project depends on at runtime. `detect` collapses these under a count; they are not entries in
  any kind.

The old rule here was "if it cannot have an outage and cannot send an invoice, it is not a service
entry, and languages and frameworks belong in the architecture description". That was wrong in both
halves. It threw away nginx and OpenTelemetry, which are real nodes with real failure modes and no
vendor behind them. And it put the stack in free text, where nothing can render it or key an EOL
date off it — `project.architecture` is the *shape* (modular monolith, vertical slices), which is
not the stack.

The line that replaces it is **runtime topology, not vendor relationship**: if it is on the path a
request takes, or it is what the code is written in, it is a node. If it only runs on a developer's
machine or at build time, it is not.

**It cannot see anything outside the repo.** The registrar, the PM board, the error tracker someone
set up in a web console — none of it leaves a trace in the files.

**When it cannot tell, it says so instead of picking.** `AGENTS.md` and `.agents/` prove a coding
agent works in this repo without naming which one, so `detect` reports them as unidentified rather
than inventing an agent. That is a question for the owner: ask, then
`catalogus add <agent> --role coding-agent`. The same applies everywhere in this
procedure — an unanswered field is a question, never a plausible default. A guess that happens to
be right is worse than a gap, because nobody goes back to check it.

### 2. Create the manifest

```
catalogus init --yes
```

This writes `catalogus.yaml` with the project name inferred from the directory and, if you pass
`--visibility`, `project.vcs.visibility` — and **no service entries at all**, not even ones
detection can name with confidence. A VCS provider and a coding agent are both service entries now
(`role: vcs`, `role: coding-agent`), so `init` does not write them either: it tells you what
detection found and the `catalogus add ... --role ...` command that records each one, the same way
it already does for every other detected service. It does not write `project.vcs` at all unless you
pass `--visibility`, because visibility cannot be detected — see "Visibility is asked, never
guessed" above. That is deliberate for services generally: a service entry needs a `role` — what
this instance does here, `database`, `hosting-api` — and detection only knows a *category*
(`db`, `ai`, `other`). Services go in one at a time in step 6, each with a role you decided on.

`init` prints how many services detection found and tells you to run `catalogus diff` for the list.

If a manifest already exists, do not re-initialise it — run `catalogus diff` and work from what it
reports as missing or stale. **Never delete `catalogus.yaml` to start over.** It is a committed file
that may hold answers a previous session got from the user, and nothing in this procedure requires
a clean slate. If a wrong entry needs undoing — a typo'd role, a service that turns out not to be
used — `catalogus remove <id>` takes it out, along with every dependency edge that named it; see
step 6.

### 3. Corroborate against configuration

`catalogus detect` reads dependency manifests *and* configuration key names, so most of the table
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
| `docs/ARCHITECTURE.md`, `README.md` | Architecture style, and which PM tool is in use, in prose |
| Dependency registration — `Program.cs`, `DependencyInjection.cs`, a `startup`/module file | Which providers are actually constructed and wired, including ones no settings file names |
| Client and adapter classes, often under `Infrastructure/`, `clients/`, `providers/` | One class per external system, usually named after it |
| A settings-validation or required-configuration guard class | The authoritative list of what the app refuses to start without |
| C4 / PlantUML / Mermaid diagrams under `docs/` | What the team believes it depends on — a checklist to verify, not a source |

**Where a key group lives is itself an edge.** This is the most under-used evidence in the repo. A
`Stripe` key group inside `src/backend/Api/appsettings.json` does not merely prove the project uses
Stripe — it proves *the API* uses Stripe, which is the edge `api -> stripe`. The same reading
applies across the board: a frontend's API base URL proves `web -> api`; a reverse-proxy config
(nginx, Caddy, a Fly `[[services]]` block) proves what sits in front of what; a deploy job in
`.github/workflows` proves `github-actions -> <hosting provider>`; Grafana provisioning under
`grafana/provisioning/datasources/` names every datasource it queries; a CDN distribution config
names its origin. Derive every edge you can this way *before* step 5, and carry the file that proved
each one.

**A service can be absent from every file you are able to read.** Local-only configuration is
routinely gitignored — `appsettings.Development.json`, `.env.local`, `ops/secrets/*.env` — so a
provider can be fully wired in the running system and leave no trace in the checkout. This is not
hypothetical: on a real .NET repo, five of twenty-one services, including the database, the auth
provider and object storage, had no key in any committed settings file. **Code is what closes that
gap**, which is why dependency registration, adapter classes and configuration-guard classes are in
the table above — they name a provider whether or not a settings file does.

The corollary matters when you read `catalogus diff`: an entry listed under **"declared in the
manifest but not visible to detection here" is not automatically stale.** It may be a service
configured only in a file detection cannot see, or one no scan could ever find. `diff` reports what
detection can see, never what is true, and it says so under that list. Do not remove an entry on
that basis alone. Where `diff` can name a reason it does — an entry the manifest already marks
`deprecated`/`phasing_out` is annotated as expected, and anything detection could not read is
listed under "Detection could not read everything in this checkout".

An architecture diagram earns its row above the same way prose does — as a checklist of what to go
and verify in code, never as the record itself. The gap runs both ways: the same run found a storage
provider unconditionally wired in code and missing from the team's own context diagram.

**Separate proven from mentioned.** A provider named in a design document or an ADR is not a
dependency. A provider with a configuration key, an SDK dependency or a client class is. Grepping
documentation produces a longer, wronger list than reading configuration does — when they disagree,
configuration wins, and anything appearing only in prose becomes a question for the user rather than
an entry in the file.

### 4. Work out what is missing

These are what remains after step 3. They are why this skill asks questions:

- **Dependency edges that configuration does not show.** Edges are the most valuable thing in the
  manifest — they are what makes impact analysis possible — but "no scanner produces them" is not
  the same as "the repo does not state them", and treating the whole edge set as unknowable is the
  most common way this skill is run badly. Step 3 derives a large share of them from configuration.
  What genuinely remains is: edges between two off-repo services wired in a web console (a CDN to
  its bucket, an alert channel to a chat workspace), whether a proxy or gateway sits in a path you
  can only see the endpoints of, and edges that exist for a semantic reason no config states — a
  service that reads another's data by convention rather than by client. Bring those, not the ones
  you could have read.
- **Domain registrar and DNS.**
- **PM tooling.** (Methodology itself — "kanban, one card per shipped change" — has no Layer 2
  field; it is not modeled here.)
- **Architecture style**, as the owner would describe it rather than as inferred from directory names.
- **Lifecycle**: what is being phased out, what replaces it, what is deprecated.
- **When each dependency was added.** Often recoverable — see below.
- **Anything from Layer 3.** Not your business here.

For `added` dates, try git before asking:

```
git log --diff-filter=A --format=%ad --date=short -- <path> | tail -1
git log -S "<ProviderKeyName>" --format=%ad --date=short --reverse | head -1
```

That is one pair of commands *per service*, and they are independent of each other — issue them as
one batch. Run serially on a twenty-service repo, this single step is usually the slowest thing in
the whole procedure, and nothing about it is ordered.

Offer what you find as a default the user can correct, rather than asking cold.

### 5. Ask the user — well

This is the part that determines whether the manifest is worth anything. Ask once, in a batch, with
your evidence attached, so the user is confirming or correcting rather than composing from nothing.
Do not interrogate one field at a time.

**Before each question, answer it yourself first.** If the repository can settle it, settling it and
showing your evidence is always better than asking — a question the user can see you could have
answered costs their trust in every other question in the batch. These are effectively always
discoverable, and asking about them cold is a defect in how this skill was run: which services
exist, which app talks to which provider (step 3), the CI provider and what it deploys, the hosting
provider per deployed app, when a dependency was added (git, below), and the VCS provider. These
are never discoverable and are what the batch is for: registrar, PM tooling, lifecycle, off-repo
services, and the owner's own description of the architecture.

**Resolve prose-only providers:**

> Configuration keys show OpenAI, Anthropic, Gemini/Vertex and ElevenLabs wired in the backend. The
> docs also mention Stability and Replicate, but neither has a config key — are those in use, or
> were they evaluated and dropped?

**Propose the derived edge graph and mark which edges are evidence-backed.** People find it much
easier to correct a wrong diagram than to produce a right one — but the diagram should be mostly
*read*, not assumed, and the user needs to see which is which. An edge you derived is a statement
they can check against reality; an edge you guessed is a question wearing a diagram's clothes, and
presenting the two identically invites a nod that confirms nothing.

> Derived from configuration: web → api (`VITE_API_URL` in `web/.env.example`), api → stripe,
> supabase, openai (key groups in `src/backend/Api/appsettings.json`), github-actions → fly-io
> (deploy job in `.github/workflows/deploy.yml`), grafana → loki and prometheus (datasource
> provisioning).
>
> I could not determine: whether web reaches the api directly or through the nginx proxy, whether
> anything besides the api talks to the database, and where the OTLP exporter actually ships to.

**Surface a contradiction when it changes the manifest.** Guessing wrong on one of those corrupts
the record:

> `docs/ARCHITECTURE.md` says the queue is SQS, but the only queue configuration in the repo is
> RabbitMQ in `docker-compose.yml`. Which one is running in production?

Scope this to contradictions that change what gets written — two providers claimed for the same job,
a service named in prose with no configuration behind it, an environment that disagrees with the
deploy config. **A codename is not a contradiction.** A repository whose namespaces or solution file
carry an internal name different from the product name is ordinary, and reconciling the two is not
this skill's job: the deliverable is the providers, the services, the external dependencies and the
relationships between them. Record the project name the owner uses and move on.

If the project name does turn out to be wrong — `init --yes` derived it from the directory, which is
a guess — `catalogus set project.name "<answer>"` corrects it, plus `project.slug` if that should
change too.

**Ask about lifecycle**, which is invisible to any scan and is half the point of the registry:

> Is anything here on the way out? If something is being replaced, I can record what replaces it so
> the migration shows up on the phase-out dashboard.

Prefer multiple choice when the plausible answers are few. Reserve open questions for genuinely open
things like architecture style.

### 6. Record the answers

`catalogus diff` is the work list: it prints every detected service not yet in the manifest. Add them
one at a time, each with a real role, plus everything the user told you that detection could not see:

```
catalogus diff
catalogus add supabase --role database --id supabase-db
catalogus add supabase --role auth --id supabase-auth --depends-on supabase-db
catalogus add nginx --kind component --role ingress-proxy --depends-on fly-api
catalogus add dotnet --kind stack --version 10 --role runtime-backend
catalogus link fly-api dotnet
catalogus add trello --role pm
catalogus add claude-code --role coding-agent
catalogus add github --role vcs
```

The last three are the PM tool, a coding agent and the VCS provider — service entries like any
other, with no `kind` (it defaults to `service`, correctly: all three are vendor products a Layer 3
cost can attach to).

Components and stack entries are added by the same command as vendors, with `--kind`. A stack entry
without an edge is a floating tile: attach it to whatever runs it, the way `fly-api` runs `dotnet`
above. `diff` names the kind on any line that is not a plain service, so the flag to pass is the one
already printed.

One service used in two roles is **two entries with distinct ids**, not one entry with two roles.
Four Fly apps are four entries. Edges point from the depender to the dependency:
`--depends-on supabase-db` on the auth entry means auth needs the database.

#### Naming a role

`role` is free text, on purpose — no list can anticipate what a project does. But roles are what
cross-project views group on, so a convention keeps them groupable without a schema constraining
them. Two rules:

**Start from a base word.** These cover almost everything, and reusing one is better than inventing
a synonym for it:

```
hosting   database  auth      storage   cache     queue     search
ai        payments  email     sms       monitoring logs     analytics
dns       registrar cdn       vcs       ci        pm        secrets
coding-agent
```

`coding-agent` is the one two-word base word in this list, and it is fixed rather than freely
composed like the others: every coding agent entry (Claude Code, Cursor, GitHub Copilot, ...) takes
this exact role, distinguished from each other by `service` and `id`, not by a role qualifier — they
all do the same job in the project, the way two Fly apps under `hosting` do not.

For `--kind stack` and `--kind component` entries the same rules apply, with their own base words:
`runtime` (`runtime-backend`, `runtime-web`), `language`, `ui-framework`, `ingress-proxy`,
`telemetry-transport`.

These are roles, not categories. The two vocabularies are deliberately not the same list: a
*category* describes the provider in the global catalog and has to be wide enough to hold Twilio and
Resend under one word (`messaging`), while a *role* describes what one instance does in one project,
where `email` and `sms` are two different jobs and worth saying separately.

**Qualify only to disambiguate.** Write `hosting`, not `hosting-api` — until the project has a
second entry that would also be `hosting`, at which point both get a qualifier saying what
distinguishes them: `hosting-api` and `hosting-web`, `storage-media` and `storage-temp`,
`ai-text` and `ai-video`. A qualifier on a role nothing collides with is noise.

**The part before the first `-` is what rollups group on.** `monitoring-dashboard` and
`monitoring-deadman` both count as `monitoring`; `ai-text` and `ai-video` both count as `ai`. That
is the whole reason for the base-word rule — pick the base word first and the grouping follows.
Some base words are themselves two words, and for those the split lands mid-base-word rather than
at a qualifier boundary: `coding-agent` rolls up to `coding`, `ingress-proxy` to `ingress`,
`telemetry-transport` to `telemetry`, `ui-framework` to `ui`, `runtime-backend` to `runtime`. Same
rule, no exception — the rollup is a mechanical grouping key, not a name, and the viewer keeps a
display label for the ones whose key reads as a cut-off word. Do not add a qualifier you did not
otherwise need just to make the grouping key come out prettier; pick the base word that describes
the entry and let the key be whatever it is.

A compound naming two different jobs is not a qualifier. `registrar-dns` reads as "registrar *and*
DNS", which groups under neither: pick the one that is the reason the account exists, and if the
service genuinely does two jobs, that is two entries (which is the same rule as Supabase being
`supabase-db` and `supabase-auth`).

Project-level answers through the CLI too — architecture, VCS visibility, and a corrected project
name or slug via `catalogus set`; PM tooling, the VCS provider and each coding agent via `catalogus
add <slug> --role pm|vcs|coding-agent`; an edge you remember later via `catalogus link`, or one that
no longer applies taken back out via `catalogus unlink`; a phase-out via `catalogus deprecate`; a
wrong `add` undone via `catalogus remove`; a wrong role corrected via `catalogus set
services.<id>.role` rather than by removing and re-adding the entry. Nothing gets hand-edited.

### 7. Validate

```
catalogus validate         # exit 0 valid, 1 invalid, 2 usage error such as no manifest found
catalogus graph            # sanity-check the shape of what you built
```

Run this after every change, not once at the end.

Plain `catalogus validate` is the CI setting. `--strict` also exists and additionally fails the run
on soft warnings, but those are word matches on terms like `billing`, `subscription` or `seat` —
whether such a word is a leak or ordinary vocabulary depends entirely on what the project does, and
a payment processor described honestly trips them every time. They are there for a person to read,
not for a gate to act on. The hard tier — an email address, a currency amount, an API-key shape —
fails `validate` on its own and needs no flag.

**If validation rejects something that is genuinely ordinary prose, that is a bug in the guard, not
a signal to reword the user's text.** Report it. The manifest should say what is true, and a guard
that pushes users into worse prose needs fixing rather than accommodating.

### 7b. Fill in missing icons

```
catalogus icons
```

lists every service entry and where its icon comes from: `local` (a mark this project has already
vendored under `.catalogus/icons/`, whether the CLI fetched it from a URL or copied it from a local
path), `simple-icons` or `thesvg` (Catalogus's own two built-in catalogs), or `none`. For each `none`
row, search the web for the brand's official mark as an SVG — the vendor's own site, press kit or
brand page first, then a public icon set — and set it:

```
catalogus set services.<id>.icon <https-url-or-path>
```

`set` fetches or copies the bytes exactly once, refuses them if they fail the sanitiser, and vendors
the result under `.catalogus/icons/<id>.svg`. The sanitiser refuses a `<script>`, a `<foreignObject>`,
an `on*=` event-handler attribute, an `<a href>`/`<use xlink:href>`, a `<style>` block, a file with no
`viewBox`, or anything over 256 KB — any of these means that particular file cannot land, so pick a
different source rather than retrying the same one. When nothing turns up, ask the user for a URL or
a local file instead of inventing or approximating a mark — the same rule as everywhere else in this
procedure.

This is the one place in this document where you act on a web search rather than asking first (the
owner's call, 2026-09-04: "the agent needs to go fetch on the web; when they don't find, they can ask
the user"). Because of that, list every icon you set and the URL it came from in your summary to the
user, so a wrong pick is one more `catalogus set services.<id>.icon <url>` away from corrected.

### 8. Hand the viewer to the user — do not run it yourself

There is a web viewer, `catalogus view`, which serves the manifest as a browsable graph on
`127.0.0.1:4180` and opens a browser. When you are done, tell the user it exists and let them run
it. **Never run it yourself.**

It is a server: it returns nothing and holds the terminal until `Ctrl+C`, exactly as its own
`press Ctrl+C to stop` line says. An agent that runs it stops there — the command never completes,
and nothing after it in your plan happens.

This is the one thing in this document you are told about but not told to run, so the rule that
separates them is worth stating: **every command in a fenced block here is one you run; anything
written only in prose, like this one, is for the user.** Your own check on the shape of what you
built is `catalogus graph`, which prints and exits.

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
- **Inventing or approximating an icon** when a web search for the brand's official mark turns up
  nothing. Ask the user for a URL or a local file instead — the one exception to "ask, never guess"
  is searching the web first, not skipping the question once the search comes up empty.
- **Guessing past a contradiction** instead of surfacing it.
- **Rewording good prose to satisfy a validator.** Report the false positive instead.
- **Deleting `catalogus.yaml` and starting over.** A wrong entry is undone with `catalogus remove
  <id>`, not by clearing the file. It refuses (exit 1, nothing written) when another entry's
  `replaced_by` still names the one you're removing — re-point or clear that first with
  `catalogus deprecate`.
- **Removing and re-adding a whole entry to drop one stale edge.** `catalogus unlink <from> <to>`
  takes out one edge without touching either entry; `remove` would also delete every other edge
  naming the entry, which is more than a stale edge asks for.
- **Running `catalogus view` to check your work.** It is a server and it will not return. Use
  `catalogus graph`, and hand the viewer to the user.

## Layer 3

Cost and account data needs the platform and never touches this file. If the user asks where
spending information goes, tell them `catalogus push --private` once they are set up, and leave it
out of the manifest either way.
