# Agent skills

`skills/catalogus/SKILL.md` is the source of truth for the Catalogus agent skill. It teaches a coding
agent to catalog whatever repository it is sitting in: gather evidence, separate what is proven from
what is merely mentioned, ask the user for the parts no repository can reveal, and write a valid
`catalogus.yaml`.

The skill is a shipped product artifact, not a development convenience. It is versioned here, next
to the schema and CLI it describes, because it documents both — a skill that drifts from the schema
teaches agents to write manifests the validator then rejects.

## Installing

Copy the file. A skill is a directory containing `SKILL.md`, and Claude Code discovers it by path:

```
~/.claude/skills/catalogus/SKILL.md          your machine, available in every repo
<repo>/.claude/skills/catalogus/SKILL.md     travels with that repo, committed alongside it
```

For a client repo, prefer the second — everyone working in the checkout gets the same behaviour
without installing anything.

Once the CLI is published this becomes a `catalogus` subcommand, which will be worth having then
because it can check the skill against the schema version actually installed. Until there is
something to verify, copying the file is the whole job.

## MCP first, CLI fallback

The skill drives Catalogus through its MCP tools when they are connected to the agent's harness —
`propose_manifest_edit` then `apply_manifest_edit` for writes, the other six for everything else —
and falls back to the `catalogus` CLI only when they aren't (decision 14, `docs/plan/decisions.md`,
2026-09-06). Both surfaces write through the same command functions, so nothing about correctness
changes between them; what changes is that an agent with the tools connected never needs a shell.
Two separate drift tests guard the two surfaces so neither goes stale in isolation:
`packages/cli/src/skill-commands-drift.test.ts` for the fenced CLI lines, and the newer
`packages/cli/src/skill-tools-drift.test.ts` for the tool names and the `edits` op vocabulary.

## Keeping it honest

The skill embeds a worked example of the manifest format. That example must stay valid against
`packages/schema` — see the drift check task in `docs/plan/phase-3.6-dogfooding.md`. If you change the schema, change the
skill in the same commit.

Neither surface has a hand-edit exception. The Layer 2 fields that once had no command behind them —
`project.architecture`, `project.vcs.visibility`, and `status`/`replaced_by` on an existing entry —
are covered by `catalogus set` and `catalogus deprecate`, edges by `catalogus link`, and undoing a
wrong entry by `catalogus remove`. `project.pm`, `project.vcs.provider` and `project.coding_agents`
were removed from the schema entirely on 2026-08-24: a PM tool, a VCS provider and a coding agent
each have an identity and an icon, so each is a service entry (`role: pm`/`vcs`/`coding-agent`) added
with `catalogus add`, the same as any other service. `apply_manifest_edit` and the CLI commands are
the only writers — both go through the same functions, and the skill contains no hand-edit path.

No backend account is needed. Everything the skill does is local.

## Background

`SKILL.md` was cut from 594 lines to 250 on 2026-09-06 (the owner: "the skill must be concise or
people will not use it"). The rules, the procedure and the fenced commands stayed; the reasoning
behind some of them didn't fit. It's kept here instead of nowhere, for a maintainer rather than
every agent's context.

**Why services, components and stack are three different kinds of node.** The rule used to be "if
it cannot have an outage and cannot send an invoice, it is not a service entry, and languages and
frameworks belong in the architecture description." That was wrong in both halves: it threw away
nginx and OpenTelemetry, which are real nodes with real failure modes and no vendor behind them, and
it put the stack in free text, where nothing can render it or key an end-of-life date off it. The
replacement rule is runtime topology, not vendor relationship — if it's on the path a request takes,
or it's what the code is written in, it's a node; if it only runs on a developer's machine or at
build time, it isn't.

**Config gaps are real, not hypothetical.** On a real .NET repo, five of twenty-one services —
including the database, the auth provider and object storage — had no key in any committed settings
file (gitignored `appsettings.Development.json`, `.env.local`, `ops/secrets/*.env`). Dependency
registration, adapter classes and configuration-guard classes are what close that gap: they name a
provider whether or not a settings file does. The same run found a storage provider unconditionally
wired in code and missing from the team's own architecture diagram — the gap runs both ways, which
is why a diagram is a checklist to verify, never the record itself.

**Role vocabulary is deliberately not the category vocabulary.** A category describes a provider in
the global catalog and has to be wide enough to hold Twilio and Resend under one word (`messaging`);
a role describes what one instance does in *this* project, where `email` and `sms` are different
jobs worth saying separately. The rollup key (the text before a role's first `-`) is a mechanical
grouping key, not a name — don't add a qualifier just to make it read better. A compound naming two
different jobs (`registrar-dns`) isn't a qualifier at all: pick the one that's the reason the
account exists, or split into two entries.

**Icon web search is the one exception to "ask, never guess."** The owner's call, 2026-09-04: "the
agent needs to go fetch on the web; when they don't find, they can ask the user." Every other
unanswered field in the procedure is a question from the start; a missing icon is a search first,
then a question.

**Illustrative questions cut from step 5, kept here for anyone extending it:**

> Configuration keys show OpenAI, Anthropic, Gemini/Vertex and ElevenLabs wired in the backend. The
> docs also mention Stability and Replicate, but neither has a config key — in use, or dropped?

> `docs/ARCHITECTURE.md` says the queue is SQS, but the only queue config in the repo is RabbitMQ.
> Which one is running in production?

> Is anything here on the way out? If something is being replaced, I can record what replaces it.

**Delegating the research pass.** If the harness can hand steps 3–4's read-only research to a
separate context, that's usually better: the reads are large and their answers are small, so
delegating keeps the main context for step 5, which is the part that carries the value. Seed the
delegate with what `catalogus detect` already found rather than sending it in blind, and give it the
same rule the skill works under — key names and file paths, never configuration values, evidence
attached to every claim rather than conclusions.

**Why `rename`/`unlink` and not remove-and-re-add.** `rename` moves both endpoints of every edge and
any other entry's `replaced_by` along with the entry, which a delete-and-recreate loses. `unlink`
takes out one stale edge without touching either entry; `remove` would also delete every other edge
naming the entry, which is more than a stale edge asks for.

**Visibility is asked, never guessed** — the corollary that closed a related loophole: `gh repo view`
was rejected as an automatic fix because it answers only for GitHub and fails quietly for GitLab,
Bitbucket, Azure DevOps or a plain origin, which is a provider-shaped guess standing in for a
visibility-shaped one. A provider-agnostic question beats a provider-specific inference every time.
