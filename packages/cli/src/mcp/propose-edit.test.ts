// Tests for propose-edit.ts (see its own module comment for the design).
// Added 2026-09-06.
//
// The property every one of these tests ultimately exists to prove is the
// one propose-edit.ts's module comment states as its whole reason to exist:
// the real manifest -- and, where one is fixture'd, the real .catalogus/ --
// is never written, moved, or read for writing, whether every step in a
// proposal succeeds or the run stops partway through a failure. Each test
// below that runs a proposal reads the real file back afterward and
// compares it to what the fixture wrote, byte for byte.
import { mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import type { ProposeManifestEditReport } from "./propose-edit.js";
import { proposeManifestEdit, sha256Hex } from "./propose-edit.js";

const MANIFEST_HEADER = "# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json";

// Deliberately minimal, matching add.test.ts / set.test.ts's own SCAFFOLD --
// empty services and dependencies, so add's id-derivation runs against a
// manifest that has nothing to collide with.
const SCAFFOLD = `${MANIFEST_HEADER}
# Hand-written header comment -- must survive every edit.
catalogus: 1
project:
  name: Example App
  slug: example-app
services: []
dependencies: []
`;

// The same shape link.test.ts's own fixture uses: two services already
// present, so link/unlink/deprecate/remove/rename have something real to
// act on and something real to fail against (an id that isn't here).
const WITH_SERVICES = `${MANIFEST_HEADER}
# Hand-written header comment -- must survive every edit.
catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: fly-api
    service: fly-io
    role: hosting
    added: 2025-11-02
  - id: supabase-db
    service: supabase
    role: database
    added: 2025-11-02
dependencies: []
`;

const CLEAN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h2v2h-2z" fill="#123456"/></svg>';

// The same icon fixture shape rename.test.ts uses: an entry whose `icon`
// points at the conventional `.catalogus/icons/<id>.svg` path, with a real
// file sitting there.
const WITH_ICON = `${MANIFEST_HEADER}
catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: logs
    service: loki
    role: observability
    added: 2025-11-02
    icon: .catalogus/icons/logs.svg
dependencies: []
`;

describe("proposeManifestEdit", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) {
      await removeTempDir(dir);
    }
  });

  async function manifestBytes(filename = "catalogus.yaml"): Promise<Buffer> {
    return readFile(join(dir, filename));
  }

  it("an add proposal returns a diff and one reproducing command, and leaves the real file untouched", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);
    const before = await manifestBytes();

    const result = (await proposeManifestEdit({
      path: dir,
      edits: [{ op: "add", service: "fly-io", role: "hosting" }],
    })) as ProposeManifestEditReport;

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.diff).toContain("service: fly-io");
    expect(result.commands).toEqual(["catalogus add fly-io --role hosting"]);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ op: "add", exitCode: 0 });

    expect(await manifestBytes()).toEqual(before);
  });

  it("baseSha256 is the SHA-256 hex of the real manifest's text as it was read for this proposal", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);

    const result = (await proposeManifestEdit({
      path: dir,
      edits: [{ op: "add", service: "fly-io", role: "hosting" }],
    })) as ProposeManifestEditReport;

    expect(result.baseSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.baseSha256).toBe(sha256Hex(SCAFFOLD));
  });

  it("a multi-step proposal (add, add, link) applies all three and the diff shows the edge", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);
    const before = await manifestBytes();

    const result = (await proposeManifestEdit({
      path: dir,
      edits: [
        { op: "add", service: "fly-io", role: "hosting" },
        { op: "add", service: "supabase", role: "database" },
        { op: "link", from: "fly-io", to: "supabase" },
      ],
    })) as ProposeManifestEditReport;

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.exitCode)).toEqual([0, 0, 0]);
    expect(result.commands).toEqual([
      "catalogus add fly-io --role hosting",
      "catalogus add supabase --role database",
      "catalogus link fly-io supabase",
    ]);
    expect(result.diff).toContain("service: fly-io");
    expect(result.diff).toContain("service: supabase");
    expect(result.diff).toContain("[fly-io, supabase]");

    expect(await manifestBytes()).toEqual(before);
  });

  it("a failing step stops the run: exit code and stderr are reported, commands holds only the steps before it, the real file is untouched", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", WITH_SERVICES);
    const before = await manifestBytes();

    const result = (await proposeManifestEdit({
      path: dir,
      edits: [
        { op: "add", service: "heroku", role: "hosting" },
        { op: "link", from: "fly-api", to: "does-not-exist" },
      ],
    })) as ProposeManifestEditReport;

    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toMatchObject({ op: "add", exitCode: 0 });
    expect(result.steps[1]?.exitCode).toBe(1);
    expect(result.steps[1]?.stderr.join("\n")).toContain("does-not-exist");
    // Only the first (successful) step's command carried forward.
    expect(result.commands).toEqual(["catalogus add heroku --role hosting"]);

    expect(await manifestBytes()).toEqual(before);
  });

  it("a set carrying private free text is refused with the command's own exit code and message, and writes nothing", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);
    const before = await manifestBytes();

    const result = (await proposeManifestEdit({
      path: dir,
      edits: [{ op: "set", field: "project.architecture", value: "Trello, billed to finance@example.com" }],
    })) as ProposeManifestEditReport;

    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ op: "set", exitCode: 2 });
    expect(result.steps[0]?.stderr.join("\n")).toContain("private data");
    expect(result.commands).toEqual([]);
    expect(result.changed).toBe(false);
    expect(result.diff).toBe("");

    expect(await manifestBytes()).toEqual(before);
  });

  it("a rename reports the moved vendored icon under otherFiles, and leaves the real files untouched", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", WITH_ICON);
    await mkdir(join(dir, ".catalogus", "icons"), { recursive: true });
    await writeFixtureFile(dir, ".catalogus/icons/logs.svg", CLEAN_SVG);
    const beforeManifest = await manifestBytes();
    const beforeIcon = await readFile(join(dir, ".catalogus", "icons", "logs.svg"));

    const result = (await proposeManifestEdit({
      path: dir,
      edits: [{ op: "rename", from: "logs", to: "loki-logs" }],
    })) as ProposeManifestEditReport;

    expect(result.ok).toBe(true);
    expect(result.commands).toEqual(["catalogus rename logs loki-logs"]);
    expect(result.otherFiles).toEqual(
      expect.arrayContaining([
        { path: ".catalogus/icons/logs.svg", change: "removed" },
        { path: ".catalogus/icons/loki-logs.svg", change: "added" },
      ])
    );
    expect(result.otherFiles).toHaveLength(2);

    expect(await manifestBytes()).toEqual(beforeManifest);
    expect(await readFile(join(dir, ".catalogus", "icons", "logs.svg"))).toEqual(beforeIcon);
    await expect(stat(join(dir, ".catalogus", "icons", "loki-logs.svg"))).rejects.toThrow();
  });

  it("a stack.yaml source reports writesTo ending in catalogus.yaml", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "stack.yaml", SCAFFOLD);
    const before = await manifestBytes("stack.yaml");

    const result = (await proposeManifestEdit({
      path: dir,
      edits: [{ op: "add", service: "fly-io", role: "hosting" }],
    })) as ProposeManifestEditReport;

    expect(result.ok).toBe(true);
    expect(result.manifestPath.replace(/\\/g, "/")).toMatch(/stack\.yaml$/);
    expect(result.writesTo.replace(/\\/g, "/")).toMatch(/catalogus\.yaml$/);

    expect(await manifestBytes("stack.yaml")).toEqual(before);
    await expect(stat(join(dir, "catalogus.yaml"))).rejects.toThrow();
  });

  it("a set value containing spaces round-trips through the quoting helper", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);

    const result = (await proposeManifestEdit({
      path: dir,
      edits: [{ op: "set", field: "project.architecture", value: "modular monolith (.NET 10)" }],
    })) as ProposeManifestEditReport;

    expect(result.ok).toBe(true);
    expect(result.commands).toEqual(["catalogus set project.architecture 'modular monolith (.NET 10)'"]);
    // Tokenizing the quoted command the way a POSIX shell would (splitting
    // on unquoted whitespace, unwrapping a single-quoted run) hands runSet
    // back exactly the two tokens it was given.
    const [field, value] = result.commands[0]?.split(" project.architecture ") ?? [];
    expect(field).toBe("catalogus set");
    expect(value?.replace(/^'|'$/g, "")).toBe("modular monolith (.NET 10)");
  });

  it("a set value beginning with a dash gets commander's end-of-options marker so the real binary accepts it", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);

    const result = (await proposeManifestEdit({
      path: dir,
      edits: [{ op: "set", field: "project.architecture", value: "-x" }],
    })) as ProposeManifestEditReport;

    expect(result.ok).toBe(true);
    expect(result.diff).toContain("architecture: -x");
    expect(result.commands).toEqual(["catalogus set -- project.architecture -x"]);
  });

  it("step output names the real directory, never the scratch copy", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);
    let scratch = "";

    const result = (await proposeManifestEdit(
      { path: dir, edits: [{ op: "add", service: "fly-io", role: "hosting" }] },
      { onScratchDir: (d) => { scratch = d; } }
    )) as ProposeManifestEditReport;

    expect(scratch).not.toBe("");
    const lines = result.steps.flatMap((step) => [...step.stdout, ...step.stderr]);
    expect(lines.some((line) => line.includes(dir))).toBe(true);
    expect(lines.some((line) => line.includes(scratch))).toBe(false);
  });

  it("no manifest in the directory returns the not-found payload naming catalogus init --yes", async () => {
    dir = await createTempDir();

    const result = await proposeManifestEdit({
      path: dir,
      edits: [{ op: "add", service: "fly-io", role: "hosting" }],
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ fill: "catalogus init --yes" });
    expect("error" in result && result.error).toContain(dir);
  });

  it("removes the scratch directory after both a successful and a failed proposal", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", WITH_SERVICES);

    // A real assertion, not a cast: proving the hook actually fired is part
    // of what this test is for, and a cast past `undefined` would let a
    // hook that silently never ran slip past unnoticed.
    function requireScratchDir(captured: string | undefined): string {
      if (captured === undefined) {
        throw new Error("onScratchDir was never called");
      }
      return captured;
    }

    let captured: string | undefined;
    const okResult = await proposeManifestEdit(
      { path: dir, edits: [{ op: "add", service: "heroku", role: "hosting" }] },
      { onScratchDir: (d) => (captured = d) }
    );
    expect(okResult.ok).toBe(true);
    const okScratchDir = requireScratchDir(captured);
    expect(okScratchDir.startsWith(tmpdir())).toBe(true);
    await expect(stat(okScratchDir)).rejects.toThrow();

    captured = undefined;
    const failResult = await proposeManifestEdit(
      { path: dir, edits: [{ op: "link", from: "fly-api", to: "does-not-exist" }] },
      { onScratchDir: (d) => (captured = d) }
    );
    expect(failResult.ok).toBe(false);
    const failScratchDir = requireScratchDir(captured);
    await expect(stat(failScratchDir)).rejects.toThrow();
  });
});
