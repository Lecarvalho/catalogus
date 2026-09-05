# The `catalogus.yaml` manifest format

`catalogus.yaml` is Layer 2 of Catalogus's three-layer data model (`docs/HANDOFF.md` §3):
human- or agent-written, committed to your repo, and safe to publish in a public repo. It
records a project's identity, its service DAG (nodes and dependency edges), and lifecycle —
never cost, billing, or account data, which live in the private overlay (Layer 3) instead and
never touch this file.

This page describes the format as the schema (`packages/schema/src/schema.ts`) defines it, and
says which `catalogus` CLI command writes each field. **The CLI is the only writer.** Every
command validates the whole manifest before writing and refuses to write anything that would
fail `catalogus validate`. Every *editing* command — everything except `catalogus init --force`
— preserves the file's existing comments and its `$schema` modeline: `init --force` (see
[Where it lives](#where-it-lives)) rebuilds the file from scratch and does not carry forward
anything the old file had. There is no supported hand-edit path — a field with no command behind
it is a gap to report, not an invitation to open the file in an editor.

## Where it lives

The file is named `catalogus.yaml`. The CLI looks for it starting in the current directory and
walking upward through parent directories, the way `git` finds its repository root
(`packages/cli/src/manifest-io.ts`). If a directory has no `catalogus.yaml` but does have a
`stack.yaml`, that older name is read as a fallback — `catalogus.yaml` always wins over
`stack.yaml` when both are present in the same directory. Whichever name a manifest was read
from, every write always goes to `catalogus.yaml`; the CLI never writes `stack.yaml`. The first
edit made to a repo that still has only `stack.yaml` reports the move it just made — `migrated
<dir>/stack.yaml -> <dir>/catalogus.yaml; delete <dir>/stack.yaml once you've checked this in.`
— and leaves the old file in place; nothing deletes it for you.

If no manifest is found in the starting directory or any parent, the CLI reports it and names
the command that creates one: `catalogus init`. `init` itself refuses to overwrite a manifest
that already exists unless you pass `--force`; passing it does not edit the existing file, it
replaces it wholesale (see the note on `init --force` above).

## The `$schema` line

A manifest opens with a YAML comment, not a document field:

```yaml
# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
```

This is the modeline the `yaml-language-server` editor extension reads for autocomplete and
inline validation against the published schema. It is a comment, so it costs nothing to a YAML
parser that doesn't recognize it, and — like every other comment in the file — it survives every
editing command (`init --force` rewrites the file, modeline included; see above).

## Top-level fields

| Field | Required | Type |
|---|---|---|
| `catalogus` | yes | must be exactly `1` — the manifest format version. There is currently only one. |
| `project` | yes | object — see [`project`](#project) |
| `services` | yes | array of service entries — see [`services[]`](#services). Can be empty on a freshly-scaffolded manifest. |
| `dependencies` | yes | array of dependency edges — see [`dependencies[]`](#dependencies). Can be empty. |

No other top-level key is allowed (`additionalProperties: false`), and — at this level and every
object level below it — a property whose name looks like private data (see
[What must never go in this file](#what-must-never-go-in-this-file)) is rejected outright, not
just discouraged.

`catalogus init` creates the file with all four keys present.

## `project`

All fields except `name` and `slug` are optional, so a freshly-scaffolded manifest is already
valid.

| Field | Required | Type | Written by |
|---|---|---|---|
| `name` | yes | string, non-empty — human-readable, e.g. `"Example App"` | `catalogus init` (its `--yes` value is a guess from the directory name); corrected with `catalogus set project.name <value>` |
| `slug` | yes | slug — lowercase letters, digits, single internal `-` or `_` separators, no leading/trailing or doubled separators — the project's machine identifier | `catalogus init` (same guess, same caveat); corrected with `catalogus set project.slug <value>` |
| `architecture` | no | free-text string, non-empty — architecture style in your own words, e.g. `"modular monolith (.NET 10, vertical slices)"` | `catalogus set project.architecture <value>` |
| `vcs` | no | object — see below | `catalogus init --visibility <v>`, or `catalogus set project.vcs.visibility <value>` |

`project.vcs` holds only `visibility`, an enum of `public`, `private`, or `internal`
(`"internal"` covers org-visible-only repos on GitHub/GitLab Enterprise). It is the one field the
CLI will never infer: `init` prompts for it interactively, and under `--yes` it is written only
if you pass `--visibility`; otherwise the block is omitted entirely and the CLI tells you the
`set` command that fills it. Nothing in a checkout can prove whether its remote is public, so the
schema and the CLI both treat an unanswered visibility as a question rather than a guess.

Note what is deliberately *not* a project field: the VCS provider, the PM tool, and coding agents
are not `project` properties. Anything with an identity and an icon — including all three of
those — is a `services[]` entry instead (see below), because a project-level field can never be
the endpoint of a dependency edge and each of these legitimately can be
(`[github-actions, github]` is a real edge in the example manifest below).

## `services[]`

Every service instance — every node in the project's dependency graph — is one entry in this
array. The same catalog service can appear more than once under different roles and ids (e.g.
`supabase-db` and `supabase-auth`, both `service: supabase`); one service used in two roles is
two entries, never one entry carrying two roles.

| Field | Required | Type | Written by |
|---|---|---|---|
| `id` | yes | slug, unique within the file | `catalogus add ... --id <id>` when given explicitly; when `--id` is omitted it is derived from `<service>` and `<role>` in order: the bare `<service>` slug, if neither that id nor that catalog service is already used anywhere in the file; otherwise `<service>-<role>`; otherwise `<service>-<role>-2`, `-3`, … until one is free. An existing id is changed with `catalogus rename <old> <new>`, which moves every edge, every `replaced_by` reference, and the vendored icon file along with it |
| `service` | yes | slug into the global Catalogus service catalog, e.g. `supabase`, `fly-io` (a different namespace from `@specfy/stack-analyser`'s own slugs — the CLI maps between them) | the `<service>` argument to `catalogus add`; no command changes it on an existing entry |
| `role` | yes | slug — what this instance does here, e.g. `database`, `auth`, `hosting` | `catalogus add --role <role>`; corrected with `catalogus set services.<id>.role <value>` |
| `kind` | no | enum: `service` \| `component` \| `stack`. Treated as `service` when omitted. | `catalogus add --kind <kind>`; corrected with `catalogus set services.<id>.kind <value>` |
| `version` | no | free-text string, e.g. `"10"`, `"19.2"` — the version as you'd say it, not something to parse or compare | `catalogus add --version <version>`; corrected with `catalogus set services.<id>.version <value>` |
| `icon` | no | path, always `.catalogus/icons/<name>.svg` — see [Icons](#icons) | `catalogus set services.<id>.icon <https-url-or-path>` chooses the value; `catalogus rename <old> <new>` rewrites it to follow the entry's new id when it moves a vendored icon |
| `added` | yes | ISO 8601 date, `YYYY-MM-DD` | `catalogus add --added <date>` (defaults to today when omitted); no command changes it after creation |
| `status` | no | enum: `active` \| `deprecated` \| `phasing_out` \| `removed`. Treated as `active` when omitted. | `catalogus add --status <status>` at creation (full enum); `catalogus deprecate <id> --status deprecated\|phasing_out` afterward (narrower — see [Lifecycle](#lifecycle)) |
| `replaced_by` | no | slug — the local `id` of the entry that replaces this one when phasing out. The schema can't check that the name refers to a real entry; `catalogus validate` does. | `catalogus add --replaced-by <id>`; `catalogus deprecate <id> --replaced-by <id>` |
| `notes` | no | free-text string — public information only, never cost, billing, or account details | `catalogus add --notes <text>`; no command changes it after creation |

`kind` distinguishes three shapes a node can be:

- **`service`** — a vendor relationship: it has an account, it can bill, and someone else's
  outage takes it down (Supabase, Stripe, Fly.io). This is the default.
- **`component`** — runtime infrastructure the project runs itself: no invoice, but on the
  request path and able to fail (nginx bundled in a web image, an OpenTelemetry transport).
- **`stack`** — the language, runtime, or framework the code is written in, attached by a
  dependency edge to whatever runs it (`[host-api, dotnet]`), so an end-of-life date answers the
  same impact question a vendor sunset does.

A build-time-only tool the project merely imports (ESLint, Vitest) is not a `services[]` entry in
any `kind`.

## `dependencies[]`

Each entry is one dependency edge, pointing from the depender to what it depends on. The schema
accepts two shapes for the same information:

- **Compact tuple**: `[from, to]` — both local service ids, exactly two items. This is what
  `catalogus add --depends-on <ids...>` and `catalogus link <from> <to>` write; no shipped
  command takes a `--notes`-style flag for an edge, so this tuple form is the only shape any
  documented command currently produces.
- **Annotated object**: `{from: <id>, to: <id>, notes: <text>}` — same information, with an
  optional free-text `notes` field for when an edge needs an annotation the tuple form has no
  room for. The schema allows this shape; it is not written by any documented command.

`catalogus unlink <from> <to>` removes the edge between two ids. Acyclicity is not checked by the
schema — a manifest can be well-formed YAML matching the schema and still describe a cycle; that
is caught by `catalogus validate`, which is the correct point to check for it since building the
graph requires reading the whole file.

## Lifecycle

`status` and `replaced_by` (on a `services[]` entry, described above) are the lifecycle fields.
`catalogus deprecate <id> [--status deprecated|phasing_out] [--replaced-by <other-id>]` sets
both together (defaulting `--status` to `deprecated` when omitted), which is the documented way
to mark an entry going away and, optionally, name what replaces it.

Two more commands change an entry's identity or existence rather than its lifecycle fields, and
both carry everything that points at the entry along with them:

- **`catalogus rename <old> <new>`** changes a local `id`, moving every dependency edge naming
  it, every other entry's `replaced_by` pointing at it, and its vendored icon file (if any) to
  the new id.
- **`catalogus remove <id>`** deletes the entry itself, every dependency edge naming it, and its
  vendored icon file.

Neither of these is a substitute for `set` or `deprecate` on a field that is merely wrong — a bad
`role` is `catalogus set services.<id>.role <value>`, not a remove-and-re-add.

## Icons

A `services[]` entry can carry an `icon` field: a path matching the schema's own pattern,
verbatim —

```
^\.catalogus/icons/(?!.*\.\.)[a-z0-9][a-z0-9_.-]*\.svg$
```

— always `.catalogus/icons/<name>.svg`, two directory levels below the manifest's own directory
(`.catalogus/`, then `icons/`), never a leading `./`, never absolute, never a URL, and the name
after `icons/` may never contain `..`. This is the only shape the field can take; in particular, a
remote URL cannot be recorded here, so `catalogus view` reads the vendored file and never fetches
over the network at render time.

The field's value is written by:

```
catalogus set services.<id>.icon <https-url-or-path>
```

which fetches (or copies) the bytes exactly once and vendors the result under
`.catalogus/icons/<id>.svg`. When the source is a URL, the CLI also writes a comment on that
`icon` line recording where the bytes came from — `# fetched from <origin> (<filename>) on
<YYYY-MM-DD>` — the URL reduced to just its origin and final path segment, so a signed or
credential-bearing URL never lands verbatim in a file this repo commits. It refuses the file
outright — nothing is written — if it fails the sanitiser: a `<script>`, a `<foreignObject>`, a
`<style>` block, an `on*=` event-handler attribute, an `href=` attribute on *any* element (not
only `<a href>`/`<use xlink:href>`), a `url(...)` reference that isn't a same-document
`#fragment`, a nested `<svg>`, a file with no `viewBox`, or anything over 256 KiB
(262144 bytes).

`catalogus icons` reports, for every entry, where its icon comes from: `local` whenever the entry
names its own `icon` field at all, whether or not the file it points at actually resolves — when
it doesn't, the report appends `(missing file)` or `(refused: <reason>)` after the path —
`simple-icons` or `thesvg` (Catalogus's two built-in icon catalogs, used automatically when a
service is in one of them and no `icon` field is set), or `none`.

The vendored file follows the entry it belongs to: `catalogus rename` moves it to the new id's
name, and `catalogus remove` deletes it. Never move or delete a file the manifest points at under
`.catalogus/icons/` by hand.

## What must never go in this file

`catalogus.yaml` is committed to the repository and has to stay safe to publish in a public one.
The schema enforces this mechanically: on every object in the document, a property whose name
matches this pattern (case-insensitive) is rejected outright —

```
cost, price, pricing, amount, account, account_id / account-id, username, user, email, token,
api_key / api-key, key, secret, password, passwd, credential, credentials, billing, invoice,
renewal, subscription_id / subscription-id, payment, card, plan_tier / plan-tier, seat, spend
```

— matched as a case-insensitive *substring*, not a whole-word match, so a property is rejected not
only when it is literally named `billing` or `account_id`, but whenever one of these words appears
anywhere inside its name — a key named `monkey` is refused too, because it contains `key`. This
applies to every object in the document, at every level, not only the top level.

`catalogus validate` additionally checks *values*, not just key names, in two tiers. The **hard**
tier fails validation on its own, no flag needed: an email address, a currency amount, an amount
tied to a billing period, a card-like number, an API-key-shaped string, a long high-entropy token
that looks like a key or secret, or a URL carrying embedded credentials. The **soft** tier is a set
of bare, case-insensitive word matches — `billing`, `invoice`, `renewal`, `subscription`, `seat`,
`plan tier`, `account`, `credentials`, and a word-form currency amount with a digit beside the
word (e.g. "25 dollars a month"; a spelled-out number is not caught) — each of which a plain `catalogus validate` run only warns about, at exit 0; `--strict` is
what promotes those same warnings into failures, since whether such a word is a real leak or
ordinary vocabulary depends on what the project does.

Beyond key and value shape, two rules govern what belongs in free text (`notes`, `architecture`):
never copy a configuration *value* into the manifest, only key *names* — and never record a
service identifier as if it were the service itself: a Supabase project ref, an AWS account
number, a Fly org slug identify one specific live tenant, and none of them belong here. Record
that the project uses Supabase; never which Supabase project.

Anything cost-, billing-, or account-shaped belongs in Layer 3 instead — cost, currency, billing
cycle, renewal dates, plan/tier, account references, private notes — which lives only in the
private overlay behind authentication and never touches the repo. Catalogus never stores
credentials; only references to an identity.

## Validating

```
catalogus validate
```

checks schema conformance, referential integrity (that every id a `dependencies[]` entry or
`replaced_by` names actually exists), acyclicity, and the private-data guard described above.
Add `--strict` to also fail the run on the soft private-data warnings.

Because every writing command validates before it writes and refuses to write anything that
would fail this check, `catalogus validate` — without `--strict` — is something to run to confirm
a manifest, not to repair one: there is no path in which the CLI leaves the file in a state plain
`validate` would reject. `--strict` is a stricter check than any writing command runs, since a
writing command only ever refuses on the hard tier above; a soft-tier hit (e.g. `catalogus add
--notes "renewal is automated via GitHub Actions"`) is written, with the same warning printed at
write time that a plain `validate` run repeats, so the manifest the CLI wrote at exit 0 can still
fail `validate --strict`.

## A complete example

Taken in full from `examples/reference.catalogus.yaml`, a deliberately synthetic manifest that
names no real project:

```yaml
# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
#
# A reference manifest, deliberately synthetic. It names no real project.
#
# Its job is to show the shapes a manifest has to be able to express, so that
# packages/schema's drift test has a complete document to validate and so the
# agent skill has something to be judged against. A manifest derived from a
# real project would do that job too, but it would also publish that
# project's entire service inventory and topology in a public repo, which is
# a different thing from publishing a schema example.
#
# Layer 2 only, and safe to commit. Cost, billing and account references are
# Layer 3: they live in the private overlay, never here.

catalogus: 1

project:
  name: Example App
  slug: example-app
  architecture: "two-tier: an HTTP API behind a reverse proxy, with a single-page front end served from the same origin"
  vcs:
    visibility: private

services:
  # One hosting provider, one entry per deployed app. Four apps would be four
  # entries, not one entry that mentions four.
  - id: host-api
    service: fly-io
    role: hosting-api
    added: 2025-11-02
    notes: "runs the API container"
  - id: host-web
    service: fly-io
    role: hosting-web
    added: 2025-11-02
    notes: "serves the front end and proxies to the API"

  # One service used in two roles is two entries with distinct ids, not one
  # entry carrying two roles. HANDOFF §9 settled this.
  - id: supabase-db
    service: supabase
    role: database
    added: 2025-11-02
  - id: supabase-auth
    service: supabase
    role: auth
    added: 2025-11-02

  # Lifecycle: something on the way out, and the entry that replaces it.
  # Nothing in a repository states this — it is always answered by a person.
  - id: legacy-mailer
    service: mailgun
    role: email
    added: 2025-03-14
    status: phasing_out
    replaced_by: mailer
  - id: mailer
    service: resend
    role: email
    added: 2026-01-15

  # Off-repo. No scan finds either of these; they are here because someone
  # was asked.
  - id: registrar
    service: namecheap
    role: dns
    added: 2025-11-02
    notes: "apex domain and DNS records"
  - id: board
    service: trello
    role: pm
    added: 2025-11-02

  # Not vendors. `kind: component` is infrastructure the project runs itself
  # -- no account and no invoice, but on the request path and able to fail.
  # `kind: stack` is what the code is written in: not on the request path,
  # but a real dependency with a real end-of-life date, which is the same
  # impact question a vendor sunset asks. Both are ordinary edge targets.
  - id: ingress
    service: nginx
    kind: component
    role: ingress-proxy
    added: 2025-11-02
    notes: "terminates public traffic inside the web image and proxies to the API"
  - id: otel
    service: opentelemetry
    kind: component
    role: telemetry-transport
    added: 2026-02-01
  - id: dotnet
    service: dotnet
    kind: stack
    version: "10"
    role: runtime-backend
    added: 2025-11-02
  - id: react
    service: react
    kind: stack
    version: "19"
    role: ui-framework
    added: 2025-11-02

  - id: github
    service: github
    role: vcs
    added: 2025-11-02
  - id: github-actions
    service: github-actions
    role: ci
    added: 2025-11-02

  # A coding agent has an identity and an icon like anything else above, so
  # it is a service entry too -- not the free-text project.coding_agents
  # list this manifest used to carry. No `kind`: it defaults to "service",
  # which is correct here -- Claude Code is a vendor product with a
  # subscription, so a Layer 3 cost can attach to it the same way one can
  # attach to Fly.io or Supabase.
  - id: claude-code
    service: claude-code
    role: coding-agent
    added: 2025-11-02

dependencies:
  # Edges point from the depender to the dependency.
  - [host-web, host-api]
  - [host-api, supabase-db]
  - [host-api, supabase-auth]
  - [host-api, mailer]
  - [host-api, legacy-mailer]
  - [supabase-auth, supabase-db]
  - [host-web, registrar]
  - [github-actions, github]
  - [github-actions, host-api]
  - [github-actions, host-web]
  # A component sits in the path; a stack entry hangs off whatever runs it,
  # so "what breaks when .NET 10 goes EOL" is a graph walk rather than a
  # text match.
  - [ingress, host-api]
  - [host-api, otel]
  - [host-api, dotnet]
  - [host-web, react]
```
