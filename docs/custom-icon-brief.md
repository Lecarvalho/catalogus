# Brief: owner-supplied icons — a service entry names its own SVG

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first:
"ask, never guess" and "no secrets" are hard rules; the comment register of neighbouring files is
the register you write in. Read the header comments of `packages/core/src/icons.ts`,
`packages/core/src/catalog.ts` (the ICON_OVERLAY and THESVG_ICON_OVERLAY sections) and
`packages/cli/src/commands/set.ts` before writing anything. `docs/icons-brief.md` is the previous
slice's brief and is the closest precedent for how this repo vendors an SVG and why every
transformation happens at read time.

## Why

Loki and Healthchecks.io render as the initials fallback on the owner's real inventory, and no
source this repo can check will ever fill them: simple-icons@16.28 has neither, thesvg.org has
neither (docs/PLAN.md, 2026-09-03 handoff, item 3). The owner's answer on 2026-09-04: *let the user
point at an icon on the web*, and *do not couple to thesvg* — no thesvg registry search, no
`thesvg:` refs in the manifest.

The mechanism the owner confirmed (2026-09-04, offered as the recommendation and picked): **the CLI
fetches once and vendors locally.** `catalogus set services.<id>.icon <https-url>` fetches the SVG
one time, refuses it if the sanitiser refuses it, saves the bytes under
`.catalogus/icons/<id>.svg` beside the manifest, and writes that repo-relative path into the
entry. A local path is accepted the same way (the bytes come from a file instead of a response).
The viewer stays offline: it reads a file the CLI already vendored, exactly as it reads a thesvg
file today. **The one variant to refuse is a URL in the manifest that the viewer fetches at
runtime** — a public manifest naming a remote the browser pulls SVG from, and a viewer with a
network. The schema must make that variant unrepresentable, not merely undocumented.

## The contract, fixed here so two agents can build against it

- **Schema.** `serviceEntry` gains an optional `icon` property, `type: string`, with a pattern that
  accepts only `.catalogus/icons/<name>.svg` where `<name>` is `[a-z0-9][a-z0-9_.-]*` and contains
  no `..` — one directory, relative to the manifest's own directory, no leading `./`, never
  absolute, never a URL. Description says all of that, says the CLI writes it
  (`catalogus set services.<id>.icon ...`), and says the viewer reads the file and never the
  network. The private-key pattern already refuses `key`, `token` etc. as *keys*; `icon` is not
  private-looking and needs no exemption.
- **Core.** `packages/core/src/icons.ts` exports one new function:

  ```ts
  export async function resolveLocalIcon(absolutePath: string): Promise<ResolvedIcon | null>;
  ```

  Reads the file, runs it through the **same sanitiser** the vendored thesvg files go through
  (`parseThesvgMarkup` today — rename it to something source-neutral if you like, keeping its
  test coverage; its refusals are the contract: `<script`, `<foreignObject`, `on*=`, `href`,
  `<style>`, nested `<svg`, missing viewBox), applies the `brand` fill policy with no knockout
  list, returns `hex: null`. Never throws: a missing file, unreadable file or refused markup all
  return null. **Why `brand` and no knockout, and why null hex:** the CLI has no way to know a
  user-supplied mark's ink or which of its fills are letters cut out of a ground; treating the
  file as it is drawn is the one policy that requires no guess. A per-icon policy the user could
  set is a possible later field and is out of scope here — say so in the function's comment.
  `resolveIcon` itself is unchanged: it still takes a catalog ref and knows nothing about paths.
  Also export a size cap constant, `MAX_ICON_BYTES = 256 * 1024`, so the CLI and the resolver
  refuse the same thing (a resolver reading a 40 MB file the CLI would never have written is
  still refused, cheaply, by a stat before the read).
- **CLI, `set`.** `SERVICE_FIELD` widens to `role|kind|version|icon`. The value is either an
  `https://` URL or a path. Anything else (`http://`, `ftp:`, a bare slug, a `thesvg:` ref) is a
  usage error, exit 2, whose message names the two accepted shapes. Both shapes end in the same
  place: bytes → `MAX_ICON_BYTES` check → sanitiser (via the core function above, run against the
  bytes *before* they are written — write to a temp file under `.catalogus/icons/`, resolve it,
  rename on success, unlink on refusal) → `.catalogus/icons/<id>.svg` written byte-for-byte as
  fetched → the manifest's `icon` field set to `.catalogus/icons/<id>.svg`. The directory is
  created on demand. A path that already *is* that exact file is not copied over itself. An
  existing file at the destination is replaced (that is what re-running `set` means for every
  other field). The URL is recorded as a YAML comment on the `icon` node — **without its query
  string or fragment**, because a signed URL's query is a credential and this file is public —
  plus the fetch date; `prepareValue`'s private-free-text guard already runs on the raw value
  first, keep it that way. Fetch with `globalThis.fetch`, a 15 s `AbortSignal.timeout`, follow
  redirects but refuse a redirect off `https:`, refuse any response that is not 200, and refuse
  a body over the cap by reading the stream and counting rather than trusting `content-length`.
  Do not gate on `content-type`: the sanitiser is the gate and hosts mislabel SVG constantly. The
  fetcher is injected (a `fetch`-shaped parameter with `globalThis.fetch` as the default) so the
  tests never open a socket; one test may still stand up a local `node:http` server the way
  `view.test.ts` does if it needs to prove redirect handling for real.
- **CLI, `view`.** `buildViewPayload` gains the manifest's directory (derive it from the
  `manifestPath` it already receives; do not add a fourth parameter). `buildViewService` resolves
  the entry's own `icon` first via `resolveLocalIcon(join(manifestDir, entry.icon))` and falls
  back to the catalog's icon when that returns null. Before the join, assert the resolved absolute
  path is inside `<manifestDir>/.catalogus/icons/` — the schema already guarantees it, and this is
  the same defensive floor `SAFE_ICON_REF` is: a floor, not the mechanism. When an entry names an
  icon and the file resolves to null, `catalogus view` prints one stderr line per such entry
  naming the path and the fix (`catalogus set services.<id>.icon <https-url|path>` again), and
  serves the fallback. `catalogus validate` does **not** check that the file exists: a manifest
  whose icon file is missing is a valid manifest with a stale pointer, and the viewer degrades
  rather than the validator failing a commit hook over an asset.
- **CLI, `icons`.** A new read-only command, `catalogus icons [path]`, exit 0, one line per
  service entry in manifest order, columns separated by two or more spaces so an agent can read
  it by eye or by regex: `<id>  <service>  <source>  <detail>`, where `<source>` is one of
  `local`, `simple-icons`, `thesvg`, `none`, and `<detail>` is the local path for `local`
  (suffixed ` (missing file)` when the pointer is stale), empty for the two catalog sources, and
  the fix line `catalogus set services.<id>.icon <https-url|path>` for `none`. A trailing summary
  line: `<n> of <total> services have no icon.` (singular forms at one, the way the viewer's
  footer does it). The resolution is the same one `view` uses — entry `icon` first, then the
  catalog — so the two commands can never disagree about which tiles will show initials. `add`
  prints one extra stdout line when the entry it just added resolves to no icon:
  `<id> has no icon yet -- catalogus icons lists every service without one.`
- **Skill.** `skills/catalogus/SKILL.md`: the manifest-format section shows `icon:` with its
  meaning; the command list gains `catalogus icons` and the `set services.<id>.icon` shape; and
  the procedure gains a step, after the manifest is recorded and validated (between today's 7 and
  8, or as 7b — match the numbering style): run `catalogus icons`; for each `none` row, **search
  the web for the brand's official mark as an SVG** (the vendor's own site, press kit or brand
  page first; then a public icon set), and set it with `catalogus set services.<id>.icon <url>`;
  when nothing turns up, ask the user for a URL or file instead of inventing or approximating
  one. The step ends by listing, in the agent's summary to the user, every icon it set and the
  URL each came from, so a wrong pick is one `set` away from corrected. **This is the owner's
  procedure, decided 2026-09-04** ("the agent needs to go fetch on the web; when they don't
  find, they can ask the user"), and it is the one place the skill lets the agent act on a
  web search rather than ask first — say so in the skill text in one sentence, and say what the
  sanitiser will refuse so the agent does not loop on a file that cannot land. The drift tests
  (`packages/schema/src/skill-drift.test.ts`, `packages/cli/src/skill-commands-drift.test.ts`)
  must stay green, which is the point of editing the skill in the same commit; the command-drift
  test may need to learn the new command's line shape.

## Non-goals, already declined

- No `thesvg:` refs in the manifest, no `catalogus icon --search`, no thesvg registry — the owner
  declined the coupling on 2026-09-04.
- No URL in the manifest, no network in the viewer.
- No per-icon fill policy or knockout list for user files (see above).
- No `unset`: `set` has no unset for any field, and this slice does not add one. Record it in
  set.ts's comment as the open item it is.
- No change to `Icon.tsx` or anything under `apps/web`: `ViewService.icon` keeps its shape and the
  viewer cannot tell a local mark from a vendored one, which is the point.
- `init` does not create `.catalogus/icons/`; `set` does, on demand.

## Part A — contract layer: `@catalogus/schema`, `@catalogus/core`, the skill (one agent)

### Files you own
- `packages/schema/src/schema.ts`, `packages/schema/src/schema.test.ts`,
  `packages/schema/src/types.ts` (if the manifest types are hand-written there),
  `packages/schema/src/validate.test.ts` (if that is where field-level accept/reject cases live —
  match where `version` was tested when it was added)
- `packages/core/src/icons.ts`, `packages/core/src/icons.test.ts`, `packages/core/src/index.ts`
- `skills/catalogus/SKILL.md`
- `examples/reference.catalogus.yaml` only if the drift test needs an `icon:` example to exist;
  if you add one, the file it names must exist beside it (`examples/.catalogus/icons/...`), or
  the example is a lie the schema cannot see.

Do not touch `packages/cli` — Part B owns it and starts after you report.

### Build
1. The schema field, exactly as the contract says. Regenerate whatever `schema.json` artefact
   `generate-schema-json.test.ts` / `schema-sync.test.ts` compare against, the way the previous
   field additions did. Tests: accepts `.catalogus/icons/loki.svg`; rejects `./.catalogus/icons/x.svg`,
   `.catalogus/icons/../x.svg`, `/abs/x.svg`, `C:\x.svg`, `https://x/y.svg`, `thesvg:aws`,
   `.catalogus/icons/x.png`, `.catalogus/icons/.svg`, empty string.
2. `resolveLocalIcon` and `MAX_ICON_BYTES`, exported from `index.ts`. Tests, against real files
   written into a temp directory: a clean multi-path SVG resolves with `hex: null` and fills kept;
   each sanitiser refusal returns null (write the hostile bytes, do not mock the parser); a
   missing file returns null; a file over the cap returns null without being read in full
   (assert via a file of `MAX_ICON_BYTES + 1` bytes); a `fill="#fff"` stays a fill, not a
   knockout.
3. The skill edits, and the drift tests green.

### Report
The verify command output (`pnpm build && pnpm test`, currently **1403 tests / 77 files**, green;
`pnpm typecheck` clean), the new counts, every file touched, and the exact exported signature of
`resolveLocalIcon` as it landed. Anything you assumed rather than ran, say so.

## Part B — `@catalogus/cli`: `set` writes it, `view` reads it (one agent, after Part A)

### Files you own
- `packages/cli/src/commands/set.ts`, `packages/cli/src/commands/set.test.ts`
- new: `packages/cli/src/icon-fetch.ts` (or a name that fits beside `manifest-io.ts`), with its
  test file — the fetch/copy/sanitise/write pipeline, separate from set.ts so set.ts stays the
  argument parser it is
- `packages/cli/src/view-payload.ts`, `packages/cli/src/view-payload.test.ts`
- `packages/cli/src/commands/view.ts`, `packages/cli/src/commands/view.test.ts` (the stderr line
  for a stale pointer)
- new: `packages/cli/src/commands/icons.ts`, `packages/cli/src/commands/icons.test.ts`
- `packages/cli/src/commands/add.ts`, `packages/cli/src/commands/add.test.ts` (the one extra line)
- `packages/cli/src/cli.ts` (the `icons` command registration; the `set` help text if it
  enumerates the per-entry fields) and `packages/cli/src/skill-commands-drift.test.ts` if the
  new command's line shape needs teaching
- `packages/cli/src/index.ts` if commands are re-exported there

Do not touch `packages/schema`, `packages/core`, `skills/`, `apps/web`.

### Build
Everything the contract section says under "CLI, `set`", "CLI, `view`" and "CLI, `icons`".
Put the shared "which source does this entry resolve to" step in one module both `view-payload`
and `icons` call, so they cannot drift. Tests run the
pipeline against a scratch manifest on disk through `runSet` and `buildViewPayload`, not through
mocks of the filesystem: a URL fetch (injected fetcher) that vendors and writes the field and the
comment, with the query string stripped from the comment; a local path that copies; the same path
given twice (no self-copy, no error); an `http://` URL refused at exit 2 with nothing written; a
hostile SVG refused with the temp file gone and the manifest untouched; a body over the cap
refused; an unknown `<id>` refused before any fetch happens (assert the fetcher was never called);
a stale pointer producing the stderr line and the catalog fallback in the payload; the containment
floor refusing a path outside `.catalogus/icons/` even if the schema is bypassed (build the
manifest object directly). Then run the built binary end to end on a scratch project:
`init --yes`, `add loki --role logging` (expect the no-icon line), `icons` (expect the `none`
row and the summary), `set services.loki.icon <a local svg path>`, `icons` again (expect
`local`), `validate`, and show the resulting YAML and the file under `.catalogus/icons/` in your
report.

### Report
Same shape as Part A's. Baseline is whatever Part A reported.
