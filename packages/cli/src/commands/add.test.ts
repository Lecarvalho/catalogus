import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { resolveAddPathArg, runAdd } from "./add.js";

const COMMENTED_MANIFEST = `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
# Example App's manifest -- hand annotated, do not clobber these comments.
catalogus: 1
project:
  name: Example App
  slug: example-app
  vcs: { visibility: private }
services:
  - id: supabase-db # primary datastore
    service: supabase
    role: database
    added: 2025-11-02
dependencies: []
`;

describe("runAdd", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", COMMENTED_MANIFEST);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("preserves comments, key order, and the $schema modeline when adding a service", async () => {
    const result = await runAdd(dir, "fly-io", { role: "hosting" });
    expect(result.exitCode).toBe(0);

    const text = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(text).toContain("# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json");
    expect(text).toContain("# Example App's manifest -- hand annotated, do not clobber these comments.");
    expect(text).toContain("# primary datastore");
    // flowCollectionPadding:false (chosen to match HANDOFF.md's compact
    // [from, to] edge tuples) also tightens this pre-existing inline map's
    // interior spacing -- still the same flow-style choice the human made,
    // just reformatted, which is the expected trade-off.
    expect(text).toContain("vcs: {visibility: private}");
    // new entry present with a derived id
    expect(text).toContain("id: fly-io");
    expect(text).toContain("service: fly-io");
  });

  it("derives the bare service slug as the id for a service the manifest doesn't have yet", async () => {
    const result = await runAdd(dir, "fly-io", { role: "hosting" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain('"fly-io"');
  });

  // The fixture already holds supabase, under the explicit id "supabase-db".
  // The bare id "supabase" is therefore free -- and taking it would leave
  // "supabase" sitting beside "supabase-db", legal but reading as though the
  // two were different kinds of thing. Once a service is present, the
  // role-qualified id is the right default.
  it("derives service-role once that service already appears, even when the bare id is free", async () => {
    const result = await runAdd(dir, "supabase", { role: "auth" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain('"supabase-auth"');
  });

  it("falls back to service-role-2 when the role-qualified id is also taken", async () => {
    await runAdd(dir, "supabase", { role: "auth" }); // takes "supabase-auth"
    const result = await runAdd(dir, "supabase", { role: "auth" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain('"supabase-auth-2"');
  });

  it("refuses a duplicate id and writes nothing", async () => {
    const before = await readFile(join(dir, "catalogus.yaml"), "utf8");
    const result = await runAdd(dir, "supabase", { role: "storage", id: "supabase-db" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Duplicate service id");
    const after = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(after).toBe(before);
  });

  it("adds dependency edges for --depends-on, in compact tuple form", async () => {
    const result = await runAdd(dir, "fly-io", { role: "hosting", dependsOn: ["supabase-db"] });
    expect(result.exitCode).toBe(0);
    const text = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(text).toContain("[fly-io, supabase-db]");
  });

  it("refuses an unknown --depends-on id, naming it and the known ids, and writes nothing", async () => {
    // FIX 4: this is the id-clearly-not-a-service-id case a swallowed
    // positional path lands in -- the message must name the actual bad
    // value rather than surfacing as an opaque schema/reference error.
    const before = await readFile(join(dir, "catalogus.yaml"), "utf8");
    const result = await runAdd(dir, "fly-io", { role: "hosting", dependsOn: ["does-not-exist"] });
    expect(result.exitCode).toBe(1);
    const text = result.stderr.join("\n");
    expect(text).toContain("does-not-exist");
    expect(text).toContain("supabase-db");
    const after = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(after).toBe(before);
  });

  it("refuses a new entry that depends on itself (a self-edge) and writes nothing", async () => {
    const before = await readFile(join(dir, "catalogus.yaml"), "utf8");
    const result = await runAdd(dir, "fly-io", { role: "hosting", id: "loopy", dependsOn: ["loopy"] });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("cyclic dependency");
    const after = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(after).toBe(before);
  });

  it("rejects a --role that is not a valid slug before touching the file", async () => {
    const before = await readFile(join(dir, "catalogus.yaml"), "utf8");
    const result = await runAdd(dir, "fly-io", { role: "Not A Slug" });
    expect(result.exitCode).toBe(2);
    const after = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(after).toBe(before);
  });

  it("accepts role: payments -- a legitimate ServiceCategory value, not private data", async () => {
    const result = await runAdd(dir, "stripe", { role: "payments" });
    expect(result.exitCode).toBe(0);
  });

  it("refuses --notes that looks like Layer 3 data and writes nothing", async () => {
    const before = await readFile(join(dir, "catalogus.yaml"), "utf8");
    const result = await runAdd(dir, "namecheap", {
      role: "dns",
      notes: "billing account dsnk@example.com, cost 42 USD/month, plan tier pro, renewal 2027-01-01",
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("--notes");
    expect(result.stderr.join("\n")).toContain("push --private");
    const after = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(after).toBe(before);
  });

  it("accepts ordinary public --notes text", async () => {
    const result = await runAdd(dir, "namecheap", {
      role: "dns",
      notes: "primary domain for the marketing site",
    });
    expect(result.exitCode).toBe(0);
    const text = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(text).toContain("notes: primary domain for the marketing site");
  });

  it("accepts --notes with a bare soft keyword and writes it, with a warning rather than a refusal", async () => {
    // FIX (write-time gate over-blocking): a soft-only hit used to be
    // refused outright, with no override -- the same string `catalogus
    // validate` accepts at exit 0. Now it's written, and the warning
    // `checkManifestObject` already produces for it is surfaced instead of
    // silently dropped.
    const result = await runAdd(dir, "github-actions", {
      role: "ci",
      notes: "renewal is automated via GitHub Actions",
    });
    expect(result.exitCode).toBe(0);
    const text = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(text).toContain("notes: renewal is automated via GitHub Actions");
    expect(result.stderr.join("\n")).toContain("warning:");
    expect(result.stderr.join("\n")).toContain("renewal");
  });

  it("rejects a --depends-on value that isn't a valid slug, naming it as a likely swallowed path, before touching the file", async () => {
    // FIX 4 follow-up: --depends-on is variadic, so `catalogus add supabase
    // --role=database --depends-on fly ./somewhere` swallows "./somewhere"
    // into dependsOn instead of reading it as the positional [path] --
    // this must be caught by shape, not left to surface as an opaque
    // manifest-not-found error naming the wrong directory.
    const before = await readFile(join(dir, "catalogus.yaml"), "utf8");
    const result = await runAdd(dir, "supabase", { role: "database", dependsOn: ["fly", "./somewhere"] });
    expect(result.exitCode).toBe(2);
    const text = result.stderr.join("\n");
    expect(text).toContain("--depends-on");
    expect(text).toContain("./somewhere");
    expect(text).toContain("looks like a path");
    const after = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(after).toBe(before);
  });

  it("exits 2 when an explicitly given target directory does not exist, rather than silently editing an ancestor manifest", async () => {
    const before = await readFile(join(dir, "catalogus.yaml"), "utf8");
    const missing = join(dir, "does-not-exist");
    const result = await runAdd(missing, "fly-io", { role: "hosting" });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("does not exist");
    const after = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(after).toBe(before);
  });

  it("exits 2 with a clear message when no manifest exists", async () => {
    const empty = await createTempDir();
    try {
      const result = await runAdd(empty, "fly-io", { role: "hosting" });
      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("\n")).toContain("catalogus init");
    } finally {
      await removeTempDir(empty);
    }
  });

  it("reports a stack.yaml -> catalogus.yaml migration when adding to a fallback-named manifest", async () => {
    const stackDir = await createTempDir();
    try {
      await writeFixtureFile(
        stackDir,
        "stack.yaml",
        "catalogus: 1\nproject:\n  name: X\n  slug: x\nservices: []\ndependencies: []\n"
      );
      const result = await runAdd(stackDir, "fly-io", { role: "hosting" });
      expect(result.exitCode).toBe(0);
      const summary = result.stdout.join("\n");
      expect(summary).toContain("migrated");
      expect(summary).toContain("stack.yaml");
      expect(summary).toContain("catalogus.yaml");

      const newText = await readFile(join(stackDir, "catalogus.yaml"), "utf8");
      expect(newText).toContain("service: fly-io");

      // the original stack.yaml is left in place, unmodified -- the message
      // above says so explicitly rather than leaving it as a silent,
      // now-disagreeing duplicate.
      const oldText = await readFile(join(stackDir, "stack.yaml"), "utf8");
      expect(oldText).not.toContain("fly-io");
    } finally {
      await removeTempDir(stackDir);
    }
  });
});

// FIX 4: `add` gets an optional positional [path] like every other command
// (init/detect/diff/validate/graph), with --path kept working as an alias.
describe("resolveAddPathArg", () => {
  it("uses the positional path when only it is given", () => {
    expect(resolveAddPathArg("./myproject", undefined)).toEqual({ ok: true, value: "./myproject" });
  });

  it("uses --path when only it is given (the pre-existing behaviour, kept working)", () => {
    expect(resolveAddPathArg(undefined, "./myproject")).toEqual({ ok: true, value: "./myproject" });
  });

  it("resolves to undefined (current directory) when neither is given", () => {
    expect(resolveAddPathArg(undefined, undefined)).toEqual({ ok: true, value: undefined });
  });

  it("accepts both when they agree", () => {
    expect(resolveAddPathArg("./myproject", "./myproject")).toEqual({ ok: true, value: "./myproject" });
  });

  it("accepts both when they name the same directory but are spelled differently", () => {
    // FIX: the comparison resolves through resolveTargetPath instead of
    // comparing raw strings -- "target" and "./target" name the same
    // directory and must not be reported as disagreeing. (node:path's
    // resolve() normalizes "\" as a separator on Windows too, so the same
    // fix also covers "./target" vs ".\target" there -- not asserted here
    // since "\" is just a literal character on a POSIX resolve().)
    expect(resolveAddPathArg("target", "./target")).toEqual({ ok: true, value: "target" });
  });

  it("is an explicit error, not a silent precedence rule, when both are given and disagree", () => {
    const result = resolveAddPathArg("./myproject", "./other");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected an error result");
    expect(result.error.exitCode).toBe(2);
    const text = result.error.stderr.join("\n");
    expect(text).toContain("./myproject");
    expect(text).toContain("./other");
  });
});
