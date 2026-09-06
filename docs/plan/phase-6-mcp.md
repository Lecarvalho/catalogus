# Phase 6 — MCP server mode

> Split out of `docs/PLAN.md` on 2026-09-05, content verbatim. `docs/PLAN.md` is the index and the
> only place status is summarised; this file is the record. Section headings are unchanged so a
> code comment that names one still finds it by grep.

## Phase 6 — MCP server mode 🔶 three of five boxes, 2026-09-06

The agent workflow, and the differentiator. `catalogus mcp` over stdio.

- [x] `detect_stack` — run detection, return a structured diff against the manifest
      (2026-09-06; validated against the built binary, see below)
- [x] `read_manifest` (2026-09-06)
- [x] `propose_manifest_edit` — returns a diff for approval, never writes directly (2026-09-06)
- [x] `apply_manifest_edit` — writes an approved proposal through the command functions; refuses
      a stale base (decision 14, 2026-09-06; validated, see below)
- [x] `init_manifest`, `validate_manifest`, `render_graph`, `list_icons` — the rest of the CLI's
      agent-relevant surface as tools (decision 14; validated)
- [x] The skill rewritten MCP-first, CLI fenced commands as the fallback; a drift test ties the
      tool names the skill teaches to the server's registry (decision 14; 250 lines, validated)
- [ ] `push_private` — routes through the CLI's credential; the agent never sees it (needs Phase 5)
- [ ] Wire into Claude Code and run the detect → diff → propose loop against a real repo (the
      owner's session: an `.mcp.json` entry naming `node packages/cli/dist/cli.js mcp <repo>`; not
      done by the 2026-09-06 session, which had no live client)

### What was built on 2026-09-06

`catalogus mcp [path]` — `packages/cli/src/commands/mcp.ts` connects a `StdioServerTransport` to
the server `packages/cli/src/mcp/server.ts` builds; `[path]` is the default directory for a tool
call that names none. The three tools, one file each under `packages/cli/src/mcp/`:

- **`read_manifest {path?}`** — the manifest's text and, when it validates, the parsed object and
  the soft private-guard warnings; an invalid manifest comes back `valid: false` with the problem
  lines and is not a tool error; no manifest is an error naming `catalogus init --yes`.
- **`detect_stack {path?}`** — the object `catalogus diff --json` prints, plus `hasDiff`. Built on
  `computeDiff`, extracted from `runDiff` in `commands/diff.ts`; the validator proved `diff` and
  `diff --json` byte-identical against a `HEAD` worktree build on four fixtures.
- **`propose_manifest_edit {path?, edits[]}`** — runs `add`/`set`/`link`/`unlink`/`deprecate`/
  `remove`/`rename` through the command functions against a scratch copy of the manifest (and its
  `.catalogus/` directory), returns a unified diff, per-step exit codes and output, the files under
  `.catalogus/` that would change, and the POSIX-quoted `catalogus ...` lines that apply it. The CLI
  stays the only writer: the tool never touches the real file (hashed before and after every
  proposal by the validator, succeeding and failing).

Rules every tool shares: a named path — the call's own or the server's default — never walks up
to an ancestor's manifest, mirroring `openManifestForEdit`; a relative call path resolves against
the server's default directory (`mcp/tool-path.ts`); nothing in the process writes to stdout
except the SDK (a spy test in `server.test.ts`, and every stdout line of every raw session the
validator ran parsed as JSON-RPC). `catalogus mcp` joins `catalogus view` in the
skill's prose-only rule: fenced means the agent runs it, and a server is never fenced
(`skill-commands-drift.test.ts`, decision 11).

Dependencies added to `packages/cli`: `@modelcontextprotocol/sdk` 1.30.0, `zod` 4, `diff` 8.

**Validated** (strongest model, built binary, SDK `Client` over `StdioClientTransport` and raw
newline-delimited JSON-RPC over a spawned process; report in the 2026-09-06 handoff). Three
defects found and fixed by the main session, then re-validated clean:

- **D1.** Stdin EOF closed the transport with tool calls in flight, so a pipe-style client
  (`cat requests | catalogus mcp`) got 4 of 16 answers. `runMcp` now tracks request ids received
  minus responses sent and closes only when stdin has ended and that set is empty. The mutation
  (close as soon as input ends) is caught by one test only — the spawned-binary test in
  `cli-binary.test.ts`; the in-memory test in `mcp.test.ts` does not see it.
- **D2.** A `set` value beginning with `-` was proposed as OK and refused by the real binary as an
  unknown option. The emitted line carries commander's `--` before the positionals when either
  starts with `-`; every other positional the tools emit is a slug and cannot.
- **D3.** A relative `path` in a tool call resolved against the process cwd, not the
  `catalogus mcp <dir>` default. Fixed in `tool-path.ts`.

Recorded, not changed (pre-existing CLI behaviour or deliberate):
- `detect()` on an unparsable `package.json` or `docker-compose.yml` returns an empty detection
  and stack-analyser prints a coloured warning to **stderr**; over MCP the agent never sees
  stderr, so a corrupt file looks like "nothing detected". Same as `catalogus diff`.
- `add` writes `added: <today>` and the proposal's command line carries no `--added`, so a command
  applied on a later day dates the entry differently from the diff shown.
- The private guard checks keys, not values: `add --notes api_key=...` is accepted, by the CLI
  too.
- The `detect-failed` branch the implementer reported as unreachable is reachable: an unreadable
  subdirectory makes both `catalogus diff` and `detect_stack` fail with `EPERM`.

Verified: **1724 tests / 89 files**, twice, build and typecheck exit 0.

### Decision 14, the same day: the agent surface completed and the skill made MCP-first

Implemented from `docs/mcp-apply-brief.md` (tools) and `docs/skill-mcp-first-brief.md` (skill),
validated from `docs/mcp-apply-validation-brief.md` on the built binary. The server has eight
tools: `read_manifest`, `detect_stack`, `init_manifest`, `propose_manifest_edit`,
`apply_manifest_edit`, `validate_manifest`, `render_graph`, `list_icons`. The proposal now
returns `baseSha256`; apply refuses when the file's hash differs. `edit-runner.ts` holds the one
edit dispatcher both propose and apply run, so the approved diff and the landed diff cannot
diverge. `SKILL.md` is 250 lines (from 594): tool path first, fenced CLI as fallback, propose
then apply for every write; the cut background lives in `skills/README.md`.
`skill-tools-drift.test.ts` checks both directions between the skill's backticked tool names and
the server's registry.

**Six validation findings, fixed by the main session and covered by tests:**
- D1: `validate_manifest`, `render_graph`, `list_icons` walked up past an explicit path (an empty
  subdirectory answered `valid: true` for the parent). The wrappers check the named directory
  first now.
- D2: two pipelined applies with the same `baseSha256` both reported ok and one write was lost.
  The two writing tools are serialized per server; a `Promise.all` of two applies now gets one
  ok and one stale refusal.
- D3: two tool descriptions still routed writes to the CLI lines. Rewritten.
- D4: the op-list drift assertion only goes red when both occurrences of an op name change.
  **Recorded, not fixed.**
- D5: the skill named `staleBase`, a field the server drops from the wire. Now says "a refusal
  saying the file changed".
- D6: a history aside about this session in the skill's opening. Removed; the owner's rule is
  that the skill instructs and never narrates.

Verified after the fixes: **1695 tests / 92 files**, twice, build and typecheck exit 0. The count
fell from 1751 because `skill-commands-drift.test.ts` generates tests per fenced line and the
skill has fewer lines; the validator confirmed the accounting.

