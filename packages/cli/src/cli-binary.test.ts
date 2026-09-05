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
});
