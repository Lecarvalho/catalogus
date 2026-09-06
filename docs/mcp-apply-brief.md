# Brief: the MCP server completes its agent surface — `apply_manifest_edit` and four command tools (Phase 6, decision 14)

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first,
then `docs/plan/decisions.md` decision 14 (the owner's ruling this implements), then
`packages/cli/src/mcp/server.ts`, `propose-edit.ts`, `read-manifest.ts` and `detect-stack.ts` —
the register, the handler shape and the path rule you match. Every decision gets a comment beside
the code, in full sentences, dated 2026-09-06, with the reason.

## What this builds

Five tools on the existing server, so an agent with the `catalogus` MCP connected never needs a
shell:

| Tool | Input | Wraps |
|---|---|---|
| `apply_manifest_edit` | `{ path?, edits[], baseSha256? }` | the same command functions `propose_manifest_edit` runs, against the **real** directory |
| `init_manifest` | `{ path?, visibility?, force? }` | `runInit(path, { yes: true, visibility, force })` |
| `validate_manifest` | `{ path?, strict? }` | `runValidate` |
| `render_graph` | `{ path?, format?: "text" \| "mermaid" }` | `runGraph(path, { mermaid })` |
| `list_icons` | `{ path? }` | `runIcons` |

Plus one change to `propose_manifest_edit`: its report gains `baseSha256`, the SHA-256 hex of the
manifest text it read, so an approval can be tied to the file state it was given on.

## `apply_manifest_edit`

`packages/cli/src/mcp/apply-edit.ts`, shaped like `propose-edit.ts`: an exported zod raw shape
(`applyManifestEditInputShape` — reuse `propose-edit.ts`'s `editSchema` by exporting it from there;
do not duplicate the union), a description constant, and `applyManifestEdit(input)` returning a
payload. The `edits` union is byte-identical to the proposal's so an agent passes the proposal's
input straight through.

Behaviour:

1. Locate the manifest by the same explicit-path rule (`findManifestIn` for a named path,
   `findManifest` otherwise; `resolveToolPath` composes the call's path with the server default
   in `server.ts`, the same as the other tools). Not found: `isError` naming `init_manifest` as
   the fix — the tool, not the CLI line, because this server now has it.
2. If `baseSha256` is given, hash the current manifest text and refuse with `isError` when it
   differs: the file changed since the proposal, nothing written, say "propose again". If it is
   absent, apply without the check but say so in the payload (`baseChecked: false`). The check is
   a proposal-to-approval guard, not a lock: two agents can still race between hash and write, and
   the comment says so rather than pretending otherwise.
3. Run the edits in order against `location.dir` through the command functions — `runAdd`,
   `runSet`, `runLink`, `runUnlink`, `runDeprecate`, `runRemove`, `runRename` — exactly as
   `propose-edit.ts`'s `runEdit` does. Extract `runEdit` and its `buildCommand` into a shared
   module both files import (`packages/cli/src/mcp/edit-runner.ts`) rather than copying it: the
   proposal and the application must run the same code or the diff the user approved is not the
   diff that lands. Stop at the first non-zero exit. Earlier steps are already on disk, the way
   they would be if the CLI lines had been run by hand; the payload says which steps landed.
4. Payload: `{ ok, manifestPath, writtenTo, changed, diff, steps, baseChecked, sha256After }` —
   `diff` from `createTwoFilesPatch` of before against after, `steps` as in the proposal,
   `sha256After` so a follow-up call can chain.

## The four command tools

`packages/cli/src/mcp/command-tools.ts`: one small handler factory per tool, plus one shared
`commandResultToToolResult(result, extra?)` that maps a `CommandResult` to a `CallToolResult`:
`content` is the text of `stdout` then `stderr` joined with newlines, `structuredContent` is
`{ exitCode, stdout, stderr, ...extra }`, `isError` when `exitCode !== 0`. Every tool goes through
it so the agent reads one shape.

- **`init_manifest`** always passes `yes: true` — a server cannot prompt. `visibility` is passed
  through when given and never inferred (CLAUDE.md's hard rule; `init.ts`'s own comment). After a
  successful run, add the written manifest's text to `extra` as `text`.
- **`validate_manifest`** adds `valid: exitCode === 0`.
- **`render_graph`**: `format` defaults to `"text"`. `graph.ts` colours output only when
  `process.stdout.isTTY`, which is false under stdio MCP, but `FORCE_COLOR` overrides that: strip
  ANSI escapes from the tool's output unconditionally and say why in a comment (an agent cannot
  read `\u001b[32m`). A test sets `FORCE_COLOR=1` for the call and asserts no escape byte.
- **`list_icons`** is a straight wrap.

## Server, program, exports

- `server.ts` registers the five with descriptions written for an agent choosing a tool: one or
  two full sentences each, saying what it returns and, for `apply_manifest_edit`, that it writes
  and expects a proposal first. Update the header comment's tool list.
- `program.ts`: the `mcp` command's description names the write tool too. One line.
- `index.ts`: export `applyManifestEdit` and its types.

## Files you own

- `packages/cli/src/mcp/apply-edit.ts`, `apply-edit.test.ts`
- `packages/cli/src/mcp/edit-runner.ts` (extracted), `edit-runner.test.ts` if the extraction
  needs its own test; otherwise the existing `propose-edit.test.ts` covers it
- `packages/cli/src/mcp/command-tools.ts`, `command-tools.test.ts`
- `packages/cli/src/mcp/propose-edit.ts`, `propose-edit.test.ts` (`baseSha256`, the extraction)
- `packages/cli/src/mcp/server.ts`, `server.test.ts`
- `packages/cli/src/program.ts` (the one description line), `packages/cli/src/index.ts`

**Do not edit** anything under `commands/` (the command functions are the contract; if one lacks
what you need, report it), `cli-binary.test.ts`, `skills/`, `docs/`, `README.md`, or any other
package. A second implementer will rewrite the skill after you land, against the tool names and
input shapes in this brief — so those names and shapes are fixed; if you must deviate, say so in
the report in a way the next brief can copy.

## Tests, at minimum

Through `InMemoryTransport` and the SDK `Client` in `server.test.ts`: `tools/list` names all
eight tools. In the per-tool files, direct handler calls on temp dirs written with
`createTempDir`/`writeFixtureFile`:

- `apply_manifest_edit`: applies an `add` and the real file changes accordingly (read it back);
  with the proposal's `baseSha256` it applies; with a wrong `baseSha256` it refuses and the file
  is byte-identical; a failing second step leaves the first step's write on disk and reports
  both; the proposal → apply round trip: propose, take `baseSha256` and the same `edits`, apply,
  assert the file equals what the proposal's diff described (apply the patch with `diff`'s
  `applyPatch` to the original and compare); no manifest names `init_manifest`.
- `init_manifest`: scaffolds in an empty dir, returns the text, no `visibility` written when none
  given; `visibility: "private"` lands; existing manifest without `force` is the command's own
  refusal.
- `validate_manifest`: valid → `valid: true`, exit 0; invalid → `isError`, lines present;
  `strict` passes through (a soft warning turns into exit 1).
- `render_graph`: text and mermaid on a two-service manifest with one edge; the `FORCE_COLOR`
  case.
- `list_icons`: a service with no icon is named in the output.

## Verify

```
pnpm build && pnpm test && pnpm typecheck
```

Baseline before this brief: **1724 tests / 89 files**, build and typecheck exit 0. Run build before
test; run the suite twice. Report observed numbers only.

## Report back

Files changed; test counts before and after; exit codes of the three verify steps, each run; the
exact `tools/list` names; any deviation from the tool names or input shapes above, stated so the
skill brief can copy it; anything not executed, labelled as such.
