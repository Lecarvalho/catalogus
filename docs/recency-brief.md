# Brief: the board carries a recency mark (HANDOFF §4.2 query 5)

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first.
The comment register of neighbouring files is the register you write in: every decision gets a
comment beside the code, in full sentences, dated 2026-09-05, with the reason.

## What this closes

`docs/plan/00-open-work.md`, "Ready now", item 2, and the paragraph under
`docs/plan/phase-3.7-viewer.md`, "HANDOFF §4.2 at the close of Phase 3.7", query 5. Read that
paragraph: it records that the recency *rule* already exists (`apps/web/src/service-tags.ts`,
`RECENT_WINDOW_DAYS`, `isRecentlyAdded`, the `new` tag on the popover and the service page) and
that the one surface showing every service at once, the board, carries no recency mark at all,
because `ServiceTile` deliberately ignores `readAt` ("a collapsed vendor tile stands for several
entries and a single bar cannot say 'some of these are new' honestly"). What is left is to surface
recency where it can be scanned, not to build the rule.

## The decision, made by the main session and to be recorded as an assumption for the owner

The mockup (`apps/web/docs/candidates/candidate-e-homescreen.html`) carries no recency mark, so
this is a choice the mockup does not make. The choice: **the recency mark goes in the tile's
existing third label line, the slot the status word already uses, in ink rather than signal red.**

- **Single-entry tile.** When `isRecentlyAdded(service.added, readAt)` is true and the tile
  renders no status phrase (`statusPhrase(service)` is `undefined`), render the word `New` in
  that slot. When a status phrase exists, the status word keeps the slot and no recency mark is
  rendered on the tile: status first, then recency, the same fixed order `tagsFor` uses, and the
  popover and the service page still show both tags. Say so in the comment.
- **Multi-entry group tile.** When at least one entry is recent and `groupStatusPhrase(group)` is
  `undefined`, render `<n> new` in that slot (`2 new`, `1 new`). Not "2 of 5 new": the count line
  above it already says how many entries. Same precedence rule: the departure phrase wins the
  slot.
- **Colour: ink, never signal red.** `apps/web/docs/DIRECTION.md`, OWN-WORLD: "Signal red is spent
  in exactly two places, the status badge and the status word, and nowhere else." Recency is
  neither. `signal-red.test.ts` scans every stylesheet and fails the suite on a red declaration
  outside its allow-list; do not touch that allow-list. The `new` tag is already ink
  (`Tag.module.css`, `.signal-outline` resolves to `--tag-phasing-ink: var(--color-text)`), so ink
  is the vocabulary's own colour for this fact. Add a `.recency` rule to `ServiceTile.module.css`
  beside `.status`: same `margin-top`, `font-size`, `line-height` and weight as `.status`, but
  `color: var(--color-text)`. Do **not** reuse the `.status` class for the recency word.
- **No badge, no desaturation.** Those are status signals 1 and 2; recency is not a status.
- **Accessible name.** The single tile's `label` and the group tile's `label` are built explicitly
  from what the tile renders. Add the recency phrase to both in the same position the status
  phrase takes (`"Fly.io, host-api, New"`, `"Fly.io, 5 entries, 2 new"`).
- Give the rendered element `data-testid="recency-text"` so tests and the validator can find it
  the way `status-text` is found.

## Files you own

- `apps/web/src/service-tags.ts` — add `countRecentlyAdded(services: readonly ViewService[], readAt: string): number`,
  built on `isRecentlyAdded`, with a doc comment in the file's register. Nothing else in that file
  changes.
- `apps/web/src/service-tags.test.ts` — tests for the new function (zero, some, all; an undefined
  `added` counts as not recent; measured from `readAt`, never `Date.now()` — copy the existing
  spy pattern).
- `apps/web/src/components/ServiceTile.tsx` — the two renderings above. Rewrite the `readAt` prop's
  doc comment: it is consulted now. Update the file header where it says the group form carries
  only the status treatment.
- `apps/web/src/components/ServiceTile.module.css` — the `.recency` rule.
- `apps/web/src/components/ServiceTile.test.tsx` — new `describe` blocks matching the existing
  ones' shape (`soloGroup`, `multiGroup`, `renderTile`, the file-level `readAt`). Cover at least:
  single recent active entry renders `New` and no `status-text`, no badge, no desaturation; single
  recent entry with `phasing_out` renders the status word and **no** `recency-text`; single old
  entry renders neither; group with two recent of five renders `2 new`; group with a recent entry
  and a departing entry renders the departure phrase and no `recency-text`; the accessible names
  for the single and the group case; a stylesheet assertion that `.recency` does not name the
  signal colour (see how `ServiceTile.module.css`'s label-stack block is already read in that
  file with `readFileSync`).

Do not edit any other file. In particular: not `ServicePopover.tsx`, not `ServicePage.tsx`, not
`BandModule.tsx`, not `bands.ts`, not `signal-red.test.ts`, not anything under `docs/`. The main
session owns the plan files.

## Verify

```
pnpm build && pnpm test && pnpm typecheck
```

Baseline before this brief: **1701 tests / 86 files**, build and typecheck exit 0. Run build before
test (the direction-contract guard compares `apps/web/index.html` against the build output).
Report the numbers you observed, not the numbers you expect. Report anything you could not do
as not done.

## Report back

The files changed, the test counts before and after, the exit codes of the three verify steps,
and the exact rendered text for each of the cases listed above as observed in your tests.
