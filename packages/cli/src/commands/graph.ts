// `dagstree graph` -- renders the project DAG. Default output is readable
// ASCII (no Unicode box-drawing, so it's legible in a plain Windows
// console); --mermaid emits a mermaid flowchart definition for pasting into
// a markdown document. Status is always shown as plain text (active /
// phasing_out -> target / deprecated / removed) so it's distinguishable
// even without colour; a Colors object built from colorSupported() below
// adds colour on top where the terminal supports it.
import { edgeEndpoints } from "@dagstree/schema";
import type { DagstreeManifestV1, ServiceEntry } from "@dagstree/schema";
import pc from "picocolors";

import { loadValidManifest } from "../load-manifest.js";
import { resolveTargetPath } from "../paths.js";
import type { CommandResult } from "../types.js";

type Colors = ReturnType<typeof pc.createColors>;

export interface GraphCommandOptions {
  mermaid?: boolean;
}

/**
 * picocolors' own auto-detection (`isColorSupported`, what the bare
 * `pc.green(...)` etc. exports use) special-cases `process.platform ===
 * "win32"` to true *before* it ever checks `stdout.isTTY` -- on the Windows
 * dev machine this repo targets, that means colour would be emitted
 * unconditionally, including into `dagstree graph . > file.txt`
 * redirection. Building our own `Colors` via `createColors` with an
 * explicit TTY check sidesteps that platform special-case; FORCE_COLOR and
 * NO_COLOR are still honoured, matching picocolors' own conventions.
 */
function colorSupported(): boolean {
  return Boolean(process.env.FORCE_COLOR) || (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
}

export async function runGraph(pathArg: string | undefined, options: GraphCommandOptions = {}): Promise<CommandResult> {
  const targetDir = resolveTargetPath(pathArg);

  const loaded = await loadValidManifest(targetDir);
  if (!loaded.ok) {
    return loaded.error;
  }
  const { manifest } = loaded.value;

  const stdout = options.mermaid ? renderMermaid(manifest) : renderAscii(manifest);
  return { exitCode: 0, stdout, stderr: [] };
}

function statusText(entry: ServiceEntry): string {
  const status = entry.status ?? "active";
  if (status === "phasing_out" && entry.replaced_by) {
    return `phasing_out -> ${entry.replaced_by}`;
  }
  return status;
}

function colorStatus(entry: ServiceEntry, color: Colors): string {
  const status = entry.status ?? "active";
  const text = statusText(entry);
  switch (status) {
    case "active":
      return color.green(text);
    case "phasing_out":
      return color.yellow(text);
    case "deprecated":
      return color.red(text);
    case "removed":
      return color.dim(text);
    default:
      return text;
  }
}

function renderAscii(manifest: DagstreeManifestV1): string[] {
  const lines: string[] = [];
  lines.push(`Dependency graph: ${manifest.project.name} (${manifest.project.slug})`);
  lines.push("");

  if (manifest.services.length === 0) {
    lines.push("(no services declared)");
    return lines;
  }

  const color = pc.createColors(colorSupported());

  const dependsOn = new Map<string, string[]>();
  for (const edge of manifest.dependencies) {
    const { from, to } = edgeEndpoints(edge);
    const list = dependsOn.get(from) ?? [];
    list.push(to);
    dependsOn.set(from, list);
  }

  for (const service of manifest.services) {
    lines.push(`[${service.id}] ${service.service} (${service.role}) - ${colorStatus(service, color)}`);
    const deps = dependsOn.get(service.id) ?? [];
    if (deps.length > 0) {
      lines.push(`    depends on: ${deps.join(", ")}`);
    }
  }

  return lines;
}

/**
 * Mermaid node ids allow only [A-Za-z0-9_]. Every dagstree id already
 * satisfies the slug pattern (lowercase letters, digits, single - or _
 * separators, HANDOFF.md section 5), so the only translation needed is "-"
 * -> "__": that pattern forbids doubled separators, so no valid id can
 * already contain "__" for this encoding to collide with, and a lone "_" is
 * left untouched. The previous blanket `[-_]` -> "_" mapping collapsed
 * "api-db" and "api_db" -- two different, both-valid ids -- onto the same
 * mermaid node; this keeps them as "api__db" and "api_db".
 */
function mermaidId(id: string): string {
  return id.replace(/-/g, "__");
}

function renderMermaid(manifest: DagstreeManifestV1): string[] {
  const lines: string[] = [];
  lines.push("flowchart LR");

  for (const service of manifest.services) {
    const label = `${service.id}: ${service.service} (${service.role})`;
    lines.push(`  ${mermaidId(service.id)}["${label}"]`);
  }

  for (const edge of manifest.dependencies) {
    const { from, to } = edgeEndpoints(edge);
    lines.push(`  ${mermaidId(from)} --> ${mermaidId(to)}`);
  }

  const statusfulServices = manifest.services.filter((s) => (s.status ?? "active") !== "active");
  if (statusfulServices.length > 0) {
    lines.push("  classDef phasingOut stroke:#b8860b,stroke-width:2px;");
    lines.push("  classDef deprecated stroke:#b00020,stroke-width:2px,stroke-dasharray: 4 2;");
    lines.push("  classDef removed fill:#eeeeee,stroke:#999999,color:#999999;");
    for (const service of statusfulServices) {
      const status = service.status ?? "active";
      const cls = status === "phasing_out" ? "phasingOut" : status === "deprecated" ? "deprecated" : "removed";
      lines.push(`  class ${mermaidId(service.id)} ${cls}`);
      if (status === "phasing_out" && service.replaced_by) {
        lines.push(`  ${mermaidId(service.id)} -. replaced by .-> ${mermaidId(service.replaced_by)}`);
      }
    }
  }

  return lines;
}
