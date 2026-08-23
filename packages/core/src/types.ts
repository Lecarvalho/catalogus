// Shared result types for the detection engine (Layer 1). Every shape here
// is plain data — arrays and objects only, no Map/Set — so a DetectionResult
// round-trips through JSON.stringify without loss, which matters because the
// CLI and (later) MCP server ship it over stdout/stdio verbatim.

/** Matches services.category in HANDOFF.md §4. */
export type ServiceCategory =
  | "db"
  | "auth"
  | "ai"
  | "hosting"
  | "dns"
  | "payments"
  | "analytics"
  | "storage"
  | "ci"
  | "agent"
  | "pm"
  | "vcs"
  | "other";

/**
 * A single piece of proof behind a detection. `file` is the human-readable
 * answer to "why does it think this?" — usually a filename or glob, but for
 * dependency/env-var based signals it may be a paraphrase of the underlying
 * regex match. `detail`, when present, is the verbatim signal string.
 */
export interface Evidence {
  file: string;
  detail?: string;
}

export interface DetectedTechnology {
  /** Dagstree catalog slug. Equal to specfySlug when unmapped. */
  slug: string;
  category: ServiceCategory;
  name: string;
  evidence: Evidence[];
  /** The raw slug @specfy/stack-analyser emitted for this detection. */
  specfySlug: string;
  /** True when specfySlug had no entry in mapping.ts — a pass-through, not a discard. */
  unmapped: boolean;
}

export interface CodingAgentDetection {
  agent: string;
  name: string;
  evidence: Evidence[];
}

export interface McpServerDetection {
  name: string;
  evidence: Evidence[];
}

export interface HostingDetection {
  slug: string;
  name: string;
  evidence: Evidence[];
}

export interface VcsDetection {
  provider: string;
  evidence: Evidence[];
}

export interface CiDetection {
  provider: string;
  evidence: Evidence[];
}

export interface DetectionResult {
  repoPath: string;
  scannedAt: string;
  technologies: DetectedTechnology[];
  codingAgents: CodingAgentDetection[];
  mcpServers: McpServerDetection[];
  hosting: HostingDetection[];
  vcs: VcsDetection | null;
  ci: CiDetection | null;
  /**
   * Human-readable notes about detection that couldn't complete cleanly —
   * e.g. an MCP config file that exists but failed to parse as JSON. Never
   * silently dropped: a partial read must be distinguishable from a
   * genuine "nothing configured" negative.
   */
  warnings: string[];
}
