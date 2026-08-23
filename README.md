# Dagstree

Dagstree is a project operations registry: a CLI that catalogs, for every project you run, the services it depends on, how those services depend on each other, and what you pay for them.

A DAG is not a tree. Nodes have several parents, which is exactly why the data model is a DAG — the name is a joke you are welcome to hold against it.

## Install

Not published yet. Build from source with Node.js 22 or newer and pnpm:

```powershell
pnpm install
pnpm build
pnpm run link:cli
```

`link:cli` puts `dagstree` on your `PATH` by writing shims into npm's global bin directory --
`%APPDATA%
pm` on Windows, `$(npm prefix -g)/bin` elsewhere -- which is already on `PATH` on a
stock Node install. Nothing edits `PATH`, so `dagstree --version` works in the shell you are
already in. Undo with `pnpm run unlink:cli`.

The shims point at this checkout, so `pnpm build` updates what they run; there is no need to relink
after a rebuild. If your shell reports the directory is not on `PATH`, the script says so and you
can add it once.

Why shims rather than a global install: `packages/cli` depends on `@dagstree/core` and
`@dagstree/schema` through the `workspace:*` protocol, so `pnpm add --global ./packages/cli` tries
to resolve two unpublished packages from the registry and fails, and pnpm 11 has dropped
`pnpm link --global`. Running the built entrypoint in place resolves dependencies from this
checkout's own `node_modules`, exactly as `node packages/cli/dist/cli.js` does.

The binary itself lands at `packages/cli/dist/cli.js` if you would rather wire it up yourself.

## Use

Scan the repo and scaffold a manifest:

```powershell
dagstree detect            # services first, by category; libraries collapsed to a count
dagstree detect --all      # ...and the libraries listed too
dagstree init --yes        # write dagstree.yaml: project fields, no service entries
dagstree diff              # the work list: detected services not yet declared
```

`init` fills in the project name, VCS provider and coding agents, and deliberately writes no
service entries — a service entry needs a `role` (what this instance *does*: `database`,
`hosting-api`), and detection only knows a category (`db`, `other`). `diff` lists what it found so
you add each one with a role you chose.

Then record what a scan cannot see. The lines below are **examples** — substitute whatever your
project actually uses. Nothing here installs anything; you are recording services that are already
there:

```powershell
dagstree add supabase --role database --id supabase-db
dagstree add supabase --role auth --id supabase-auth --depends-on supabase-db
dagstree link fly-api supabase-db                    # an edge you remember later
dagstree set project.vcs.provider github project.vcs.visibility private
dagstree deprecate heroku-api --status phasing_out --replaced-by fly-api
dagstree remove old-entry                            # undo a wrong add, edges included
dagstree validate          # schema, referential integrity, acyclicity
dagstree graph --mermaid   # render the dependency graph
```

One service in two roles is two entries, not one entry with two roles — that is what makes
`supabase-auth --depends-on supabase-db` expressible.

Every command validates the whole manifest before writing and refuses to write one that would fail
`validate`, so the file never needs a hand edit — comments and the `$schema` modeline survive
untouched. `set` writes the project-level fields (`architecture`, `pm`, `vcs.provider`,
`vcs.visibility`, `coding_agents`) and takes several `<field> <value>` pairs at once, which is how
`vcs` gets written: the schema requires both halves together.

`validate` is the CI entrypoint: exit 0 valid, 1 invalid, 2 usage error. Run it without `--strict`
there — soft private-data warnings are printed for a person to read, not to gate on, because whether
a word like `billing` is a leak or ordinary vocabulary depends on what the project does.

## Why anything is manual

Detection is a floor, not the answer. Run against a real .NET project, the dependency scanner found
Fly.io, GitHub and Slack — and missed Supabase, Stripe, and every AI provider, because those are
wired through `appsettings.json` rather than through packages it reads. Dagstree now reads
configuration key *names* as well (`appsettings*.json`, `.env.example`, `docker-compose.yml`,
`config/*.yml`), which finds all of them; values are never read.

Three things no scanner can ever close:

- **Roles.** That Supabase is your database *and* your auth, as two separate nodes.
- **Edges.** That your API talks to your database. Nothing in any repo states this, and it is the
  thing that makes "what breaks if this vendor goes down" answerable.
- **Lifecycle and off-repo services.** What is being phased out, who your registrar is, the
  dashboard someone set up in a web console.

That is the split the design is built on: the machine records what it can see, you record what
only you know. The [agent skill](#the-agent-skill) exists so a coding agent does the asking.

## Three layers

Everything Dagstree knows lives in exactly one of them, and the boundary is enforced rather than documented.

- **Auto-detected.** Regenerated on every scan, never hand-edited.
- **`dagstree.yaml`.** Committed to your repo. Architecture, services, dependency edges, lifecycle. Safe to publish.
- **Private overlay.** Cost, billing, plan tier, account references. Never touches the repo.

The schema **refuses** private-looking data in `dagstree.yaml` — both key names (`cost`, `billing`, `account_ref`) and values that look like a price, an email or a key. Coding agents are helpful to a fault; the tool enforces the boundary so nobody has to remember it. Dagstree never stores credentials, only references to an identity.

## The agent skill

Let a coding agent do the cataloging. Copy [`skills/dagstree/SKILL.md`](skills/dagstree/SKILL.md) into `.claude/skills/dagstree/SKILL.md`, in your home directory or in the repo you want catalogued.

The skill teaches the agent to run the CLI, then ask you for everything above that a scan cannot reach.

## Current limitations

- No backend yet, so the private overlay, `login` and `push` do not exist.
- No viewer yet. `graph --mermaid` is the only rendering.
- Not published to npm.
- Dagstree's category enum has thirteen values and no bucket for monitoring, queue or email, so
  Sentry, Datadog, SQS, RabbitMQ, Resend, SendGrid and Twilio land in `other` despite being
  unambiguously services. Widening the enum is a schema change and has not been made.
- Config-key detection matches known provider names only, so a provider absent from its catalog
  still needs `dagstree add`.

## Licence

Not yet licensed. Until a licence is added, default copyright applies and you have no right to use, copy or redistribute this.
