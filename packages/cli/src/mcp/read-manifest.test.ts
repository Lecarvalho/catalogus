// createReadManifestHandler, exercised directly as the plain async function
// it is -- server.test.ts already proves this tool is reachable through a
// real MCP Client and registerTool's own validation; this file is where the
// tool's own contract (locating the manifest, valid vs invalid, isError vs
// not) gets checked without an in-memory transport in the way.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { createReadManifestHandler } from "./read-manifest.js";

const VALID_MANIFEST = `catalogus: 1
project:
  name: X
  slug: x
services: []
dependencies: []
`;

// Same fixture cli-binary.test.ts uses for its own "invalid manifest" case:
// no project.slug, and a service entry missing the required `service` key.
const INVALID_MANIFEST = `catalogus: 1
project:
  name: "Bad"
services:
  - id: a
    role: hosting
dependencies: []
`;

function text(result: CallToolResult): string {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`expected a text content block, got: ${JSON.stringify(result.content)}`);
  }
  return first.text;
}

describe("createReadManifestHandler", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("returns the raw text, the parsed manifest and valid: true for a manifest that validates", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const handler = createReadManifestHandler();

    const result = await handler({ path: dir });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(text(result)) as {
      manifestPath: string;
      filename: string;
      text: string;
      valid: boolean;
      manifest: { project: { slug: string } };
      warnings: string[];
    };
    expect(Object.keys(payload).sort()).toEqual(["filename", "manifest", "manifestPath", "text", "valid", "warnings"]);
    expect(payload.manifestPath).toBe(join(dir, "catalogus.yaml"));
    expect(payload.filename).toBe("catalogus.yaml");
    expect(payload.text).toBe(VALID_MANIFEST);
    expect(payload.valid).toBe(true);
    expect(payload.warnings).toEqual([]);
    expect(payload.manifest.project.slug).toBe("x");
    // content and structuredContent carry the same object -- an agent
    // reading either sees the same facts.
    expect(result.structuredContent).toEqual(payload);
  });

  it("returns valid: false with the schema problem lines, and is not isError, for a manifest that fails validation", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", INVALID_MANIFEST);
    const handler = createReadManifestHandler();

    const result = await handler({ path: dir });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(text(result)) as { valid: boolean; problems: string[]; manifest?: unknown };
    expect(payload.valid).toBe(false);
    expect(payload.manifest).toBeUndefined();
    expect(payload.problems.length).toBeGreaterThan(0);
    expect(payload.problems.join("\n")).toContain("slug");
  });

  it("is isError and names catalogus init --yes when no manifest exists at an explicit path", async () => {
    const handler = createReadManifestHandler();

    const result = await handler({ path: dir });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("catalogus init --yes");
    expect(text(result)).toContain(`"${dir}"`);
    // An explicit path never gets the upward-walk phrasing.
    expect(text(result)).not.toContain("parent directory");
  });

  it("does not walk up past an explicit input path, even when an ancestor holds a manifest", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const sub = join(dir, "sub");
    await mkdir(sub, { recursive: true });
    const handler = createReadManifestHandler();

    const result = await handler({ path: sub });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain(`"${sub}"`);
  });

  it("treats the server's defaultPath as explicit too -- it also refuses to walk past it", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const sub = join(dir, "sub");
    await mkdir(sub, { recursive: true });
    const handler = createReadManifestHandler({ defaultPath: sub });

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(text(result)).toContain(`"${sub}"`);
  });

  it("an input path overrides the server's defaultPath", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const otherDir = await createTempDir();
    try {
      const handler = createReadManifestHandler({ defaultPath: otherDir });
      const result = await handler({ path: dir });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(text(result)) as { manifestPath: string };
      expect(payload.manifestPath).toBe(join(dir, "catalogus.yaml"));
    } finally {
      await removeTempDir(otherDir);
    }
  });

  it("walks up from the current directory only when no path was given anywhere", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const sub = join(dir, "sub");
    await mkdir(sub, { recursive: true });
    // Neither the tool input nor the server's defaultPath names a path, so
    // resolveTargetPath falls through to process.cwd() -- mocked here
    // rather than actually changing the process's real working directory,
    // which nothing else in this test suite does either.
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(sub);
    try {
      const handler = createReadManifestHandler();
      const result = await handler({});
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(text(result)) as { manifestPath: string };
      expect(payload.manifestPath).toBe(join(dir, "catalogus.yaml"));
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
