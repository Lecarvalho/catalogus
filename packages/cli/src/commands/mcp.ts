// `catalogus mcp [path]` -- runs the MCP server over stdio so an agent
// (Claude Code, or any other MCP client) can call read_manifest /
// detect_stack / propose_manifest_edit against this repo mid-session
// (HANDOFF.md section 6).
//
// **Over stdio, stdout *is* the JSON-RPC channel.** A single stray
// console.log anywhere in this process corrupts the framing and the client
// disconnects with no useful diagnostic. Every command already returns a
// CommandResult instead of printing for exactly this kind of reason
// (types.ts) -- this command is the one place that guarantee actually
// matters at runtime, because here it isn't `emit()` deciding what reaches
// stdout, it's the MCP SDK itself, message by message, for as long as the
// process runs. @catalogus/core's detect() was grepped end to end and
// prints nothing (server.test.ts's stdout-spy test proves it for the whole
// server, not just by inspection, by spying on process.stdout.write while
// driving both tools through an in-memory transport). Diagnostics, if this
// ever needs them, go to stderr.
//
// **Resolving when the client hangs up.** The brief for this is
// "StdioServerTransport ends when stdin ends", which is only half true of
// the SDK as installed (1.30.0): `StdioServerTransport.start()` registers
// `data`/`error` listeners on stdin but never an `end` listener, so nothing
// inside the transport ever calls its own `close()` -- the method that
// actually fires `onclose` -- just because stdin reached EOF. Run as the
// real CLI binary this gap is invisible: once stdin ends and nothing else
// is keeping the event loop open, node exits the process on its own
// (verified directly: a script with only stdin `data`/`error` listeners,
// no `end` handler at all, still exits 0 the moment a piped stdin closes),
// which looks identical from the outside to "resolved at exit 0" even
// though runMcp's own Promise never actually settled. That stops being
// invisible the instant this runs anywhere else the process doesn't also
// end when stdin does -- a test process such as this package's own vitest
// run, which has plenty else keeping it alive. There, a never-settled
// Promise hangs forever. Listening for stdin's own `end` event here and
// calling transport.close() explicitly makes the behaviour real rather than
// coincidental, and makes it the *same* real behaviour whether this runs as
// the shipped binary or as mcp.test.ts driving injected streams.
//
// **Closing only once every answered request has been answered.** The
// first version closed the transport the moment stdin ended, and over a
// pipe -- `cat requests.ndjson | catalogus mcp` -- that dropped every tool
// call still running: the process exited 0 having answered only the
// requests the SDK rejects synchronously (2026-09-06 validation, defect
// D1; 4 of 16 answered, all 16 with stdin held open). An SDK client never
// sees this because it waits for each reply before hanging up, which is
// exactly why the in-process tests did not catch it. So stdin's `end` now
// only marks the input as finished; the transport closes when the set of
// request ids received and not yet answered is empty. The bookkeeping
// wraps the transport's `onmessage` (the SDK installs it in connect()) and
// `send` (which the SDK calls for every response) rather than the tool
// handlers, so it counts what the client is actually owed: a response on
// the wire, not a handler that resolved. A handler that never settles
// would hold the process open; nothing here has one, and a client that
// wants out can still kill the process.
//
// `stdin`/`stdout` are parameters, defaulting to the real process streams,
// for exactly that testability -- StdioServerTransport's own constructor
// already accepts stream overrides for this reason, and mcp.test.ts uses it
// with a `PassThrough` pair rather than the real `process.stdin`, which
// vitest itself is still reading from. (2026-09-06.)
import type { Readable, Writable } from "node:stream";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { JSONRPCMessage, RequestId } from "@modelcontextprotocol/sdk/types.js";

import { createCatalogusMcpServer } from "../mcp/server.js";
import { resolveTargetPath } from "../paths.js";
import type { CommandResult } from "../types.js";
import { errorMessage } from "../types.js";

export interface RunMcpOptions {
  /** Overrides the real process.stdin, for tests. */
  stdin?: Readable;
  /** Overrides the real process.stdout, for tests. */
  stdout?: Writable;
}

export async function runMcp(pathArg: string | undefined, options: RunMcpOptions = {}): Promise<CommandResult> {
  // Resolved through the same function every command uses (paths.ts), and
  // only when a path was actually given -- an absent pathArg here must stay
  // absent as the server's defaultPath, not collapse into today's cwd,
  // because a tool call made later needs to be able to tell "no path
  // anywhere" (walk up from cwd at call time) apart from "this server's
  // default is cwd" (don't walk past it) -- read-manifest.ts's own header
  // is where that distinction actually matters.
  const defaultPath = pathArg === undefined ? undefined : resolveTargetPath(pathArg);
  const server = createCatalogusMcpServer({ defaultPath });

  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const transport = new StdioServerTransport(stdin, stdout);

  return new Promise<CommandResult>((resolve) => {
    transport.onclose = () => {
      resolve({ exitCode: 0, stdout: [], stderr: [] });
    };

    // Requests received and not yet answered -- see the header.
    const pending = new Set<RequestId>();
    let inputEnded = false;
    const closeWhenIdle = (): void => {
      if (!inputEnded || pending.size > 0) {
        return;
      }
      transport.close().catch(() => {
        // close() only rejects if send()/pause() throw, neither of which
        // is reachable once the input side has already ended; nothing
        // more to do here beyond not leaving an unhandled rejection.
      });
    };
    const trackRequestsAndResponses = (): void => {
      const onmessage = transport.onmessage;
      transport.onmessage = (message: JSONRPCMessage) => {
        if ("id" in message && "method" in message) {
          pending.add(message.id);
        }
        onmessage?.(message);
      };
      const send = transport.send.bind(transport);
      transport.send = async (message: JSONRPCMessage) => {
        await send(message);
        if ("id" in message && !("method" in message) && message.id !== undefined) {
          pending.delete(message.id);
          closeWhenIdle();
        }
      };
    };

    // See the header comment: StdioServerTransport never wires this itself.
    // Wrapped in its own try/catch, separate from server.connect()'s below:
    // `stdin.on` throwing synchronously here (an unusable stream, mirrored
    // directly by mcp.test.ts's "connecting throws" case) is exactly the
    // same failure server.connect() would otherwise surface a moment later
    // from inside transport.start(), which also calls `stdin.on`. Left
    // unguarded, a synchronous throw here would escape this Promise's
    // executor entirely and reject runMcp's own promise instead of
    // resolving it at exit 2 the way every other connection failure does.
    try {
      stdin.on("end", () => {
        inputEnded = true;
        closeWhenIdle();
      });
    } catch (error) {
      resolve({ exitCode: 2, stdout: [], stderr: [errorMessage(error)] });
      return;
    }

    // The wrappers go on after connect() has installed the SDK's own
    // onmessage. Messages are only ever delivered from stdin `data`
    // events, which cannot run before this continuation does, so no
    // request can slip past the bookkeeping in between.
    server
      .connect(transport)
      .then(trackRequestsAndResponses)
      .catch((error: unknown) => {
        resolve({ exitCode: 2, stdout: [], stderr: [errorMessage(error)] });
      });
  });
}
