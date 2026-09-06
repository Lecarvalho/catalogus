# Catalogus

Catalogus is a project operations registry: a CLI that catalogs, for every project you run, the services it depends on, how those services depend on each other, and what you pay for them.

## Install

Not published yet. Build from source with Node.js 22 or newer and pnpm:

```powershell
pnpm install
pnpm build
pnpm run link:cli
```

`link:cli` puts `catalogus` on your `PATH` by writing shims into npm's global bin directory --
`%APPDATA%\npm` on Windows, `$(npm prefix -g)/bin` elsewhere -- which is already on `PATH` on a
stock Node install. Nothing edits `PATH`, so `catalogus --version` works in the shell you are
already in. Undo with `pnpm run unlink:cli`.

The shims point at this checkout, so `pnpm build` updates what they run; there is no need to relink
after a rebuild. If your shell reports the directory is not on `PATH`, the script says so and you
can add it once.

Why shims rather than a global install: `packages/cli` depends on `@catalogus/core` and
`@catalogus/schema` through the `workspace:*` protocol, so `pnpm add --global ./packages/cli` tries
to resolve two unpublished packages from the registry and fails, and pnpm 11 has dropped
`pnpm link --global`. Running the built entrypoint in place resolves dependencies from this
checkout's own `node_modules`, exactly as `node packages/cli/dist/cli.js` does.

The binary itself lands at `packages/cli/dist/cli.js` if you would rather wire it up yourself.

## Use

Scan the repo and scaffold a manifest:

```powershell
catalogus detect           # services first, by category; libraries collapsed to a count
catalogus detect --all     # ...and the libraries listed too
catalogus init --yes       # write catalogus.yaml: project fields, no service entries
catalogus diff             # the work list: detected services not yet declared
```

`init` fills in the project name, and deliberately writes no service entries — a service entry
needs a `role` (what this instance *does*: `database`, `hosting-api`), and detection only knows a
category (`db`, `other`). That includes the VCS provider and any coding agent detection finds:
both are service entries now (`role: vcs`, `role: coding-agent`), not project fields, so `init`
never writes them either. `diff` lists everything it found — services, the VCS provider, coding
agents — so you add each one with a role you chose.

Then record what a scan cannot see. The lines below are **examples** — substitute whatever your
project actually uses. Nothing here installs anything; you are recording services that are already
there:

```powershell
catalogus add supabase --role database --id supabase-db
catalogus add supabase --role auth --id supabase-auth --depends-on supabase-db
catalogus link fly-api supabase-db                   # an edge you remember later
catalogus set project.vcs.visibility private
catalogus add github --role vcs
catalogus add trello --role pm
catalogus add claude-code --role coding-agent
catalogus deprecate heroku-api --status phasing_out --replaced-by fly-api
catalogus remove old-entry                           # undo a wrong add, edges included
catalogus rename fly-api fly-backend                 # change an id, edges and replaced_by follow
catalogus validate         # schema, referential integrity, acyclicity
catalogus graph --mermaid  # render the dependency graph
```

One service in two roles is two entries, not one entry with two roles — that is what makes
`supabase-auth --depends-on supabase-db` expressible. The VCS provider, the PM tool and each coding
agent are exactly the same shape: anything with an identity and an icon is a service entry, `role`
gives its section, and `add` is how it gets in — never a project field.

Every command validates the whole manifest before writing and refuses to write one that would fail
`validate`, so the file never needs a hand edit — comments and the `$schema` modeline survive
untouched. `set` writes the remaining project-level fields (`architecture`, `vcs.visibility`, `name`,
`slug`) and takes several `<field> <value>` pairs at once.

`validate` is the CI entrypoint: exit 0 valid, 1 invalid, 2 usage error. Run it without `--strict`
there — soft private-data warnings are printed for a person to read, not to gate on, because whether
a word like `billing` is a leak or ordinary vocabulary depends on what the project does.

For the full field-by-field reference, see [`docs/user/manifest-format.md`](docs/user/manifest-format.md).

## Why anything is manual

Detection is a floor, not the answer. Run against a real .NET project, the dependency scanner found
Fly.io, GitHub and Slack — and missed Supabase, Stripe, and every AI provider, because those are
wired through `appsettings.json` rather than through packages it reads. Catalogus now reads
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

Everything Catalogus knows lives in exactly one of them, and the boundary is enforced rather than documented.

- **Auto-detected.** Regenerated on every scan, never hand-edited.
- **`catalogus.yaml`.** Committed to your repo. Architecture, services, dependency edges, lifecycle. Safe to publish.
- **Private overlay.** Cost, billing, plan tier, account references. Never touches the repo.

The schema **refuses** private-looking data in `catalogus.yaml` — both key names (`cost`, `billing`, `account_ref`) and values that look like a price, an email or a key. Coding agents are helpful to a fault; the tool enforces the boundary so nobody has to remember it. Catalogus never stores credentials, only references to an identity.

## The agent skill

Let a coding agent do the cataloging. Copy [`skills/catalogus/SKILL.md`](skills/catalogus/SKILL.md) into `.claude/skills/catalogus/SKILL.md`, in your home directory or in the repo you want catalogued.

The skill teaches the agent to run the CLI, then ask you for everything above that a scan cannot reach.

## The MCP server

`catalogus mcp` runs the CLI as an [MCP](https://modelcontextprotocol.io) server over stdio. For an
agent, this is the interface: read the manifest, diff it against detection, propose a change, show
the diff, apply it, validate. It ships inside `@catalogus/cli`; there is nothing separate to
install. Eight tools:

| Tool | Does |
|---|---|
| `read_manifest` | Returns `catalogus.yaml` as text and, when it validates, as a parsed object. An invalid manifest comes back with its problems, not as an error. |
| `detect_stack` | Runs detection and returns the same structured diff `catalogus diff --json` prints, plus `hasDiff`. A claim about one checkout, not about what is deployed. |
| `init_manifest` | Scaffolds `catalogus.yaml` the way `catalogus init --yes` does. Visibility is written only when given, never inferred. |
| `propose_manifest_edit` | Runs `add`, `set`, `link`, `unlink`, `deprecate`, `remove` or `rename` against a scratch copy and returns a unified diff, the equivalent `catalogus ...` lines, and a hash of the file it read. Writes nothing. |
| `apply_manifest_edit` | Applies the same edits for real, through the same validated write path the CLI uses. Given the proposal's hash, it refuses if the file changed in between. |
| `validate_manifest` | `catalogus validate` as a tool: exit code, lines, `valid`. |
| `render_graph` | The dependency graph as text or Mermaid. |
| `list_icons` | Which services have no icon and where each icon file lives. |

The intended loop is propose, show the diff, get approval, apply. Every write goes through the same
code the CLI's commands use, so a manifest an agent wrote and one a person wrote are the same file:
validated before writing, comments intact, private-looking data refused.

Each tool takes an optional `path`. A path named in the call, or on the server's command line, is
used as given and never walks up to a parent directory's manifest; with no path anywhere the
current directory is used and the usual upward search applies.

Where this is going: the same tools, served over HTTP by the Catalogus web platform against an
account, so a client installs the skill and nothing else. The stdio server is the local edition of
that contract and stays for offline use and CI.

### Getting the server

> **Not published yet.** `@catalogus/cli` is not on npm as of 2026-09-06; publishing it is on the
> launch checklist. Until it lands, the only way to run the server is
> from a clone of this repository (see [Install](#install) at the top, then use
> `node <clone>/packages/cli/dist/cli.js mcp` in place of `npx -y @catalogus/cli mcp` below).
> Everything else in this section is the procedure as it will work once published.

The server is the CLI package. Nothing to download by hand: the client's agent launches it with
`npx`, which fetches `@catalogus/cli` on first use and caches it. Prerequisite: Node.js 22 or newer
on the machine running the agent.

To pin a version, write `@catalogus/cli@1.2.3` instead of `@catalogus/cli`. To update an unpinned
install, `npx` picks up the latest on its next cold start; `npm cache clean --force` forces it.

### Claude Code

In the repo you want catalogued:

```
claude mcp add --scope project catalogus -- npx -y @catalogus/cli mcp .
```

That writes `.mcp.json` at the repo root, which you check in so every clone of the repo gets it:

```json
{
  "mcpServers": {
    "catalogus": {
      "command": "npx",
      "args": ["-y", "@catalogus/cli", "mcp", "."]
    }
  }
}
```

The trailing `.` is the default directory the tools work on; Claude Code starts the server in the
repo root, so `.` is the repo. Use `--scope user` to register it once for every project on the
machine, drop the `.`, and let each tool call name its `path`.

**Windows:** `npx` is a `.cmd` shim, and a stdio server has to be launched through `cmd`:

```json
{
  "mcpServers": {
    "catalogus": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@catalogus/cli", "mcp", "."]
    }
  }
}
```

Restart Claude Code in that repo. `/mcp` should list `catalogus` as connected with eight tools.
Because `.mcp.json` is project-scoped, Claude Code asks once whether to trust it.

### Other clients

Any MCP client that launches stdio servers (Cursor, Windsurf, Codex, Zed, an SDK client) takes the
same command in its own config format: `npx -y @catalogus/cli mcp <repo>`. The server speaks
JSON-RPC on stdout and writes nothing else there; diagnostics go to stderr. It exits when the
client closes stdin, after answering every request it has already received.

Do not have an agent run `catalogus mcp` from a shell. It is a server: the call never returns. The
skill says the same about `catalogus view`.

## Current limitations

- No backend yet, so the private overlay, `login` and `push` do not exist.
- The viewer (`catalogus view`) shows one repo at a time; there is no portfolio across projects.
- Not published to npm.
- Catalogus's category enum has thirteen values and no bucket for monitoring, queue or email, so
  Sentry, Datadog, SQS, RabbitMQ, Resend, SendGrid and Twilio land in `other` despite being
  unambiguously services. Widening the enum is a schema change and has not been made.
- Config-key detection matches known provider names only, so a provider absent from its catalog
  still needs `catalogus add`.

## Licence

Not yet licensed. Until a licence is added, default copyright applies and you have no right to use, copy or redistribute this.
