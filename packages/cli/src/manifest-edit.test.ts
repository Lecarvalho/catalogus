import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runAdd } from "./commands/add.js";
import { runDeprecate } from "./commands/deprecate.js";
import { runLink } from "./commands/link.js";
import { runRemove } from "./commands/remove.js";
import { runSet } from "./commands/set.js";
import { runValidate } from "./commands/validate.js";
import { cycleKey } from "./manifest-edit.js";
import { createTempDir, removeTempDir, writeFixtureFile } from "./test-support/temp-dir.js";
import type { CommandResult } from "./types.js";

// Both suites below test the shared writer path rather than one command, so
// each runs against every writer. That is the point: both defects were found
// on `remove` and then reproduced on `link` and `deprecate` against the same
// files, which is what established they belonged in manifest-edit.ts. A test
// that only covered `remove` would let the next writer reintroduce either
// one.
const WRITERS: Array<{ name: string; run: (dir: string) => Promise<CommandResult> }> = [
  { name: "add", run: (dir) => runAdd(dir, "stripe", { role: "payments" }) },
  { name: "set", run: (dir) => runSet(dir, ["project.name", "Renamed"]) },
  { name: "link", run: (dir) => runLink(dir, "svc-a", "svc-b") },
  { name: "deprecate", run: (dir) => runDeprecate(dir, "svc-a") },
  { name: "remove", run: (dir) => runRemove(dir, "svc-a") },
];

const HEALTHY = `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-a
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: svc-b
    service: supabase
    role: database
    added: 2025-01-02
dependencies: []
`;

// svc-a is declared first and touches neither edge, so a command aimed at it
// is unambiguously innocent of the cycle between svc-b and svc-c.
const PREEXISTING_CYCLE = `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-a
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: svc-b
    service: supabase
    role: database
    added: 2025-01-02
  - id: svc-c
    service: stripe
    role: payments
    added: 2025-01-03
dependencies:
  - [svc-b, svc-c]
  - [svc-c, svc-b]
`;

// The same cycle, plus a half-built second one: svc-a -> svc-d is here
// already, so one added edge back the other way closes a fresh loop while
// the svc-b/svc-c loop stays exactly as it was.
const MIXED_CYCLES = `catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-a
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: svc-b
    service: supabase
    role: database
    added: 2025-01-02
  - id: svc-c
    service: stripe
    role: payments
    added: 2025-01-03
  - id: svc-d
    service: heroku
    role: hosting
    added: 2025-01-04
dependencies:
  - [svc-b, svc-c]
  - [svc-c, svc-b]
  - [svc-a, svc-d]
`;

describe("openManifestForEdit -- an explicit path never falls through to an ancestor", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", HEALTHY);
    await mkdir(join(dir, "sub"), { recursive: true });
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  for (const writer of WRITERS) {
    it(`${writer.name} refuses an existing subdirectory that holds no manifest, leaving the ancestor's untouched`, async () => {
      const before = await readFile(join(dir, "catalogus.yaml"), "utf8");

      const result = await writer.run(join(dir, "sub"));

      expect(result.exitCode).toBe(2);
      const stderr = result.stderr.join(" ");
      expect(stderr).toContain("No catalogus.yaml in");
      expect(stderr).toContain(join(dir, "sub"));
      // Naming the manifest that does exist is the half that makes the error
      // actionable -- without it the message says a typo'd path is empty and
      // leaves the user to guess that the parent is what they meant.
      expect(stderr).toContain(join(dir, "catalogus.yaml"));

      expect(await readFile(join(dir, "catalogus.yaml"), "utf8")).toBe(before);
    });
  }

  it("says how to create one when no ancestor holds a manifest either", async () => {
    const orphan = await createTempDir();
    try {
      await mkdir(join(orphan, "sub"), { recursive: true });
      const result = await runRemove(join(orphan, "sub"), "svc-a");

      expect(result.exitCode).toBe(2);
      const stderr = result.stderr.join(" ");
      expect(stderr).toContain("No catalogus.yaml in");
      expect(stderr).toContain('Run "catalogus init" to create one.');
      // The ancestor sentence is the wrong advice when there is no ancestor.
      expect(stderr).not.toContain("was named explicitly");
    } finally {
      await removeTempDir(orphan);
    }
  });

  it("still accepts an explicit path to the directory that does hold the manifest", async () => {
    const result = await runRemove(dir, "svc-a");
    expect(result.exitCode).toBe(0);
  });

  // The check asks "is there a manifest here", not "is there a catalogus.yaml
  // here" -- reading stack.yaml is still supported, so a repo on the old
  // filename must not be locked out of every writer by this fix.
  it("accepts an explicit path to a directory holding only the stack.yaml fallback", async () => {
    const fallbackDir = await createTempDir();
    try {
      await writeFixtureFile(fallbackDir, "stack.yaml", HEALTHY);
      const result = await runRemove(fallbackDir, "svc-a");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join(" ")).toContain("catalogus.yaml");
    } finally {
      await removeTempDir(fallbackDir);
    }
  });
});

describe("commitManifestEdit -- a pre-existing cycle is not blamed on the current edit", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", PREEXISTING_CYCLE);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  for (const writer of WRITERS) {
    it(`${writer.name} reports the cycle against the file, not against itself`, async () => {
      const before = await readFile(join(dir, "catalogus.yaml"), "utf8");

      const result = await writer.run(join(dir, "."));

      expect(result.exitCode).toBe(1);
      const stderr = result.stderr.join(" ");
      expect(stderr).toContain("already contained a cyclic dependency before this command");
      expect(stderr).toContain("svc-b -> svc-c -> svc-b");
      // The command-blaming phrasing every writer used to produce here.
      expect(stderr).not.toContain("would make");
      expect(stderr).toContain("Nothing was written.");

      expect(await readFile(join(dir, "catalogus.yaml"), "utf8")).toBe(before);
    });
  }

  // The reason a cyclic manifest is still opened at all rather than refused
  // up front: `remove` on one of the cycle's services is the only thing in
  // the CLI that breaks a cycle. Refusing to open would turn a reported
  // defect into an unfixable one, which is the failure mode Phase 3.6's
  // `remove` section exists to prevent.
  it("still lets remove break the cycle it is aimed at", async () => {
    const result = await runRemove(dir, "svc-c");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join(" ")).toContain("dropped edge: svc-b -> svc-c");
    expect(result.stdout.join(" ")).toContain("dropped edge: svc-c -> svc-b");

    const validated = await runValidate(dir, {});
    expect(validated.exitCode).toBe(0);
  });

  // The other half of the discrimination, and the case a coarser check --
  // "was the file already cyclic?" -- would get wrong: a file that already
  // has one cycle must not launder a second, disjoint one added on top of
  // it. svc-a -> svc-d is already there, so linking svc-d -> svc-a closes a
  // fresh loop alongside the untouched svc-b/svc-c one.
  it("blames a cycle the edit actually created, even on a file that already had one", async () => {
    const mixedDir = await createTempDir();
    try {
      await writeFixtureFile(mixedDir, "catalogus.yaml", MIXED_CYCLES);

      const result = await runLink(mixedDir, "svc-d", "svc-a");

      expect(result.exitCode).toBe(1);
      const stderr = result.stderr.join(" ");
      expect(stderr).toContain('Linking "svc-d" -> "svc-a" would make');
      expect(stderr).toContain("svc-a -> svc-d -> svc-a");
      expect(stderr).not.toContain("already contained");
    } finally {
      await removeTempDir(mixedDir);
    }
  });

  it("blames a cycle the edit created on a previously healthy file", async () => {
    const healthyDir = await createTempDir();
    try {
      await writeFixtureFile(healthyDir, "catalogus.yaml", HEALTHY);
      expect((await runLink(healthyDir, "svc-a", "svc-b")).exitCode).toBe(0);

      const result = await runLink(healthyDir, "svc-b", "svc-a");
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join(" ")).toContain('Linking "svc-b" -> "svc-a" would make');
      expect(result.stderr.join(" ")).toContain("cyclic dependency");
      expect(result.stderr.join(" ")).not.toContain("already contained");
    } finally {
      await removeTempDir(healthyDir);
    }
  });
});

// findCycles returns a closed walk whose entry point depends on declaration
// order, so identity has to survive rotation or an edit that reorders nodes
// would make an old cycle look new. Tested directly rather than through a
// command because no writer in the CLI today reorders services -- the
// property is defensive, and an untested defensive property is a guess.
describe("cycleKey", () => {
  it("gives the same key to the same loop entered from a different node", () => {
    expect(cycleKey(["b", "c", "d", "b"])).toBe(cycleKey(["c", "d", "b", "c"]));
    expect(cycleKey(["b", "c", "d", "b"])).toBe(cycleKey(["d", "b", "c", "d"]));
  });

  it("distinguishes a loop from its reverse, which is a different set of edges", () => {
    expect(cycleKey(["b", "c", "b"])).not.toBe(cycleKey(["b", "d", "b"]));
    expect(cycleKey(["b", "c", "d", "b"])).not.toBe(cycleKey(["b", "d", "c", "b"]));
  });

  it("handles a self-edge, which is the shortest closed walk there is", () => {
    expect(cycleKey(["a", "a"])).toBe("a");
  });
});
