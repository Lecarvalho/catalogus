// Dagstree-specific detector for MCP servers configured in a repo
// (HANDOFF.md §6). Reads only server *names* out of these files — never
// their command, args, env, or any other field, since those can carry
// tokens or paths that shouldn't be echoed into a detection result.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { McpServerDetection } from "../types.js";

type ReadResult = { status: "ok"; data: unknown } | { status: "absent" } | { status: "unreadable" };

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

/**
 * Distinguishes "file absent" from "file present but unparseable" — a
 * hand-edited config with a trailing comma or a `//` comment throws in
 * JSON.parse, and silently returning null for that case would make it
 * indistinguishable from a genuine "no MCP config here" negative. The
 * caller surfaces "unreadable" as a warning instead of dropping it.
 */
async function readJsonFile(path: string): Promise<ReadResult> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    return isEnoent(error) ? { status: "absent" } : { status: "unreadable" };
  }
  try {
    return { status: "ok", data: JSON.parse(raw) as unknown };
  } catch {
    return { status: "unreadable" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extracts server names from either shape Claude Code's config files use:
 * a `.mcp.json`-style `{ mcpServers: { name: {...} } }` object, or a
 * `.claude/settings.json`-style `enabledMcpjsonServers: string[]` list
 * (project settings can also inline a full `mcpServers` object directly).
 */
function extractServerNames(data: unknown): string[] {
  if (!isRecord(data)) {
    return [];
  }
  const names = new Set<string>();

  if (isRecord(data.mcpServers)) {
    for (const name of Object.keys(data.mcpServers)) {
      names.add(name);
    }
  }

  if (Array.isArray(data.enabledMcpjsonServers)) {
    for (const name of data.enabledMcpjsonServers) {
      if (typeof name === "string") {
        names.add(name);
      }
    }
  }

  return [...names];
}

const SOURCES = [".mcp.json", ".claude/settings.json"];

export interface McpDetectionResult {
  servers: McpServerDetection[];
  /** e.g. `.mcp.json: present but could not be parsed as JSON` — never silently dropped. */
  warnings: string[];
}

export async function detectMcpServers(repoPath: string): Promise<McpDetectionResult> {
  const byName = new Map<string, McpServerDetection>();
  const warnings: string[] = [];

  for (const relativePath of SOURCES) {
    const segments = relativePath.split("/");
    const result = await readJsonFile(join(repoPath, ...segments));

    if (result.status === "unreadable") {
      warnings.push(`${relativePath}: present but could not be parsed as JSON`);
      continue;
    }
    if (result.status === "absent") {
      continue;
    }

    for (const name of extractServerNames(result.data)) {
      const entry = byName.get(name) ?? { name, evidence: [] };
      entry.evidence.push({ file: relativePath });
      byName.set(name, entry);
    }
  }

  return { servers: [...byName.values()], warnings };
}
