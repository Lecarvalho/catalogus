# Shared spec — Catalogus viewer, new-world candidates

Read this whole file before writing anything. Every candidate obeys everything here; candidates
differ **only** on the axis named in your own brief.

## What this is

The Catalogus viewer (`catalogus view`) renders one project's operations manifest — its services,
infrastructure, dependencies and stack — as a read-only page. It currently ships in a design world
called `japanese-high-density-web`: a dense mosaic of hairline-ruled boxed modules, everything on
one screen, no scrolling, no search.

**On 2026-08-26 the owner retired that world.** They ran it, said it is not professional enough, and
named **Notion** as the reference to capture. They were then interviewed and answered eight
questions. Those answers are the contract below. They are not suggestions and they are not to be
re-litigated inside a candidate.

## The contract — the owner's answers, verbatim in effect

| Question | Answer | What it means for you |
|---|---|---|
| Scope | **New visual world** | `japanese-high-density-web` is retired. Do not preserve its mosaic. |
| Density | **Breathing room wins** | Generous spacing and larger type. Scrolling is allowed and expected. |
| Palette | **Keep cream + red** | The warm cream ground stays. Do NOT move to Notion's cool white. |
| Reference | **Notion** | Notion, not Confluence. Calm surfaces, quiet chrome, strong type hierarchy. |
| Search | **No search, ever** | No search field, no Cmd-K, no filter input. Navigation is bands + left rail. |
| Form | **Airier boxes** | Modules stay as containers. They get real padding and real space between them. |
| Geometry | **Sharp structure, soft transients** | Page, panels and rows: sharp corners, flat, no shadow. Radius (4–6px) and a soft shadow ONLY on popovers, menus and hover surfaces. |
| Process | **Candidates first** | This is a static mockup for the owner to judge. It is not wired to the app. |

### Constraints that survive from the old world and are still binding

- **Red is the only chromatic colour in the UI.** It marks what departs from normal — a deprecated
  service, a phase-out, a count worth reading — and nothing else. Adding a second UI hue costs the
  first its meaning. (Brand icons are a separate question; see your brief.)
- **Organize by architecture, not alphabet.** The seven bands below are the organizing principle.
- **Read-only: no editing affordance anywhere.** No buttons that write, no "+ Add", no edit pencils.
  The only interaction is reading and navigating.
- **Keep meaning out of colour alone.** Every status must be legible in greyscale — carry it in a
  word or a mark, not only in a hue.
- **No network.** `catalogus view` serves from 127.0.0.1 and must work fully offline. **No webfonts,
  no CDN links, no remote images.** System font stack only. Your file must be fully self-contained.
- **`active` carries no tag.** Tagging the norm is what produced 35 identical pills in the version
  the owner rejected. Only `phasing_out`, `deprecated` and `removed` are marked.
- **38% of real services have no brand icon**, so the fallback must look deliberate rather than
  broken.

### The rut, named before you start — do not walk into it

The design this replaces two versions ago was: dark dashboard, neon accent, even card grid, sidebar,
status pills. Its predictable opposite is: airy white docs site, Inter, thin grey rules, blue links.
**Cream + a single red is what keeps you out of both.** If your candidate would look the same with a
white ground and a blue accent, you have drifted.

## The token layer — use these exact values

```css
:root {
  /* Ground and ink — warm, computed against the cream ground #f4f1ea (rel. luminance 0.881) */
  --color-bg:             #f4f1ea;
  --color-surface:        #fbf9f4;
  --color-surface-sunken: #ece8de;
  --color-header-fill:    #e9e4d8;
  --color-text:           #24211c;  /* 14.2:1 AAA */
  --color-text-muted:     #5e5a50;  /*  6.1:1 AA  */
  --color-text-faint:     #7e7a6e;  /*  3.8:1 — de-emphasised metadata only, never body text */
  --color-signal:         #d40010;  /*  4.9:1 AA — the ONLY chromatic colour */
  --color-hairline:       #d5cebe;  /*  1.39:1 against the ground */
}
```

Font stack (no webfont): `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
Numerals should use `font-variant-numeric: tabular-nums` wherever they line up in a column.

**Type scale is yours to set, and it is part of what is being judged.** The old world used 12px body
at 1.5 line-height, which is part of what reads as cramped. Notion's body is ~16px at ~1.5 with
generous paragraph spacing. Pick deliberately and stay consistent.

## The data — real, from `examples/layout-stress.catalogus.yaml`

Do not invent services, do not trim the list, do not add lorem. All 35 entries render.

**Project:** `Layout Stress` (slug `layout-stress`), visibility `private`.
**Architecture sentence:** "deliberately overgrown: an API hub with eighteen outgoing dependencies,
two lifecycle migrations in flight, and one entry nothing depends on"
**Manifest path to show in the shell:** `examples/layout-stress.catalogus.yaml`
**Totals:** 35 services · 48 dependencies · 21 rollups · 7 bands in use.

Columns below: `id` · display name · `role` · kind · version · status · `replaced_by` · in-edges ·
out-edges. Kind is `service` unless stated. Entries are already in the order the app renders them
(bands in reading order; entries sorted by `id` within a band).

### Runs in production — 7

| id | name | role | kind | ver | status | replaced_by | in | out |
|---|---|---|---|---|---|---|---|---|
| auth-legacy | Auth0 | auth-legacy | service | — | phasing_out | auth-users | 1 | 0 |
| auth-users | Clerk | auth-users | service | — | active | — | 1 | 1 |
| host-api | Fly.io | hosting-api | service | — | active | — | 3 | 18 |
| host-edge | Cloudflare Workers | hosting-edge | service | — | active | — | 2 | 3 |
| host-web | Fly.io | hosting-web | service | — | active | — | 2 | 5 |
| host-worker | Fly.io | hosting-worker | service | — | active | — | 1 | 5 |
| ingress-edge | NGINX | ingress-proxy | component | — | active | — | 0 | 1 |

`host-api` carries the note: "the fan-out hub: 18 outgoing edges".

### Holds data — 7

| id | name | role | kind | ver | status | replaced_by | in | out |
|---|---|---|---|---|---|---|---|---|
| blob-store | Google Cloud Storage | storage-blob | service | — | active | — | 3 | 0 |
| db-cache | Redis | database-cache | service | — | active | — | 2 | 0 |
| db-legacy | MongoDB | database-document | service | — | deprecated | db-primary | 2 | 0 |
| db-primary | PostgreSQL | database-primary | service | — | active | — | 6 | 1 |
| db-replica | PostgreSQL | database-replica | service | — | active | — | 1 | 0 |
| db-search | Elasticsearch | database-search | service | — | active | — | 1 | 0 |
| queue-jobs | RabbitMQ | queue-jobs | service | — | active | — | 2 | 0 |

`db-primary` carries the note: "the fan-in hub: six dependents across five rollups".
Note that `db-primary` and `db-replica` are **both** displayed as "PostgreSQL" — the `id` line is
what tells them apart, and a candidate that renders the name alone shows the same tile twice. Same
for the three Fly.io entries above.

### Calls out to — 6
*Band note: "Third-party capabilities this project invokes."*

| id | name | role | kind | ver | status | replaced_by | in | out |
|---|---|---|---|---|---|---|---|---|
| ai-chat | Anthropic | ai-inference | service | — | active | — | 1 | 1 |
| ai-embed | Hugging Face | ai-embeddings | service | — | active | — | 0 | 2 |
| mail-legacy | Mailgun | email-legacy | service | — | removed | mail-tx | 1 | 0 |
| mail-tx | Resend | email-transactional | service | — | active | — | 2 | 0 |
| pay-cards | Stripe | payments-cards | service | — | active | — | 1 | 0 |
| pay-legacy | PayPal | payments-legacy | service | — | phasing_out | pay-cards | 2 | 0 |

### Runs on — 4

| id | name | role | kind | ver | status | replaced_by | in | out |
|---|---|---|---|---|---|---|---|---|
| stack-lang | TypeScript | language-shared | stack | 5 | active | — | 4 | 0 |
| stack-mobile | Expo | ui-mobile | stack | 52 | active | — | 0 | 2 |
| stack-runtime | .NET | runtime-backend | stack | 10 | active | — | 2 | 0 |
| stack-ui | React | ui-framework | stack | 19 | active | — | 1 | 0 |

### Watched by — 4

| id | name | role | kind | ver | status | replaced_by | in | out |
|---|---|---|---|---|---|---|---|---|
| analytics-product | PostHog | analytics-product | service | — | active | — | 0 | 2 |
| obs-errors | Sentry | monitoring-errors | service | — | active | — | 1 | 0 |
| obs-metrics | Datadog | monitoring-metrics | service | — | active | — | 1 | 0 |
| obs-trace | OpenTelemetry | telemetry-transport | component | — | active | — | 3 | 0 |

### Built and shipped by — 5

| id | name | role | kind | ver | status | replaced_by | in | out |
|---|---|---|---|---|---|---|---|---|
| agent-claude | Claude Code | coding-agent | service | — | active | — | 0 | 0 |
| agent-cursor | Cursor | coding-review | service | — | active | — | 0 | 0 |
| board | Trello | pm | service | — | active | — | 0 | 0 |
| ci | GitHub Actions | ci | service | — | active | — | 0 | 5 |
| vcs | GitHub | vcs | service | — | active | — | 1 | 0 |

### Registered at — 1

| id | name | role | kind | ver | status | replaced_by | in | out |
|---|---|---|---|---|---|---|---|---|
| dns | Cloudflare | dns | service | — | active | — | 1 | 0 |

### Unplaced — 1
*Band note: "These roles are not in SKILL.md's base-word list, so this view has no band for them."*

| id | name | role | kind | ver | status | replaced_by | in | out |
|---|---|---|---|---|---|---|---|---|
| legacy-ledger | acme-ledger | finance-ledger | service | — | deprecated | — | 2 | 0 |

`legacy-ledger` has **no catalog row** — it renders as its raw slug `acme-ledger` with the fallback
glyph rather than a display name and a brand icon. Its note: "an in-house ledger service nobody has
a catalog row for". This is the 38% case; make sure it does not look like a bug.

## Brand icons

`icons.json` sits beside this file. It maps each `service` slug to `{title, hex, path}`, where
`path` is a `simple-icons` SVG path for a 24×24 viewBox. Inline the ones you need as
`<svg viewBox="0 0 24 24"><path d="…"/></svg>`. **Do not fetch anything.** `acme-ledger` is
deliberately absent — that entry takes the fallback.

The shipped app renders brand icons in `currentColor` (ink) by default, so the "red is the only
chromatic colour" rule holds. **Whether your candidate keeps that or shows full-colour brand marks
the way Notion does is specified in your own brief — follow it exactly.**

## The shell and the views — present in every candidate

- **A top bar.** Product identity left (the wordmark `Catalogus` — there is no logo glyph, by owner
  decision; do not invent one), manifest path right.
- **A left rail, 240px.** Project identity, then the band index with counts. This is specified in
  the direction contract and has never been built. It is the navigation, since there is no search.
- **A view rail: List · Graph · Migrations**, with List active. The other two are real views in the
  app; render the rail and mark them inactive-but-present. Do not build them.
- **The board itself**, which is what your axis is about.
- **Hover → a popover near the item. Click → the service's own page.** That is the owner's ruling. A
  service is a PAGE, not a row. Show the popover for exactly one service (`db-primary` is the
  interesting one — 6 in, 1 out, and the target of a `replaced_by`) so the owner can judge the
  transient surface, since this is a static file. It is the one place a radius and a soft shadow are
  allowed.

## Output

- **One file, self-contained**, at the exact path in your brief. Inline CSS in a `<style>` block,
  inline SVG. No build step, no imports, no network.
- **Desktop first, at 1440px.** It must also not overflow horizontally at 390px, but mobile polish
  is not what is being judged.
- **A short comment block at the top of the file** naming the candidate, its axis, and the three or
  four decisions you made that another candidate could reasonably have made differently. This is
  what the owner reads when two candidates look close.
- Do not create any other file. Do not touch anything under `C:\Workspace\repos\catalogus`.

## Honesty rules — this repo's standing rule, and it applies to a mockup

- **Ask, never guess** is the project's hard rule. Where this spec does not answer something, make
  the call and **write it down in your top-of-file comment as a decision**. Do not present a guess
  as though it were specified.
- **Every number on screen must be real** — computed from the data above, not plausible. The totals
  are 35 / 48 / 21 and the band counts are 7 / 7 / 6 / 4 / 4 / 5 / 1 / 1.
- **Report what you actually did.** If you did not get something working, say so in your report
  rather than describing it as done.

---

# ADDENDUM — 2026-08-26, added mid-flight: the full application shell

**This was added after the three candidate briefs went out.** The owner asked for it directly:

> "What I also need is the shell. Header, footer, profile, settings, help, etc. Even if it's mock
> for now, that's gonna help us to get the professional state we're looking for, and help me decide
> the best direction."

So the shell is now **part of what is being judged**, not scaffolding around it. A page that is
well designed inside a thin bar does not read as a product; the chrome is a large part of why Notion
reads as professional. Treat it with the same care as the board.

**It is explicitly allowed to be mock.** These surfaces have no backend behind them — accounts,
settings and sync arrive in Phases 4–5, which are unbuilt. Render them as a designer would render
them, and do not apologise for them on screen. Do not add "(mock)" labels, placeholder-grey boxes,
or lorem. Make them look like the real thing, because looking like the real thing is the entire
point of the exercise.

## What the shell must contain

### Top bar
- **Product identity, left**: the wordmark `Catalogus`. There is still no logo glyph and you must
  still not invent one.
- **Project identity**: the current project, `Layout Stress`. **There is NO project switcher and no
  multi-project navigation.** The owner decided on 2026-08-25 that the viewer stays single-repo and
  deferred the portfolio page; that decision stands unless it is reversed explicitly.
- **Right cluster**: help, settings, and a profile control, in whatever order and form your
  candidate's register argues for. Ink line icons, ~1.5px, or quiet text labels — your call, but be
  consistent with the rest of your candidate.
- **The profile control opens a menu.** Show it open in one of your two open transient surfaces (see
  below), or show it closed — but design the menu either way and say which you chose.

### Profile menu — mock content, and keep it plausible rather than inventive
Account name and email, a workspace or plan line, and menu entries for Account, Preferences,
Keyboard shortcuts, Documentation, and Sign out. Use `Leandro Carvalho` / `dsnktec@gmail.com` for
the account, since it is the owner's and this is their tool.

### Settings
A panel or menu, your candidate's choice of surface. Plausible read-only-era settings only:
appearance (light / dark / system), density, whether brand icons render in colour, default view
(List / Graph / Migrations), and the manifest path. **Do not add anything that would write to the
manifest** — the read-only constraint is still binding, and settings that change how the viewer
*displays* are not editing affordances, while anything touching manifest content is.

### Help
Whatever your register argues for: a menu, a panel, or a link cluster. Plausible entries are
documentation, the manifest format reference, keyboard shortcuts, `catalogus` CLI reference, and a
version line. This is the surface where naming the CLI commands is appropriate — the viewer is one
half of a tool whose other half is a terminal.

### Footer
The old world had none and the bottom of the screen has been recorded as empty since 2026-08-25 —
this is your chance to solve that. Plausible content: the manifest path and when it was read, the
totals, the CLI version, a documentation link, the schema URL
`https://catalogus.dev/schema/v1.json`. Make it earn its space or make it thin, but decide
deliberately and say which you decided in your comment block.

## Rules that still bind the shell

- **Everything from the main spec applies unchanged**: cream ground, ink, one red, no second UI hue,
  no webfont, no network, no search anywhere in the chrome either, sharp structure with radius and
  soft shadow only on transients.
- **Menus and popovers ARE transients** — they get the radius and the soft shadow. They are the main
  place your candidate's "soft transients" answer becomes visible, so make them count.
- **Show at most two open transient surfaces at once** in the static file — the `db-primary` service
  popover the main spec already asks for, plus one of the profile / settings / help surfaces. More
  than two and the screenshot stops reading as a screen.
- **Still no editing affordance** anywhere in the chrome.
- **Still one self-contained file**, no new files.

## Add to your report

- What you put in the footer and why, or why you kept it thin.
- Which transient surface you chose to show open, and what it demonstrates about your candidate.
- Anything in the shell you had to invent because neither the spec nor the addendum answered it —
  flagged as a call, not as a fact.

---

# ADDENDUM 2 — 2026-08-26: the app shell is approved; the ICON shell comes off

**Read this before the addendum above confuses you.** The word "shell" was used for two different
things and the owner has now separated them.

## The app shell is finished. Do not touch it.

The owner's words, exactly: *"When I said shell, I said the icon shell, not the app shell. Your new
app shell is perfect, don't touch it."*

So the top bar, the help / settings / profile cluster, the profile menu, the settings surface, the
help surface, the left rail and the footer are **approved and settled**. Reproduce them faithfully.
This is not an invitation to redesign chrome the owner has just called perfect — a candidate that
"improves" it has failed, however good the improvement.

`candidate-d-iconwall.html` in this directory is the reference implementation of that shell. **You
may read it. You may not edit it, and you may not edit any other sibling candidate.** Take its
shell, its tokens, its rail, its menus and its footer, and change only what your own brief tells you
to change.

## What actually comes off is the ICON's shell

Candidate D draws every service as a bordered tile: a box with a hairline border, a fill, and the
icon and labels inside it. **That box is what the owner wants gone.** The reference is a smartphone
home screen — the app icon sits directly on the ground with its name beneath it, and there is no
card, no border, no panel around each one.

So for these candidates:

- **No border, no fill, no card around a service.** The icon and its label sit on the page ground.
- **The icon itself becomes the object.** It carries the visual weight that the box used to carry,
  so it needs real size and real presence.
- **Rounded icon tiles are allowed, and only there.** The owner chose this explicitly: the icon tile
  gets a phone-like corner radius; everything else — sections, chrome, rails, footer — stays sharp.
  This is a **declared, contained departure** from "sharp structure, soft transients", not a repeal
  of it. Do not let the radius spread to anything else.
- Hover still opens the popover. The popover is still a transient and still gets its radius and soft
  shadow.

## The hard problem this creates, and it is the thing to solve well

**With the card gone, there is nowhere obvious to put status.** Candidate D put a worded bordered tag
inside the tile. You do not have a tile.

Non-active services must still be findable **without hovering**, and must still **survive
greyscale** — those two constraints have not moved. A phone's own vocabulary has answers worth
stealing: a corner badge on the icon, a dimmed or desaturated icon, a label under the name, a
different treatment of the name itself. Pick one, make it deliberate, and say what you picked.

There are **five** non-active entries, not four: `auth-legacy` (phasing_out), `pay-legacy`
(phasing_out), `db-legacy` (deprecated), `legacy-ledger` (deprecated), `mail-legacy` (removed). Only
the first four carry a `replaced_by`; `legacy-ledger` has none, so do not invent one for it.

## Everything else still binds

The duplicate-name trap has not gone away — `host-api`, `host-web` and `host-worker` are all Fly.io,
and `db-primary` and `db-replica` are both PostgreSQL. The vendor name alone still renders the same
label three times, so the `id` still has to be visible. `legacy-ledger` still has no brand icon and
is still the most exposed entry in an icon-led form; without a card to sit in, its fallback is harder
and matters more.

Cream ground, one red, no second UI hue, no webfont, no network, no search, no editing affordance,
all 35 services, real counts. The CLI version is `0.0.1` — do not invent a nicer one.

## The owner is brainstorming, and said so

Asked to choose between a home-screen grid and a vertical list, they declined and wrote: *"We're
brainstorming, we need to be open minded now."* So two candidates are being built to show both
rather than to argue for one. **Build yours as well as it can be built** — the comparison is only
worth something if each side is its best self rather than a strawman for the other.
