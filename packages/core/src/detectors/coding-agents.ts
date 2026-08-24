// Dagstree-specific detector — stack-analyser has no notion of "coding
// agents in use" (HANDOFF.md §6). Root-level marker files/dirs only;
// monorepo-aware scanning is out of scope for v1 (HANDOFF.md §9.5).
import { join } from "node:path";

import { pathExists } from "./fs-helpers.js";
import type { CodingAgentDetection, CodingAgentDetectionResult, Evidence } from "../types.js";

interface Marker {
  agent: string;
  name: string;
  /** Path relative to the repo root, forward slashes for display. */
  relativePath: string;
}

// Markers that name a *specific* agent. A marker only belongs here if the
// file or directory identifies which tool wrote it -- see AMBIGUOUS_MARKERS
// for the ones that don't.
const MARKERS: Marker[] = [
  { agent: "claude-code", name: "Claude Code", relativePath: "CLAUDE.md" },
  { agent: "claude-code", name: "Claude Code", relativePath: ".claude" },
  { agent: "codex", name: "Codex", relativePath: ".codex" },
  { agent: "cursor", name: "Cursor", relativePath: ".cursor" },
  { agent: "github-copilot", name: "GitHub Copilot", relativePath: ".github/copilot-instructions.md" },
];

/**
 * Files that prove *some* agent reads this repo without saying which one.
 *
 * `AGENTS.md` and `.agents/` used to emit an agent called `agents-md`, and
 * that was a category error: the field is `project.coding_agents`, which
 * answers "which agents are used here", and AGENTS.md is a vendor-neutral
 * instruction file by design -- naming it as an agent is like answering
 * "which car do you drive" with "a driver's manual". Worse, it was
 * self-confirming: it appeared next to the real agents on every repo that
 * had any, so it always looked corroborated.
 *
 * These are reported separately instead. A caller that finds them and no
 * specific marker knows an agent is in use and does not know which, which
 * is a question for the owner rather than a value to invent.
 */
const AMBIGUOUS_MARKERS = ["AGENTS.md", ".agents"] as const;

export async function detectCodingAgents(repoPath: string): Promise<CodingAgentDetectionResult> {
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

  const unidentified: Evidence[] = [];
  for (const relativePath of AMBIGUOUS_MARKERS) {
    if (await pathExists(join(repoPath, relativePath))) {
      unidentified.push({ file: relativePath });
    }
  }

  return { agents: [...byAgent.values()], unidentified };
}
