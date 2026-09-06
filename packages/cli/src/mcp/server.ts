// `createCatalogusMcpServer` -- assembles the MCP server Claude Code (or any
// other MCP client) talks to for the agent workflow HANDOFF.md section 6
// and decision 14 (docs/plan/decisions.md) describe: read_manifest,
// detect_stack, propose_manifest_edit, apply_manifest_edit, init_manifest,
// validate_manifest, render_graph and list_icons. read_manifest and
// detect_stack were written with this file (docs/mcp-server-brief.md);
// propose_manifest_edit was written in parallel as a standalone function
// (docs/propose-edit-brief.md) and registered here by the main session once
// both landed, which is why its handler is a thin adapter below rather than
// a `create...Handler` factory like the other two; apply_manifest_edit
// followed the same shape once decision 14 turned "propose, never write"
// into "propose, then apply" (docs/mcp-apply-brief.md). The remaining four
// -- init_manifest, validate_manifest, render_graph, list_icons -- are each
// a thin `create...Handler` factory in command-tools.ts wrapping an
// already-existing CLI command function, so an agent with this server
// connected never needs a shell for any of the eight.
//
// No transport is attached here -- connect() is the caller's job.
// commands/mcp.ts wires a real StdioServerTransport for the shipped binary;
// server.test.ts wires an InMemoryTransport pair instead, which is what
// makes every tool's behaviour testable through a real MCP Client without a
// child process, a pipe, or stdin/stdout ever entering the picture.
// (2026-09-06.)
import { createRequire } from "node:module";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ApplyManifestEditInput } from "./apply-edit.js";
import { applyManifestEdit, APPLY_MANIFEST_EDIT_DESCRIPTION, applyManifestEditInputShape } from "./apply-edit.js";
import {
  createInitManifestHandler,
  createListIconsHandler,
  createRenderGraphHandler,
  createValidateManifestHandler,
  INIT_MANIFEST_DESCRIPTION,
  initManifestInputShape,
  LIST_ICONS_DESCRIPTION,
  listIconsInputShape,
  RENDER_GRAPH_DESCRIPTION,
  renderGraphInputShape,
  VALIDATE_MANIFEST_DESCRIPTION,
  validateManifestInputShape,
} from "./command-tools.js";
import { createDetectStackHandler, DETECT_STACK_DESCRIPTION, detectStackInputShape } from "./detect-stack.js";
import {
  PROPOSE_MANIFEST_EDIT_DESCRIPTION,
  proposeManifestEdit,
  proposeManifestEditInputShape,
} from "./propose-edit.js";
import type { ProposeManifestEditInput } from "./propose-edit.js";
import { createReadManifestHandler, READ_MANIFEST_DESCRIPTION, readManifestInputShape } from "./read-manifest.js";
import { resolveToolPath } from "./tool-path.js";

export interface CatalogusMcpServerOptions {
  /**
   * The repo directory `catalogus mcp [path]` was started with. Falls
   * through to each tool's own `path` input when a call names one, and to
   * the process's cwd (via resolveTargetPath) when neither is given --
   * paths.ts's own contract, reused rather than re-decided here.
   */
  defaultPath?: string;
}

// Same intent as program.ts's own packageVersion() -- read the version
// rather than hardcode it, because a hardcoded copy is exactly the kind of
// plausible-looking staleness this codebase has already shipped once (that
// file's own comment). Not imported from program.ts: program.ts already
// imports commands/mcp.ts (to register the `mcp` command), and commands/mcp.ts
// imports this file, so importing packageVersion the other way round would
// close a cycle through exactly the two files program.ts's header is most
// paranoid about (its whole reason for existing is a chunk-splitting defect
// in this same dependency graph).
//
// Two candidate paths, tried in order, because this file is reached two
// different ways at two different depths: unbundled, under vitest, it runs
// from its real src/mcp/ location, two levels above package.json; bundled
// by tsup, it is inlined into whichever of dist/index.js, dist/cli.js or a
// shared dist/chunk-*.js reaches it, all three siblings of package.json's
// parent one level up (observed directly in a built dist/: cli.js, index.js
// and chunk-*.js all sit flat under dist/, regardless of this file's own
// nesting in src/). One hardcoded depth is wrong in one of the two
// contexts; trying both, and using whichever resolves, is right in both.
function packageVersion(): string {
  const require = createRequire(import.meta.url);
  for (const candidate of ["../package.json", "../../package.json"]) {
    try {
      const pkg = require(candidate) as { version?: string };
      if (pkg.version) {
        return pkg.version;
      }
    } catch {
      // Try the next candidate -- see the comment above on why there are two.
    }
  }
  return "0.0.0";
}

/**
 * Builds a fresh McpServer with all eight tools registered: read_manifest,
 * detect_stack, propose_manifest_edit, apply_manifest_edit, init_manifest,
 * validate_manifest, render_graph and list_icons.
 * A function rather than module-level state, the same reason
 * `createProgram` in program.ts is one: commands/mcp.ts calls this once per
 * `catalogus mcp` invocation, and server.test.ts calls it fresh per test.
 */
export function createCatalogusMcpServer(options: CatalogusMcpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "catalogus", version: packageVersion() });

  // The SDK dispatches tool calls concurrently, and the 2026-09-06 validation
  // pipelined two `apply_manifest_edit` calls with the same baseSha256: both
  // reported ok and one write was lost, because both hashed the file before
  // either wrote it. The two tools that write -- apply and init -- therefore
  // run one at a time on this server, each waiting for the previous write
  // to finish. Reads are not queued; a read racing a write sees one version
  // or the other, which is what a read of a file means anyway. This is a
  // per-process queue, not a file lock: two servers on one repo can still
  // race, and the stale-base check is what catches that.
  let writeQueue: Promise<unknown> = Promise.resolve();
  const serialized = <I, R>(handler: (input: I) => Promise<R>) => {
    return (input: I): Promise<R> => {
      const run = writeQueue.then(() => handler(input));
      writeQueue = run.catch(() => undefined);
      return run;
    };
  };

  server.registerTool(
    "read_manifest",
    { description: READ_MANIFEST_DESCRIPTION, inputSchema: readManifestInputShape },
    createReadManifestHandler({ defaultPath: options.defaultPath })
  );

  server.registerTool(
    "detect_stack",
    { description: DETECT_STACK_DESCRIPTION, inputSchema: detectStackInputShape },
    createDetectStackHandler({ defaultPath: options.defaultPath })
  );

  server.registerTool(
    "propose_manifest_edit",
    { description: PROPOSE_MANIFEST_EDIT_DESCRIPTION, inputSchema: proposeManifestEditInputShape },
    async (input: ProposeManifestEditInput) => {
      // The server's default directory combines with the call's own path
      // by the same rule the two read tools use (tool-path.ts): a call that
      // names no path gets the `catalogus mcp [path]` directory, a relative
      // one resolves under it, and proposeManifestEdit treats the result as
      // an explicit path (no upward walk), which is what a directory the
      // user named on the command line is.
      const result = await proposeManifestEdit({ ...input, path: resolveToolPath(input.path, options.defaultPath) });
      if (!result.ok && "fill" in result) {
        return {
          content: [{ type: "text", text: `${result.error} Run "${result.fill}" to create one.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }
  );

  server.registerTool(
    "apply_manifest_edit",
    { description: APPLY_MANIFEST_EDIT_DESCRIPTION, inputSchema: applyManifestEditInputShape },
    serialized(async (input: ApplyManifestEditInput) => {
      // Same path composition as propose_manifest_edit just above -- see
      // that handler's comment.
      const result = await applyManifestEdit({ ...input, path: resolveToolPath(input.path, options.defaultPath) });
      // Two distinct isError shapes, both early-exit (nothing ran): no
      // manifest at all (`fill`, naming the init_manifest tool -- apply-
      // edit.ts's own comment on why this one names a tool rather than a
      // CLI line), and a stale baseSha256 (`staleBase`). A mid-run failure
      // (some steps landed, one then failed) is neither of these -- it is a
      // full ApplyManifestEditReport with `ok: false`, which is not an
      // error result: the agent needs to read `steps` to see what actually
      // wrote, the same way propose_manifest_edit's own `ok: false` report
      // is not an error result either.
      if (!result.ok && ("fill" in result || "staleBase" in result)) {
        const text = "fill" in result ? `${result.error} Use the "${result.fill}" tool to create one.` : result.error;
        return { content: [{ type: "text", text }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    })
  );

  server.registerTool(
    "init_manifest",
    { description: INIT_MANIFEST_DESCRIPTION, inputSchema: initManifestInputShape },
    serialized(createInitManifestHandler({ defaultPath: options.defaultPath }))
  );

  server.registerTool(
    "validate_manifest",
    { description: VALIDATE_MANIFEST_DESCRIPTION, inputSchema: validateManifestInputShape },
    createValidateManifestHandler({ defaultPath: options.defaultPath })
  );

  server.registerTool(
    "render_graph",
    { description: RENDER_GRAPH_DESCRIPTION, inputSchema: renderGraphInputShape },
    createRenderGraphHandler({ defaultPath: options.defaultPath })
  );

  server.registerTool(
    "list_icons",
    { description: LIST_ICONS_DESCRIPTION, inputSchema: listIconsInputShape },
    createListIconsHandler({ defaultPath: options.defaultPath })
  );

  return server;
}
