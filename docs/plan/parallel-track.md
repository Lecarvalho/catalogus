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

---

