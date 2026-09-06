// runMcp, exercised with injected stdin/stdout streams rather than the real
// process.stdin/process.stdout -- this test process (vitest) has plenty
// else keeping its event loop alive, unlike the real `catalogus mcp`
// binary, where the whole process simply exits once stdin ends. Running
// this against the real streams here would mean either never observing
// that exit (the test hangs) or racing vitest's own stdin usage. See
// mcp.ts's own header for why StdioServerTransport needs an explicit
// `stdin.on("end", ...)` at all, and why that's exactly what makes this
// file possible: without it, ending the injected PassThrough below would
// never resolve runMcp's promise, and this test would hang instead of
// failing loudly.
import { PassThrough } from "node:stream";
import type { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runMcp } from "./mcp.js";

function jsonRpcLine(message: unknown): string {
  return JSON.stringify(message) + "\n";
}

describe("runMcp", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(
      dir,
      "catalogus.yaml",
      `catalogus: 1
project:
  name: X
  slug: x
services: []
dependencies: []
`
    );
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("resolves { exitCode: 0, stdout: [], stderr: [] } once stdin ends", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    stdout.resume(); // drain so the transport's writes never block on backpressure

    const resultPromise = runMcp(dir, { stdin, stdout });
    stdin.end();

    await expect(resultPromise).resolves.toEqual({ exitCode: 0, stdout: [], stderr: [] });
  });

  it("resolves { exitCode: 2, stderr: [message] } when connecting to the transport throws", async () => {
    // A stdin whose .on() throws makes StdioServerTransport.start() reject,
    // which is what server.connect(transport) awaits -- the simplest way to
    // force this path without a real broken stream.
    const brokenStdin = {
      on: () => {
        throw new Error("boom: no stdin here");
      },
    } as unknown as Readable;
    const stdout = new PassThrough();
    stdout.resume();

    const result = await runMcp(dir, { stdin: brokenStdin, stdout });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toEqual([]);
    expect(result.stderr).toEqual(["boom: no stdin here"]);
  });

  it("serves read_manifest and detect_stack over the injected streams before stdin ends", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const chunks: Buffer[] = [];
    stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

    const resultPromise = runMcp(dir, { stdin, stdout });

    stdin.write(
      jsonRpcLine({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "mcp.test.ts", version: "0.0.0" },
        },
      })
    );
    stdin.write(jsonRpcLine({ jsonrpc: "2.0", method: "notifications/initialized" }));
    stdin.write(jsonRpcLine({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));

    // Give the server's message handling a turn before ending stdin -- the
    // handlers above are synchronous (no fs access), but this still lets
    // any pending microtasks settle before the transport closes.
    await new Promise((resolve) => setImmediate(resolve));
    stdin.end();

    const result = await resultPromise;
    expect(result).toEqual({ exitCode: 0, stdout: [], stderr: [] });

    const lines = Buffer.concat(chunks)
      .toString("utf8")
      .split("\n")
      .filter((line) => line.length > 0);
    expect(lines.length).toBeGreaterThan(0);
    const messages = lines.map((line) => JSON.parse(line) as { id?: number; result?: { tools?: Array<{ name: string }> } });
    const toolsListResponse = messages.find((m) => m.id === 2);
    expect(toolsListResponse).toBeDefined();
    const names = toolsListResponse?.result?.tools?.map((t) => t.name) ?? [];
    expect(names).toContain("read_manifest");
    expect(names).toContain("detect_stack");
  });
});
