# Brief: the user docs folder, first page — the manifest format reference

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first:
"ask, never guess" and "no secrets" are hard rules. This brief writes documentation, not code.

## What this is

The owner, 2026-09-05: *"Create a user docs folder and let's start creating docs there."* The
viewer's help menu (being built by a parallel agent) links "Manifest format reference" to
`https://github.com/Lecarvalho/catalogus/blob/main/docs/user/manifest-format.md`. That page must
exist at that path. `docs/` today holds internal material (the handoff, the plan, briefs); `docs/user/`
is the reader-facing folder and starts with this one page plus a short `docs/user/README.md` index.

## Sources — write from these and nothing else

- `packages/schema/src/schema.ts`: the JSON Schema for `catalogus.yaml`, with a description on
  every field. This is the format. Every field, enum value, pattern and required/optional fact in
  your page must be traceable to it. If the schema does not say something, the page does not say it.
- `examples/reference.catalogus.yaml` and `examples/layout-stress.catalogus.yaml`: the two
  synthetic manifests. Quote from these for examples; never invent a service inventory, and never
  derive an example from a real project (CLAUDE.md, `examples/`).
- `skills/catalogus/SKILL.md`: how the CLI writes each field. The page describes the *format*;
  where a field is written by a specific command, say which (`catalogus add`, `set`, `link`,
  `deprecate`, `rename`, `remove`, `set services.<id>.icon`). Read `packages/cli/src/cli.ts` for
  the exact command surface and `catalogus --help` output from the built binary
  (`node packages/cli/dist/cli.js --help`, and `<command> --help`) rather than remembering it.
- `docs/HANDOFF.md` §3 for the three-layer model (what belongs in `catalogus.yaml` and what never
  does — cost, accounts, credentials). The page must carry the no-secrets rule and the list of
  refused key names the schema enforces; read them off the schema/guard code, do not paraphrase
  from memory.

## The page

`docs/user/manifest-format.md`, GitHub-flavoured markdown, for a reader who has a repo and wants to
understand or review its `catalogus.yaml`. Structure: what the file is and where it lives (name,
the `stack.yaml` fallback if the CLI still reads it — check `packages/cli/src/manifest-io.ts`);
the `$schema` modeline; top-level fields; `project` and its fields; `services[]` and every entry
field with its type, whether optional, its enum values, and which command writes it; `dependencies`
in both legal edge shapes; lifecycle (`status`, `replaced_by`, what `deprecate` writes); icons
(`services[].icon`, the `.catalogus/icons/<id>.svg` convention, what `rename` and `remove` do with
the file — see the 2026-09-05 handoff at the top of `docs/PLAN.md`); what the file must never
contain; how to validate (`catalogus validate`) and the rule that the CLI is the only writer.
One complete example manifest, taken from `examples/reference.catalogus.yaml`. Plain prose,
short sections, no marketing.

`docs/user/README.md`: three or four lines saying what this folder is and listing the page(s).
Add one line to the root `README.md`'s "Use" section pointing at `docs/user/` — nothing else in
that file changes.

## Rules

- Do not describe a field, value or behaviour you did not find in the sources above. Where the
  sources are silent, leave it out and list the gap in your report.
- No project names, hostnames, emails, account references or costs anywhere in the page.
- Do not edit anything outside `docs/user/**` and the one README line. Another agent is editing
  `apps/web/**` and `packages/cli/**` right now; do not open those for editing (reading is fine).

## Verify

`pnpm test` must stay green (a drift test compares the skill to the schema; you touch neither).
Report: the page's section list, every fact you could not source and left out, and the exact
commands whose `--help` you read.
