// Exercises `dist/cli.js` -- the shipped binary itself, spawned as a real
// child process -- rather than `runCli()` called in-process the way
// cli.test.ts and every command test do.
//
// **Why this file exists, precisely.** `dist/cli.js`'s last two lines are a
// self-invocation guard: `fileURLToPath(import.meta.url) === process.argv[1]`,
// true only when this exact file is the one `node` was told to run. Calling
// `runCli()` directly (as every other test in this package does) never
// evaluates that guard at all -- it imports the function and calls it, which
// proves the function works but says nothing about whether the *file*
// invokes it. That gap shipped a broken binary once, in this same brief:
// `view-payload.ts` gained an import reaching into `cli.ts` for its
// `listCommandNames()`, and tsup's bundler -- entirely correctly, and
// entirely silently -- moved `cli.ts`'s whole module, guard included, into a
// chunk shared with the `index` entry. Once the guard's own `import.meta.url`
// named the *chunk's* path instead of `dist/cli.js`'s, it was never true
// again: `node dist/cli.js --version` exited 0 and printed nothing, and 609
// green in-process tests (this package's whole suite at the time) had
// nothing to say about it, because not one of them runs the built file.
// `program.ts`'s own header carries the fix and the reasoning; this file is
// the guard against it, or anything shaped like it, recurring unnoticed.
//
// Spawned with `node`, not imported: importing `dist/cli.js` from a test
// would itself evaluate `import.meta.url` against *that* import machinery's
// notion of the running script, not against a real invocation the way a
// user's shell actually launches this binary. Only a real child process
// reproduces `process.argv[1]` the way `npm`/`pnpm`/a bare `catalogus` on
// $PATH would set it.
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "./test-support/temp-dir.js";
import { findRepoRoot } from "./test-support/repo-root.js";

const execFileAsync = promisify(execFile);

const repoRoot = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
const cliBinaryPath = `${repoRoot}/packages/cli/dist/cli.js`;

async function run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliBinaryPath, ...args]);
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: failure.stdout ?? "", stderr: failure.stderr ?? "", exitCode: failure.code ?? 1 };
  }
}

/**
 * Same shape as run() above, for a command that reads stdin rather than
 * exiting once argv is parsed -- `catalogus mcp` is the one command in this
 * package for which that's true. `promisify(execFile)`'s returned Promise
 * carries the live ChildProcess as `.child` (Node's own documented
 * behaviour for a promisified execFile, verified directly here rather than
 * assumed) precisely so a caller can write to its stdin before the process
 * exits and awaiting the Promise makes sense. `stdinLines` are newline-
 * terminated and written before the process's own stdin is closed, so the
 * server sees a complete request even though nothing here waits for a
 * response before sending the next line.
 */
async function runWithStdin(
  args: string[],
  stdinLines: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const resultPromise = execFileAsync(process.execPath, [cliBinaryPath, ...args]);
  const { stdin } = resultPromise.child;
  if (!stdin) {
    throw new Error("spawned child process has no stdin pipe");
  }
  for (const line of stdinLines) {
    stdin.write(line + "\n");
  }
  stdin.end();

  try {
    const { stdout, stderr } = await resultPromise;
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: failure.stdout ?? "", stderr: failure.stderr ?? "", exitCode: failure.code ?? 1 };
  }
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => removeTempDir(dir)));
});

describe("the built dist/cli.js binary, run as a real child process", () => {
  // Not a hand-typed "0.0.1" -- see view-payload.test.ts's own comment on
  // the same choice. A literal here would pass even if the binary printed
  // the wrong (but plausible-looking) version.
  it("prints its own version and exits 0", async () => {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version: string };

    const { stdout, exitCode } = await run(["--version"]);
    expect(stdout.trim()).toBe(pkg.version);
    expect(exitCode).toBe(0);
  });

  it("lists every registered command in --help output, not an empty or truncated table", async () => {
    const { stdout, exitCode } = await run(["--help"]);
    expect(exitCode).toBe(0);
    for (const command of ["init", "detect", "diff", "validate", "graph", "icons", "add", "set", "link", "unlink", "deprecate", "remove", "rename", "view"]) {
      expect(stdout).toContain(`\n  ${command} `);
    }
  });

  // The regression itself: a manifest failing schema validation must exit
  // non-zero with the failure on stdout -- not exit 0 with nothing printed,
  // which is exactly what the silently-broken binary did for every command.
  it("validate exits non-zero and reports the real schema errors against an invalid manifest", async () => {
    const dir = await createTempDir();
    tempDirs.push(dir);
    await writeFixtureFile(
      dir,
      "catalogus.yaml",
      `catalogus: 1
project:
  name: "Bad"
services:
  - id: a
    role: hosting
dependencies: []
`,
    );

    // Schema errors go to stderr, not stdout (validate.ts's own header: "the
    // warning is always printed to stderr ... never to stdout" -- the same
    // rule applies to a hard failure, not only the --strict warning it was
    // written about).
    const { stderr, exitCode } = await run(["validate", dir]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("slug");
  });

  // The other direction of the same proof: a manifest that does pass exits 0
  // and says so -- not a blanket "every invocation exits 0", which the
  // broken binary also satisfied.
  it("validate exits 0 and confirms a valid manifest", async () => {
    const dir = await createTempDir();
    tempDirs.push(dir);
    await writeFixtureFile(
      dir,
      "catalogus.yaml",
      `catalogus: 1
project:
  name: Good
  slug: good
services: []
dependencies: []
`,
    );

    const { stdout, exitCode } = await run(["validate", dir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("is valid");
  });

  // `catalogus mcp` is the one command in this file that never exits on its
  // own -- see commands/mcp.ts's own header on why the process exiting once
  // stdin ends is what makes exit 0 here mean anything at all, rather than
  // this test hanging until vitest's own timeout kills it. The manifest is
  // written by the CLI's own `init --yes` rather than by writeFixtureFile,
  // matching this brief's own instruction, so this test also proves the
  // server can read a manifest this same binary actually produced, not a
  // hand-authored fixture that merely looks like one.
  it("mcp answers a tool call that is still running when stdin ends, before exiting", async () => {
    // A pipe-style client writes everything and closes stdin at once. The
    // first version closed the transport on stdin's `end` and dropped the
    // calls in flight (2026-09-06 validation, defect D1); this is the case
    // the in-process tests could not see, because an SDK client waits for
    // each reply before hanging up.
    const dir = await createTempDir();
    tempDirs.push(dir);
    expect((await run(["init", dir, "--yes"])).exitCode).toBe(0);

    const { stdout, exitCode } = await runWithStdin(["mcp", dir], [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "0" } },
      }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read_manifest", arguments: {} } }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "detect_stack", arguments: {} } }),
    ]);

    expect(exitCode).toBe(0);
    const ids = stdout
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => (JSON.parse(line) as { id?: number }).id);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
  });

  it("mcp speaks JSON-RPC over stdio and exits 0 once the client hangs up", async () => {
    const dir = await createTempDir();
    tempDirs.push(dir);
    const initResult = await run(["init", dir, "--yes"]);
    expect(initResult.exitCode).toBe(0);

    const { stdout, exitCode } = await runWithStdin(["mcp", dir], [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "cli-binary.test.ts", version: "0.0.0" },
        },
      }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    ]);

    expect(exitCode).toBe(0);

    const lines = stdout.split("\n").filter((line) => line.length > 0);
    expect(lines.length).toBeGreaterThan(0);
    const messages = lines.map((line) => {
      // Every non-empty stdout line must be parseable JSON -- a line that
      // isn't means something wrote outside the JSON-RPC framing (stdout
      // rule, docs/mcp-server-brief.md), which corrupts the channel for a
      // real client the same way it would fail this parse.
      return JSON.parse(line) as { id?: number; result?: { tools?: Array<{ name: string }> } };
    });

    const toolsListResponse = messages.find((message) => message.id === 2);
    expect(toolsListResponse).toBeDefined();
    const names = toolsListResponse?.result?.tools?.map((tool) => tool.name) ?? [];
    // "contains", not an exact set: propose_manifest_edit lands in the same
    // commit from a second implementer working in parallel on
    // packages/cli/src/mcp/propose-edit.ts, wired in afterwards by the main
    // session -- this assertion must not go red the moment that happens.
    expect(names).toContain("read_manifest");
    expect(names).toContain("detect_stack");
  });
});
