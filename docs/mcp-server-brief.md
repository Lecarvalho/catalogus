# Brief: `catalogus mcp` — the server, `read_manifest` and `detect_stack` (Phase 6, part 1)

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first,
then `docs/plan/phase-6-mcp.md` and HANDOFF §6 "MCP server mode" (`docs/HANDOFF.md`, around line
415). The comment register of neighbouring files is the register you write in: every decision gets
a comment beside the code, in full sentences, dated 2026-09-06, with the reason. Look at
`packages/cli/src/commands/view.ts`, `commands/diff.ts` and `program.ts` for the register before
writing a line.

## What this builds

The first three boxes of Phase 6 minus `propose_manifest_edit`, which a second implementer is
building in parallel as a standalone function (`packages/cli/src/mcp/propose-edit.ts`) that the main
session will register afterwards. You build:

1. `createCatalogusMcpServer(options)` in `packages/cli/src/mcp/server.ts` — an `McpServer` from
   `@modelcontextprotocol/sdk` (already installed, 1.30.0, with `zod` 4) with two tools registered:
   `read_manifest` and `detect_stack`. No transport inside; the caller connects one. This is what
   makes it testable with `InMemoryTransport.createLinkedPair()` and a `Client`.
2. `runMcp(pathArg)` in `packages/cli/src/commands/mcp.ts` — connects a `StdioServerTransport`,
   resolves with a `CommandResult` of exit 0 once the transport closes (the client hung up), so a
   commander action can await it the way every other command is awaited. Empty `stdout` in that
   result: see the stdout rule below.
3. `computeDiff(targetDir)` extracted from `runDiff` in `packages/cli/src/commands/diff.ts` so
   `detect_stack` returns exactly the object `catalogus diff --json` prints, built once, in one
   place. `runDiff`'s observable output must not change by a byte — `diff.test.ts` is the guard.
4. The `mcp` command registered in `program.ts`, and exports in `index.ts`.

## Tool contracts

Both tools take one optional input, `path` (string): the repo directory. When absent, the server's
`defaultPath` (from `catalogus mcp [path]`) is used, and when that is absent too, the process's
cwd — resolve through `resolveTargetPath`, the same function every command uses. Return results as
`content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]` **and** the same object as
`structuredContent`. Do not declare an `outputSchema`: the SDK would then validate every result
against it, and the diff payload's shape is owned by `diff.ts`, not by a second copy in a schema.

- **`read_manifest`** — locate the manifest the way the commands do (`findManifestIn` when a path
  was given explicitly, `findManifest`'s upward walk only when no path was given anywhere — the
  reason is in `openManifestForEdit`'s comment in `manifest-edit.ts`; copy the rule, not the code,
  or export a helper from `manifest-edit.ts` if that is cleaner and say why). Payload on success:
  `{ manifestPath, filename, text, manifest, valid: true, warnings }` where `manifest` is the parsed
  object from `loadValidManifest` and `warnings` the soft private-guard lines. When the file
  exists but does not validate, that is **not** a tool error: return `{ manifestPath, filename,
  text, valid: false, problems: [...lines] }` so the agent can see what is wrong and fix it with
  the CLI. Use `checkManifestText` from `manifest-checks.ts` for the lines. When no manifest is
  found, return `isError: true` with a text content naming the directory searched and the line
  that fills the gap: `catalogus init --yes` (CLAUDE.md's "absent field reads as not answered
  yet" rule applies to whole files too).
- **`detect_stack`** — `computeDiff(targetDir)`. Returns the diff payload. No manifest: `isError`
  with the same `catalogus init --yes` line. Detection threw: `isError` with the error message.
  The payload's `hasDiff` (or whatever `diff.ts` already names it — keep its names) is what an
  agent reads first; make sure it is in the object.

Tool descriptions are read by an agent choosing a tool, so write them as one or two full sentences
that say what the result is and what it is not: `detect_stack` is a claim about one checkout, not
about the world (`diff.ts`'s header explains why; carry that sentence into the description).

## The stdout rule, and why it is the whole design

Over stdio, **stdout is the JSON-RPC channel.** One stray `console.log` anywhere in the process
corrupts the framing and the client disconnects with no useful message. This is why every command
already returns a `CommandResult` instead of printing: `runMcp` must never call `emit`-like code,
and nothing it calls may print. `@catalogus/core`'s `detect()` was grepped by the main session and
prints nothing; state that in a comment and add a test that proves it for the server: run
`detect_stack` and `read_manifest` through an in-memory transport with `process.stdout.write`
spied (`vi.spyOn`) and assert it was never called. Diagnostics, if any, go to stderr.

`runMcp` resolving on transport close: `StdioServerTransport` ends when stdin ends. Resolve
`{ exitCode: 0, stdout: [], stderr: [] }` then. If connecting throws, resolve
`{ exitCode: 2, stdout: [], stderr: [message] }`.

## Program registration

```
catalogus mcp [path]     # run as an MCP server over stdio (tools: read_manifest, detect_stack, propose_manifest_edit)
```

`[path]`: the default repo directory for tools that do not name one. Description in that shape;
include `propose_manifest_edit` in it because it lands in the same commit (the main session wires
it). Like `view`, this command holds the process open until the client disconnects, so it must
never appear fenced in `skills/catalogus/SKILL.md` (decision 11 in `docs/plan/decisions.md`). Do
not edit `SKILL.md` or `skill-commands-drift.test.ts`; the main session does that.

## Files you own

- `packages/cli/src/mcp/server.ts`, `packages/cli/src/mcp/server.test.ts`
- `packages/cli/src/mcp/read-manifest.ts` (+ `.test.ts`), `packages/cli/src/mcp/detect-stack.ts`
  (+ `.test.ts`) — one file per tool, each exporting the tool's input shape (a zod raw shape, e.g.
  `{ path: z.string().optional() }`), its description, and its handler. `server.ts` registers them.
- `packages/cli/src/commands/mcp.ts`, `packages/cli/src/commands/mcp.test.ts`
- `packages/cli/src/commands/diff.ts`, `packages/cli/src/commands/diff.test.ts` (only if the
  extraction needs a test moved; behaviour must not change)
- `packages/cli/src/program.ts` (the one registration), `packages/cli/src/index.ts` (exports:
  `createCatalogusMcpServer`, `runMcp`, `computeDiff` and their types)
- `packages/cli/src/cli-binary.test.ts` — one added test: spawn `node dist/cli.js mcp <tempdir>`
  with a CLI-written manifest in `<tempdir>`, write an `initialize` request, the
  `notifications/initialized` notification and a `tools/list` request as newline-delimited
  JSON-RPC to stdin, end stdin, and assert: exit 0, every non-empty stdout line parses as JSON,
  and the tool list names `read_manifest` and `detect_stack` (and `propose_manifest_edit` once
  the main session wires it — write the assertion as "contains" so it does not go red when the
  third tool lands). The existing `run` helper there uses `execFile`; you will need a variant
  that writes stdin. Match the file's register.

**Do not edit** `packages/cli/src/mcp/propose-edit.ts` or `propose-edit.test.ts` (the other
implementer's), `manifest-edit.ts` beyond an exported helper if you choose that route,
`skills/`, anything under `docs/`, or any file in `packages/core`, `packages/schema`, `apps/web`.
`package.json` and the lockfile are already updated; do not run `pnpm add`.

## Tests you write, at minimum

In `server.test.ts`, through `InMemoryTransport.createLinkedPair()` and
`@modelcontextprotocol/sdk/client/index.js`'s `Client`: `tools/list` names both tools with their
descriptions; `read_manifest` on a temp dir holding a valid manifest returns the text and the
parsed object; on an invalid manifest returns `valid: false` with problems and is not `isError`;
on an empty dir is `isError` and names `catalogus init --yes`; `detect_stack` on a temp dir with a
`package.json` naming a mapped dependency and a manifest without it reports that service as
missing; an explicit `path` under a directory that has its own manifest does **not** walk up (write
a manifest in the temp root, call with `path` = an empty subdirectory, expect the `isError`
not-found result); the stdout spy test above. Use `createTempDir`/`writeFixtureFile` from
`test-support/temp-dir.ts` and the existing manifest fixtures in `diff.test.ts` as the model.

## Verify

```
pnpm build && pnpm test && pnpm typecheck
```

Baseline before this brief: **1680 tests / 84 files**, build and typecheck exit 0. Run build
before test (the direction-contract guard compares `apps/web/index.html` against the build output;
`cli-binary.test.ts` runs the built `dist/cli.js`). Run the suite twice. Report the numbers you
observed, not the numbers you expect. Report anything you could not do as not done.

## Report back

Files changed; test counts before and after; exit codes of the three verify steps, each run;
the exact JSON the `tools/list` round-trip returned in the binary test; and any claim of yours
that you did not execute, labelled as such.
