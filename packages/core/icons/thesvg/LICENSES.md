# Vendored icons: thesvg.org

Five brand marks `simple-icons@16.28.0` no longer carries (four removed under trademark pressure,
one it never had), sourced from https://thesvg.org/, backed by
https://github.com/glincker/thesvg pinned at commit `9e7c56e6602bba6f71b32b045fd6133f9e9b40d4`
(main, 2026-09-03). Every file below is vendored byte-for-byte from that commit's jsDelivr mirror
-- no transformation of any kind happens to the file on disk; every transformation (fill policy,
knockout handling) happens at read time in `../../src/icons.ts`, so this record and the bytes it
describes never drift apart from what a diff would show.

`icons.test.ts` recomputes each file's sha256 and asserts it against the value recorded here, so a
file cannot be edited without this record moving with it in the same commit.

## The `MIT` label is thesvg's, not the brand's

Every row below says `license: MIT`. That is thesvg.org's own manifest field
(`src/data/icons.json`), describing the licence thesvg.org grants over its redrawn/collected SVG
file -- it is **not** a licence granted by Amazon, Microsoft, OpenAI, Slack or Google over their
own trademark. Each mark stays that company's trademark; thesvg's `LEGAL.md` states the marks are
provided "for identification and development purposes only, consistent with nominative fair use
of trademarks" -- the same basis `simple-icons` already ships under elsewhere in this tree.
Nothing below should ever be read or repeated as "licensed MIT by Amazon" (or Microsoft, OpenAI,
Slack, Google) -- the licence is thesvg's redistribution terms for the file, the mark itself is
used under nominative fair use.

## Records

### `aws.svg`

- Catalog rows: `aws-lambda`, `aws-ec2`, `aws-cognito`, `aws-cloudfront`, `aws-s3`, `aws-sqs`
  (every `aws-*` row in `packages/core/src/mapping.ts`)
- thesvg slug / variant: `aws` / `default`
- Source: https://cdn.jsdelivr.net/gh/glincker/thesvg@9e7c56e6602bba6f71b32b045fd6133f9e9b40d4/public/icons/aws/default.svg
  (the manifest's own `variants.default` for this slug points at `color.svg`; fetched and diffed
  byte-for-byte identical to `/icons/aws/color.svg` at the same commit, so `default.svg` is a
  faithful copy of the canonical file, not a divergent alias)
- Manifest `license`: `MIT`
- Manifest `hex`: `222F3E`
- Fetched: 2026-09-03
- sha256: `65e2ca39ef0669dbb0323bc5ab69f981b8087d8ebb3e4a3bce1d3b32b3b67151`

### `csharp.svg`

- Catalog row: `csharp`
- thesvg slug / variant: `csharp` / `default`
- Source: https://cdn.jsdelivr.net/gh/glincker/thesvg@9e7c56e6602bba6f71b32b045fd6133f9e9b40d4/public/icons/csharp/default.svg
- Manifest `license`: `MIT`
- Manifest `hex`: `000000`
- Fetched: 2026-09-03
- sha256: `637b695492be05f7d0ec6977de4aa9b46133df52315be214c34572d176c8a1e3`

### `openai.svg`

- Catalog row: `openai` (`codex` has its own file below -- an OpenAI product, but not the
  OpenAI mark)
- thesvg slug / variant: `openai` / `default`
- Source: https://cdn.jsdelivr.net/gh/glincker/thesvg@9e7c56e6602bba6f71b32b045fd6133f9e9b40d4/public/icons/openai/default.svg
- Manifest `license`: `MIT`
- Manifest `hex`: `000000`
- Fetched: 2026-09-03
- sha256: `db81a8225166f02f773304ba4d8f0141343da5f43870d8b41f10bf6bc59840c8`

### `slack.svg`

- Catalog row: `slack`
- thesvg slug / variant: `slack` / `default`
- Source: https://cdn.jsdelivr.net/gh/glincker/thesvg@9e7c56e6602bba6f71b32b045fd6133f9e9b40d4/public/icons/slack/default.svg
- Manifest `license`: `MIT`
- Manifest `hex`: `000000`
- Fetched: 2026-09-03
- sha256: `29734796b3a85f9d0e03150d53142fab0b7f994ae80c7e3e1efd0bef52c12f5d`

### `googlevertexai.svg`

- Catalog row: `google-vertex-ai`
- thesvg slug / variant: `vertexai-google` / `default`
- Source: https://cdn.jsdelivr.net/gh/glincker/thesvg@9e7c56e6602bba6f71b32b045fd6133f9e9b40d4/public/icons/vertexai-google/default.svg
  (same alias note as `aws.svg`: the manifest's `variants.default` points at `color.svg`; fetched
  and diffed byte-for-byte identical to `/icons/vertexai-google/color.svg` at the same commit)
- Manifest `license`: `MIT`
- Manifest `hex`: `4285F4`
- Fetched: 2026-09-03
- sha256: `36a5bbdaffe24fa703ad938716f81c45e78042faaf3ae8a45009e2710aaa3548`

### `codex.svg`

- Catalog row: `codex`
- thesvg slug / variant: `codex-openai` / `default` (the manifest's `variants.default` points at
  `color.svg`; `default.svg`, `color.svg` and `mono.svg` are byte-identical at this commit --
  one currentColor path)
- Source: https://cdn.jsdelivr.net/gh/glincker/thesvg@9e7c56e6602bba6f71b32b045fd6133f9e9b40d4/public/icons/codex-openai/default.svg
- Manifest `license`: `MIT`
- Manifest `hex`: `fff` (white -- the file is drawn for a dark ground; not used as a brand colour)
- Fetched: 2026-09-03
- sha256: `5f424b10216e17cd79c5f852138969453e031066e68a8d9c661e74534276ed9c`

### `xai.svg`

- Catalog row: `xai`
- thesvg slug / variant: `xai` / `default` (the manifest's `variants.default` points at
  `mono.svg`; `default.svg` and `mono.svg` are byte-identical at this commit -- one currentColor
  path)
- Source: https://cdn.jsdelivr.net/gh/glincker/thesvg@9e7c56e6602bba6f71b32b045fd6133f9e9b40d4/public/icons/xai/default.svg
- Manifest `license`: `MIT`
- Manifest `hex`: `fff` (white -- as for codex, not a brand colour)
- Fetched: 2026-09-03
- sha256: `823bbbf2c6781192aa849f69dbaf57c8caffa21d39e79992c473dacaad2b09f5`

## Loki and Healthchecks.io: not vendored

Neither has any entry in thesvg's manifest (checked directly against `src/data/icons.json` at
the pinned commit -- no row whose slug, title or aliases mention either). Both keep the viewer's
fallback glyph; see the dated comment on Loki's row in `catalog.ts`. Filling those two needs an
owner-supplied icon, which is an open design item in docs/PLAN.md.

## `LICENSE-thesvg.txt`

Verbatim copy of thesvg.org's own repository licence (`LICENSE` at the pinned commit) -- the MIT
licence covering the thesvg.org codebase and its redistribution of these files. Attribution is the
one condition MIT carries, so it is vendored alongside the icons it covers rather than only
referenced.
