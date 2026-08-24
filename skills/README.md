# Agent skills

`skills/dagstree/SKILL.md` is the source of truth for the Dagstree agent skill. It teaches a coding
agent to catalog whatever repository it is sitting in: gather evidence, separate what is proven from
what is merely mentioned, ask the user for the parts no repository can reveal, and write a valid
`dagstree.yaml`.

The skill is a shipped product artifact, not a development convenience. It is versioned here, next
to the schema and CLI it describes, because it documents both — a skill that drifts from the schema
teaches agents to write manifests the validator then rejects.

## Installing

Copy the file. A skill is a directory containing `SKILL.md`, and Claude Code discovers it by path:

```
~/.claude/skills/dagstree/SKILL.md          your machine, available in every repo
<repo>/.claude/skills/dagstree/SKILL.md     travels with that repo, committed alongside it
```

For a client repo, prefer the second — everyone working in the checkout gets the same behaviour
without installing anything.

Once the CLI is published this becomes a `dagstree` subcommand, which will be worth having then
because it can check the skill against the schema version actually installed. Until there is
something to verify, copying the file is the whole job.

## Keeping it honest

The skill embeds a worked example of the manifest format. That example must stay valid against
`packages/schema` — see the drift check task in `docs/PLAN.md`. If you change the schema, change the
skill in the same commit.

The skill treats the CLI as a hard prerequisite. It checks `dagstree --version` and stops if that
fails, rather than hand-writing a manifest as a fallback — the CLI owns id derivation, referential
integrity, acyclicity and the private-data guard, and a hand-rolled file bypasses all of it. When
adding to the skill, route new work through a command rather than through hand-editing.

That exception is now closed. The Layer 2 fields that once had no command behind them —
`project.architecture`, `project.vcs.visibility`, and `status`/`replaced_by` on an existing entry —
are covered by `dagstree set` and `dagstree deprecate`, edges by `dagstree link`, and undoing a
wrong entry by `dagstree remove`. `project.pm`, `project.vcs.provider` and `project.coding_agents`
were removed from the schema entirely on 2026-08-24: a PM tool, a VCS provider and a coding agent
each have an identity and an icon, so each is a service entry (`role: pm`/`vcs`/`coding-agent`) added
with `dagstree add`, the same as any other service. The CLI is the only writer, and the skill
contains no hand-edit path.

No backend account is needed. Everything the skill does is local.
