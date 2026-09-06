# Parallel track — names, trademark, schema URL

> Split out of `docs/PLAN.md` on 2026-09-05, content verbatim. `docs/PLAN.md` is the index and the
> only place status is summarised; this file is the record. Section headings are unchanged so a
> code comment that names one still finds it by grep.

## Parallel track — not code, but time-sensitive ⬜

Names get taken. None of this blocks development, and all of it blocks launch.

- [x] Domains — **`catalogus.dev` registered 2026-08-24 and owned.** It is load-bearing: the schema
      `$id` and the modeline the CLI writes both point at it. `catalogus.io` was *not* acquired —
      the $20 aftermarket figure was a minimum-offer threshold, not a price, and a $20 offer via
      Sedo drew a $7,500 counter, which was declined. `catalogus.com` was $12,000 and was declined
      too. There is no homophone spelling to redirect, and nothing here is still pending.
- [x] npm package name — `catalogus` cannot be reserved: verified against the registry on
      2026-08-24, it is an npm-owned security holding package (maintainer `npm`, repo
      `npm/security-holder`, version `0.0.1-security`). The CLI ships scoped as `@catalogus/cli`;
      the binary it installs is still `catalogus`.
- [ ] Reserve the GitHub org `catalogus` — the repo currently lives at `github.com/Lecarvalho/catalogus`;
      moving it to an org later is a redirect, not a break, so this is not urgent
- [ ] CIPO/USPTO knock-out search, Nice Class 9 + 42
- [ ] Publish the JSON Schema at `https://catalogus.dev/schema/v1.json` — the `$schema` modeline the
      CLI writes points there, so until it resolves, editor autocomplete does not work
- [ ] **Publish `@catalogus/schema`, `@catalogus/core` and `@catalogus/cli` to npm** — decided
      2026-09-06 when the owner ruled that a client installs the MCP server without the source:
      "they should be able to install the MCP without the code source." The README documents the
      npm channel (`npx -y @catalogus/cli mcp`) as the procedure, marked not yet published. What the
      publish needs, in order, none of it done:
      1. Claim the npm org `catalogus` (the scope; `@catalogus/cli` returned 404 on 2026-09-06, so it
         is free). The unscoped name is npm's security holder and stays out of reach.
      2. Drop `"private": true` from the three packages; pin `workspace:*` through
         `pnpm publish`, which rewrites them to the published versions, so publish schema, then
         core, then cli.
      3. `packages/cli`'s `files: ["dist"]` ships `dist/web` only when the root build ran first —
         `tsup.config.ts`'s own comment records the gap. A `prepublishOnly` that runs the root
         build, or a publish script at the root, closes it.
      4. The `link:cli` shims and the skill's copy-the-file install give way to
         `pnpm add --global @catalogus/cli` and a `catalogus` subcommand
         (`phase-3.6-dogfooding.md` already lists both as due on publish).
      5. Verify from a machine without the clone: `npx -y @catalogus/cli mcp .` answers
         `tools/list`, on Windows through `cmd /c` (the README's Windows entry is written from
         documented Claude Code behaviour, not yet exercised).
      Rejected alternatives, so they are not re-proposed: a single-file bundle on GitHub Releases
      (probed 2026-09-06: `noExternal` bundling fails on `@cdktf/hcl2json`'s wasm bridge inside
      stack-analyser's tree; fixable, but a build project of its own) and a Docker image (needs
      Docker on every client).

---

