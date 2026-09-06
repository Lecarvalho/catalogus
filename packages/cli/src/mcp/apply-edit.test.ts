// Tests for apply-edit.ts (see its own module comment for the design).
// Added 2026-09-06 (Phase 6, decision 14).
//
// Unlike propose-edit.test.ts, these tests read the real file back after
// every call expecting a write, rather than asserting it is untouched --
// that is the whole point of the tool this file tests.
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { applyPatch } from "diff";
import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import type { Edit } from "./propose-edit.js";
import type { ProposeManifestEditReport } from "./propose-edit.js";
import { proposeManifestEdit, sha256Hex } from "./propose-edit.js";
import type { ApplyManifestEditReport } from "./apply-edit.js";
import { applyManifestEdit } from "./apply-edit.js";

const MANIFEST_HEADER = "# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json";

// Same shape propose-edit.test.ts uses for its own SCAFFOLD/WITH_SERVICES --
// empty services and dependencies, so add's id-derivation has nothing to
// collide with; a two-service manifest for link/unlink/deprecate/remove/
// rename to act on and to fail against.
const SCAFFOLD = `${MANIFEST_HEADER}
# Hand-written header comment -- must survive every edit.
catalogus: 1
project:
  name: Example App
  slug: example-app
services: []
dependencies: []
`;

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

describe("applyManifestEdit", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) {
      await removeTempDir(dir);
    }
  });

  async function manifestText(filename = "catalogus.yaml"): Promise<string> {
    return readFile(join(dir, filename), "utf8");
  }

  it("applies an add: ok, changed, and the real file changes accordingly", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);

    const result = (await applyManifestEdit({
      path: dir,
      edits: [{ op: "add", service: "fly-io", role: "hosting" }],
    })) as ApplyManifestEditReport;

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.baseChecked).toBe(false);
    expect(result.writtenTo).toBe(join(dir, "catalogus.yaml"));
    expect(result.diff).toContain("+  - id: fly-io");
    expect(result.steps).toEqual([
      expect.objectContaining({ op: "add", exitCode: 0, command: "catalogus add fly-io --role hosting" }),
    ]);

    const written = await manifestText();
    expect(written).toContain("service: fly-io");
    expect(written).not.toBe(SCAFFOLD);
  });

  it("applies when given the proposal's own baseSha256, and reports baseChecked: true", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);

    const edits: Edit[] = [{ op: "add", service: "fly-io", role: "hosting" }];
    const proposal = (await proposeManifestEdit({ path: dir, edits })) as ProposeManifestEditReport;
    expect(proposal.baseSha256).toMatch(/^[0-9a-f]{64}$/);

    const result = (await applyManifestEdit({
      path: dir,
      edits,
      baseSha256: proposal.baseSha256,
    })) as ApplyManifestEditReport;

    expect(result.ok).toBe(true);
    expect(result.baseChecked).toBe(true);
    expect(await manifestText()).toContain("service: fly-io");
  });

  it("refuses a wrong baseSha256 before running anything, and writes nothing", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);
    const before = await readFile(join(dir, "catalogus.yaml"));

    const result = await applyManifestEdit({
      path: dir,
      edits: [{ op: "add", service: "fly-io", role: "hosting" }],
      baseSha256: "0".repeat(64),
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ staleBase: true });
    expect("error" in result && result.error).toContain("Propose again");
    expect(await readFile(join(dir, "catalogus.yaml"))).toEqual(before);
  });

  it("a failing second step leaves the first step's write on disk and reports both", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", WITH_SERVICES);

    const result = (await applyManifestEdit({
      path: dir,
      edits: [
        { op: "add", service: "heroku", role: "hosting" },
        { op: "link", from: "fly-api", to: "does-not-exist" },
      ],
    })) as ApplyManifestEditReport;

    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toMatchObject({ op: "add", exitCode: 0 });
    expect(result.steps[1]?.exitCode).toBe(1);
    expect(result.steps[1]?.stderr.join("\n")).toContain("does-not-exist");

    const written = await manifestText();
    expect(written).toContain("service: heroku");
    expect(written).not.toContain("does-not-exist");
  });

  it("the proposal -> apply round trip: the real file equals the proposal's diff applied to the original", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);
    const original = await manifestText();

    const edits: Edit[] = [
      { op: "add", service: "fly-io", role: "hosting" },
      { op: "add", service: "supabase", role: "database" },
      { op: "link", from: "fly-io", to: "supabase" },
    ];

    const proposal = (await proposeManifestEdit({ path: dir, edits })) as ProposeManifestEditReport;
    expect(proposal.ok).toBe(true);

    const applied = (await applyManifestEdit({
      path: dir,
      edits,
      baseSha256: proposal.baseSha256,
    })) as ApplyManifestEditReport;
    expect(applied.ok).toBe(true);

    const patched = applyPatch(original, proposal.diff);
    if (patched === false) {
      throw new Error("applyPatch could not apply the proposal's own diff to the original text");
    }
    const real = await manifestText();
    expect(real).toBe(patched);
    expect(applied.sha256After).toBe(sha256Hex(real));
  });

  it("no manifest in the directory returns the not-found payload naming the init_manifest tool", async () => {
    dir = await createTempDir();

    const result = await applyManifestEdit({
      path: dir,
      edits: [{ op: "add", service: "fly-io", role: "hosting" }],
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ fill: "init_manifest" });
    expect("error" in result && result.error).toContain(dir);
  });

  it("a stack.yaml source writes to catalogus.yaml and leaves stack.yaml as the reported manifestPath", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "stack.yaml", SCAFFOLD);

    const result = (await applyManifestEdit({
      path: dir,
      edits: [{ op: "add", service: "fly-io", role: "hosting" }],
    })) as ApplyManifestEditReport;

    expect(result.ok).toBe(true);
    expect(result.manifestPath.replace(/\\/g, "/")).toMatch(/stack\.yaml$/);
    expect(result.writtenTo.replace(/\\/g, "/")).toMatch(/catalogus\.yaml$/);
    await expect(stat(join(dir, "catalogus.yaml"))).resolves.toBeTruthy();
  });
});
