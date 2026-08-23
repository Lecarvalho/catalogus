// `dagstree diff` -- compares detection output against the manifest and
// reports both directions: detected but missing from the manifest, and
// declared in the manifest but no longer detected. The second direction is
// how a stale manifest gets noticed, so it's not optional/secondary here.
//
// The two directions deliberately compare against different detection sets.
// "Detected but missing" uses collectDetectedServices' catalog-known
// subset -- offering every unmapped pass-through technology as a candidate
// to add would make this list unusable (same reasoning as init --yes).
// "Declared but no longer detected" uses collectAllDetectedServices
// instead, unmapped technologies included -- a manifest entry can legally
// name an unmapped slug (declared by hand, or by an old `init --yes`
// scaffold predating a mapping.ts entry for it), and comparing that
// direction against the filtered set would flag it stale on every run even
// though detection still finds it.
//
// Some manifest entries are legitimately undetectable by design (HANDOFF.md
// section 6, "Known ceiling": a domain registrar, a PM tool -- Layers 2/3
// facts that leave no trace in a repo scan). What makes an entry
// undetectable isn't its *role* -- a role is free text (`dependencyEdge`'s
// $ref: slug on serviceEntry.role has no fixed vocabulary), so exempting on
// role: dns/pm alone let a detectable service dodge the check under an
// unlisted role word (role: registrar) or wrongly exempted a genuinely
// stale entry that happened to use "dns"/"pm" (role: dns on a *mapped,
// detectable* provider like cloudflare). What actually determines
// detectability is the *slug*: @dagstree/core's SPECFY_TO_DAGSTREE is the
// complete, closed set of Dagstree slugs any scan can ever produce (every
// mapped technology, and every Dagstree-specific hosting detector's own
// slug -- see mapping.ts's own comment; core/src/detectors/hosting.ts's
// output slugs are already a subset of it). A declared slug outside that
// set can never come back from detect() -- mapped or as an unmapped
// pass-through, since pass-through slugs are derived from stack-analyser's
// own tech keys, which have no notion of a DNS registrar or a PM tool at
// all -- so it's undetectable by design, not stale.
import { detect, SPECFY_TO_DAGSTREE } from "@dagstree/core";

import { collectAllDetectedServices, collectDetectedServices } from "../detected-services.js";
import type { DetectedServiceCandidate } from "../detected-services.js";
import { loadValidManifest } from "../load-manifest.js";
import { resolveTargetPath } from "../paths.js";
import type { CommandResult } from "../types.js";
import { errorMessage } from "../types.js";

const REACHABLE_SLUGS = new Set(Object.values(SPECFY_TO_DAGSTREE).map((entry) => entry.slug));

function isUndetectableByDesign(slug: string): boolean {
  return !REACHABLE_SLUGS.has(slug);
}

export interface DiffCommandOptions {
  json?: boolean;
}

export async function runDiff(pathArg: string | undefined, options: DiffCommandOptions = {}): Promise<CommandResult> {
  const targetDir = resolveTargetPath(pathArg);

  const loaded = await loadValidManifest(targetDir);
  if (!loaded.ok) {
    return loaded.error;
  }
  const { location, manifest } = loaded.value;

  let detection;
  try {
    detection = await detect(location.dir);
  } catch (error) {
    return { exitCode: 2, stdout: [], stderr: [errorMessage(error)] };
  }

  const missingCandidates = collectDetectedServices(detection);
  const allDetectedSlugs = new Set(collectAllDetectedServices(detection).map((d) => d.slug));
  const declaredSlugs = new Set(manifest.services.map((s) => s.service));

  const missingServices = missingCandidates.filter((d) => !declaredSlugs.has(d.slug));
  const staleServices = manifest.services.filter(
    (s) => !allDetectedSlugs.has(s.service) && !isUndetectableByDesign(s.service)
  );

  const declaredAgents = new Set(manifest.project.coding_agents ?? []);
  const detectedAgentIds = new Set(detection.codingAgents.map((a) => a.agent));
  const missingAgents = detection.codingAgents.filter((a) => !declaredAgents.has(a.agent));
  const staleAgents = [...declaredAgents].filter((a) => !detectedAgentIds.has(a));

  const hasDiff =
    missingServices.length > 0 || staleServices.length > 0 || missingAgents.length > 0 || staleAgents.length > 0;

  if (options.json) {
    const payload = {
      manifestPath: location.filePath,
      missingServices,
      staleServices: staleServices.map((s) => ({ id: s.id, service: s.service, role: s.role })),
      missingCodingAgents: missingAgents,
      staleCodingAgents: staleAgents,
    };
    return { exitCode: hasDiff ? 1 : 0, stdout: [JSON.stringify(payload, null, 2)], stderr: [] };
  }

  const lines: string[] = [];
  lines.push(`Diff for ${location.filePath}`);
  lines.push("");

  lines.push("Detected but missing from the manifest:");
  pushServiceLines(lines, missingServices, "+");
  lines.push("");

  lines.push("Declared in the manifest but no longer detected:");
  if (staleServices.length === 0) {
    lines.push("  (none)");
  } else {
    for (const s of staleServices) {
      lines.push(`  - ${s.id} (service: ${s.service}, role: ${s.role})`);
    }
  }
  lines.push("");

  if (missingAgents.length > 0 || staleAgents.length > 0) {
    lines.push("Coding agents detected but not declared in project.coding_agents:");
    if (missingAgents.length === 0) {
      lines.push("  (none)");
    } else {
      for (const agent of missingAgents) {
        lines.push(`  + ${agent.agent} (${agent.name})`);
      }
    }
    lines.push("");

    lines.push("Coding agents declared but no longer detected:");
    if (staleAgents.length === 0) {
      lines.push("  (none)");
    } else {
      for (const agent of staleAgents) {
        lines.push(`  - ${agent}`);
      }
    }
    lines.push("");
  }

  if (!hasDiff) {
    lines.push(`${location.filePath} matches the detected stack.`);
  }

  return { exitCode: hasDiff ? 1 : 0, stdout: lines, stderr: [] };
}

// Same lead-with-services treatment as `dagstree detect` (see that module's
// header): collectDetectedServices already excludes most library noise by
// only offering catalog-known slugs, but a handful of known rows are
// libraries worth cataloging by name (mcp, lucide-icons) rather than by
// role, and those would otherwise sit in this list looking exactly like a
// missed service. No --all here -- `--json` already carries the full,
// kind-tagged list, and this direction rarely has enough library-kind
// entries to be worth a second flag on top of the one `detect` already has.
function pushServiceLines(lines: string[], services: readonly DetectedServiceCandidate[], marker: string): void {
  const primary = services.filter((s) => s.kind !== "library");
  const libraries = services.filter((s) => s.kind === "library");

  if (primary.length === 0 && libraries.length === 0) {
    lines.push("  (none)");
    return;
  }
  for (const s of primary) {
    // Distinct files: evidence is per-signal, so one settings file naming
    // several of a provider's keys contributes several records for it.
    const files = [...new Set(s.evidence.map((e) => e.file))].join(", ");
    lines.push(`  ${marker} ${s.slug} (${s.name}) [${s.category}]${files ? ` - ${files}` : ""}`);
  }
  if (libraries.length > 0) {
    const noun = libraries.length === 1 ? "library" : "libraries";
    lines.push(`  ${marker} ${libraries.length} ${noun} also detected but not declared -- see --json for the list`);
  }
}
