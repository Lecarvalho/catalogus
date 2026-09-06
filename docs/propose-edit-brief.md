# Brief: `propose_manifest_edit` — a diff for approval, never a write (Phase 6, part 2)

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first,
then `docs/plan/phase-6-mcp.md` and HANDOFF §6 "MCP server mode" (`docs/HANDOFF.md`, around line
415). The comment register of neighbouring files is the register you write in: every decision gets
a comment beside the code, in full sentences, dated 2026-09-06, with the reason. Read
`packages/cli/src/manifest-edit.ts` and `commands/add.ts` for the register before writing a line.

## What this builds

One function, `proposeManifestEdit(input, options?)`, in `packages/cli/src/mcp/propose-edit.ts`,
plus its zod input shape and a tool description, so the main session can register it on the MCP
server another implementer is building in `packages/cli/src/mcp/server.ts`. You do **not** touch
the server or any transport. The function is the tool's handler body: it takes the tool's input
and returns the payload the tool will answer with.

The design, settled by the main session:

**The proposal runs the CLI's own write path against a scratch copy of the manifest, and returns
the diff plus the `catalogus ...` lines that would apply it for real.** Nothing else may write
`catalogus.yaml` (CLAUDE.md: "the CLI is the only writer"), so the tool does not grow a second
editing engine that could disagree with `add`/`set`/`link`. It invokes the command functions —
`runAdd`, `runSet`, `runLink`, `runUnlink`, `runDeprecate`, `runRemove`, `runRename` — with the
scratch directory as their `pathArg`. Because an explicit `pathArg` never walks upward
(`openManifestForEdit`'s comment), the scratch copy can never resolve to a parent's manifest.

## Input

```ts
{
  path?: string;          // repo directory; absent = the server's default, then cwd (resolveTargetPath)
  edits: Edit[];          // at least one, applied in order
}
Edit =
  | { op: "add"; service: string; role: string; id?: string; kind?: string; version?: string;
      dependsOn?: string[]; status?: string; replacedBy?: string; added?: string; notes?: string }
  | { op: "set"; field: string; value: string }      // one field per edit; runSet gets [field, value]
  | { op: "link"; from: string; to: string }
  | { op: "unlink"; from: string; to: string }
  | { op: "deprecate"; id: string; status?: string; replacedBy?: string }
  | { op: "remove"; id: string }
  | { op: "rename"; from: string; to: string }
```

Export the zod raw shape as `proposeManifestEditInputShape` (`{ path: z.string().optional(),
edits: z.array(editSchema).min(1) }`, `editSchema` a `z.discriminatedUnion("op", [...])`), the
inferred TypeScript type as `ProposeManifestEditInput`, and the description string as
`PROPOSE_MANIFEST_EDIT_DESCRIPTION`. The description is read by an agent choosing a tool: say in
one or two full sentences that it returns a diff and the commands to apply it, and that it never
writes. Mirror the CLI's option names exactly (the same words `catalogus add --help` uses), because
the `commands` output below has to round-trip into them.

## Behaviour

1. Locate the real manifest: `findManifestIn` when `path` is given, `findManifest` when not (the
   same rule as `openManifestForEdit`; reuse it if you can without changing its signature). No
   manifest: return `{ ok: false, error: "...", fill: "catalogus init --yes" }` — the payload's
   shape is yours, but the not-found case must name that line.
2. Create a scratch directory (`mkdtemp` under `os.tmpdir()`). Copy the manifest file into it
   under its own filename (`catalogus.yaml` or the `stack.yaml` fallback — both are legal on
   read), and copy the `.catalogus/` directory beside it if one exists: `set services.<id>.icon`
   vendors into `.catalogus/icons/`, and `remove`/`rename` move or delete files there, so a
   proposal that ignored that directory would report a different edit from the one the CLI makes.
3. Run each edit in order with the scratch dir as `pathArg`, collecting
   `{ op, command, exitCode, stdout, stderr }` per step. Stop at the first non-zero exit — the
   later edits were written against a state that no longer exists.
4. Read the scratch manifest back. Note `writeManifestText` always writes `catalogus.yaml`, so when
   the source was `stack.yaml` the written file has a different name; report `writesTo` as the real
   path the CLI would write (`<dir>/catalogus.yaml`) and diff old text against the new file.
5. Build a unified diff with `createTwoFilesPatch` from `diff` (installed, v8, typed) using the
   real manifest path for both headers. Empty diff when nothing changed.
6. List every file under the scratch `.catalogus/` that was added, removed or changed relative to
   the copy (names only, never contents — an icon SVG in a tool result is noise).
7. Delete the scratch directory in a `finally`.
8. Return, for example:
   ```ts
   { ok: boolean; manifestPath: string; writesTo: string; changed: boolean; diff: string;
     otherFiles: { path: string; change: "added" | "removed" | "modified" }[];
     steps: { op: string; command: string; exitCode: number; stdout: string[]; stderr: string[] }[];
     commands: string[] }   // the shell lines for the steps that succeeded, in order
   ```
   `commands` are what the agent runs after the user approves, so they must be copy-pasteable:
   write a small quoting helper (wrap a token in single quotes when it contains whitespace or a
   shell metacharacter, escaping embedded single quotes the POSIX way) and a comment saying the
   quoting is POSIX because every fenced line in `SKILL.md` is. Values must round-trip: the token
   list `catalogus set project.architecture 'modular monolith (.NET 10)'` must be what a shell
   would hand back to `runSet` as `["project.architecture", "modular monolith (.NET 10)"]`.

`runSet` takes a `fetchImpl` parameter; accept `options.fetchImpl` and pass it through so the
tests never touch the network, and say in a comment that a real `set services.<id>.icon <url>`
proposal does fetch (the CLI would too, and the scratch copy is where the fetched bytes land).

**The real manifest is never written, moved or read for writing.** Test it: snapshot the real
file's bytes before and after every proposal, including a proposal whose steps all succeed and one
whose step fails. That test is the reason the tool is allowed to exist.

## Files you own

- `packages/cli/src/mcp/propose-edit.ts`
- `packages/cli/src/mcp/propose-edit.test.ts`

**Do not edit anything else.** Not `manifest-edit.ts`, not any `commands/*.ts`, not `server.ts`
(the other implementer's), not `program.ts`, not `index.ts` (the main session adds the export),
not `skills/`, not `docs/`. `package.json` and the lockfile are already updated; do not run
`pnpm add`. If a command function's signature makes something impossible, report it rather than
changing the command.

## Tests you write, at minimum

Using `createTempDir`/`writeFixtureFile`/`removeTempDir` from `test-support/temp-dir.ts` and the
manifest fixtures `commands/add.test.ts` and `link.test.ts` use as the model:

- an `add` proposal returns a diff containing the new entry, `changed: true`, one command line
  `catalogus add <service> --role <role> ...` that reproduces the input exactly, and the real file
  is byte-identical afterwards;
- a multi-step proposal (`add`, `add`, `link`) applies all three and the diff shows the edge;
- a failing step (`link` between an id that does not exist) stops the run: `ok: false`, the
  step's exit code and stderr are in `steps`, `commands` holds only the steps before it, the real
  file is untouched;
- a `set` on a private-looking field (`project.cost`, or whatever `private-guard.ts` refuses) is
  refused with the command's own exit code and message, nothing written anywhere;
- a `rename` reports the moved vendored icon under `otherFiles` (write a fixture icon under
  `.catalogus/icons/` and an entry whose `icon` points at it — `commands/rename.ts` says how it
  moves the file);
- a `stack.yaml` source reports `writesTo` ending in `catalogus.yaml`;
- a `set` with a value containing spaces round-trips through the quoting helper (assert on the
  exact command string);
- no manifest in the directory returns the not-found payload naming `catalogus init --yes`;
- the scratch directory is gone after both a successful and a failed proposal (capture the path
  through a test-only `options.onScratchDir` hook, or by listing `os.tmpdir()` for the prefix
  before and after — say which and why).

## Verify

```
pnpm build && pnpm test && pnpm typecheck
```

Baseline before this brief: **1680 tests / 84 files**, build and typecheck exit 0. Run build
before test (the direction-contract guard compares `apps/web/index.html` against the build output).
The other implementer's tests will be landing in parallel, so the total will move under you; report
the count of *your* file's tests and the total you observed. Run the suite twice. Report anything
you could not do as not done.

## Report back

Files changed; your test count and the totals observed; exit codes of the three verify steps;
the exact `commands` array and `diff` string one test produced; and any claim of yours that you did
not execute, labelled as such.
