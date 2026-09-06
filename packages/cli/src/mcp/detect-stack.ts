// `detect_stack` -- the MCP tool that hands an agent the same structured
// diff `catalogus diff --json` prints: services detected but missing from
// the manifest, services the manifest declares that detection cannot see
// here, and the coding-agent equivalents of both. Built on computeDiff()
// (commands/diff.ts) so this can never drift from what the CLI itself
// reports -- there is exactly one place that constructs "the diff", and
// this tool is a thin caller of it, not a second implementation.
//
// This is a claim about what this one checkout shows, not about what is
// actually running: a service wired through a gitignored settings file or
// a web console looks exactly like one that no longer exists. diff.ts's own
// header explains why "declared but not visible" replaced "no longer
// detected" as this list's name -- a real .NET repo's gitignored config
// named five services that way, every one of them still in production. An
// entry missing from detection here is a lead to check, never a delete
// list, and the tool description below says that outright rather than
// leaving an agent to assume "missing from detection" means "gone".
//
// An explicit `path` never walks up. computeDiff itself walks up from
// targetDir the way `catalogus diff` does (loadValidManifest ->
// findManifest), and that lookup was left as it is; this tool checks the
// named directory with findManifestIn first and reports not-found when it
// holds no manifest, so that every tool on this server answers a named
// path the same way (read-manifest.ts's header carries the reason: a
// named path is a claim about which project the call targets, and a
// typo'd subdirectory that silently reports the parent's diff is the
// defect openManifestForEdit's rule exists to prevent). The first version
// of this file let detect_stack walk up while read_manifest refused to,
// which would have made the two tools disagree about whether a directory
// has a manifest at all; corrected by the main session. (2026-09-06.)
import { MANIFEST_FILENAME, MANIFEST_FILENAME_FALLBACK } from "@catalogus/schema";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { computeDiff } from "../commands/diff.js";
import { findManifestIn } from "../manifest-io.js";
import { resolveTargetPath } from "../paths.js";
import { resolveToolPath } from "./tool-path.js";

/** `detect_stack`'s one input: the repo directory. Optional at every level -- see DetectStackToolOptions.defaultPath and resolveTargetPath. */
export const detectStackInputShape = { path: z.string().optional() };

export const DETECT_STACK_DESCRIPTION =
  "Scans the repo at `path` -- or the server's default directory, or the current directory when " +
  "neither is given -- and returns the same structured diff catalogus diff --json prints: services " +
  "detected but missing from the manifest, services the manifest declares that detection cannot see " +
  "here, and the coding-agent equivalents of both. This is a claim about what this one checkout " +
  "shows, not about what is actually deployed -- a service configured through a gitignored settings " +
  "file or a web console looks exactly like one that was removed, so an entry detection misses is a " +
  "lead to check, not a delete list.";

export interface DetectStackToolOptions {
  /** The repo directory `catalogus mcp [path]` was started with, if any. */
  defaultPath?: string;
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function createDetectStackHandler(options: DetectStackToolOptions = {}) {
  return async (input: { path?: string }): Promise<CallToolResult> => {
    const pathArg = resolveToolPath(input.path, options.defaultPath);
    const targetDir = resolveTargetPath(pathArg);
    const explicit = pathArg !== undefined;

    // Wording matches read-manifest.ts's notFoundResult -- both tools report
    // the same gap and name the same fix.
    const notFound = (where: string): CallToolResult =>
      errorResult(
        `No ${MANIFEST_FILENAME} (or ${MANIFEST_FILENAME_FALLBACK}) found in ${where}. ` +
          'Run "catalogus init --yes" to create one.'
      );

    if (explicit && (await findManifestIn(targetDir)) === null) {
      return notFound(`"${targetDir}"`);
    }

    const computed = await computeDiff(targetDir);

    if (!computed.ok) {
      if (computed.reason === "not-found") {
        return notFound(`"${targetDir}" or any parent directory`);
      }
      // "load-failed" (manifest exists but doesn't read or validate) and
      // "detect-failed" (detect() threw) both already carry a message an
      // agent can act on -- computeDiff's own stderr line -- so relaying it
      // is correct instead of composing a second one that could drift from
      // what `catalogus diff` itself would have said for the same failure.
      return errorResult(computed.error.stderr.join("\n"));
    }

    // hasDiff lives outside diff.ts's own payload object (see that file's
    // header for why) but belongs in *this* tool's result -- it's the one
    // field an agent should read first, rather than re-deriving "is there a
    // diff" by checking four array lengths itself.
    const payload = { ...computed.value.payload, hasDiff: computed.value.hasDiff };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  };
}
