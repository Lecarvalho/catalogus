# Brief: brand icons from thesvg.org for the marks simple-icons no longer carries

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first:
"ask, never guess" and "no secrets" are hard rules; the comment register of neighbouring files is
the register you write in. Read the header comments of `packages/core/src/icons.ts`,
`packages/core/src/catalog.ts` (the ICON_OVERLAY section) and `apps/web/src/components/Icon.tsx`
before writing anything: they record why icon resolution is server-side, why the board is
monochrome, and why the fallback glyph is never tinted. None of that changes.

## Why

The owner ran `catalogus view` on a real 36-service inventory (docs/PLAN.md, "The owner's first
run against a real inventory — 2026-09-03", finding 2). Six brands rendered as the initials
fallback: AWS, C#, OpenAI, Slack, Loki, Vertex AI. `simple-icons@16.28` carries none of the first
four (trademark removals) nor Loki, and Vertex AI has no row. The owner's answer: source those
marks from https://thesvg.org/ — check the licence per icon before bundling any, record the
licence beside each, and route the six named brands through it first. Hand-drawn brand-shaped
marks stay forbidden (`apps/web/src/fallback-icons.tsx`).

## What the orchestrator already verified (2026-09-03), so you do not re-derive it

- thesvg.org is a static site backed by https://github.com/glincker/thesvg at commit
  `9e7c56e6602bba6f71b32b045fd6133f9e9b40d4` (main, 2026-09-03). Codebase licence: MIT
  (`LICENSE`, "Copyright (c) 2025 thesvg.org"). Brand icons: `LEGAL.md` says every icon carries
  a per-icon `license` field and that the icons are provided "for identification and development
  purposes only, consistent with nominative fair use of trademarks" — the same basis simple-icons
  already ships under in this tree. `TRADEMARK.md` asks for accurate, unmodified official marks.
- Raw files: `https://thesvg.org/icons/<slug>/<variant>.svg` (also
  `https://cdn.jsdelivr.net/gh/glincker/thesvg@<sha>/public/icons/<slug>/<variant>.svg`, which
  pins the commit — fetch from the pinned URL). Source-of-truth manifest with the `license` field:
  `https://cdn.jsdelivr.net/gh/glincker/thesvg@<sha>/src/data/icons.json` (an object keyed by
  slug; 2.9 MB — read it once, do not vendor it).
- The five icons to vendor, with the manifest's own `license` value and hex, and what the file
  looks like (measured by the orchestrator; verify on fetch and stop if it differs):

  | catalog row(s) | thesvg slug / variant | license | hex | file |
  |---|---|---|---|---|
  | every `aws-*` row in `mapping.ts` (aws-lambda, aws-cognito, aws-cloudfront, aws-sqs, …) | `aws/default` | MIT | 222F3E | 2 paths, `fill="#F90"` + `fill="currentColor"`, viewBox 0 0 24 24 |
  | `csharp` | `csharp/default` | MIT | 000000 | 5 paths, fills #a179dc #280068 #390091 and **#fff knockouts** (the letters), viewBox `0 -1.43 255.58 290.11` |
  | `openai`, and `codex` if the catalog comment there still says "no icon" | `openai/default` | MIT | 000000 | 1 path, `fill="#fff"` — white on transparent, i.e. the file is drawn for a dark ground; `openai/light` is the same path with no fill attribute |
  | `slack` | `slack/default` | MIT | 000000 | 4 paths, four brand colours, no knockouts, viewBox `0 0 2447.6 2452.5` |
  | `google-vertex-ai` | `vertexai-google/default` | MIT | 4285F4 | 8 paths, three blues, no knockouts (a `mono` variant exists, all currentColor) |

  **Loki is not on thesvg.org** (only `grafana`, CC0). Loki keeps the fallback; say so in the
  catalog row comment, dated, the same way the row already records simple-icons' absence.
- The `MIT` label is thesvg's label on a trademarked mark, not a licence granted by Amazon,
  Microsoft, OpenAI, Slack or Google. Record it as "thesvg.org manifest `license: MIT`; the
  mark itself is the owner's trademark, used for identification (thesvg `LEGAL.md`)" — never as
  "licensed MIT by <brand>". That distinction is the whole reason the licence record exists.

## Part A — `@catalogus/core` and `@catalogus/cli` (one agent)

### Files you own
- new: `packages/core/icons/thesvg/*.svg` (five files), `packages/core/icons/thesvg/LICENSES.md`,
  `packages/core/icons/thesvg/LICENSE-thesvg.txt` (verbatim copy of the MIT text — attribution is
  the one condition MIT carries)
- `packages/core/src/icons.ts`, `packages/core/src/icons.test.ts`
- `packages/core/src/catalog.ts`, `packages/core/src/catalog.test.ts`
- `packages/core/src/index.ts` if an export changes
- `packages/cli/src/view-payload.ts`, `packages/cli/src/view-payload.test.ts`
- `packages/core/package.json` only if `files` needs `icons` (it is a private workspace package;
  check whether anything actually packs it before touching it)

Do not touch `apps/web` — Part B owns it and starts after you report.

### Build
1. **Vendor the five files unmodified** from the pinned jsDelivr URL. Keep them byte-for-byte as
   fetched (TRADEMARK.md asks for unmodified marks; every transformation below happens at read
   time). `LICENSES.md` records, per file: catalog row(s), thesvg slug and variant, the source URL
   with the commit sha, the manifest `license` value, the manifest hex, the date fetched, and the
   file's sha256. Add a test that recomputes each sha256 and compares it to `LICENSES.md`, so a
   file cannot be edited without the record moving with it.
2. **Icon refs gain a second source.** `CatalogEntry.icon` stays one string. A simple-icons ref
   is unchanged (`nginx`); a thesvg ref is prefixed: `thesvg:aws`. `SAFE_ICON_REF` stays the
   floor for the slug half. Add the six rows (the `aws-*` set plus the five named) to the overlay
   in whatever shape reads best beside ICON_OVERLAY — one table with prefixed values, or a second
   table; the existing catalog test that asserts every ICON_OVERLAY value resolves against the
   installed simple-icons data must keep doing exactly that for simple-icons refs and assert
   vendored-file existence for thesvg refs. Update the `openai`/`codex` and `loki` row comments
   in `catalog.ts`; they currently say "no icon", dated, and one of them is now wrong.
3. **`resolveIcon` returns one shape for both sources**, and the shape carries markup rather
   than a bare `d`:
   ```ts
   interface ResolvedIcon {
     /** the SVG's own viewBox, verbatim */
     viewBox: string;
     /** inner SVG markup: <path>/<g>/<circle>… elements only, no <svg> wrapper */
     body: string;
     /**
      * The brand colour a single-ink mark is painted with when colour is asked for.
      * null for a multi-colour mark, whose colour form is its own fills.
      */
     hex: string | null;
   }
   ```
   - simple-icons: `body` is `<path d="…" fill="currentColor"/>`, `viewBox` is `0 0 24 24`,
     `hex` is the simple-icons hex as today. The existing `resolveIconPath` may stay for its
     callers and tests, or go if nothing else uses it — check.
   - thesvg: read the vendored file; drop the XML declaration, comments, `<title>`, `<desc>`;
     refuse (return null, never throw) a file containing `<script`, `<foreignObject`, `on*=`
     attributes, `href`/`xlink:href`, or `<style>` — the five files contain none, and the test
     must prove the refusal on a synthetic file. Then apply the per-icon **fill policy**, recorded
     in a small typed table in `icons.ts` (or beside the vendored files), not inferred from the
     file:
     - `ink` (openai): every `fill` attribute becomes `currentColor`; `hex` is the manifest hex.
       The board's monochrome rule and the popover's colour rule then behave exactly as they do
       for a simple-icons mark.
     - `brand` (aws, slack, vertexai): fills are kept verbatim; `hex` is null. A `currentColor`
       fill (aws's text) stays `currentColor`.
     - `brand` with `knockout: ["#fff"]` (csharp): fills kept; every path whose fill is in the
       knockout list gets `data-knockout=""` and its fill attribute removed. The viewer paints
       knockouts with the page ground. Match colours case-insensitively and accept both 3- and
       6-digit forms; the test writes both spellings.
   - The regex in `extractPathData` is not a parser and the thesvg files are not one-path files.
     Use a real approach for the body: the five files are `<svg …>inner</svg>` with no nesting of
     `<svg>`, so taking the inner markup between the root's opening and closing tag is sound —
     say so where you do it, and reject a file with a second `<svg` in a test.
   - Never throws; every failure degrades to null, same contract as today.
4. **`ViewService.icon` becomes `ResolvedIcon | null`** and `iconHex` is removed (its doc comment
   moves onto `hex`). Update `view-payload.test.ts`. The payload must still carry nothing but
   plain data — no functions, no class instances.
5. Tests, in the register of `icons.test.ts`: each of the five resolves and its `viewBox`/fill
   outcome matches the table above (assert the csharp knockout count and that no `fill="#fff"`
   survives; assert openai has zero literal fills left; assert slack keeps all four); the sha256
   drift test; the sanitiser refusals; `thesvg:` with a bad slug, a traversal-shaped slug, and a
   missing file all return null.

### Verify
`pnpm build && pnpm test` in that order, then `pnpm typecheck`. Baseline before you start:
**1375 tests / 77 files**, all green, typecheck clean. `apps/web` will fail to typecheck and its
tests will fail once `iconHex` is gone — that is expected and is Part B's job; report the exact
web failure count so Part B knows its starting line. Report core and cli numbers separately.
Run the suite twice before believing it.

### Report
Files changed; the five sha256s; per-icon test outcomes; core/cli test counts and the web failure
count; anything in the fetched files that differed from the table above (stop and report rather
than adapting silently); anything you had to assume.

## Part B — `apps/web` (one agent, after Part A lands)

### Files you own
`apps/web/src/components/Icon.tsx`, `Icon.module.css`, `Icon.test.tsx`; the five call sites
(`ServiceTile.tsx`, `ServicePopover.tsx`, `ServicePage.tsx`, `ServiceNode.tsx`,
`MigrationList.tsx`) and their tests; `apps/web/src/bands.ts` and `bands.test.ts` (the
`VendorGroup` carries `icon`/`iconHex`); `apps/web/src/test-support/fixtures.ts`. Nothing else.

### Build
1. `Icon` takes `icon: ResolvedIcon | null` (import the type from `@catalogus/cli`'s payload
   types the way the call sites already import `ViewService`) instead of `iconPath`/`iconHex`.
   Render `<svg viewBox={icon.viewBox} role="img" aria-label={label}
   dangerouslySetInnerHTML={{ __html: icon.body }} />`. Write, at the call, why this is safe:
   the body is produced server-side by `@catalogus/core` from either the installed simple-icons
   package or a vendored file with a recorded sha256, and the sanitiser's refusals are tested
   there; the payload never carries manifest-authored markup. Keep the `colour` prop and its doc
   comment.
2. Colour rule, in `Icon.module.css`, not in JS where you can avoid it:
   - monochrome (the default): every element with a `fill` inside the svg is painted
     `currentColor` — a CSS rule beats a presentation attribute, so
     `.icon svg [fill] { fill: currentColor }` is enough; write that fact down beside the rule.
   - `colour`: the rule above does not apply; a single-ink mark (`hex !== null`) gets
     `color: <hex>` on the svg (inline style, the one JS-side value); a multi-colour mark keeps
     its own fills.
   - knockouts: `[data-knockout] { fill: var(--color-bg) }` in both modes — the C# letters read
     as the ground, which on cream is what a knockout is. Say why it is the ground and not white.
   - The fallback glyph is untouched and still never coloured.
3. `bands.ts`'s `VendorGroup` carries `icon` only. Fixtures gain one thesvg-shaped icon (a
   two-path body with a knockout) so the mono/colour/knockout rules each have a test, alongside
   the simple-icons-shaped one.
4. `signal-red.test.ts` scans every stylesheet under `apps/web/src`; nothing you add may be red.
   `direction-contract.test.ts` and `token-references.test.ts` are guards you must leave green,
   not edit.

### Verify
`pnpm build && pnpm test` in order, then `pnpm typecheck`. Starting line: Part A's report gives
the web failure count; the end state is all four packages green and typecheck clean. Run twice.

### Report
Files changed; test counts per package; the exact CSS rules that implement the three modes; what
you assumed.

## Validation (a third agent, strongest model, after B — reports, does not fix)

Drive the built app, not the source. Write a scratch `catalogus.yaml` naming `aws-lambda`,
`csharp`, `openai`, `slack`, `loki`, `google-vertex-ai` plus two rows that still resolve via
simple-icons (`nginx`, `supabase`) and one unknown slug, serve it with the built CLI's `view`
command, and in a real browser at 1280×720: on the board every one of the five vendored marks is
monochrome ink on cream and visible (measure: no path painted `#fff`, none painted its brand
colour); in the popover and on the service page aws shows its orange smile, slack its four
colours, vertexai its blues, csharp purple with ground-coloured letters, openai ink-black; Loki
and the unknown slug show the fallback, untinted. Also: contrast of every vendored mark on cream
in mono (the owner asked for this re-check *after* dark left, and nobody has seen it yet).
Sanitiser: hand a synthetic `<script>`-bearing file to `resolveIcon` through the test harness
and confirm null. Drift: change one byte of a vendored file, confirm the sha test fails, revert.
Report exit codes, counts, and measurements, not impressions.
