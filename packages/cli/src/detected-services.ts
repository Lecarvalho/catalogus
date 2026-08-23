// Turns a raw DetectionResult (from @dagstree/core) into the shapes the CLI
// actually renders: everything (for `dagstree detect`'s full Layer 1 report
// and `dagstree diff`'s staleness check) and just the catalog-known subset
// worth offering as manifest service candidates (for `dagstree diff`'s
// missing-service check and `dagstree init --yes`).
import type {
  ConfigServiceDetection,
  DetectedTechnology,
  DetectionResult,
  Evidence,
  HostingDetection,
} from "@dagstree/core";

export interface DetectedServiceCandidate {
  slug: string;
  category: string;
  name: string;
  evidence: Evidence[];
}

/** True when `e` is already present in `existing` (same file and same detail). */
function hasEvidence(existing: readonly Evidence[], e: Evidence): boolean {
  return existing.some((prev) => prev.file === e.file && prev.detail === e.detail);
}

/**
 * Appends `incoming` onto `target` in place, skipping anything already
 * present. The same evidence legitimately reaches a slug's entry twice --
 * @dagstree/core's own hosting merge already folds a stack-analyser
 * "hosting" detection into the Dagstree-detector HostingDetection for the
 * same provider (see core's mergeHosting), and this module's own merge
 * below then folds `technologies` on top of that -- so without this check a
 * single file like fly.toml ends up listed two or three times over.
 */
function mergeEvidence(target: Evidence[], incoming: readonly Evidence[]): void {
  for (const e of incoming) {
    if (!hasEvidence(target, e)) {
      target.push(e);
    }
  }
}

function mergeBySlug(
  technologies: readonly DetectedTechnology[],
  hosting: readonly HostingDetection[],
  configServices: readonly ConfigServiceDetection[],
  includeUnmapped: boolean
): Map<string, DetectedServiceCandidate> {
  const bySlug = new Map<string, DetectedServiceCandidate>();

  for (const tech of technologies) {
    if (tech.unmapped && !includeUnmapped) {
      continue;
    }
    const existing = bySlug.get(tech.slug);
    if (existing) {
      mergeEvidence(existing.evidence, tech.evidence);
    } else {
      const evidence: Evidence[] = [];
      mergeEvidence(evidence, tech.evidence);
      bySlug.set(tech.slug, { slug: tech.slug, category: tech.category, name: tech.name, evidence });
    }
  }

  for (const host of hosting) {
    const existing = bySlug.get(host.slug);
    if (existing) {
      mergeEvidence(existing.evidence, host.evidence);
    } else {
      const evidence: Evidence[] = [];
      mergeEvidence(evidence, host.evidence);
      bySlug.set(host.slug, { slug: host.slug, category: "hosting", name: host.name, evidence });
    }
  }

  // Config-key detections are catalog-known by construction (an
  // unrecognised key name is never emitted), so they belong in both the
  // filtered and unfiltered views. They arrive last so that a provider
  // stack-analyser also found keeps that detector's category and display
  // name, rather than having the answer depend on which detector happened
  // to run first.
  for (const service of configServices) {
    const existing = bySlug.get(service.slug);
    if (existing) {
      mergeEvidence(existing.evidence, service.evidence);
    } else {
      const evidence: Evidence[] = [];
      mergeEvidence(evidence, service.evidence);
      bySlug.set(service.slug, {
        slug: service.slug,
        category: service.category,
        name: service.name,
        evidence,
      });
    }
  }

  return bySlug;
}

/**
 * The subset of detect()'s output worth offering as manifest service
 * candidates: catalog-known (`unmapped: false`) technologies, plus every
 * Dagstree-specific hosting detection (config-file based; HostingDetection
 * carries no `unmapped` flag because it's never a raw pass-through).
 * Deliberately excludes unmapped technologies -- HANDOFF.md's example
 * manifest (section 5) lists actual providers and infrastructure, not every
 * entry in package.json, and offering hundreds of language/library
 * detections here would make `diff`'s missing-service list and `init --yes`
 * unusable. Used for diff's "detected but missing" direction and init
 * --yes; diff's staleness check and `detect` itself use
 * collectAllDetectedServices/groupAllDetections below, since neither a full
 * Layer 1 report nor "is this really gone" should hide anything.
 */
export function collectDetectedServices(result: DetectionResult): DetectedServiceCandidate[] {
  const bySlug = mergeBySlug(result.technologies, result.hosting, result.configServices, false);
  return [...bySlug.values()].sort((a, b) => a.category.localeCompare(b.category) || a.slug.localeCompare(b.slug));
}

/**
 * Every technology detect() found -- mapped or not -- merged with the
 * hosting list by slug so a provider caught by both isn't shown twice. Flat
 * (not grouped by category); see groupAllDetections below for `detect`'s
 * own grouped report, and collectDetectedServices above for the
 * catalog-known-only subset. `dagstree diff` uses this for its staleness
 * check specifically because a manifest entry can name an unmapped
 * technology's own slug (declared by hand, or by a stale `init --yes`
 * scaffold from before a mapping.ts entry existed for it) -- comparing
 * against the filtered set would flag it stale on every run even though
 * detection still finds it.
 */
export function collectAllDetectedServices(result: DetectionResult): DetectedServiceCandidate[] {
  const bySlug = mergeBySlug(result.technologies, result.hosting, result.configServices, true);
  return [...bySlug.values()].sort((a, b) => a.category.localeCompare(b.category) || a.slug.localeCompare(b.slug));
}

/**
 * groupAllDetections's flat detections, grouped by category and sorted
 * within each group. This is `dagstree detect`'s full report.
 */
export function groupAllDetections(result: DetectionResult): Map<string, DetectedServiceCandidate[]> {
  const grouped = new Map<string, DetectedServiceCandidate[]>();
  for (const entry of collectAllDetectedServices(result)) {
    const list = grouped.get(entry.category) ?? [];
    list.push(entry);
    grouped.set(entry.category, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.slug.localeCompare(b.slug));
  }
  return grouped;
}
