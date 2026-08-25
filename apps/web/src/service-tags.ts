// Which tags a service earns, decided once, here, away from any component.
//
// The rule this file exists to enforce: **`active` earns no tag.** The
// previous viewer rendered a status pill on every entry, which meant a real
// manifest showed thirty-five pills, thirty-one of them saying "active" --
// so the four that said anything else were the hardest things on screen to
// notice. Tagging the norm spends the reader's attention on the norm. Only
// departures get a mark, which is what makes a mark worth looking at.
//
// The tag *styles* are borrowed wholesale from the world this viewer is
// built in (see the direction contract in App.tsx): solid signal, outline
// signal, solid ink, solid grey. Four weights, no more, and no traffic-light
// ramp -- meaning has to survive greyscale, which a green/amber/red status
// colour never did.
import type { ViewService } from "@catalogus/cli";

export type TagTone = "signal-solid" | "signal-outline" | "ink-solid" | "grey-solid" | "quiet-outline";

export interface Tag {
  /** Stable key for React, and what a test names. Never shown. */
  id: string;
  /** Shown, in caps, by the component. Kept short: this sits in a 13px row. */
  label: string;
  tone: TagTone;
  /** Long-form, surfaced as the tag's title so a mark is never the only explanation. */
  title: string;
}

/**
 * How recent counts as recent. Thirty days is a choice, not a derived fact,
 * and it is the kind of number this project's standing rule says to be
 * explicit about rather than bury: it is here, named, in one place, so
 * changing it is one edit and reading it takes no archaeology.
 *
 * It answers HANDOFF §4.2's query 5 ("everything added in the last N days"),
 * which docs/PLAN.md had recorded as unbuilt and blocked on nothing. It is
 * answered as a *mark on the thing* rather than as a filter, because the
 * owner's chosen structure has no search or filter affordance at all.
 */
export const RECENT_WINDOW_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * True when `added` falls within the recency window ending at `readAt`.
 *
 * Both arguments come from the payload -- `readAt` is stamped server-side at
 * the moment the manifest was read (view-payload.ts) -- so this never calls
 * `Date.now()`. That keeps it a pure function of its inputs, which is what
 * lets a test assert on it without freezing a clock, and it also means the
 * page agrees with itself: every "new" mark on the screen is measured from
 * the same instant rather than from whenever each row happened to render.
 *
 * Returns false rather than throwing on anything unparseable. `added` is a
 * schema-validated date, so an invalid one should not reach here; if it
 * does, the honest rendering is no mark at all, because a wrong mark is
 * worse than a missing one.
 */
export function isRecentlyAdded(added: string | undefined, readAt: string, windowDays = RECENT_WINDOW_DAYS): boolean {
  if (added === undefined) return false;

  const addedMs = Date.parse(added);
  const readMs = Date.parse(readAt);
  if (Number.isNaN(addedMs) || Number.isNaN(readMs)) return false;

  const elapsedDays = (readMs - addedMs) / MS_PER_DAY;
  // Future-dated entries are not "new" -- they are wrong, and this is not the
  // place that reports it. `catalogus validate` owns that judgement.
  return elapsedDays >= 0 && elapsedDays <= windowDays;
}

/**
 * Status tag, or null for `active`.
 *
 * A Map rather than a keyed object literal: `status` is manifest-derived,
 * and this repo has produced the Object.prototype defect five times now
 * (see StatusPill.tsx's header for the full account). A Map has no
 * prototype chain to fall through, so an absent key is absent.
 */
const STATUS_TAGS = new Map<string, Tag>([
  [
    "phasing_out",
    {
      id: "phasing_out",
      label: "phasing out",
      tone: "signal-outline",
      title: "Being replaced. The replacement is named beside it where the manifest declares one.",
    },
  ],
  [
    "deprecated",
    {
      id: "deprecated",
      label: "deprecated",
      tone: "ink-solid",
      title: "Should not be used. Still present in the project.",
    },
  ],
  [
    "removed",
    {
      id: "removed",
      label: "removed",
      tone: "grey-solid",
      title: "No longer part of the project. Kept for the record.",
    },
  ],
]);

/**
 * Every tag a service earns, in render order.
 *
 * Order is deliberate and fixed: status first (the thing most likely to
 * change what a reader does), then recency, then kind. A row rarely earns
 * more than one.
 *
 * `kind` earns a quiet outline tag on `component` and `stack` but nothing on
 * `service`, for the same reason `active` earns nothing: a vendor is the
 * common case, and marking the common case is noise. This is the distinction
 * HANDOFF's 2026-08-23 amendment introduced -- a component has no invoice
 * and a stack is what the code is written in -- and it is worth seeing,
 * because only `service` rows can ever carry a Layer 3 cost.
 */
export function tagsFor(service: ViewService, readAt: string): Tag[] {
  const tags: Tag[] = [];

  const statusTag = STATUS_TAGS.get(service.status);
  if (statusTag) tags.push(statusTag);

  if (isRecentlyAdded(service.added, readAt)) {
    tags.push({
      id: "new",
      label: "new",
      tone: "signal-outline",
      title: `Added in the last ${RECENT_WINDOW_DAYS} days (${service.added}).`,
    });
  }

  if (service.kind === "component") {
    tags.push({
      id: "component",
      label: "component",
      tone: "quiet-outline",
      title: "Infrastructure run by this project rather than a vendor. No invoice, so no cost can attach to it.",
    });
  }

  if (service.kind === "stack") {
    tags.push({
      id: "stack",
      label: service.version ? `stack ${service.version}` : "stack",
      tone: "quiet-outline",
      title: "What the code is written in or runs inside, rather than a service that can be down.",
    });
  }

  return tags;
}
