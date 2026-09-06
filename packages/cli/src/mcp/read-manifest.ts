// `read_manifest` -- the MCP tool that lets an agent see this repo's
// catalogus.yaml the way the CLI itself sees it: the raw text, plus the
// parsed object once it validates. A read, nothing more -- writing goes
// through `propose_manifest_edit`, never through this tool.
//
// Locating the manifest copies the rule `openManifestForEdit` documents
// (manifest-edit.ts) rather than sharing its code: a path the caller (or
// the server's own `catalogus mcp <path>` default) actually named is a
// concrete claim about which project this call targets, so it must never
// silently walk up to an ancestor's manifest the way the no-argument
// default is allowed to -- `findManifestIn` for the former, `findManifest`'s
// git-style upward walk for the latter. See that comment for the defect
// this rule fixes (a typo'd subdirectory silently editing an unrelated
// parent manifest). Copied rather than imported because the two callers
// diverge past that one rule: this tool never stats the directory or
// refuses a non-directory path the way a *writing* command must, and its
// failure is an MCP `isError` result, not a CommandResult's stderr lines --
// sharing the function would mean sharing a return type neither caller
// actually wants. (2026-09-06.)
//
// "Valid" here means what `loadValidManifest` means by it -- schema and
// referential integrity, via @catalogus/schema's own parseManifest, which
// deliberately does not check acyclicity (schema.ts's own comment on
// `dependencies`: "acyclicity is checked by catalogus validate, not by this
// schema"). A manifest with a cycle but nothing else wrong reads back as
// valid: true here, exactly as it would to `catalogus diff`/`add`/`graph`;
// catching a cycle is `catalogus validate`'s job, not this tool's.
import { MANIFEST_FILENAME, MANIFEST_FILENAME_FALLBACK, parseManifest } from "@catalogus/schema";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { checkManifestText, warningLines } from "../manifest-checks.js";
import { findManifest, findManifestIn, readManifestText } from "../manifest-io.js";
import { resolveTargetPath } from "../paths.js";
import { resolveToolPath } from "./tool-path.js";

/** `read_manifest`'s one input: the repo directory. Optional at every level -- see ReadManifestToolOptions.defaultPath and resolveTargetPath. */
export const readManifestInputShape = { path: z.string().optional() };

export const READ_MANIFEST_DESCRIPTION =
  "Reads catalogus.yaml (or the stack.yaml fallback) for the repo at `path` -- or the server's " +
  "default directory, or the current directory when neither is given -- and returns its raw text " +
  "plus, when it validates, the parsed manifest object and any soft private-guard warnings. A " +
  "manifest that exists but fails validation is still returned (valid: false, with the specific " +
  "problems) rather than treated as an error, so a caller can see what is wrong and fix it with the " +
  "same edits. This tool only reads; writes go through propose_manifest_edit then apply_manifest_edit.";

export interface ReadManifestToolOptions {
  /** The repo directory `catalogus mcp [path]` was started with, if any. */
  defaultPath?: string;
}

function textAndStructured(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

// The wording has to match detect-stack.ts's own not-found message -- both
// tools are reporting the same gap (CLAUDE.md's "absent field reads as not
// answered yet" rule, applied to a whole missing file), and a caller
// reading both tools' errors should see one fix named the same way, not two
// differently-worded ones for what is the same missing manifest. Both tools
// apply the same explicit-path rule (detect-stack.ts's header records that
// it did not at first); the wording is duplicated rather than shared only
// because each tool composes its own error result.
function notFoundResult(targetDir: string, explicit: boolean): CallToolResult {
  const where = explicit ? `"${targetDir}"` : `"${targetDir}" or any parent directory`;
  const message = `No ${MANIFEST_FILENAME} (or ${MANIFEST_FILENAME_FALLBACK}) found in ${where}. Run "catalogus init --yes" to create one.`;
  return { content: [{ type: "text", text: message }], isError: true };
}

export function createReadManifestHandler(options: ReadManifestToolOptions = {}) {
  return async (input: { path?: string }): Promise<CallToolResult> => {
    const pathArg = resolveToolPath(input.path, options.defaultPath);
    const targetDir = resolveTargetPath(pathArg);
    const explicit = pathArg !== undefined;

    const location = explicit ? await findManifestIn(targetDir) : await findManifest(targetDir);
    if (!location) {
      return notFoundResult(targetDir, explicit);
    }

    const text = await readManifestText(location);
    const parsed = parseManifest(text);
    if (!parsed.valid) {
      // checkManifestText re-parses the same text; it hits this exact same
      // schema failure and never reaches its own acyclicity check, so
      // reusing it here for the formatted problem lines cannot disagree
      // with the parseManifest call above.
      const check = checkManifestText(text);
      return textAndStructured({
        manifestPath: location.filePath,
        filename: location.filename,
        text,
        valid: false,
        problems: check.ok ? [] : check.lines,
      });
    }

    return textAndStructured({
      manifestPath: location.filePath,
      filename: location.filename,
      text,
      manifest: parsed.manifest,
      valid: true,
      warnings: warningLines(parsed.warnings),
    });
  };
}
