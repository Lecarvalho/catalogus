# Brief: the skill becomes MCP-first, CLI as fallback (Phase 6, decision 14)

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first,
then `docs/plan/decisions.md` decisions 11 and 14, then `skills/catalogus/SKILL.md` end to end,
then `skills/README.md`, then `packages/cli/src/skill-commands-drift.test.ts` (what already guards
the skill) and `packages/cli/src/mcp/server.ts` (the tools as registered). The skill is written
in the owner's voice: full sentences, reasons beside rules, no hedging. Match it.

## Why

On 2026-09-06 a client session with the skill loaded and the `catalogus` MCP tools connected ran
everything through Bash and never loaded a tool. Asked why: "Skill says MCP is read-only anyway;
writes go through CLI regardless." That was the skill's fault, not the agent's. The owner then
ruled (decision 14): the MCP is the first-class surface for agents; the CLI is for people, CI and
the machine that holds the credential. The server now has eight tools (the apply brief,
`docs/mcp-apply-brief.md`, landed them):

| Tool | Replaces | Notes |
|---|---|---|
| `detect_stack {path?}` | `catalogus detect`, `catalogus diff` | the diff object plus `hasDiff`; grouped detection text is CLI-only |
| `read_manifest {path?}` | reading the file | text + parsed object, or `valid: false` with problems |
| `init_manifest {path?, visibility?, force?}` | `catalogus init --yes [--visibility]` | never infers visibility |
| `propose_manifest_edit {path?, edits[]}` | none | diff, per-step results, `commands`, `baseSha256`; writes nothing |
| `apply_manifest_edit {path?, edits[], baseSha256?}` | `add`/`set`/`link`/`unlink`/`deprecate`/`remove`/`rename` | writes through the same functions; refuses a changed file when `baseSha256` is given |
| `validate_manifest {path?, strict?}` | `catalogus validate` | |
| `render_graph {path?, format?}` | `catalogus graph [--mermaid]` | |
| `list_icons {path?}` | `catalogus icons` | |

`edits[]` is a discriminated union on `op`: `add {service, role, id?, kind?, version?, dependsOn?,
status?, replacedBy?, added?, notes?}`, `set {field, value}`, `link {from, to}`, `unlink {from,
to}`, `deprecate {id, status?, replacedBy?}`, `remove {id}`, `rename {from, to}`. Read
`packages/cli/src/mcp/propose-edit.ts` for the exact shape before you document it.

Not tools, and never will be: `catalogus view` (a browser), `catalogus login` (a keychain),
`catalogus mcp` (the server itself). `catalogus push --private` becomes the `push_private` tool
in Phase 5; the skill's Layer 3 section already points at it in prose and keeps doing so.

## What changes in `SKILL.md`

The **procedure does not change** — scan, create, corroborate, find what is missing, ask well,
record, validate, icons, hand over the viewer — and neither does a word of the rules about Layer 3,
key names versus values, tenant identifiers, `added` dates, or asking rather than guessing. What
changes is *how each step is driven*:

1. **Front matter `description`**: say the skill drives Catalogus through its MCP tools when they
   are connected and through the `catalogus` CLI otherwise.
2. **Replace "The CLI does the writing" with a section that states the two ways and the order.**
   First: if tools named `detect_stack`, `read_manifest`, `propose_manifest_edit`,
   `apply_manifest_edit` (and the rest) are available to you, use them — and if your harness
   lists them as deferred, load them; that is what the 2026-09-06 session failed to do. Second:
   if they are not, check `catalogus --version` and use the CLI. Third, unchanged: never
   hand-write the manifest. Keep the existing fenced CLI command block; it is what the CLI path
   copies and what the drift test walks. Add the table above beside it so the two surfaces are
   visibly the same operations.
3. **Every step names the tool first and keeps the fenced CLI line as the fallback.** Step 1:
   `detect_stack` (and say that its `hasDiff` and the two directions are the same facts
   `catalogus diff` prints, and that "declared but not visible" is a lead, not a delete list —
   the tool description says so, the skill should too). Step 2: `init_manifest`. Step 6, the
   writes: **on the tool path, propose first, show the user the diff, get approval, then apply
   with the proposal's `baseSha256`** — one `propose_manifest_edit` with the whole batch of
   edits, so the user reviews one diff, not twenty. On the CLI path the fenced lines run as
   today. Step 7: `validate_manifest`. Step 7b: `list_icons`, `set` through
   `propose`/`apply`. Step 8 stays prose-only and gains nothing.
4. **"There is no hand-edit exception"** stays and gains one sentence: on the tool path,
   `apply_manifest_edit` is the only write, and it takes the same `edits` the proposal took.
5. **Common mistakes**, two new bullets: running CLI commands through a shell while the tools are
   connected; applying without proposing, or applying a proposal after the file changed
   (the `baseSha256` refusal is the tool telling you to propose again).
6. **The `mcp` paragraph** in section 8 (added 2026-09-06 by the main session) is rewritten to
   match the above; it currently says the tools are read-only, which is now false.

Keep the rule from decision 11 intact: **fenced means the agent runs it, prose means it is for
the user**, and `catalogus view` / `catalogus mcp` are never fenced. Tool names are written in
backticks in prose, never in fences.

## The drift test

`packages/cli/src/skill-tools-drift.test.ts`, new, beside `skill-commands-drift.test.ts` and in
its register. It builds the server with `createCatalogusMcpServer()`, lists its tools through an
`InMemoryTransport` pair and the SDK `Client` (see `mcp/server.test.ts` for the pattern), and
checks both directions — unlike the command drift test, both are right here, and say why in the
header: the tools exist for the agent the skill instructs, so a tool the skill never names is a
tool no agent will load, and a name the skill teaches that the server does not register is a
call that fails in the client's repo.

- Every backticked identifier in `SKILL.md` matching `/^[a-z]+(_[a-z]+)+$/` that ends in one of
  the server's tool-name words is checked against the live list. Simpler and more honest: collect
  every backticked `snake_case` token and assert each one is either a registered tool name or on
  a short, commented allow-list of non-tool identifiers the skill legitimately uses
  (`push_private` is the forward reference to Phase 5; `phasing_out` and `replaced_by` are
  manifest fields; `coding_agents` if it appears). Print the offending token and line.
- Every registered tool name appears at least once in `SKILL.md`.
- The `edits` op names the skill documents (`add`, `set`, `link`, `unlink`, `deprecate`,
  `remove`, `rename`) match the union's literals: read them off `editSchema` (exported from
  `propose-edit.ts`) rather than retyping.

Mutation-check it: add a fake `` `frobnicate_manifest` `` to the skill and see the test name it;
remove `list_icons` from the skill and see the reverse direction go red. Restore both.

## Files you own

- `skills/catalogus/SKILL.md`
- `skills/README.md` (one paragraph: the skill drives the MCP tools first; the CLI is the
  fallback; the drift tests that guard each)
- `packages/cli/src/skill-tools-drift.test.ts` (new)
- `packages/cli/src/skill-commands-drift.test.ts` **only** if a fenced line you change trips
  it — prefer changing the skill line to match the CLI.

**Do not edit** anything under `packages/cli/src/mcp/`, `commands/`, `docs/`, `README.md`,
`packages/schema` (its `skill-drift.test.ts` walks the skill's yaml fragment; keep that fragment
byte-identical or its test tells you what moved), or `examples/`.

## Verify

```
pnpm build && pnpm test && pnpm typecheck
```

Baseline before this brief: the count the apply brief's report states (the main session fills it
in here: **1751 tests / 91 files**). Run build before test; run the suite twice. Report observed
numbers only, and the two mutation results.

## Report back

Files changed; test counts before and after; exit codes of the three verify steps, each run; the
two mutation checks with the test names that went red; the new section's text verbatim; anything
not executed, labelled as such.
