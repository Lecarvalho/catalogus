# Decisions made, and non-goals

> Split out of `docs/PLAN.md` on 2026-09-05, content verbatim. `docs/PLAN.md` is the index and the
> only place status is summarised; this file is the record. Section headings are unchanged so a
> code comment that names one still finds it by grep.

## Decisions made

From HANDOFF §9, plus decisions taken during implementation. Settled — reopen only with a reason.

1. **Manifest filename** — `catalogus.yaml`. `stack.yaml` accepted as a fallback on read; writes are
   always `catalogus.yaml`.
2. **Slug taxonomy** — Catalogus's own namespace, with an explicit mapping table from the slugs
   stack-analyser emits. Adopting specfy's slugs wholesale would couple the catalog to their release
   cycle.
3. **Acyclicity enforcement** — CLI `validate` and the application layer. No database trigger.
4. **One service, multiple roles** — two entries with distinct local ids (`supabase-db`,
   `supabase-auth`).
5. **Monorepo handling inside a scanned project** — out of scope for v1.
6. **Where the private-data guard lives** — `@catalogus/schema`, not the CLI. Phase 5 push and Phase 6
   MCP both need the identical boundary, and a guard implemented in the CLI is bypassed by every other
   consumer. Exactly one copy of the patterns exists in the repo; two copies is how one of them stops
   catching things.
7. **Two-tier guard rather than one** — a heuristic that cries wolf gets switched off, and a guard the
   user has disabled is worth less than no guard. Hard tier is high precision only; soft tier warns and
   leaves exit 0 unless `--strict`.
8. **`packages/schema/schema/catalogus.v1.json` stays committed, not gitignored** — asked because
   `pnpm build` regenerates it and it looked like a build artifact. It is a *published* one, which is
   a different thing: `packages/schema/package.json`'s `files` ships `schema/`, and every manifest the
   CLI writes carries `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json`, so an
   editor fetches it over HTTP. `dist/` is ignorable precisely because nothing external fetches it by
   URL.

   **The decisive argument is what ignoring it would do to `schema-sync.test.ts`.** That test exists
   to catch a `schema.ts` edit that was never followed by `pnpm build`, and it works only because a
   *committed* copy is capable of being stale. With no committed copy it would compare a file the
   build just wrote against the source that build read — a tautology, permanently green. Ignoring the
   file would convert a real tripwire into a no-op, which is the failure shape this document already
   records three times over.
9. **Line endings are LF everywhere, pinned by `.gitattributes` (`* text=auto eol=lf`)** — the fix for
   what prompted decision 8. The generator writes LF unconditionally while `core.autocrlf=true`
   (Windows default) wants CRLF, so *every build* left that file reported as modified while being
   byte-identical to `HEAD` — confirmed by hashing both sides to the same object id. **A file that is
   permanently dirty and never actually changed is a file people learn to skip in `git status`**,
   which is how a real change to it eventually gets committed unnoticed.

   No renormalization commit was needed: zero committed blobs in this repo contain a CR, so the index
   was already LF and `git add --renormalize` is a content no-op. One `git update-index
   --really-refresh` was needed once to clear the stale stat cache; a fresh clone will not need it.
10. **No raw control characters in source.** Found while doing the above: `packages/cli/src/toposort.ts`
    held two literal NUL bytes as composite-map-key separators (`` `${from}\0${to}` ``), which made git
    classify the whole file as binary — **every change to it showed as "Binary files differ" with no
    reviewable diff.** In a repo whose review step is an agent reading a diff (see CLAUDE.md), that was
    the one file nobody could review, and nothing would ever have reported it. NUL is still the right
    separator (the schema's slug pattern cannot produce one); it is spelled `\u0000` now. Behaviour
    unchanged — `toposort.test.ts`'s 7 tests and the full suite pass — and the file is plain ASCII again.

11. **The skill hands `catalogus view` to the user and never runs it** — owner-confirmed
    2026-08-24. The gap was found while building the shell-command drift check, and the obvious fix
    was the wrong one.

    `runView` returns exit 0 as soon as the socket is listening, but the listening socket holds the
    event loop open, so the process runs until Ctrl+C — which is what its own `press Ctrl+C to stop`
    line says. Every other fenced command in `SKILL.md` is one the agent runs itself, so a fenced
    `catalogus view` would teach an agent to **block its own tool call**, with everything after it in
    the agent's plan silently not happening.

    So the viewer is documented in prose only, in a new `### 8. Hand the viewer to the user`
    section, plus a Common-mistakes bullet. That turned an accidental convention into a stated one:
    **fenced means the agent runs it, prose means it is for the user.** `catalogus graph` stays the
    agent's own check — it prints and exits.

    **A test enforces it**, because nothing else would. The four existing per-line checks all *pass*
    on `catalogus view --no-open`: it is a registered command, those are real options, and it needs
    no positional. It is a correct command line and still the wrong thing to teach — exactly the
    decision that gets undone by the next person who notices the viewer is missing from the skill
    and helpfully adds it. Mutation-checked: adding a fenced `catalogus view` to `SKILL.md` fails
    with a message naming the fix.

12. **The viewer's graph view is decommissioned; deferred, not rejected** — owner, 2026-09-05:
    *"It's not yet the way I'd like to read it, it's confusing. Let's finish the basic first,
    someday we can come back to that graph. Decommission all of that."* The viewer has two views,
    List and Migrations. `GraphCanvas`, `graph-layout.ts`, `elk-layout.ts`, `@xyflow/react` and
    `elkjs` are gone from `apps/web`; git history keeps them. `catalogus graph`, the CLI command,
    is not the graph view and stays. The three graph items left open on 2026-08-26 and the
    "do the graph's nodes join Monochrome" question closed with it. Reopen only when the owner
    asks for a graph they can read — and start from the reading, not from the old code.

13. **The signal red is `#d40010`** — owner, 2026-09-05: *"Keep the #d40010, that's the red we
    should use."* Closes the `#E60012`-versus-`#d40010` question for good; the 2026-08-26 ruling
    on contrast (4.89:1 on the cream ground against 4.26:1) was the same answer with a
    measurement, and this is the owner saying it in words. The token, the contract and the
    tripwire in `direction-contract.test.ts` all name `#d40010`.

14. **The MCP server is the first-class surface for agents; the CLI is for people, CI and the
    machine that holds the credential** — owner, 2026-09-06: *"let's make the MCP the first
    class for agents. When Catalogus gonna run in the web, the MCP gonna call the web service,
    not a local workload, so then, for agents Catalogus MCP won't need any local installation,
    only the skill, and an account in Catalogus."*

    What this settles, and what it amends:

    - **HANDOFF §6's "propose, never write" becomes "propose, then apply".** The single-writer
      rule was always about the code path (`manifest-edit.ts`: validate before write, comments
      survive, private data refused), not about the binary. An MCP tool that calls the same
      command functions is that same writer over a different transport. So the server grows
      `apply_manifest_edit` (same `edits` schema as the proposal, writes for real, refuses when the
      manifest changed since the proposal it was given), plus `init_manifest`, `validate_manifest`,
      `render_graph` and `list_icons`, so an agent never needs a shell. `view` and `login` stay
      CLI-only: a server cannot hand a person a browser or a keychain.
    - **The skill is rewritten MCP-first.** When the `catalogus` tools are connected the agent
      uses them, proposes before it applies, and shows the diff; the fenced CLI commands stay as
      the fallback for an agent that has the skill and no server. The observed 2026-09-06 session
      that ran everything through Bash with the tools loaded but unused is the defect this fixes:
      the skill never told the agent to prefer a tool.
    - **The end state is a hosted server.** When the platform exists (Phase 4 onwards), the same
      tools are served over HTTP by the web service, authenticated by a Catalogus account; the
      client installs the skill and nothing else. The stdio server built today is the local
      edition of the same tool contract and stays for offline use and for CI. **Constraint
      recorded, not solved:** `detect_stack` reads a filesystem. A hosted server has no local
      checkout, so the hosted edition needs repo access through the VCS provider (a GitHub App
      or equivalent) or a local-scan upload; that belongs to Phase 7's design, and the tool
      contract should not assume a local path forever — `path` is already optional.
    - **Publishing to npm stays on the launch checklist** (parallel track) for the local edition
      and for CI; it stops being the way an agent gets Catalogus.

## Non-goals

From HANDOFF §8. Worth restating because each is a plausible-sounding scope creep.

- Storing secrets or credentials. Ever. Layer 3 holds *references* to an identity, never the
  credential itself.
- Uptime monitoring — other tools do this; integrate later at most.
- Package-level dependency management — that is Renovate's job.
