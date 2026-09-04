// @catalogus/core — the Layer 1 detection engine. Wraps @specfy/stack-analyser
// for general-purpose tech detection and adds the Catalogus-specific
// detectors HANDOFF.md §6 calls for (coding agents, MCP servers, hosting
// config files, VCS/CI provider), plus a config-key detector for the
// services stack-analyser structurally cannot see — anything wired through
// a settings file rather than a dependency manifest — then merges them into
// one JSON-serialisable DetectionResult with evidence on every entry.
export const CORE_PACKAGE_NAME = "@catalogus/core";

import { stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { detectCodingAgents } from "./detectors/coding-agents.js";
import { detectConfigKeys } from "./detectors/config-keys.js";
import { pathExists } from "./detectors/fs-helpers.js";
import { detectHosting } from "./detectors/hosting.js";
import { detectMcpServers } from "./detectors/mcp-servers.js";
import { detectCi, detectVcs } from "./detectors/vcs.js";
import { runStackAnalyser } from "./specfy.js";
import type { DetectionResult, Evidence, HostingDetection } from "./types.js";

export type {
  CiDetection,
  CodingAgentDetection,
  CodingAgentDetectionResult,
  ConfigServiceDetection,
  DetectedTechnology,
  DetectionKind,
  DetectionResult,
  Evidence,
  HostingDetection,
  McpServerDetection,
  ServiceCategory,
  VcsDetection,
} from "./types.js";
export { DETECTION_KINDS, SERVICE_CATEGORIES } from "./types.js";
export { mapSpecfySlug, SPECFY_TO_CATALOGUS } from "./mapping.js";
export type { MappingEntry } from "./mapping.js";
export { CATALOGUS_CATALOG, getCatalogEntry } from "./catalog.js";
export type { CatalogEntry } from "./catalog.js";
export { resolveIcon, resolveLocalIcon, describeLocalIconRefusal, MAX_ICON_BYTES } from "./icons.js";
export type { ResolvedIcon, LocalIconRefusal } from "./icons.js";
// describeLocalIconRefusal/LocalIconRefusal added 2026-09-04 alongside
// resolveLocalIcon's own export above -- packages/cli's icon-resolution.ts
// (the only caller today) needs it re-exported here the same way every
// other cross-package symbol in this file is, not reached through a deep
// import into ./icons.js. See icons.ts's own comment on why this exists
// (D3, docs/custom-icon-brief.md's follow-up).

/** Thrown by detect() when repoPath doesn't name a real, absolute directory. */
export class InvalidRepoPathError extends Error {
  constructor(repoPath: string, reason: string) {
    super(`detect(): invalid repoPath ${JSON.stringify(repoPath)} — ${reason}`);
    this.name = "InvalidRepoPathError";
  }
}

async function assertValidRepoPath(repoPath: string): Promise<void> {
  if (!isAbsolute(repoPath)) {
    throw new InvalidRepoPathError(repoPath, "must be an absolute path");
  }
  let info;
  try {
    info = await stat(repoPath);
  } catch {
    throw new InvalidRepoPathError(repoPath, "does not exist");
  }
  if (!info.isDirectory()) {
    throw new InvalidRepoPathError(repoPath, "is not a directory");
  }
}

/**
 * Scans an absolute repository path and returns everything Layer 1 can
 * learn about it: detected technologies (stack-analyser, mapped into
 * Catalogus's namespace), coding agents, MCP servers, hosting providers, and
 * VCS/CI provider. Every entry carries the evidence that produced it.
 *
 * Read-only — never writes into repoPath. Rejects with InvalidRepoPathError
 * for a missing path, a non-directory, or a relative path (the contract is
 * absolute-only; resolving a relative one against an unstated cwd would be
 * guessing).
 */
export async function detect(repoPath: string): Promise<DetectionResult> {
  await assertValidRepoPath(repoPath);

  const [technologies, codingAgents, mcp, catalogusHosting, configKeys, vcs, ci] = await Promise.all([
    runStackAnalyser(repoPath),
    detectCodingAgents(repoPath),
    detectMcpServers(repoPath),
    detectHosting(repoPath),
    detectConfigKeys(repoPath),
    detectVcs(repoPath),
    detectCi(repoPath),
  ]);

  const hosting = await mergeHosting(repoPath, catalogusHosting, technologies);

  return {
    repoPath,
    scannedAt: new Date().toISOString(),
    technologies,
    codingAgents: codingAgents.agents,
    unidentifiedCodingAgents: codingAgents.unidentified,
    mcpServers: mcp.servers,
    hosting,
    configServices: configKeys.services,
    vcs,
    ci,
    warnings: [...mcp.warnings, ...configKeys.warnings],
  };
}

/**
 * Merges `incoming` evidence onto `target`, keyed by `file`. The same
 * config file routinely satisfies both Catalogus's own pattern detector and
 * stack-analyser's independent file-based rule for the same provider (Fly's
 * multi-app `fly.toml` is the case that surfaced this), so a plain
 * concatenation of the two evidence arrays carries that file twice. When
 * both sides describe the same file, the record with a `detail` string wins
 * over the bare one — `detail` is the only field that explains "why", so
 * the richer record is strictly more useful to a caller than whichever one
 * happened to be pushed first.
 */
function mergeEvidenceByFile(target: readonly Evidence[], incoming: readonly Evidence[]): Evidence[] {
  const byFile = new Map<string, Evidence>();
  for (const evidence of target) {
    byFile.set(evidence.file, evidence);
  }
  for (const evidence of incoming) {
    const existing = byFile.get(evidence.file);
    if (!existing || (existing.detail === undefined && evidence.detail !== undefined)) {
      byFile.set(evidence.file, evidence);
    }
  }
  return [...byFile.values()];
}

/**
 * Folds Catalogus's own filename-pattern hosting detections together with
 * anything stack-analyser separately concluded was hosting-category, so a
 * provider caught only by stack-analyser's dependency rules (no config file
 * on disk) still shows up in `hosting` rather than only in `technologies`.
 *
 * stack-analyser's "matched file: X" reason strings never carry a
 * directory — the library discards path context for file-name matches (see
 * docs/detection-spike.md Gotcha #4) — so a same-named file anywhere in the
 * tree (a test fixture, a docs/ sample, an example app) is otherwise
 * indistinguishable from a real project-root marker. Only evidence whose
 * named file genuinely exists at repoPath's own root gets folded into
 * `hosting`; everything else stays visible in `technologies` (still
 * flagged category "hosting" there) without being promoted to a claim about
 * the whole project.
 */
async function mergeHosting(
  repoPath: string,
  catalogusHosting: HostingDetection[],
  technologies: DetectionResult["technologies"]
): Promise<HostingDetection[]> {
  const bySlug = new Map(catalogusHosting.map((entry) => [entry.slug, { ...entry, evidence: [...entry.evidence] }]));

  for (const techEntry of technologies) {
    if (techEntry.category !== "hosting") {
      continue;
    }

    const rootAnchored: Evidence[] = [];
    for (const evidence of techEntry.evidence) {
      if (await pathExists(join(repoPath, evidence.file))) {
        rootAnchored.push(evidence);
      }
    }
    if (rootAnchored.length === 0) {
      continue;
    }

    const existing = bySlug.get(techEntry.slug);
    if (existing) {
      existing.evidence = mergeEvidenceByFile(existing.evidence, rootAnchored);
    } else {
      bySlug.set(techEntry.slug, {
        slug: techEntry.slug,
        name: techEntry.name,
        evidence: mergeEvidenceByFile([], rootAnchored),
      });
    }
  }

  return [...bySlug.values()];
}
