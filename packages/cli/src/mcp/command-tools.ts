// `init_manifest`, `validate_manifest`, `render_graph` and `list_icons` --
// four MCP tools that each wrap one already-existing, already-tested CLI
// command function (`runInit`, `runValidate`, `runGraph`, `runIcons`) rather
// than reimplementing any of their behaviour, so an agent with the
// `catalogus` MCP connected never needs a shell for these either (Phase 6,
// decision 14, docs/mcp-apply-brief.md).
//
// Every one of the four goes through `commandResultToToolResult`, the one
// place a `CommandResult` becomes a `CallToolResult`, so an agent reads the
// same shape regardless of which of the four it called: `content` is
// `stdout` then `stderr` joined with newlines (an agent reading `content`
// alone still sees everything the CLI would have printed, in the order it
// would have printed it), `structuredContent` is `{ exitCode, stdout,
// stderr, ...extra }` (`extra` is each tool's own addition -- `valid` for
// validate, `text` for init, nothing for graph/icons), and `isError` is set
// whenever `exitCode !== 0`, the same contract every command function in
// this package already promises its CLI caller (types.ts's own comment).
// (2026-09-06.)
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { MANIFEST_FILENAME } from "@catalogus/schema";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { runGraph } from "../commands/graph.js";
import { runIcons } from "../commands/icons.js";
import { runInit } from "../commands/init.js";
import { runValidate } from "../commands/validate.js";
import { resolveTargetPath } from "../paths.js";
import type { CommandResult } from "../types.js";
import { resolveToolPath } from "./tool-path.js";
import { findManifestIn } from "../manifest-io.js";
import { MANIFEST_FILENAME_FALLBACK } from "@catalogus/schema";

// The command functions these three wrap (`runValidate`, `runGraph`,
// `runIcons`) walk up from an explicit path the way the CLI does. Every
// other tool on this server refuses that for a named path (read-manifest.ts's
// header), and the 2026-09-06 validation showed what the difference costs:
// `validate_manifest` on an empty subdirectory answered `valid: true` for
// the parent repo. So the wrappers check the named directory first and
// return the same not-found result the other tools do; the command function
// is only reached when the manifest is where the caller said. (2026-09-06.)
async function explicitPathHasNoManifest(pathArg: string | undefined): Promise<CallToolResult | null> {
  if (pathArg === undefined) {
    return null;
  }
  const targetDir = resolveTargetPath(pathArg);
  if ((await findManifestIn(targetDir)) !== null) {
    return null;
  }
  return {
    content: [
      {
        type: "text",
        text:
          `No ${MANIFEST_FILENAME} (or ${MANIFEST_FILENAME_FALLBACK}) found in "${targetDir}". ` +
          'Use the "init_manifest" tool to create one.',
      },
    ],
    isError: true,
  };
}

export interface CommandToolOptions {
  /** The repo directory `catalogus mcp [path]` was started with, if any. */
  defaultPath?: string;
}

/** The one place a CommandResult becomes a CallToolResult -- see this file's header for the shape every tool below promises. */
function commandResultToToolResult(result: CommandResult, extra: Record<string, unknown> = {}): CallToolResult {
  return {
    content: [{ type: "text", text: [...result.stdout, ...result.stderr].join("\n") }],
    structuredContent: { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, ...extra },
    isError: result.exitCode !== 0,
  };
}

// --- init_manifest -----------------------------------------------------------

export const initManifestInputShape = {
  path: z.string().optional(),
  /** Never inferred -- CLAUDE.md's hard rule, and init.ts's own comment on why visibility is asked rather than guessed. Written only when given. */
  visibility: z.string().optional(),
  force: z.boolean().optional(),
};

const initManifestInputSchema = z.object(initManifestInputShape);

export type InitManifestInput = z.infer<typeof initManifestInputSchema>;

export const INIT_MANIFEST_DESCRIPTION =
  "Scaffolds a new catalogus.yaml in the repo at `path` (or the server's default directory, or the " +
  "current directory) without prompting -- a server cannot prompt, so this always runs the CLI's " +
  "--yes path. `visibility` is written only when given here; never guessed. Refuses when a manifest " +
  "already exists unless `force` is true. Returns the written manifest's text on success.";

export function createInitManifestHandler(options: CommandToolOptions = {}) {
  return async (input: InitManifestInput): Promise<CallToolResult> => {
    const pathArg = resolveToolPath(input.path, options.defaultPath);
    // `yes: true` unconditionally: an MCP tool call has no terminal to
    // prompt into, so the interactive path (init.ts's own `!options.yes`
    // branch) is never reachable from here.
    const result = await runInit(pathArg, { yes: true, visibility: input.visibility, force: input.force });
    if (result.exitCode !== 0) {
      return commandResultToToolResult(result);
    }
    const text = await readFile(join(resolveTargetPath(pathArg), MANIFEST_FILENAME), "utf8");
    return commandResultToToolResult(result, { text });
  };
}

// --- validate_manifest ---------------------------------------------------------

export const validateManifestInputShape = {
  path: z.string().optional(),
  strict: z.boolean().optional(),
};

const validateManifestInputSchema = z.object(validateManifestInputShape);

export type ValidateManifestInput = z.infer<typeof validateManifestInputSchema>;

export const VALIDATE_MANIFEST_DESCRIPTION =
  "Runs the same checks `catalogus validate` runs (schema, referential integrity, dependency " +
  "acyclicity, and -- with `strict` -- soft private-value warnings promoted to failures) against " +
  "catalogus.yaml at `path` (or the server's default directory, or the current directory). Returns " +
  "`valid: true`/`false` alongside the raw exit code and every problem line the CLI would print.";

export function createValidateManifestHandler(options: CommandToolOptions = {}) {
  return async (input: ValidateManifestInput): Promise<CallToolResult> => {
    const pathArg = resolveToolPath(input.path, options.defaultPath);
    const notFound = await explicitPathHasNoManifest(pathArg);
    if (notFound) {
      return notFound;
    }
    const result = await runValidate(pathArg, { strict: input.strict });
    return commandResultToToolResult(result, { valid: result.exitCode === 0 });
  };
}

// --- render_graph ----------------------------------------------------------

export const renderGraphInputShape = {
  path: z.string().optional(),
  format: z.enum(["text", "mermaid"]).optional(),
};

const renderGraphInputSchema = z.object(renderGraphInputShape);

export type RenderGraphInput = z.infer<typeof renderGraphInputSchema>;

export const RENDER_GRAPH_DESCRIPTION =
  "Renders the dependency graph of catalogus.yaml at `path` (or the server's default directory, or " +
  "the current directory) as readable text (the default) or, with `format: \"mermaid\"`, a mermaid " +
  "flowchart definition. Output never carries colour escape codes, even when the CLI's own coloured " +
  "rendering would have been on -- an agent reads plain text either way.";

// graph.ts colours its ASCII output only when process.stdout.isTTY, which is
// false for this process under stdio MCP -- except FORCE_COLOR overrides
// that TTY check (graph.ts's own colorSupported()), and this server's own
// process could have FORCE_COLOR set in its environment for reasons that
// have nothing to do with this tool. Stripping SGR escapes unconditionally,
// rather than relying on the TTY check alone, means an agent calling this
// tool never has to parse a raw SGR escape (an ESC byte followed by
// "[<digits>m") regardless of how this process was started. Matches the SGR
// shapes picocolors actually emits -- an ESC byte, "[", digits and
// semicolons, "m" -- as a general CSI-SGR pattern, not a hand-picked list of
// this file's own colours, so it strips whatever picocolors emits without
// needing to be kept in sync with graph.ts's colour choices. (2026-09-06.)
const ESC = String.fromCharCode(27);
const ANSI_SGR_PATTERN = new RegExp(ESC + "\\[[0-9;]*m", "g");

function stripAnsi(text: string): string {
  return text.replace(ANSI_SGR_PATTERN, "");
}

export function createRenderGraphHandler(options: CommandToolOptions = {}) {
  return async (input: RenderGraphInput): Promise<CallToolResult> => {
    const pathArg = resolveToolPath(input.path, options.defaultPath);
    const notFound = await explicitPathHasNoManifest(pathArg);
    if (notFound) {
      return notFound;
    }
    const result = await runGraph(pathArg, { mermaid: input.format === "mermaid" });
    const stripped: CommandResult = {
      exitCode: result.exitCode,
      stdout: result.stdout.map(stripAnsi),
      stderr: result.stderr.map(stripAnsi),
    };
    return commandResultToToolResult(stripped);
  };
}

// --- list_icons --------------------------------------------------------------

export const listIconsInputShape = { path: z.string().optional() };

const listIconsInputSchema = z.object(listIconsInputShape);

export type ListIconsInput = z.infer<typeof listIconsInputSchema>;

export const LIST_ICONS_DESCRIPTION =
  "Reports where each service entry's icon in catalogus.yaml at `path` (or the server's default " +
  "directory, or the current directory) comes from -- a catalogued brand icon, a vendored local " +
  "file, or none -- one line per entry plus a summary count, the same report `catalogus icons` " +
  "prints. A service with no icon names the `catalogus set services.<id>.icon <url|path>` line that " +
  "fills it. A vendored file's detail is suffixed `(check: ...)` when it paints with white or pale " +
  "ink that can vanish on the viewer's light ground -- ask the user to open `catalogus view` and " +
  "confirm it reads well rather than judging the render yourself.";

export function createListIconsHandler(options: CommandToolOptions = {}) {
  return async (input: ListIconsInput): Promise<CallToolResult> => {
    const pathArg = resolveToolPath(input.path, options.defaultPath);
    const notFound = await explicitPathHasNoManifest(pathArg);
    if (notFound) {
      return notFound;
    }
    const result = await runIcons(pathArg);
    return commandResultToToolResult(result);
  };
}
