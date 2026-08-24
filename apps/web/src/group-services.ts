// Pure grouping logic, kept out of any component so it's testable without
// jsdom or React at all. Groups services by `rollup` (the segment of `role`
// before the first "-" -- see @catalogus/cli's view-payload.ts, which
// already computed it server-side; this module never re-derives it from
// `role`) -- docs/PLAN.md's Phase 3.7 rendering rule.
import type { ViewService } from "@catalogus/cli";

export interface ServiceGroupData {
  rollup: string;
  services: ViewService[];
}

/** Ordinal compare (plain `<`), not a locale-aware collation -- matches the sort @catalogus/cli's workspace-scan.ts already uses, for the same reason: stable regardless of the host's ICU data. */
function ordinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Groups by rollup, groups ordinal-sorted by rollup name, entries
 * ordinal-sorted by `id` within each group. Sorting on `id` rather than on
 * `role` or `name`: it's the one field guaranteed unique within a manifest
 * (@catalogus/schema enforces it), so the order is stable and reproducible
 * even when two entries in the same group share a role or a display name
 * (two supabase entries both rolling up to a shared group, for instance).
 */
export function groupByRollup(services: readonly ViewService[]): ServiceGroupData[] {
  const byRollup = new Map<string, ViewService[]>();
  for (const service of services) {
    const existing = byRollup.get(service.rollup);
    if (existing) {
      existing.push(service);
    } else {
      byRollup.set(service.rollup, [service]);
    }
  }

  const groups = [...byRollup.entries()].map(([rollup, list]) => ({
    rollup,
    services: [...list].sort((a, b) => ordinal(a.id, b.id)),
  }));

  groups.sort((a, b) => ordinal(a.rollup, b.rollup));
  return groups;
}
