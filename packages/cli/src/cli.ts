#!/usr/bin/env node
// Bin entrypoint. `program.ts` owns building the commander program and
// deriving its command surface; this file owns only what must never be
// shared with anything else this package exports -- see program.ts's own
// header for exactly why that boundary exists and what happens when it is
// crossed (a real, reproduced defect, not a hypothetical one).
//
// `runCli` is also exercised directly from cli.test.ts, driven by argv
// rather than a spawned process, which is what makes commander's own
// error/help paths -- not just the command functions -- testable at all.
import { fileURLToPath } from "node:url";

import { CommanderError } from "commander";

import { looksLikePrivateFlagName, privateFlagRefusalMessage } from "./private-guard.js";
import { createProgram, listCommandNames } from "./program.js";

// Re-exported rather than defined here, so nothing importing `./cli.js`
// today has to change (skill-commands-drift.test.ts's `createProgram`,
// view-payload.ts's `listCommandNames`) -- program.ts's own header explains
// why the actual definitions had to move.
export { createProgram, listCommandNames };

/**
 * Parses `argv` (the "user" slice -- no node executable, no script path)
 * against a fresh program and returns the process exit code. This is the
 * whole bin entrypoint's logic, factored out so cli.test.ts can drive it
 * directly instead of spawning a child process to exercise commander's own
 * error/help paths. `process.exitCode` is reset up front so one call's
 * outcome can never leak into the next -- real usage only ever calls this
 * once per process, but tests (and this reset) treat every call as if it
 * started a fresh one.
 */
export async function runCli(argv: string[]): Promise<number> {
  process.exitCode = undefined;
  const program = createProgram();
  try {
    await program.parseAsync(argv, { from: "user" });
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  } catch (error) {
    if (!(error instanceof CommanderError)) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }

    if (error.code === "commander.unknownOption") {
      const flag = /--[\w-]+/.exec(error.message)?.[0];
      if (flag && looksLikePrivateFlagName(flag.slice(2))) {
        console.error(privateFlagRefusalMessage(flag));
        return 2;
      }
    }

    // Every commander-native path reaching here -- help, version, and
    // every other Command.error() failure (missing/unknown option, unknown
    // command, ...) -- already wrote its message to the right stream
    // (writeOut for --help/--version/`catalogus help`, the writeErr hook in
    // program.ts for everything else, private-flag redirection included) by
    // the time this throw happens. Nothing left to print; just propagate the
    // exit code commander computed.
    return error.exitCode;
  }
}

// **Must stay in this file, and must stay the only thing besides `runCli`
// that this file's own module body reaches** -- program.ts's header explains
// why: the moment this file imports anything that `index.ts`'s own graph
// also imports, tsup's bundler is free to move this check into a shared
// chunk, at which point `import.meta.url` no longer names `dist/cli.js` and
// this is always false. `createProgram`/`listCommandNames` above are
// re-exports, evaluated as plain bindings, not additional imports pulling
// program.ts's *content* into this file's own body -- program.ts staying
// side-effect-free is what makes that safe.
const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
