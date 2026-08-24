#!/usr/bin/env node
// Bin entrypoint. Wires commander onto the command functions in
// src/commands/ -- all the actual logic lives there so it can be called
// directly from tests without going through argv parsing or process.exit.
// The commander wiring itself (createProgram/runCli) is also exercised
// directly from cli.test.ts, driven by argv rather than a spawned process,
// which is what makes commander's own error/help paths -- not just the
// command functions -- testable at all.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { Command, CommanderError } from "commander";

import { resolveAddPathArg, runAdd } from "./commands/add.js";
import { runDeprecate } from "./commands/deprecate.js";
import { runDetect } from "./commands/detect.js";
import { runDiff } from "./commands/diff.js";
import { runGraph } from "./commands/graph.js";
import { runInit } from "./commands/init.js";
import { runLink } from "./commands/link.js";
import { runRemove } from "./commands/remove.js";
import { runRename } from "./commands/rename.js";
import { runSet, SETTABLE_FIELDS } from "./commands/set.js";
import { runValidate } from "./commands/validate.js";
import { DEFAULT_VIEW_PORT, runView } from "./commands/view.js";
import { looksLikePrivateFlagName, privateFlagRefusalMessage } from "./private-guard.js";
import type { CommandResult } from "./types.js";

// Errors go to stderr, data goes to stdout, so --json output stays pipeable.
function emit(result: CommandResult): void {
  for (const line of result.stdout) {
    console.log(line);
  }
  for (const line of result.stderr) {
    console.error(line);
  }
  process.exitCode = result.exitCode;
}

/**
 * Builds a fresh commander Program. A function rather than module-level
 * state so runCli can build a clean one on every call -- commander's
 * Command instances accumulate parsed option values, so reusing one across
 * calls (as tests do, repeatedly) would leak one call's flags into the
 * next.
 */
// Read the version from package.json rather than repeating it here. A
// hardcoded copy had already drifted -- `--version` reported 0.1.0 while the
// package said 0.0.1 -- and a CLI that misreports its own version undermines
// every bug report filed against it.
function packageVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version?: string };
  return pkg.version ?? "0.0.0";
}

function createProgram(): Command {
  const program = new Command();
  program
    .name("catalogus")
    .description("Catalogus -- a project operations registry (offline commands)")
    .version(packageVersion())
    // Without this, commander's own `--version` (registered on the program by
    // .version() above) is inherited by every subcommand and beats a
    // subcommand's identically-named option -- so `catalogus add dotnet
    // --kind stack --version 10` printed "0.0.1" and added nothing, exit 0.
    // Silent data loss, not an error. enablePositionalOptions scopes an
    // option to the command it follows: `catalogus --version` still reports
    // the CLI version, `catalogus add ... --version 10` reaches `add`.
    .enablePositionalOptions()
    .exitOverride()
    .configureOutput({
      // Commander writes every one of its own error/usage messages (a bare
      // `catalogus` invocation's usage-and-exit-1, an unknown option, an
      // unknown command, a missing required argument, ...) through this
      // hook before throwing (exitOverride makes it throw instead of
      // calling process.exit() itself). The only message that ever needs
      // to be replaced rather than shown verbatim is an unrecognized flag
      // that itself looks like Layer 3 data (`--cost`, `--account`) --
      // runCli's catch block below prints privateFlagRefusalMessage()
      // instead, at exit code 2 rather than commander's generic 1.
      // Everything else passes straight through to the real stderr.
      //
      // An earlier version of this hook silenced writeErr unconditionally
      // (relying on runCli's catch block to reprint error.message instead)
      // on the theory that centralizing every print there was simpler. It
      // mostly worked, because `error.message` on the thrown
      // CommanderError carries the real text for every other commander
      // error code -- except this one: `this.help({error: true})` (the
      // path a bare `catalogus` with no subcommand takes) writes its actual
      // help text through this hook and passes the CommanderError only a
      // useless placeholder, `'(outputHelp)'`. Silencing writeErr there
      // swallowed the help text with nothing to reprint it from -- see
      // cli.test.ts.
      writeErr: (str) => {
        const flag = /^error: unknown option '(--[\w-]+)'/.exec(str)?.[1];
        if (flag && looksLikePrivateFlagName(flag.slice(2))) {
          return;
        }
        process.stderr.write(str);
      },
    });

  program
    .command("init")
    .description("scaffold a catalogus.yaml in the target directory")
    .argument("[path]", "target directory (defaults to the current directory)")
    .option("--yes", "infer everything possible from detection and write without prompting")
    .option("--visibility <visibility>", "repo visibility: public | private | internal (never inferred)")
    .option("--force", "overwrite an existing manifest")
    .action(async (path: string | undefined, opts: { yes?: boolean; visibility?: string; force?: boolean }) => {
      emit(await runInit(path, opts));
    });

  program
    .command("detect")
    .description("scan a repo and print the detected stack (Layer 1)")
    .argument("[path]", "repo path (defaults to the current directory)")
    .option("--json", "machine-readable output")
    .option("--all", "list every detected library inline instead of collapsing them under a count")
    .action(async (path: string | undefined, opts: { json?: boolean; all?: boolean }) => {
      emit(await runDetect(path, opts));
    });

  program
    .command("diff")
    .description("compare detection against the manifest: what's missing, what's stale")
    .argument("[path]", "repo path (defaults to the current directory)")
    .option("--json", "machine-readable output")
    .action(async (path: string | undefined, opts: { json?: boolean }) => {
      emit(await runDiff(path, opts));
    });

  program
    .command("validate")
    .description("schema + acyclicity check on the manifest (CI entrypoint)")
    .argument("[path]", "repo path (defaults to the current directory)")
    .option("--strict", "treat soft private-data warnings (billing, renewal, account, ...) as hard errors")
    .action(async (path: string | undefined, opts: { strict?: boolean }) => {
      emit(await runValidate(path, opts));
    });

  program
    .command("graph")
    .description("render the project dependency DAG")
    .argument("[path]", "repo path (defaults to the current directory)")
    .option("--mermaid", "emit a mermaid flowchart definition instead of ASCII")
    .action(async (path: string | undefined, opts: { mermaid?: boolean }) => {
      emit(await runGraph(path, opts));
    });

  program
    .command("add")
    .description("add a service entry (and any dependency edges) to the manifest")
    .argument("<service>", "catalog slug for the service, e.g. supabase, fly-io")
    .argument("[path]", "target directory (defaults to the current directory)")
    .requiredOption("--role <role>", "the role this instance plays, e.g. database, hosting")
    .option("--id <id>", "local id (derived from service+role when omitted)")
    .option("--depends-on <ids...>", "local ids this new entry depends on")
    .option("--status <status>", "active | deprecated | phasing_out | removed")
    .option("--kind <kind>", "service (default) | component | stack")
    .option("--version <version>", "version in use, e.g. 10, 19.2 -- mostly for --kind stack")
    .option("--replaced-by <id>", "local id of the entry that replaces this one")
    .option("--added <date>", "ISO date this dependency was added (defaults to today)")
    .option("--notes <text>", "free-text annotation")
    .option("--path <path>", "target directory -- alias for the positional [path]; must agree with it if both are given")
    .action(
      async (
        service: string,
        pathArg: string | undefined,
        opts: {
          role: string;
          id?: string;
          dependsOn?: string[];
          status?: string;
          kind?: string;
          version?: string;
          replacedBy?: string;
          added?: string;
          notes?: string;
          path?: string;
        }
      ) => {
        const resolvedPath = resolveAddPathArg(pathArg, opts.path);
        if (!resolvedPath.ok) {
          emit(resolvedPath.error);
          return;
        }
        emit(
          await runAdd(resolvedPath.value, service, {
            role: opts.role,
            id: opts.id,
            dependsOn: opts.dependsOn,
            status: opts.status,
            kind: opts.kind,
            version: opts.version,
            replacedBy: opts.replacedBy,
            added: opts.added,
            notes: opts.notes,
          })
        );
      }
    );

  program
    .command("set")
    .description("set a manifest field: project-level, or an existing service's role")
    .argument("<field>", `one of: ${SETTABLE_FIELDS.join(", ")}`)
    .argument("<value>", "the value")
    .argument("[pairs...]", "further <field> <value> pairs, applied as one edit")
    // Positional [path] is impossible here: the pair list is variadic, so a
    // trailing directory would be read as a field name. See commands/set.ts.
    .option("--path <path>", "target directory (defaults to the current directory)")
    .action(async (field: string, value: string, pairs: string[], opts: { path?: string }) => {
      emit(await runSet(opts.path, [field, value, ...pairs]));
    });

  program
    .command("link")
    .description("add a dependency edge between two services that already exist")
    .argument("<from>", "local id that depends on <to>")
    .argument("<to>", "local id that <from> depends on")
    .argument("[path]", "target directory (defaults to the current directory)")
    .action(async (from: string, to: string, path: string | undefined) => {
      emit(await runLink(path, from, to));
    });

  program
    .command("deprecate")
    .description("mark a service entry deprecated or phasing out")
    .argument("<id>", "local id of the entry to mark")
    .argument("[path]", "target directory (defaults to the current directory)")
    .option("--status <status>", "deprecated | phasing_out (default: deprecated)")
    .option("--replaced-by <id>", "local id of the entry that replaces this one")
    .action(
      async (id: string, path: string | undefined, opts: { status?: string; replacedBy?: string }) => {
        emit(await runDeprecate(path, id, { status: opts.status, replacedBy: opts.replacedBy }));
      }
    );

  program
    .command("remove")
    .description("delete a service entry, and every dependency edge that names it")
    .argument("<id>", "local id of the entry to delete")
    .argument("[path]", "target directory (defaults to the current directory)")
    .action(async (id: string, path: string | undefined) => {
      emit(await runRemove(path, id));
    });

  program
    .command("rename")
    .description("change a service entry's local id, moving every edge and replaced_by with it")
    .argument("<old>", "the local id as it is now")
    .argument("<new>", "the local id it should have")
    .argument("[path]", "target directory (defaults to the current directory)")
    .action(async (oldId: string, newId: string, path: string | undefined) => {
      emit(await runRename(path, oldId, newId));
    });

  program
    .command("view")
    .description("serve the web viewer for this repo's manifest and open it in a browser")
    .argument("[path]", "repo path (defaults to the current directory)")
    .option("--port <port>", `port to serve on (default: ${DEFAULT_VIEW_PORT})`)
    .option("--no-open", "do not open a browser automatically")
    .action(async (path: string | undefined, opts: { port?: string; open?: boolean }) => {
      emit(await runView(path, opts));
    });

  return program;
}

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
    // (writeOut for --help/--version/`catalogus help`, the writeErr hook
    // above for everything else, private-flag redirection included) by the
    // time this throw happens. Nothing left to print; just propagate the
    // exit code commander computed.
    return error.exitCode;
  }
}

const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
