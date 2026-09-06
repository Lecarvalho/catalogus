# Validation brief: `apply_manifest_edit`, the four command tools, and the MCP-first skill (Phase 6, decision 14)

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first,
then `docs/plan/decisions.md` decision 14, then `docs/mcp-apply-brief.md` and
`docs/skill-mcp-first-brief.md` (the two briefs whose claims you test), then
`docs/mcp-validation-brief.md` (the previous round: its driver approach is the one to reuse).
**You report; you do not fix.** You did not write this code; you execute the built binary against
inputs you write yourself and treat every implementer claim as unverified until reproduced.

## Claims to test, by execution

Drive `node packages/cli/dist/cli.js mcp <dir>` with the SDK `Client` over `StdioClientTransport`,
and once raw over a pipe. Fixtures written with the CLI in temp dirs.

1. **`tools/list`** names exactly eight tools; every description is one or more full sentences;
   `apply_manifest_edit`'s says it writes and expects a proposal.
2. **Propose then apply, the intended loop.** Propose a batch (`add`, `add`, `link`, `set`,
   `deprecate`) on a CLI-written manifest; take `baseSha256` and the same `edits`; apply. The
   file on disk equals the proposal's diff applied to the original (`applyPatch` from `diff`).
   `sha256After` equals the hash of the file now on disk. Then propose the same batch again and
   confirm every step fails as a duplicate and nothing changes.
3. **Stale base.** Propose; change the file with the CLI (`catalogus set project.name X`); apply
   with the old `baseSha256`: refused, `isError`, file byte-identical to the CLI's write, message
   says to propose again. Apply without `baseSha256`: proceeds, `baseChecked: false` in the
   payload.
4. **Partial failure on apply.** `add`, then `link` to a missing id, then `add`: first step on
   disk, second reported with its exit code, third not run; `ok: false`; not an MCP `isError`.
5. **Apply never bypasses validation.** An `add` whose `--depends-on` would create a cycle, and a
   `set` on a private-looking field: refused with the command's own exit code and message, the
   file unchanged. A `set services.<id>.icon <local svg>` through apply vendors the icon into
   `.catalogus/icons/` the same way the CLI does; the diff shows the `icon:` line.
6. **`init_manifest`.** Empty dir: writes a manifest, returns its text, no `project.vcs` block
   when `visibility` is absent; `visibility: "private"` lands; `visibility: "nonsense"` is the
   command's own refusal; existing manifest without `force` is refused, with `force: true` it
   overwrites. Nothing in the payload guesses a value the input did not carry.
7. **`validate_manifest`.** Valid → `valid: true`; invalid → `isError`, lines; a manifest with a
   soft private warning: exit 0 without `strict`, exit 1 with.
8. **`render_graph`.** `text` and `mermaid` on a three-node manifest; with `FORCE_COLOR=1` in the
   server's environment no `\u001b` byte appears in the payload; `format: "svg"` is a validation
   error.
9. **`list_icons`** names an entry with no icon; after a vendored icon is set, names its path.
10. **Path rule** for the five new tools: explicit `path` at an empty subdirectory of a repo with a
    manifest is not-found (no walk-up); relative `path` resolves against the server default.
11. **stdout purity** across all eight tools including every error path above: every stdout
    line of the raw session parses as JSON-RPC; count stderr bytes and say what was there.
12. **The skill, read as the agent would.** Open `skills/catalogus/SKILL.md` and answer, quoting
    the lines: does it tell an agent with the tools connected to load them if deferred; does it
    put `propose_manifest_edit` before `apply_manifest_edit` for every write; does it keep the
    fenced CLI path for an agent without the tools; is `catalogus mcp` or `catalogus view` fenced
    anywhere (must not be); does any sentence still call the tools read-only; do the documented
    `edits` shapes match `propose-edit.ts`'s `editSchema` (check each op's fields against the
    zod schema by reading the schema, this once, because the skill is prose and cannot be
    executed). Does the `yaml` fragment `packages/schema/src/skill-drift.test.ts` walks still
    validate (run that test alone and say so).
12b. **Length.** The owner ruled the skill must be concise (2026-09-06: "needs to be, otherwise
    people not gonna use it if too heavy"); the cap given to the implementer is 250 lines. Report
    `wc -l` on `SKILL.md`, and read it once for padding: a paragraph that restates a rule already
    stated, or narrates history, is a defect to name with its line number.
13. **Drift tests.** `packages/cli/src/skill-tools-drift.test.ts` exists and passes. Mutations,
    each restored from a backup you take first (the skill is tracked, so `git checkout --` works
    there; the new test file is untracked): add `` `frobnicate_manifest` `` to the skill → the
    test names the token and the line; delete every mention of `list_icons` from the skill →
    the reverse direction goes red; register a ninth tool name in `server.ts`
    (`server.registerTool("noop_tool", ...)` with a trivial handler) → red; change an `edits` op
    literal in the skill (`rename` → `move`) → red. Name the test that went red each time, or
    say none did.
14. **Verify** `pnpm build && pnpm test && pnpm typecheck`, twice. Expected: the count the
    skill implementer reports (the main session fills it in: **1693 tests / 92 files** — down from 1751 because `skill-commands-drift.test.ts` generates one test per fenced line and the skill now has fewer; confirm that accounting yourself).

## Do not

Edit any file except transiently for the mutation checks. Do not touch `docs/`. Do not run
`pnpm add`. Do not commit. Do not run a live Claude Code session; the live wiring is the owner's
item on the board.

## Report

Defects first, ranked, each with the exact command, exit code and decisive output line. Then per
claim: reproduced / not reproduced / defect. Then the skill reading (claim 12) with quotes, the
mutation results, the verify numbers from both runs, and anything you could not do, labelled.
