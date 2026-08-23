// Dagstree-specific detector — stack-analyser has no notion of "coding
// agents in use" (HANDOFF.md §6). Root-level marker files/dirs only;
// monorepo-aware scanning is out of scope for v1 (HANDOFF.md §9.5).
import { join } from "node:path";

import { pathExists } from "./fs-helpers.js";
import type { CodingAgentDetection } from "../types.js";

interface Marker {
  agent: string;
  name: string;
  /** Path relative to the repo root, forward slashes for display. */
  relativePath: string;
}

const MARKERS: Marker[] = [
  { agent: "claude-code", name: "Claude Code", relativePath: "CLAUDE.md" },
  { agent: "claude-code", name: "Claude Code", relativePath: ".claude" },
  { agent: "agents-md", name: "AGENTS.md", relativePath: "AGENTS.md" },
  { agent: "agents-md", name: "AGENTS.md", relativePath: ".agents" },
  { agent: "cursor", name: "Cursor", relativePath: ".cursor" },
  { agent: "github-copilot", name: "GitHub Copilot", relativePath: ".github/copilot-instructions.md" },
];

export async function detectCodingAgents(repoPath: string): Promise<CodingAgentDetection[]> {
  const byAgent = new Map<string, CodingAgentDetection>();

  for (const marker of MARKERS) {
    const segments = marker.relativePath.split("/");
    const absolute = join(repoPath, ...segments);
    if (!(await pathExists(absolute))) {
      continue;
    }
    const entry = byAgent.get(marker.agent) ?? { agent: marker.agent, name: marker.name, evidence: [] };
    entry.evidence.push({ file: marker.relativePath });
    byAgent.set(marker.agent, entry);
  }

  return [...byAgent.values()];
}
