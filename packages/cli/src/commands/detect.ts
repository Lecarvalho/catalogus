// `dagstree detect` -- runs the Layer 1 scan and prints the detected stack
// grouped by category, with the evidence file for each detection. --json
// emits the raw DetectionResult (already JSON-clean, see @dagstree/core's
// own round-trip test) for machine consumption.
//
// Text output leads with services and collapses libraries under a one-line
// count rather than listing them: a real project's package.json routinely
// names ten or twenty libraries (React, TypeScript, Tailwind, ESLint, ...)
// for every one or two actual services, so an undifferentiated category
// dump buries the thing this command exists to surface -- see PLAN.md's
// dogfooding notes, "detect output buries services among the libraries".
// The governing test for the split (@dagstree/core's DetectionKind) is the
// plan's own: a service is something that can have an outage and send an
// invoice. `--all` prints the full library list inline for anyone who
// wants it; `--json` always carries every detection regardless, kind
// included, because it's the machine-readable surface and nothing here
// should ever make it less complete than the underlying DetectionResult.
import { detect } from "@dagstree/core";

import type { DetectedServiceCandidate } from "../detected-services.js";
import { groupAllDetections } from "../detected-services.js";
import { resolveTargetPath } from "../paths.js";
import type { CommandResult } from "../types.js";
import { errorMessage } from "../types.js";

export interface DetectCommandOptions {
  json?: boolean;
  /**
   * Print every library-kind detection inline instead of collapsing them
   * under a one-line count. Off by default -- see the module header for why.
   */
  all?: boolean;
}

/**
 * The distinct files behind a detection, in the order they were proved.
 * Distinct because evidence is per-signal, not per-file: the config-key
 * detector emits one record per matching key, so a settings file naming
 * four Grafana variables would otherwise print its own path four times on
 * one line. `--json` still carries every individual record, key names
 * included.
 */
function evidenceSuffix(evidence: ReadonlyArray<{ file: string }>): string {
  const files = [...new Set(evidence.map((e) => e.file))].join(", ");
  return files ? ` - ${files}` : "";
}

export async function runDetect(pathArg: string | undefined, options: DetectCommandOptions = {}): Promise<CommandResult> {
  const targetDir = resolveTargetPath(pathArg);

  let result;
  try {
    result = await detect(targetDir);
  } catch (error) {
    return { exitCode: 2, stdout: [], stderr: [errorMessage(error)] };
  }

  if (options.json) {
    return { exitCode: 0, stdout: [JSON.stringify(result, null, 2)], stderr: [] };
  }

  const lines: string[] = [];
  lines.push(`Detected stack for ${result.repoPath}`);
  lines.push("");

  const grouped = groupAllDetections(result);
  const categories = [...grouped.keys()].sort();

  const libraries: DetectedServiceCandidate[] = [];
  let sawService = false;

  for (const category of categories) {
    const entries = grouped.get(category) ?? [];
    // Everything that is not a library leads: services, the components the
    // project runs itself, and the stack it is written in are all nodes
    // someone has to decide about. Filtering to kind === "service" here
    // used to drop the other two out of *both* lists -- neither led nor
    // counted among the libraries -- so a detected component was invisible.
    const nodes = entries.filter((e) => e.kind !== "library");
    for (const entry of entries) {
      if (entry.kind === "library") {
        libraries.push(entry);
      }
    }
    if (nodes.length === 0) {
      continue;
    }
    sawService = true;
    lines.push(`${category}:`);
    for (const entry of nodes) {
      const kindSuffix = entry.kind === "service" ? "" : ` [${entry.kind}]`;
      lines.push(`  ${entry.slug} (${entry.name})${kindSuffix}${evidenceSuffix(entry.evidence)}`);
    }
    lines.push("");
  }

  if (!sawService) {
    lines.push("(no services detected)");
    lines.push("");
  }

  if (libraries.length > 0) {
    libraries.sort((a, b) => a.slug.localeCompare(b.slug));
    if (options.all) {
      lines.push(`libraries (${libraries.length}):`);
      for (const entry of libraries) {
        lines.push(`  ${entry.slug} (${entry.name}) [${entry.category}]${evidenceSuffix(entry.evidence)}`);
      }
    } else {
      lines.push(
        `libraries: ${libraries.length} detected, not shown -- linters, test runners and build tooling, none of which is a node; rerun with --all to list them`
      );
    }
    lines.push("");
  }

  if (result.codingAgents.length > 0) {
    lines.push("coding agents:");
    for (const agent of result.codingAgents) {
      lines.push(`  ${agent.agent} (${agent.name})${evidenceSuffix(agent.evidence)}`);
    }
    lines.push("");
  }

  if (result.mcpServers.length > 0) {
    lines.push("mcp servers:");
    for (const server of result.mcpServers) {
      lines.push(`  ${server.name}${evidenceSuffix(server.evidence)}`);
    }
    lines.push("");
  }

  if (result.vcs) {
    lines.push(`vcs: ${result.vcs.provider}${evidenceSuffix(result.vcs.evidence)}`);
  }
  if (result.ci) {
    lines.push(`ci: ${result.ci.provider}${evidenceSuffix(result.ci.evidence)}`);
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("warnings:");
    for (const warning of result.warnings) {
      lines.push(`  ${warning}`);
    }
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return { exitCode: 0, stdout: lines, stderr: [] };
}
