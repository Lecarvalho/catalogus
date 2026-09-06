# Phase 7 — Viewer, backed by the platform

> Split out of `docs/PLAN.md` on 2026-09-05, content verbatim. `docs/PLAN.md` is the index and the
> only place status is summarised; this file is the record. Section headings are unchanged so a
> code comment that names one still finds it by grep.

## Phase 7 — Viewer, backed by the platform ⬜

Everything below needs Layer 3 and cross-user data, so it waits on Phase 4.

**Read four of these as "backed by the platform", not as unbuilt.** The app, the DAG, the status
colours and the migration dashboard all exist as of Phase 3.7 and read manifests directly; what
Phase 7 adds is the store behind them. They are listed again here because the data path is the
whole difference. (This said "the first three" until 2026-08-25, when the migration dashboard
shipped and made it wrong — the same drift the fixture paragraph above records, and worth the
same correction rather than a quiet edit.)

- [ ] React + Vite app
- [ ] Per-project DAG: elkjs layout, React Flow render, `simple-icons` brand icons
- [ ] Status colours — active, `phasing_out`, deprecated — and `replaced_by` targets shown
- [ ] Project list and portfolio page with cost totals (private layer, owner only)
- [ ] Migration dashboard: everything `phasing_out` with its replacement
- [ ] Cross-project blast radius view
- [ ] Acceptance: all six HANDOFF §4.2 queries answerable from the UI — **two of six today**, and
      the per-query status is in Phase 3.7's "HANDOFF §4.2 at the close of Phase 3.7" box rather
      than left for a reader to re-derive.

`simple-icons` has removed brand marks before under trademark pressure, so the generic
category-icon fallback needs to exist from the start rather than being bolted on the first time a
slug disappears.

---

