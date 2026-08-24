import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "./test-support/temp-dir.js";
import { InvalidWorkspaceRootError, scanWorkspace } from "./workspace-scan.js";

function manifestNamed(name: string): string {
  return `catalogus: 1
project:
  name: ${name}
  slug: ${name}
services: []
dependencies: []
`;
}

async function makeRepoDir(root: string, name: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Creates a directory link at `linkPath` pointing at `target`, using the
 * one call that is both portable and unprivileged: `fs.symlink(target,
 * path, "junction")`. The "junction" type is honoured only on Windows
 * (creating a junction -- no elevation needed); POSIX ignores the type
 * argument and creates an ordinary symlink, which resolves the same way
 * for this scanner's purposes. Never attempts `mklink` or a true Windows
 * *symbolic* link (`New-Item -ItemType SymbolicLink`) -- that form needs
 * Administrator and is not something a test may assume is available.
 */
async function tryDirLink(target: string, linkPath: string): Promise<boolean> {
  try {
    await symlink(target, linkPath, "junction");
    return true;
  } catch {
    return false;
  }
}

// Probed once, at module load, on a throwaway temp dir: whether this
// runner can create even the unprivileged directory-link form above. Not
// every CI sandbox is guaranteed to allow it, and a test that fails for
// that environmental reason is a false signal about the code under test
// -- so the whole junction/symlink describe block below is skipped
// (visibly, as "skipped" rather than "passed") when the probe fails,
// rather than silently asserting nothing.
async function probeDirLinkSupport(): Promise<boolean> {
  const probeRoot = await createTempDir("catalogus-cli-test-linkprobe-");
  try {
    const target = join(probeRoot, "target");
    await mkdir(target);
    return await tryDirLink(target, join(probeRoot, "link"));
  } finally {
    await removeTempDir(probeRoot);
  }
}

const canCreateDirLinks = await probeDirLinkSupport();

describe("scanWorkspace", () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(root);
  });

  it("finds manifests in some immediate children and leaves the rest unmanaged", async () => {
    const withManifest = await makeRepoDir(root, "has-manifest");
    await writeFixtureFile(withManifest, "catalogus.yaml", manifestNamed("has-manifest"));
    await makeRepoDir(root, "no-manifest");

    const result = await scanWorkspace(root);

    expect(result.root).toBe(root);
    expect(result.manifests).toHaveLength(1);
    expect(result.manifests[0]!.name).toBe("has-manifest");
    expect(result.manifests[0]!.path).toBe(withManifest);
    expect(result.manifests[0]!.manifest.project.name).toBe("has-manifest");
    expect(result.failures).toHaveLength(0);
    expect(result.unmanaged).toHaveLength(1);
    expect(result.unmanaged[0]!.name).toBe("no-manifest");
  });

  it("reports malformed YAML as a failure, not a thrown error", async () => {
    const dir = await makeRepoDir(root, "broken-yaml");
    await writeFixtureFile(dir, "catalogus.yaml", "catalogus: [this is not\n  valid: yaml: at all\n");

    const result = await scanWorkspace(root);

    expect(result.manifests).toHaveLength(0);
    expect(result.unmanaged).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    const failure = result.failures[0]!;
    expect(failure.name).toBe("broken-yaml");
    expect(failure.reason).toBe("malformed-yaml");
    expect(failure.message).toContain("Could not parse YAML");
    expect(failure.errors).toHaveLength(1);
  });

  it("reports a manifest that parses but fails schema validation as a failure", async () => {
    const dir = await makeRepoDir(root, "schema-invalid");
    // Missing required project.slug.
    await writeFixtureFile(
      dir,
      "catalogus.yaml",
      `catalogus: 1
project:
  name: Missing Slug
services: []
dependencies: []
`
    );

    const result = await scanWorkspace(root);

    expect(result.manifests).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    const failure = result.failures[0]!;
    expect(failure.name).toBe("schema-invalid");
    expect(failure.reason).toBe("invalid");
    expect(failure.errors.length).toBeGreaterThan(0);
    expect(failure.message).toContain(failure.location.filePath);
  });

  it("falls back to stack.yaml when catalogus.yaml is absent, same as the single-repo lookup", async () => {
    const dir = await makeRepoDir(root, "legacy-name");
    await writeFixtureFile(dir, "stack.yaml", manifestNamed("legacy-name"));

    const result = await scanWorkspace(root);

    expect(result.manifests).toHaveLength(1);
    expect(result.manifests[0]!.location.filename).toBe("stack.yaml");
  });

  it("skips a file sitting directly in the root", async () => {
    await writeFixtureFile(root, "README.md", "not a repo\n");
    const dir = await makeRepoDir(root, "actual-repo");
    await writeFixtureFile(dir, "catalogus.yaml", manifestNamed("actual-repo"));

    const result = await scanWorkspace(root);

    expect(result.manifests).toHaveLength(1);
    expect(result.manifests[0]!.name).toBe("actual-repo");
    expect(result.unmanaged).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });

  it("returns empty lists for an empty root", async () => {
    const result = await scanWorkspace(root);

    expect(result.manifests).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.unmanaged).toEqual([]);
  });

  it("rejects a root that does not exist", async () => {
    await expect(scanWorkspace(join(root, "does-not-exist"))).rejects.toThrow(InvalidWorkspaceRootError);
  });

  it("rejects a root that is a file, not a directory", async () => {
    const filePath = await writeFixtureFile(root, "not-a-dir.txt", "hello\n");
    await expect(scanWorkspace(filePath)).rejects.toThrow(InvalidWorkspaceRootError);
  });

  it("rejects a relative root path", async () => {
    await expect(scanWorkspace("relative/path")).rejects.toThrow(InvalidWorkspaceRootError);
  });

  it("sorts every list ordinally by directory name, independent of creation or read order", async () => {
    // Created out of alphabetical order on purpose.
    const zManifest = await makeRepoDir(root, "zeta-project");
    await writeFixtureFile(zManifest, "catalogus.yaml", manifestNamed("zeta-project"));
    const aManifest = await makeRepoDir(root, "alpha-project");
    await writeFixtureFile(aManifest, "catalogus.yaml", manifestNamed("alpha-project"));
    const mManifest = await makeRepoDir(root, "mid-project");
    await writeFixtureFile(mManifest, "catalogus.yaml", manifestNamed("mid-project"));

    const zFail = await makeRepoDir(root, "zeta-broken");
    await writeFixtureFile(zFail, "catalogus.yaml", "not: [valid yaml\n");
    const aFail = await makeRepoDir(root, "alpha-broken");
    await writeFixtureFile(aFail, "catalogus.yaml", "not: [valid yaml\n");

    await makeRepoDir(root, "zeta-empty");
    await makeRepoDir(root, "alpha-empty");

    const result = await scanWorkspace(root);

    expect(result.manifests.map((m) => m.name)).toEqual(["alpha-project", "mid-project", "zeta-project"]);
    expect(result.failures.map((f) => f.name)).toEqual(["alpha-broken", "zeta-broken"]);
    expect(result.unmanaged.map((u) => u.name)).toEqual(["alpha-empty", "zeta-empty"]);
  });

  it("reports a read failure separately from a parse/validation failure", async () => {
    // findManifestIn() finds the file; make the "read" step itself fail by
    // pointing readManifestText at a directory named catalogus.yaml instead
    // of a file, which is a directory-not-a-file failure findManifestIn's
    // fileExists() (an access() check) does not distinguish, but reading
    // it does.
    const dir = await makeRepoDir(root, "unreadable-manifest");
    await mkdir(join(dir, "catalogus.yaml"));

    const result = await scanWorkspace(root);

    expect(result.manifests).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    const failure = result.failures[0]!;
    expect(failure.name).toBe("unreadable-manifest");
    expect(failure.reason).toBe("unreadable");
    expect(failure.errors).toEqual([]);
  });

  it("includes the manifest's own validation error detail for the invalid reason", async () => {
    const dir = await makeRepoDir(root, "dup-ids");
    await writeFixtureFile(
      dir,
      "catalogus.yaml",
      `catalogus: 1
project:
  name: Dup
  slug: dup
services:
  - id: same
    service: postgresql
    role: db
    added: 2025-01-01
  - id: same
    service: redis
    role: cache
    added: 2025-01-01
dependencies: []
`
    );

    const result = await scanWorkspace(root);

    expect(result.failures).toHaveLength(1);
    const failure = result.failures[0]!;
    expect(failure.reason).toBe("invalid");
    expect(failure.errors.some((e) => e.kind === "reference")).toBe(true);
  });

  describe.skipIf(!canCreateDirLinks)("symlinks and junctions (followed at this depth-1 scan)", () => {
    it("treats a junction/symlink to a directory holding a valid manifest as an ordinary repo", async () => {
      const targetDir = await makeRepoDir(root, "zebra-target");
      await writeFixtureFile(targetDir, "catalogus.yaml", manifestNamed("zebra-target"));
      const linkPath = join(root, "junction-repo");
      expect(await tryDirLink(targetDir, linkPath)).toBe(true);

      const result = await scanWorkspace(root);

      const entry = result.manifests.find((m) => m.name === "junction-repo");
      expect(entry).toBeDefined();
      expect(entry!.path).toBe(linkPath);
      expect(entry!.manifest.project.name).toBe("zebra-target");
      expect(result.failures.map((f) => f.name)).not.toContain("junction-repo");
      expect(result.unmanaged.map((u) => u.name)).not.toContain("junction-repo");
    });

    it("treats a junction/symlink to a directory with no manifest as unmanaged", async () => {
      const targetDir = await makeRepoDir(root, "empty-target");
      const linkPath = join(root, "junction-empty");
      expect(await tryDirLink(targetDir, linkPath)).toBe(true);

      const result = await scanWorkspace(root);

      expect(result.unmanaged.map((u) => u.name)).toContain("junction-empty");
      expect(result.manifests.map((m) => m.name)).not.toContain("junction-empty");
      expect(result.failures.map((f) => f.name)).not.toContain("junction-empty");
    });

    it("reports a broken link as an unreadable failure without sinking the rest of the scan", async () => {
      const linkPath = join(root, "broken-link");
      // Target never exists at all -- broken from creation, so there's no
      // need to create it and then remove it out from under the link.
      expect(await tryDirLink(join(root, "does-not-exist-target"), linkPath)).toBe(true);

      const withManifest = await makeRepoDir(root, "has-manifest");
      await writeFixtureFile(withManifest, "catalogus.yaml", manifestNamed("has-manifest"));
      await makeRepoDir(root, "no-manifest");

      const result = await scanWorkspace(root);

      const failure = result.failures.find((f) => f.name === "broken-link");
      expect(failure).toBeDefined();
      expect(failure!.reason).toBe("unreadable");
      expect(failure!.location.filePath).toBe(linkPath);
      expect(failure!.errors).toEqual([]);
      expect(failure!.message).toContain(linkPath);
      // Not `unmanaged`: that would claim "no manifest here", a fact this
      // scan never actually established for a link it couldn't resolve.
      expect(result.unmanaged.map((u) => u.name)).not.toContain("broken-link");
      expect(result.manifests.map((m) => m.name)).not.toContain("broken-link");

      // The rest of the root is unaffected.
      expect(result.manifests.map((m) => m.name)).toContain("has-manifest");
      expect(result.unmanaged.map((u) => u.name)).toContain("no-manifest");
    });

    it("ignores a link that resolves to a file, the same as a loose file sitting in the root", async () => {
      const targetFile = join(root, "target-file.txt");
      await writeFile(targetFile, "hello\n", "utf8");
      const linkPath = join(root, "link-to-file");
      expect(await tryDirLink(targetFile, linkPath)).toBe(true);

      const result = await scanWorkspace(root);

      expect(result.manifests.map((m) => m.name)).not.toContain("link-to-file");
      expect(result.failures.map((f) => f.name)).not.toContain("link-to-file");
      expect(result.unmanaged.map((u) => u.name)).not.toContain("link-to-file");
    });
  });
});
