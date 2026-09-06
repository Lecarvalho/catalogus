# Validation brief: `catalogus mcp` and its three tools (Phase 6, parts 1 and 2)

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first.
You are the validator. **You report; you do not fix.** You did not write this code and you must not
read it to convince yourself it works: you execute the built binary against inputs you write
yourself, and every claim in the implementers' reports below is unverified until you reproduce it.

## What was built

Two implementers on a smaller model worked from `docs/mcp-server-brief.md` and
`docs/propose-edit-brief.md`; the main session wired the third tool into the server and made
`detect_stack` refuse to walk up past an explicit path, matching `read_manifest`. Read both briefs
for the contracts. The surface:

- `catalogus mcp [path]` — MCP server over stdio. `[path]` is the default repo directory for a
  tool call that names none. Exit 0 when the client closes stdin.
- Tools: `read_manifest {path?}`, `detect_stack {path?}`, `propose_manifest_edit {path?, edits[]}`.
  Every tool answers a named path without walking up to an ancestor's manifest; with no path at
  all, the process cwd is used and the git-style upward walk applies.
- `computeDiff` was extracted from `runDiff`; `catalogus diff` and `catalogus diff --json` are
  claimed byte-for-byte unchanged.

## Implementer claims to test directly (each one, by execution)

1. `tools/list` names all three tools with descriptions; `propose_manifest_edit`'s description says
   it never writes.
2. `read_manifest`: valid manifest returns text, parsed object, `valid: true`, `warnings`; an
   invalid manifest returns `valid: false` with `problems` and is **not** `isError`; no manifest is
   `isError` naming `catalogus init --yes`; an explicit `path` at an empty subdirectory of a
   directory with a manifest is not-found (no walk-up); with `catalogus mcp <subdir>` as the
   default path and no `path` argument, the same.
3. `detect_stack` returns the object `catalogus diff --json` prints plus `hasDiff`. Prove the
   byte-equality claim for the CLI command itself: build the pre-change binary in a `git worktree`
   at `HEAD` (the working tree holds the change uncommitted) and compare `catalogus diff` and
   `catalogus diff --json` output on the same fixtures between the two binaries. Then compare the
   tool's `structuredContent` (minus `hasDiff`) to the new binary's `--json` output.
4. `detect_stack` with an explicit path never walks up (the main session's change; the
   implementer's first version did walk up).
5. `propose_manifest_edit`:
   - the real `catalogus.yaml` is byte-identical before and after every proposal, succeeding or
     failing (hash it);
   - **the round trip**: take the returned `commands`, run them with the real binary against a
     copy of the same manifest, and compare the resulting file to what the returned `diff`
     described. Note the implementer's own output: `add` writes `added: <today>` and the returned
     command carries no `--added`, so a command applied on a later day differs from the diff.
     Report whether that is the only divergence, and any other field the commands do not
     round-trip;
   - a failing middle step stops the run: `ok: false`, the step's exit code and stderr present,
     `commands` holds only the earlier steps;
   - `set project.cost 5` (or another private-looking field) is refused with the command's own
     exit code and message; nothing written anywhere, including the scratch copy's parent;
   - `rename` of an entry with a vendored icon under `.catalogus/icons/` reports the moved file in
     `otherFiles`; `remove` reports it removed;
   - a `stack.yaml` source reports `writesTo` ending in `catalogus.yaml`;
   - quoting: values containing spaces, a single quote, `$`, backticks, `#`, a leading `-`, and
     an empty string, each round-tripped through a POSIX shell (`bash -c`) back into the binary;
   - the scratch directory is gone afterwards (list `os.tmpdir()` for `catalogus-propose-edit-`
     before and after);
   - an unknown `op`, an empty `edits` array, an `add` without `role`, and a `path` pointing at a
     file rather than a directory: each is an error, none writes anything;
   - a `path` of `..` or `../..` relative to a repo with a manifest: what does it resolve to and
     is that the right answer?
6. **stdout purity.** Over stdio, every non-empty stdout line must parse as JSON-RPC. Run each
   tool at least once, including the error paths and a proposal that makes `add` report a missing
   icon, and check every stdout byte. Anything else on stdout is a defect, wherever it comes from.
7. `runMcp` exits 0 on stdin EOF, and the process does not linger (measure).
8. The implementer reports the `detect()`-threw branch (`reason: "detect-failed"`) as untested
   because "it cannot fail on a directory that has a manifest". Try to make it fail: a manifest
   beside a `package.json` that is not JSON, a `docker-compose.yml` that is not YAML, a
   subdirectory the process cannot read, a symlink loop. Report what you got.
9. `pnpm build && pnpm test && pnpm typecheck`, twice. Expected **1720 tests / 89 files**, build
   and typecheck exit 0. Report observed numbers.
10. Mutation checks, then restore with `git checkout -- <file>` and say so in the report: remove
    the `findManifestIn` guard in `packages/cli/src/mcp/detect-stack.ts`; make `proposeManifestEdit`
    write to `location.dir` instead of the scratch dir; drop the `end` listener in
    `packages/cli/src/commands/mcp.ts`. For each, name the test that went red, or report that none
    did.

## How to drive the binary

Prefer the SDK's own client against the real binary: `Client` from
`@modelcontextprotocol/sdk/client/index.js` with `StdioClientTransport` from
`@modelcontextprotocol/sdk/client/stdio.js`, command `node`, args
`["packages/cli/dist/cli.js", "mcp", <dir>]`. Write your driver scripts in your scratchpad (not in
the repo); `packages/cli/node_modules` has the SDK, so run scripts from inside `packages/cli` or
set `NODE_PATH`. For stdout purity, also drive it once raw: spawn the process, write
newline-delimited JSON-RPC (`initialize`, `notifications/initialized`, `tools/call`), capture
stdout bytes.

Fixtures: write them with the CLI itself (`init --yes`, `add`, `link`, `set services.<id>.icon
<local file>`) in temp directories, the way a real repo would have them.

## Do not

Edit any file in the repo except transiently for the mutation checks (restore each before the
next check, and before reporting). Do not touch `docs/`. Do not run `pnpm add`. Do not commit.

## Report

Per claim: reproduced / not reproduced / defect, with the exact command, exit code and the
decisive output line. Defects first, ranked. Then the verify numbers from both runs, the
mutation results, and anything you could not do, labelled as such.
