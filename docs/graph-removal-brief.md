# Brief: decommission the viewer's graph view

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first.
The comment register of neighbouring files is the register you write in: every decision gets a
comment beside the code, in full sentences, dated 2026-09-05, with the reason.

## The owner's decision (2026-09-05)

> About the graph: let's make it simple for now and just remove it. It's not yet the way I'd like
> to read it, it's confusing. Let's finish the basic first, someday we can come back to that
> graph. Decommission all of that.

So: the viewer has two views, **List** and **Migrations**. The graph view, its layout engine, its
canvas and its two dependencies go. Git history keeps the code; nothing is parked in a "disabled"
state, nothing is commented out.

**What is not the graph and stays untouched:**

- `catalogus graph`, the CLI command (`packages/cli`). It prints the dependency graph as data and
  is part of the offline CLI's contract. Not in scope.
- The payload's `edges`, `deriveEdgeMaps` in `App.tsx`, and every "depends on / depended on by"
  rendering in the popover and the service page. Those are the list's, not the graph's.
- `ServiceNode.tsx` / `.module.css` / `.test.tsx`. The graph reused the list's node; the node is
  still rendered by `ServiceGroup.tsx` and its `serviceNodeDomId` is used by `App.tsx` and
  `MigrationList.tsx`. Only its comments that describe the graph change (see below).
- `apps/web/index.html` and `apps/web/src/direction-contract.test.ts` — a second agent owns them
  in parallel. **Do not edit them.** Their change is the same decision from the contract's side.
- Everything under `docs/`. The main session owns the plan.

## Part A — files you own, and what happens to each

**Delete** (with `git rm`):
- `apps/web/src/components/GraphCanvas.tsx`, `GraphCanvas.module.css`, `GraphCanvas.test.tsx`
- `apps/web/src/graph-layout.ts`, `graph-layout.test.ts`
- `apps/web/src/elk-layout.ts`

**Dependencies:** remove `@xyflow/react` and `elkjs` from `apps/web/package.json`, run
`pnpm install` from the repo root so `pnpm-lock.yaml` follows, and confirm with a grep of
`apps/web/src` that nothing imports either.

**Edit:**
- `apps/web/src/components/ViewToggle.tsx` + `.test.tsx` — `ViewMode` becomes `"list" | "migrations"`,
  `MODES` loses its graph entry. The header comment explains the two views. Arrow-key movement on
  the rail keeps working with two options; test it.
- `apps/web/src/preferences.ts` + `.test.ts` — `DefaultViewPreference` and `DEFAULT_VIEW_VALUES`
  lose `"graph"`. A stored `"graph"` in `localStorage` (a reader who chose it before today) must
  fall back to the default view without throwing and without leaving the panel in an unselected
  state; the parser is already tolerant of garbage — add a test that names this exact case.
- `apps/web/src/components/SettingsPanel.tsx` + `.test.tsx` — the Default view row offers List
  and Migrations. **Also:** the owner ruled on Density on 2026-09-05: *"Users don't need to choose
  the density, remove it."* Replace the "omitted for now" Density comment with one sentence
  recording that ruling and the date. Nothing renders for it; nothing did.
- `apps/web/src/components/HelpMenu.tsx` (+ its test if it asserts the text) — the shortcut
  description "Move between the List, Graph and Migrations tabs" names the two tabs left.
- `apps/web/src/App.tsx` + `App.test.tsx` — drop the lazy `GraphCanvas` import, `layoutWithElk`,
  the `mode === "graph"` branch and the `Suspense` fallback; the header comment about "both halves
  of the graph view load on demand" goes; comments that list "the graph and the migration board"
  as the two non-list views are corrected to name the migration board alone. In the test file the
  elk mock and the graph-mode tests go; the migrations-view siblings stay.
- `apps/web/src/components/AppShell.tsx`, `Rail.tsx`, `Icon.tsx`, `ServiceNode.tsx`,
  `ServiceStatus.tsx`, `ServiceGroup.tsx`, `MigrationList.tsx`, `ServiceTile.tsx`, `Tag.tsx`,
  `Icon.module.css`, `ServiceNode.module.css` — comment-only edits where a comment states a fact
  about the graph that is no longer true (for instance `Icon.tsx`'s "the graph's nodes are not on
  that switch and stay in colour" and `ServiceNode.tsx`'s reference to `graph-layout.ts`'s
  `NODE_SIZE`). Do not rewrite history in comments that describe a past decision; append the
  2026-09-05 removal in one sentence where the reader would otherwise go looking for a file that
  no longer exists. If a file's only mention is a passing "as the graph also does", leave it.
- `apps/web/src/tokens.css` — remove the `--graph-*` tokens and any token used only by
  `GraphCanvas.module.css`; keep every `--*node*` token `ServiceNode.module.css` still reads.
  Correct the comment block around them (it says the node's box is a constraint from
  `graph-layout.ts`).
- `apps/web/src/token-references.test.ts` — it names `GraphCanvas.test.tsx`; correct the comment
  and any list that drives assertions. If the test scans stylesheets for token references, the
  deleted stylesheet simply stops being scanned.
- `apps/web/src/signal-red.test.ts` — check the allow-list. `ServiceNode.module.css` sites stay
  (the node still renders). If any `GraphCanvas.module.css` site is listed, remove that row: the
  "allow-list cannot rot" test fails on a licensed site with no declaration.

## Verify

```
pnpm build && pnpm test && pnpm typecheck
```

Baseline before this brief: **1716 tests / 86 files**, build and typecheck exit 0. The count will
drop (two test files deleted, graph-mode tests removed) — report the number you observed and how
many tests each removal accounts for. `direction-contract.test.ts` may fail until the parallel
agent's contract edit lands; if it is the only red file, say so with the failing test names, and
do not touch it.

Then run the built binary once against a scratch project (`node packages/cli/dist/cli.js init`
and `add` in the scratchpad `C:\Users\Leandro\AppData\Local\Temp\claude\C--Workspace-repos-catalogus\1fc6be1f-ca1c-4604-93d1-81892714b564\scratchpad`,
then `view --no-open --port <free port>`), fetch the served `index.html` and the bundle, and confirm
with a grep that neither `elkjs`, `xyflow`, `reactflow` nor the word `Graph` reach the shipped
JavaScript. Stop the server.

## Report back

Files deleted, files edited, dependencies removed, tests before and after with the per-file
accounting, the three verify exit codes, the bundle grep result, and anything not done.
