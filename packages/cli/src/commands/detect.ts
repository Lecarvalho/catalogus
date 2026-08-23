// `dagstree detect` -- runs the Layer 1 scan and prints the detected stack
// grouped by category, with the evidence file for each detection. --json
// emits the raw DetectionResult (already JSON-clean, see @dagstree/core's
// own round-trip test) for machine consumption.
import { detect } from "@dagstree/core";

import { groupAllDetections } from "../detected-services.js";
import { resolveTargetPath } from "../paths.js";
import type { CommandResult } from "../types.js";
import { errorMessage } from "../types.js";

export interface DetectCommandOptions {
  json?: boolean;
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

  if (categories.length === 0) {
    lines.push("(no technologies detected)");
  }
  for (const category of categories) {
    lines.push(`${category}:`);
    for (const entry of grouped.get(category) ?? []) {
      lines.push(`  ${entry.slug} (${entry.name})${evidenceSuffix(entry.evidence)}`);
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
