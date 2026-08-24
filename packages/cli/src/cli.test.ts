// Exercises createProgram/runCli's own error and help handling directly --
// the part of cli.ts that isn't covered by calling a command function
// (runInit, runAdd, ...) directly, since it's commander's own parsing and
// exitOverride/configureOutput wiring under test here, not the commands
// themselves.
//
// commander writes its own text straight to process.stdout.write /
// process.stderr.write (its writeOut/writeErr defaults, and the writeErr
// hook in createProgram falls back to the same), not console.log/
// console.error -- only emit() (used by our own command results) goes
// through console.*. So these tests spy on the process streams directly
// rather than on console.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "./cli.js";
import { createTempDir, removeTempDir, writeFixtureFile } from "./test-support/temp-dir.js";

function spyOnStreams() {
  const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  return { out, err };
}

// `vi.spyOn(process.stdout, "write")` infers a MockInstance typed to
// process.stdout.write's actual (overloaded) signature, not the generic
// `ReturnType<typeof vi.spyOn>` catch-all -- the two don't structurally
// unify, since the overloaded call signature isn't assignable to a plain
// `(...args: unknown[]) => unknown`. Pulling the type back out of
// spyOnStreams's own return value, rather than re-deriving it by hand,
// keeps this tied to whatever vi.spyOn actually infers here.
type StreamSpy = ReturnType<typeof spyOnStreams>["out"];

function written(spy: StreamSpy): string {
  return spy.mock.calls.map((c) => String(c[0])).join("");
}

describe("runCli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints usage and exits 1 on a bare invocation with no subcommand", async () => {
    const { out, err } = spyOnStreams();

    const exitCode = await runCli([]);

    expect(exitCode).toBe(1);
    // The bug this regresses: commander's real usage text got swallowed by
    // a blanket-silenced writeErr, leaving only its internal
    // "(outputHelp)" placeholder to print.
    const printed = written(err);
    expect(printed).toContain("Usage: dagstree");
    expect(printed).toContain("Commands:");
    expect(printed).not.toContain("(outputHelp)");
    expect(written(out)).toBe("");
  });

  it("prints help once (not swallowed, not duplicated) for --help", async () => {
    const { out, err } = spyOnStreams();

    const exitCode = await runCli(["--help"]);

    expect(exitCode).toBe(0);
    expect(written(err)).toBe("");
    const printed = written(out);
    expect(printed.match(/Usage: dagstree/g)).toHaveLength(1);
  });

  it("prints help exactly once (not doubled) for the bare `help` subcommand", async () => {
    const { out } = spyOnStreams();

    const exitCode = await runCli(["help"]);

    expect(exitCode).toBe(0);
    const printed = written(out);
    expect(printed.match(/Usage: dagstree/g)).toHaveLength(1);
  });

  it("redirects an unrecognized private-looking flag to the private-overlay message, at exit 2", async () => {
    // Unlike commander's own paths (all above), this one message is
    // runCli's own console.error() call, not a passthrough of commander's
    // writeErr -- suppressed there specifically so this replacement can be
    // printed instead of commander's generic "unknown option" text.
    const { err } = spyOnStreams();
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runCli(["add", "stripe", "--role", "payments", "--cost", "20"]);

    expect(exitCode).toBe(2);
    // commander's own generic "unknown option" text must not have reached
    // the real stderr -- one message, not two.
    expect(written(err)).toBe("");
    const printed = consoleErrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toContain("--cost");
    expect(printed).toContain("push --private");
    expect(printed).not.toContain("error: unknown option");
  });

  it("still refuses a plain unrecognized flag as a normal unknown-option error", async () => {
    const { err } = spyOnStreams();

    const exitCode = await runCli(["add", "stripe", "--role", "payments", "--bogus", "xyz"]);

    expect(exitCode).toBe(1);
    const printed = written(err);
    expect(printed).toContain("unknown option");
    expect(printed).toContain("--bogus");
  });

  it("does not leak exit code state between calls", async () => {
    spyOnStreams();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = await runCli(["add", "stripe", "--role", "payments", "--cost", "20"]);
    expect(first).toBe(2);
    const second = await runCli(["--version"]);
    expect(second).toBe(0);
  });

  // FIX 4: `add` takes an optional positional [path], matching every other
  // command's surface, exercised here through the real commander wiring
  // (not just the runAdd/resolveAddPathArg unit tests in add.test.ts).
  describe("add's positional [path]", () => {
    it("accepts a positional path the same way init/detect/diff/validate/graph do", async () => {
      spyOnStreams();
      const dir = await createTempDir();
      try {
        await writeFixtureFile(
          dir,
          "dagstree.yaml",
          "dagstree: 1\nproject:\n  name: X\n  slug: x\nservices: []\ndependencies: []\n"
        );

        const exitCode = await runCli(["add", "fly-io", dir, "--role", "hosting"]);

        expect(exitCode).toBe(0);
        const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
        expect(text).toContain("service: fly-io");
      } finally {
        await removeTempDir(dir);
      }
    });

    // Both of these were live bugs that every unit test in add.test.ts
    // passed straight through, because both lived in the argv wiring rather
    // than in runAdd. Found by running the built binary.
    it("carries --kind and --version through commander into the written entry", async () => {
      spyOnStreams();
      const dir = await createTempDir();
      try {
        await writeFixtureFile(
          dir,
          "dagstree.yaml",
          "dagstree: 1\nproject:\n  name: X\n  slug: x\nservices: []\ndependencies: []\n"
        );

        // --version is the sharp one. commander registers `--version` on the
        // program via .version(), every subcommand inherits it, and the
        // inherited option beat add's own: this exact argv printed the CLI
        // version, added nothing, and exited 0. Silent data loss, not an
        // error. enablePositionalOptions() in cli.ts is what scopes it.
        const exitCode = await runCli([
          "add",
          "dotnet",
          dir,
          "--kind",
          "stack",
          "--version",
          "10",
          "--role",
          "runtime-backend",
        ]);

        expect(exitCode).toBe(0);
        const parsed = parse(await readFile(join(dir, "dagstree.yaml"), "utf8"));
        expect(parsed.services).toHaveLength(1);
        expect(parsed.services[0]).toMatchObject({ service: "dotnet", kind: "stack", version: "10" });
      } finally {
        await removeTempDir(dir);
      }
    });

    it("rejects an out-of-enum --kind rather than dropping it", async () => {
      spyOnStreams();
      const dir = await createTempDir();
      try {
        await writeFixtureFile(
          dir,
          "dagstree.yaml",
          "dagstree: 1\nproject:\n  name: X\n  slug: x\nservices: []\ndependencies: []\n"
        );

        // The action used to build its options object field by field and
        // simply omitted kind/version, so a bogus --kind was not rejected --
        // it was silently discarded and the entry written without it.
        const exitCode = await runCli(["add", "foo", dir, "--kind", "widget", "--role", "x"]);

        expect(exitCode).toBe(2);
        const parsed = parse(await readFile(join(dir, "dagstree.yaml"), "utf8"));
        expect(parsed.services).toEqual([]);
      } finally {
        await removeTempDir(dir);
      }
    });

    it("still reports the CLI version for a bare --version", async () => {
      spyOnStreams();
      // The other half of the enablePositionalOptions change: scoping
      // options to the command they follow must not cost the conventional
      // top-level `dagstree --version`.
      await expect(runCli(["--version"])).resolves.toBe(0);
    });

    it("errors, without touching the manifest, when the positional path and --path disagree", async () => {
      spyOnStreams();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const dir = await createTempDir();
      const otherDir = await createTempDir();
      try {
        const manifest = "dagstree: 1\nproject:\n  name: X\n  slug: x\nservices: []\ndependencies: []\n";
        await writeFixtureFile(dir, "dagstree.yaml", manifest);

        const exitCode = await runCli(["add", "fly-io", dir, "--role", "hosting", "--path", otherDir]);

        expect(exitCode).toBe(2);
        const after = await readFile(join(dir, "dagstree.yaml"), "utf8");
        expect(after).toBe(manifest);
      } finally {
        await removeTempDir(dir);
        await removeTempDir(otherDir);
      }
    });
  });

  // set/link/deprecate are the three writers added so the CLI, rather than a
  // hand edit, owns every Layer 2 field. Their argument shapes differ from
  // each other on purpose -- set's pair list is variadic, so it takes --path
  // where link and deprecate take a positional [path] -- and that is exactly
  // the kind of wiring a direct call to the command function cannot check.
  describe("the manifest-writing commands, driven through argv", () => {
    const SCAFFOLD = ["dagstree: 1", "project:", "  name: X", "  slug: x", "services: []", "dependencies: []", ""].join(
      "\n"
    );

    it("set takes repeated <field> <value> pairs and --path", async () => {
      spyOnStreams();
      const dir = await createTempDir();
      try {
        await writeFixtureFile(dir, "dagstree.yaml", SCAFFOLD);

        const exitCode = await runCli([
          "set",
          "project.vcs.provider",
          "github",
          "project.vcs.visibility",
          "private",
          "--path",
          dir,
        ]);

        expect(exitCode).toBe(0);
        const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
        expect(text).toContain("provider: github");
        expect(text).toContain("visibility: private");
      } finally {
        await removeTempDir(dir);
      }
    });

    it("link takes <from> <to> and a positional [path]", async () => {
      spyOnStreams();
      const dir = await createTempDir();
      try {
        await writeFixtureFile(dir, "dagstree.yaml", SCAFFOLD);
        await runCli(["add", "fly-io", dir, "--role", "hosting"]);
        await runCli(["add", "supabase", dir, "--role", "database"]);

        const exitCode = await runCli(["link", "fly-io", "supabase", dir]);

        expect(exitCode).toBe(0);
        const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
        expect(text).toContain("[fly-io, supabase]");
      } finally {
        await removeTempDir(dir);
      }
    });

    it("deprecate takes <id>, a positional [path], --status and --replaced-by", async () => {
      spyOnStreams();
      const dir = await createTempDir();
      try {
        await writeFixtureFile(dir, "dagstree.yaml", SCAFFOLD);
        await runCli(["add", "heroku", dir, "--role", "hosting"]);
        await runCli(["add", "fly-io", dir, "--role", "hosting"]);

        const exitCode = await runCli([
          "deprecate",
          "heroku",
          dir,
          "--status",
          "phasing_out",
          "--replaced-by",
          "fly-io",
        ]);

        expect(exitCode).toBe(0);
        const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
        expect(text).toContain("status: phasing_out");
        expect(text).toContain("replaced_by: fly-io");
      } finally {
        await removeTempDir(dir);
      }
    });

    it("remove takes <id> and a positional [path]", async () => {
      spyOnStreams();
      const dir = await createTempDir();
      try {
        await writeFixtureFile(dir, "dagstree.yaml", SCAFFOLD);
        await runCli(["add", "fly-io", dir, "--role", "hosting"]);
        await runCli(["add", "supabase", dir, "--role", "database"]);
        await runCli(["link", "fly-io", "supabase", dir]);

        const exitCode = await runCli(["remove", "supabase", dir]);

        expect(exitCode).toBe(0);
        const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
        expect(text).not.toContain("supabase");
        expect(text).toContain("dependencies: []");
      } finally {
        await removeTempDir(dir);
      }
    });

    it("rename takes <old> <new> and a positional [path]", async () => {
      spyOnStreams();
      const dir = await createTempDir();
      try {
        await writeFixtureFile(dir, "dagstree.yaml", SCAFFOLD);
        await runCli(["add", "fly-io", dir, "--role", "hosting"]);
        await runCli(["add", "supabase", dir, "--role", "database"]);
        await runCli(["link", "fly-io", "supabase", dir]);

        // Two positional ids ahead of the optional [path] is the shape most
        // at risk of commander swallowing the directory as an argument --
        // the bug `--depends-on` hit in Phase 3.5.
        const exitCode = await runCli(["rename", "supabase", "supabase-db", dir]);

        expect(exitCode).toBe(0);
        const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
        expect(text).toContain("id: supabase-db");
        expect(text).toContain("[fly-io, supabase-db]");
        expect(await runCli(["validate", dir])).toBe(0);
      } finally {
        await removeTempDir(dir);
      }
    });
  });
});
