// `dagstree diff` -- compares detection output against the manifest and
// reports both directions: detected but missing from the manifest, and
// declared in the manifest but not visible to detection. The second
// direction is how a stale manifest gets noticed, so it's not
// optional/secondary here.
//
// That second direction used to be headed "declared in the manifest but no
// longer detected", which reads as a delete list and was acted on as one.
// Measured: on a `git clone` of a real .NET repo it named five services --
// the database, the auth provider, object storage among them -- every one
// of which was real and still in use, and invisible only because the files
// configuring them (`appsettings.Development.json`, `.env.local`) are
// gitignored and therefore absent from that checkout. "No longer detected"
// is a claim about the world; what this command actually knows is a claim
// about one checkout, and the heading now says which.
//
// Where a reason is knowable it is named rather than left to the reader:
// an entry the manifest itself marks deprecated/phasing_out/removed is
// *expected* to fade from detection, and detection's own warnings (a
// settings file that exists but would not parse) are the difference
// between "nothing is configured here" and "something could not be read".
//
// The two directions deliberately compare against different detection sets.
// "Detected but missing" uses collectDetectedServices' catalog-known
// subset -- offering every unmapped pass-through technology as a candidate
// to add would make this list unusable (same reasoning as init --yes).
// "Declared but not visible" uses collectAllDetectedServices
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
  const notDetectedServices = manifest.services.filter(
    (s) => !allDetectedSlugs.has(s.service) && !isUndetectableByDesign(s.service)
  );

  const declaredAgents = new Set(manifest.project.coding_agents ?? []);
  const detectedAgentIds = new Set(detection.codingAgents.map((a) => a.agent));
  const missingAgents = detection.codingAgents.filter((a) => !declaredAgents.has(a.agent));
  const staleAgents = [...declaredAgents].filter((a) => !detectedAgentIds.has(a));

  // AGENTS.md / .agents/ prove an agent works here without naming it. Worth
  // raising only when nothing else answered the question: alongside a
  // declared list it says nothing new, and alongside a detected one it is
  // already covered by the specific markers.
  const unidentifiedAgents =
    declaredAgents.size === 0 && detectedAgentIds.size === 0 ? detection.unidentifiedCodingAgents : [];

  const hasDiff =
    missingServices.length > 0 || notDetectedServices.length > 0 || missingAgents.length > 0 || staleAgents.length > 0;

  if (options.json) {
    const payload = {
      manifestPath: location.filePath,
      missingServices,
      // Named for what it is rather than for what it looks like. A key
      // called `staleServices` -- which this was -- makes the same wrong claim to a program
      // that the old heading made to a person, and a program acting on
      // "stale" deletes. `status` rides along because it is the one reason
      // for absence the manifest already knows.
      notDetectedServices: notDetectedServices.map((s) => ({
        id: s.id,
        service: s.service,
        role: s.role,
        status: s.status ?? "active",
      })),
      detectionWarnings: detection.warnings,
      unidentifiedCodingAgents: unidentifiedAgents,
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

  lines.push("Declared in the manifest but not visible to detection here:");
  if (notDetectedServices.length === 0) {
    lines.push("  (none)");
  } else {
    for (const s of notDetectedServices) {
      const status = s.status ?? "active";
      // An entry the manifest itself says is on the way out is *supposed*
      // to stop showing up. Saying so inline is the difference between a
      // line that needs investigating and one that confirms the record.
      const because = status === "active" ? "" : ` -- marked ${status}, so this is expected`;
      lines.push(`  - ${s.id} (service: ${s.service}, role: ${s.role})${because}`);
    }
    lines.push("");
    lines.push("  Not a delete list. Detection reports what this checkout shows, not what is true:");
    lines.push("  a service configured in a gitignored file or wired in a web console looks exactly");
    lines.push("  like one that was removed. Confirm with the owner before \"dagstree remove\".");
  }
  lines.push("");

  // The difference between "detection found nothing here" and "detection
  // could not read something here" is exactly the reason an entry above may
  // be missing, and it was previously dropped on the floor.
  if (detection.warnings.length > 0) {
    lines.push("Detection could not read everything in this checkout:");
    for (const warning of detection.warnings) {
      lines.push(`  ! ${warning}`);
    }
    lines.push("");
  }

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

  if (unidentifiedAgents.length > 0) {
    const files = [...new Set(unidentifiedAgents.map((e) => e.file))].join(", ");
    lines.push("Coding agent in use but not identified:");
    lines.push(`  ${files} says an agent works in this repo without naming which one.`);
    lines.push("  Ask the owner, then: dagstree set project.coding_agents <agent>[,<agent>]");
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
    // Printed as the flag rather than as prose, and only when it isn't the
    // default -- the line stays short for the vendor rows that are most of
    // this list, and where it does appear it can be copied straight into
    // `dagstree add nginx --kind component --role ingress-proxy`.
    const kindFlag = s.kind === "service" ? "" : ` --kind ${s.kind}`;
    lines.push(`  ${marker} ${s.slug} (${s.name}) [${s.category}]${kindFlag}${files ? ` - ${files}` : ""}`);
  }
  if (libraries.length > 0) {
    const noun = libraries.length === 1 ? "library" : "libraries";
    lines.push(`  ${marker} ${libraries.length} ${noun} also detected but not declared -- see --json for the list`);
  }
}
