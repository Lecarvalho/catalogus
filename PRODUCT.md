# Product

<!-- impeccable:product-schema 1 -->

> **This file is subordinate to `docs/HANDOFF.md`.** `CLAUDE.md` names the handoff as the source of
> truth and says it should not be re-derived or contradicted. This record exists so design work has
> the product facts in one place; where the two touch, it cites the handoff rather than restating
> it, and the handoff wins. Facts captured in interview on 2026-08-25 that the handoff does not
> carry are marked as such.

## Platform

web

## Users

Solo developers and small agencies running roughly 5–15 projects at once — HANDOFF §1's ICP, and
confirmed in interview on 2026-08-25 as the audience the viewer is designed for, not just the owner.
The owner is user zero and the only current user, but the design target is a stranger who will judge
the product in ten seconds against tools they already pay for. The owner named **Confluence and
Notion** as the bar, and the reasoning behind it: "if we look like prime apps like Confluence and
Notion, they beat us."

## Product Purpose

A project operations registry: for each project, what it is built on — service providers,
infrastructure, dependencies, stack — and what depends on what. HANDOFF §1 lists the six questions it
exists to answer.

**The manifest is a skeleton, not the product.** Confirmed in interview, 2026-08-25, and it is the
most consequential thing in this file. `catalogus.yaml` records topology: identity, role, status,
edges. What the owner actually wants to keep is the *operational knowledge* attached to each entry —
the tax registration table behind a Stripe integration, why the ingress is wired the way it is, the
thing that took a day to learn and must never be re-derived. That content is a **page**, not a field.

**Pages are Layer 3, and they are edited in the browser.** Owner decision, 2026-08-25, recorded as a
committed direction rather than a candidate. Long prose does not go in the repo: it churns diffs
nobody reviews, bloats the checkout, dies when a repo is archived or renamed, and — the reason that
settles it — a tax registration table in a committed file is precisely the kind of business detail
that leaks by accident. HANDOFF §3 already defines Layer 3 as the private per-user overlay behind
auth, so this uses the architecture that exists rather than inventing one.

**This un-defers Phase 4**, and that consequence was named and accepted when the decision was taken.
Browser editing needs a store, auth (Phase 5) and an MCP write path (Phase 6). Two further costs
were named and accepted: the viewer stops working offline and account-free, which it does today on
any checkout; and there will be two writers on one page — the owner in the browser and the MCP
server — which needs a version or draft-approval story that does not exist yet.

Success is that someone opens a project six months later, or hands it to somebody else, and does not
have to reconstruct how it works.

## Positioning

HANDOFF §1's comparison table is the durable version. The short form: service catalogs
(Backstage, Port, OpsLevel) are enterprise-shaped and have no cost layer; SaaS-spend tools
(Cledara, Torii) are finance-shaped and have no dependency model; StackShare is public-facing with
no lifecycle; stack-analyser is detection only and its dashboard was archived in 2024.

HANDOFF §6 names the differentiator: **MCP server mode — the agent workflow.** That is consistent
with the page model above. The agent is what fills the pages.

**The capture loop is the product, stated by the owner on 2026-08-25.** The intended moment is
mid-work, not documentation time: you are coding on a project with an agent, the agent explains
something hard-won — the example given was how Stripe Tax only collects where you hold a
registration, and what that means for this business province by province — and you say **"catalogus
that please."** It files onto the right service page of the right project, and it is there in six
months.

Two things follow, and both are load-bearing:

- **Filing has to cost nothing.** Every documentation tool loses to the terminal scrollback because
  stopping, switching app, finding the page, pasting and reformatting costs more than the knowledge
  seems worth in the moment. Catalogus wins that trade by already knowing the project, the service
  and the topology — there is no "where does this go?" step.
- **Pages accumulate as a by-product of work, not as a chore.** Nobody sits down to document. This is
  the mechanism no general-purpose wiki has, because a wiki does not know what you are working on.

It also resolves who writes what: **the agent captures, the browser curates.** Different jobs, mostly
different moments, which is why two writers on one page is a smaller problem than it first looked.

**The manifest is authoritative for coding agents, not only for people.** Owner, 2026-08-25. An agent
told to change something Supabase-related should read the manifest first — what Supabase is used for
here, what depends on it, what it talks to — instead of searching the whole repo to reconstruct facts
that are already written down. This is a second audience for the same file, and it changes the
economics: the manifest pays for its own upkeep on every task, because a file read replaces a
repo-wide search.

It comes with an obligation the product has to state and enforce: **agents must keep it updated.**
`skills/catalogus/SKILL.md`, and the `AGENTS.md` / `CLAUDE.md` of any onboarded repo, should insist
on it rather than leave it optional — a registry that drifts is worse than none, because it is
believed. `catalogus diff` is the existing mechanism that catches drift; what does not exist yet is
the instruction making the update non-optional.

Both halves are open work, recorded in `docs/PLAN.md` rather than built.

## Operating Context

**Three jobs, confirmed in interview 2026-08-25.** Ranked as the owner selected them:

1. **Orienting in a project** — coming back after months, or picking one up. Browsing, not searching.
2. **Handing a project over** — onboarding a developer or client into a system they did not build.
3. **Reviewing the portfolio** — across projects: what is used everywhere, what is stale, what it
   costs.

**It is not an incident tool.** "Something broke — what's red?" was offered and deliberately not
selected, even though HANDOFF §1 lists blast radius among the product's questions. Nothing in the
viewer should be designed around urgency, alerting, or at-a-glance triage.

**Job 3 has no surface today.** The portfolio page was deferred by the owner on 2026-08-25 and the
viewer is single-repo. It is recorded here because the design must leave room for it, and because a
job the owner names and the product cannot do is worth stating plainly rather than omitting.

**How it is reached:** `catalogus view [path]` from a repo checkout, serving `127.0.0.1:4180`.

## Capabilities and Constraints

**The manifest is written by the CLI and the agent, never by hand.**
`packages/cli/src/manifest-edit.ts` is the only writer and refuses anything that would fail
`validate`. There is no supported hand-edit path, and browser editing does **not** change this — the
skeleton stays CLI-owned. What becomes editable is page content, which is Layer 3 and has no schema.

**The viewer is read-only today, and page editing is the first thing that changes it.** "Go into each
item" was confirmed in interview to mean navigating to a page in the UI. Until Layer 3 has a store,
there is nothing to edit and any editing affordance would be lying — so the current build shows none.

**Sequencing, decided 2026-08-25:** the page-centric redesign ships first, read-only against manifest
data; editing arrives with Phase 4 as an addition to a page that already exists. The information
architecture is identical either way, which is why the redesign does not have to wait on a backend.

**Three layers** (HANDOFF §3): Layer 1 auto-detected, Layer 2 the committed manifest, Layer 3 a
private overlay for cost and account references. Layer 3 has no store — the viewer renders an
explicit "not connected" state.

**Entries have a `kind`** — `service` (a vendor), `component` (infrastructure the owner runs, no
invoice), `stack` (what the code is written in, carrying a version). Only `service` can ever carry a
Layer 3 cost.

**`role` drives grouping.** The rollup is the segment before the first `-`, mechanically. Display
labels live in the viewer (`apps/web/src/rollup-labels.ts`).

**What real data actually looks like**, measured against the one real manifest on 2026-08-25 —
`C:/Workspace/repos/Clapline/catalogus.yaml`:

| | value |
|---|---|
| services | 35 |
| edges | 41 |
| distinct roles | 32 |
| rollup groups | 21 |
| groups holding exactly one service | **15** |

That last row is the design constraint nobody had seen before: 35 items scattered across 21 headings,
most of them singletons. Every prior layout judgement was made against synthetic fixtures with a
different shape.

**Brand icons are the minority path.** Measured against `simple-icons` 16.28.0: of 159 catalog slugs,
77 resolve directly, 22 by display name, and **60 have no icon at all** — including Slack, OpenAI,
AWS, Heroku, Twilio and Java. Two nodes in five use the category fallback, so the fallback must look
deliberate rather than like a missing image.

**Never a secret.** Catalogus stores no credentials, keys, tokens or passwords anywhere; the schema
rejects private-looking keys on write. This is absolute and predates everything else here.

**Ask, never guess.** Where a fact is not in the repo, the CLI asks or records nothing and names the
command that fills the gap. An absent field reads as "not answered yet"; a filled one reads as an
answer. Four of the six defects in the 3.6.1 pass were a plausible default written in place of a
question.

## Brand Commitments

- **Name:** Catalogus. `catalogus.dev` is registered and owned, and is load-bearing — the schema
  `$id` and the `$schema` modeline the CLI writes into every manifest both point at it.
- **Logo:** open, and **deferred by the owner on 2026-08-25** -- "the logo is something I need to
  think on my time". Nothing is drawn; `apps/web/src/components/BrandMark.tsx` renders the wordmark
  alone and marks itself `data-mark="placeholder"` in the DOM, with a test pinning that.

  Three directions were explored and none chosen. They are recorded because each one narrowed the
  brief, and re-running them would cost a day:

  1. **Abstract precision instruments** -- registration marks, a caliper, an engraved theodolite
     plate. Rejected as **"too simple"**, then, after two rounds of adding density, rejected again.
     The lesson, and it is the useful one: "too simple" did **not** mean "too few elements". The
     owner's own reference images are *simpler* than the marks they rejected -- one is four shapes.
     What was missing was **warmth and recognisability**. Two rounds were spent solving the wrong
     problem.
  2. **Coffee and catalog** -- a cup whose interior holds a short list, from the owner's reference
     images. The direction was liked; the execution was judged **"not unique"**, correctly: an
     outlined cup with rules in it is close to a stock icon. Variants that pushed for
     distinctiveness (the list forming the cup's wall, a rule that becomes the handle) each traded
     legibility at 16px for it.
  3. **The board's own tiles**, proposed by the owner -- "this is our distinct mark". The strongest
     of the three, because the mosaic is a shape the product already owns. It converged on two
     module bars and a tile arranged as a **C**: the app's grammar forming the initial, holding down
     to 16px. Deferred with the rest.

  Settled along the way and still standing: **ink only**, because `#d40010` is a signal colour in
  the data and spending it on the brand costs it that meaning; a **primary mark plus a derived
  reduced variant**, rather than one asset constrained by the favicon; and the drawing style of the
  owner's references -- uniform stroke weight, rounded caps, no fill, warm charcoal on cream.

  **A candidate was deleted rather than left in place**, and that is deliberate. One had been drawn,
  tested, wired into the header and given a favicon before the deferral. Keeping it "for now" is
  exactly how a mark nobody chose becomes the mark, which is principle 3 applied to the product's
  own identity.

- **Quality bar, set by the owner:** Confluence and Notion. Named as competitors on craft, not as
  visual references to copy.
- **Temperature: warm.** Owner decision, 2026-08-25. Asked whether the brand should follow the app's
  committed bright-white world or the app should follow the warm cream of the brand references, the
  owner chose **the app follows the brand**. The viewer's ground is `#f4f1ea` and its ink `#24211c`.
  This revised a direction the owner had previously pinned; `apps/web/docs/DIRECTION.md` carries the
  revision and `apps/web/src/tokens.css` carries the computed contrast for every pair.

## Evidence on Hand

- `examples/reference.catalogus.yaml` — 14 entries, synthetic on purpose (CLAUDE.md: a real example
  would publish a real project's whole topology in a public repo).
- `examples/layout-stress.catalogus.yaml` — 35 services, 48 edges, an 18-edge fan-out hub. Synthetic,
  written for layout.
- `C:/Workspace/repos/Clapline/catalogus.yaml` — **the only real manifest**, 35 services, 41 edges,
  validating clean. It is not in this repo and must not be copied into it.
- **The owner has run the viewer against it once**, on 2026-08-25, and the verdict was "too poor and
  generic". That is the entire body of first-hand user feedback that exists.
- **No page content exists anywhere.** The Stripe tax-registration table the owner described is an
  illustration of the shape wanted, not a file that can be rendered. Nothing may be fabricated to
  stand in for it.
- No screenshots, no usability testing, no users other than the owner.

## Product Principles

1. **The manifest is the skeleton; the page is the product.** A service is a destination you navigate
   into and read, not a row with a detail panel. Anything that makes a service feel like a record
   rather than a document is working against the thing.
2. **Reading is the job; editing is a capability.** All three named jobs are reading jobs — nobody's
   job is "edit". Notion is an editor that happens to render, and organising this UI the same way
   produces a worse Notion. Organise it around reading, and let editing live quietly inside a page.
   The moat is on the other side of that line: **Notion cannot draw the topology and never will.**
3. **Absent beats plausible.** A missing fact is shown as missing, with the command that fills it.
   Never a confident-looking default.
4. **Never a secret.** Non-negotiable, and it governs the open decisions below.
5. **Legible to someone who did not build the system.** Two of the three named jobs are a person
   meeting a project cold. Internal shorthand that only the owner can decode is a defect.

## Accessibility & Inclusion

No product-specific requirement has been established with a user. The repo's existing practice is to
compute contrast for every foreground/background pair and hold AA (the migration board's worst case
is 5.35:1), to keep focus visible and restored, and never to carry meaning in colour alone — a
selected node is 3px against 1px precisely because that survives greyscale. Treat this as the working
floor. **Nothing has been heard on an actual screen reader**, and the repo says so rather than
implying otherwise.

## Open Decisions

Recorded rather than invented, per the project's own standing rule.

**Settled on 2026-08-25**, and listed here because they were open earlier the same day:

- **Where page content lives:** Layer 3, edited in the browser. Not the repo, not `catalogus.yaml`.
  See Product Purpose above for the reasoning and the three accepted costs.
- **How sensitive page content is:** the storage decision answers it. Layer 3 is private, per-user
  and behind auth, so page content is never committed and never inherits a repo's visibility. The
  "no secrets" rule is unaffected and still absolute — Layer 3 holds cost and account *references*,
  never credentials.
- **Page scope:** per project + service. Vendor-general knowledge repeats across projects rather than
  being inherited from a shared catalog. HANDOFF §4.1's eventual global catalog may revisit this; it
  does not today.

**Still open:**

- **Two writers on one page.** The owner editing in the browser and the MCP server writing the same
  page. Notion's answer is block-level real-time sync, which is a large commitment; cheaper answers
  are version history with last-write-wins, or the agent writes a draft the owner approves. Named
  and deliberately not solved. It does not block the redesign.
- **What a page is made of.** No page content exists anywhere yet. The Stripe tax table was described
  verbally as an illustration of the shape wanted, and nothing may be fabricated to stand in for it.
  Whether pages are free prose, or structured sections the agent can target, is undecided — and it
  matters for the MCP write path more than for the design.
