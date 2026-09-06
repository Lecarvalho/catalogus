// createDetectStackHandler, exercised directly as the plain async function
// it is -- server.test.ts already proves this tool is reachable through a
// real MCP Client; this file is where the tool's own contract (relaying
// computeDiff's outcome as an MCP result, and composing hasDiff into it)
// gets checked without an in-memory transport in the way.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { createDetectStackHandler } from "./detect-stack.js";

const VALID_MANIFEST = `catalogus: 1
project:
  name: X
  slug: x
services: []
dependencies: []
`;

// Same fixture used elsewhere in this package for "fails schema validation":
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

describe("createDetectStackHandler", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("reports a mapped dependency the manifest doesn't declare as a missing service, with hasDiff true", async () => {
    // redis is a proven mapping.ts entry (category db, kind service) --
    // verified directly against @catalogus/core's detect() before writing
    // this test, so this isn't a guess about what stack-analyser reports.
    await writeFixtureFile(dir, "package.json", JSON.stringify({ name: "probe", dependencies: { redis: "^4.0.0" } }));
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const handler = createDetectStackHandler();

    const result = await handler({ path: dir });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(text(result)) as { hasDiff: boolean; missingServices: Array<{ slug: string }> };
    expect(payload.hasDiff).toBe(true);
    expect(payload.missingServices.some((s) => s.slug === "redis")).toBe(true);
    expect(result.structuredContent).toEqual(payload);
  });

  it("reports hasDiff: false when the manifest already matches detection", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const handler = createDetectStackHandler();

    const result = await handler({ path: dir });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(text(result)) as { hasDiff: boolean };
    expect(payload.hasDiff).toBe(false);
  });

  it("is isError and names catalogus init --yes when the explicit path holds no manifest", async () => {
    const handler = createDetectStackHandler();

    const result = await handler({ path: dir });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("catalogus init --yes");
    // An explicit path never walks up (this file's header, 2026-09-06), so
    // the message names the directory alone, not "or any parent directory".
    expect(text(result)).not.toContain("parent directory");
  });

  it("does not walk up past an explicit path, even when an ancestor has its own manifest", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const sub = join(dir, "sub");
    await mkdir(sub, { recursive: true });
    const handler = createDetectStackHandler();

    const result = await handler({ path: sub });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("catalogus init --yes");
    expect(text(result)).not.toContain("parent directory");
  });

  it("is isError with the underlying message when the manifest exists but fails validation", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", INVALID_MANIFEST);
    const handler = createDetectStackHandler();

    const result = await handler({ path: dir });
    expect(result.isError).toBe(true);
    // computeDiff's "load-failed" reason relays loadValidManifest's own
    // message rather than composing a new one -- see detect-stack.ts's own
    // comment on why only "not-found" gets custom phrasing.
    expect(text(result)).toContain("does not currently pass validation");
    expect(text(result)).not.toContain("catalogus init --yes");
  });

  it("falls back to the server's defaultPath when no input path is given", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const handler = createDetectStackHandler({ defaultPath: dir });

    const result = await handler({});
    expect(result.isError).toBeFalsy();
  });

  it("an input path overrides the server's defaultPath", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const otherDir = await createTempDir();
    try {
      const handler = createDetectStackHandler({ defaultPath: otherDir });
      const result = await handler({ path: dir });
      expect(result.isError).toBeFalsy();
    } finally {
      await removeTempDir(otherDir);
    }
  });
});
