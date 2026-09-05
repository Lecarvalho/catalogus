// The commander program itself: every `catalogus <command>` this CLI
// registers, wired onto the command functions in `src/commands/`.
//
// **Split out of `cli.ts` on 2026-09-05, and the split is load-bearing, not
// cosmetic.** `view-payload.ts` needs `listCommandNames()` below so the
// viewer's Help panel and `catalogus --help` can never name a different set
// of commands (docs/menus-brief.md) -- and the first attempt at that had
// `view-payload.ts` import straight from `cli.ts`. That compiled and every
// test passed, and it also broke the shipped binary: tsup's two entries
// (`index.ts` for the package's public API, `cli.ts` for the bin) share
// exactly the code both reach, and once `index.ts`'s dependency graph
// (through `view-payload.ts`) touched anything in `cli.ts`, tsup moved
// `cli.ts`'s *entire* module -- including the bottom-of-file `isMainModule`
// self-invocation this bin script depends on -- into a chunk shared by both
// outputs. That relocation is silent and correct in every way but one:
// `isMainModule` compares `import.meta.url` to `process.argv[1]`, and once
// the check itself lives in a shared chunk file rather than in `dist/cli.js`,
// `import.meta.url` names the *chunk's* path, which is never what
// `process.argv[1]` names when a user runs `catalogus`. The check silently
// evaluates false forever, `runCli()` never fires, and the built binary exits
// 0 with no output for every invocation -- reproduced directly (`node
// dist/cli.js --version` printed nothing) before this file existed to fix
// it. `cli.ts` cannot depend on anything `index.ts`'s graph also reaches, or
// this happens again; this file is the boundary that guarantees it stays
// side-effect-free so it is safe for both entries to share.
//
// This file owns everything pure and shareable: building the program,
// deriving the command list, reading the package version. `cli.ts` keeps
// only the bin-entrypoint's own side effect (the `isMainModule` check and its
// invocation) and its thin `runCli` wrapper, and re-exports `createProgram`
// from here so nothing importing `./cli.js` today (skill-commands-drift.test.ts
// included) has to change.
import { createRequire } from "node:module";

import { Command } from "commander";

import { resolveAddPathArg, runAdd } from "./commands/add.js";
import { runDeprecate } from "./commands/deprecate.js";
import { runDetect } from "./commands/detect.js";
import { runDiff } from "./commands/diff.js";
import { runGraph } from "./commands/graph.js";
import { runIcons } from "./commands/icons.js";
import { runInit } from "./commands/init.js";
import { runLink } from "./commands/link.js";
import { runRemove } from "./commands/remove.js";
import { runRename } from "./commands/rename.js";
import { runSet, SETTABLE_FIELDS } from "./commands/set.js";
import { runUnlink } from "./commands/unlink.js";
import { runValidate } from "./commands/validate.js";
import { DEFAULT_VIEW_PORT, runView } from "./commands/view.js";
import { looksLikePrivateFlagName } from "./private-guard.js";
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

// Read the version from package.json rather than repeating it here. A
// hardcoded copy had already drifted -- `--version` reported 0.1.0 while the
// package said 0.0.1 -- and a CLI that misreports its own version undermines
// every bug report filed against it.
function packageVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version?: string };
  return pkg.version ?? "0.0.0";
}

/**
 * Builds a fresh commander Program. A function rather than module-level
 * state so runCli can build a clean one on every call -- commander's
 * Command instances accumulate parsed option values, so reusing one across
 * calls (as tests do, repeatedly) would leak one call's flags into the
 * next.
 *
 * Exported for skill-commands-drift.test.ts, which walks the returned
 * program's command and option tables to check that every `catalogus ...`
 * line in the shipped skill still names something this CLI actually
 * registers. Reading that surface off the live program is the point: a
 * hand-copied list of command names in a test is one more artifact that
 * drifts, which is the defect the test exists to catch.
 */
export function createProgram(): Command {
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
      // runCli's catch block (cli.ts) prints privateFlagRefusalMessage()
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
    .command("icons")
    .description("report which icon source each service entry resolves to, and which have none")
    .argument("[path]", "repo path (defaults to the current directory)")
    .action(async (path: string | undefined) => {
      emit(await runIcons(path));
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
    .command("unlink")
    .description("remove one dependency edge between two services")
    .argument("<from>", "local id that depended on <to>")
    .argument("<to>", "local id <from> depended on")
    .argument("[path]", "target directory (defaults to the current directory)")
    .action(async (from: string, to: string, path: string | undefined) => {
      emit(await runUnlink(path, from, to));
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
    .description("delete a service entry, every dependency edge that names it, and its vendored icon file")
    .argument("<id>", "local id of the entry to delete")
    .argument("[path]", "target directory (defaults to the current directory)")
    .action(async (id: string, path: string | undefined) => {
      emit(await runRemove(path, id));
    });

  program
    .command("rename")
    .description("change a service entry's local id, moving every edge, replaced_by and its vendored icon with it")
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
 * Every command name `createProgram()` registers, in registration order --
 * derived from a fresh program rather than a hand-copied list, for the same
 * reason `createProgram` itself is exported to skill-commands-drift.test.ts:
 * a list typed out a second time is one more artifact that drifts. Read by
 * `view-payload.ts` (`cliCommands`), which hands this same list to the
 * viewer's Help panel so the panel and `catalogus --help` can never name a
 * different set of commands.
 *
 * A function, not a module-level constant: `createProgram()` builds a whole
 * commander `Command` tree, and running that as a side effect of merely
 * importing this file would be work nobody asked for. Called once per
 * `catalogus view` server start (view-payload.ts's own `buildViewPayload`),
 * which is exactly as often as `createProgram()` already runs for `view`
 * itself.
 */
export function listCommandNames(): string[] {
  return createProgram().commands.map((command) => command.name());
}
