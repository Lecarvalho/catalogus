# Brief: the direction contract follows the graph's removal and the Density ruling

Repo: C:\Workspace\repos\catalogus (Windows; Bash tool, POSIX syntax). Read root `CLAUDE.md` first,
then `docs/graph-removal-brief.md` (the parallel agent's brief — it names the decision and the
files that agent owns; **do not edit any of them**). Comment register: full sentences, dated
2026-09-05, with the reason.

## Files you own

- `apps/web/docs/DIRECTION.md` — the owner's contract.
- `apps/web/index.html` — the embedded copy of the contract and this repo's own disclosure prose.
- `apps/web/src/direction-contract.test.ts` — the guard. Read its header: the five contract
  sections are compared word for word between the two files, and the preamble / DEPARTURES /
  disclosure / FINISH prose is this repo's own and is checked only for load-bearing pins.

Nothing else. Not `tokens.css`, not any component, not `docs/`.

## The two rulings (owner, 2026-09-05)

1. **The graph view is decommissioned.** The viewer has two views, List and Migrations. The
   contract's FIRST VIEWPORT (or whichever section holds it) says "Main field: a view rail — List,
   Graph, Migrations —". Because the owner made this decision, the contract itself changes, not a
   departure: edit `DIRECTION.md` to name the two views, and edit the embedded copy in
   `index.html` to match word for word. Where `DIRECTION.md` has a dated history of rulings (read
   it; there are sections such as "Signal red: the rule stands"), add a short dated entry
   recording this ruling in the owner's words: *"It's not yet the way I'd like to read it, it's
   confusing. Let's finish the basic first, someday we can come back to that graph."* The graph is
   deferred, not rejected forever; say so.
2. **No Density setting.** *"Users don't need to choose the density, remove it."* The contract
   sentence "settings covers appearance, density, brand-icon colour and the default view" loses
   "density" (and check whether "appearance" is still true — the 2026-09-05 handoff in
   `docs/plan/handoffs-2026-09.md` records Appearance omitted because the dark theme was removed;
   if the contract still names it, leave it and note it in your report rather than deciding).
   The disclosure bullet "**The Settings panel has no Density row.** The mockup draws …" becomes a
   one-sentence record of the ruling, or is removed if the disclosure section only lists open
   gaps. Read the section's own framing and do whichever it says.

Any other "graph" mention in `index.html` or `DIRECTION.md` that states the graph as a present
surface gets the same treatment; passing historical mentions ("on 2026-08-26 the graph …") stay.

## The guard

`direction-contract.test.ts` derives some counts from the contract's own sections, and pins
specific paragraphs. After your edits it must pass without loosening any pin. If a pin names the
old wording, update the pin to the new wording and say which. Do not add a `DECLARED_DEPARTURES`
entry for either change — both copies move together.

## Verify

```
pnpm build && pnpm test && pnpm typecheck
```

Run build before test (the guard compares `index.html` against the build output). The parallel
agent is deleting the graph code at the same time; if files it owns are mid-change, tests outside
`direction-contract.test.ts` may be red for reasons that are not yours. Report
`direction-contract.test.ts`'s own result by running it alone as well
(`pnpm --filter @catalogus/web test -- direction-contract`), with the count it produced.

## Report back

The exact sentences changed in each file, the guard's test count before and after and its exit
code, the full-suite result you saw, and anything not done.
