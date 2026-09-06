// Tests for command-tools.ts's four handler factories (see that file's own
// module comment for the shared shape they all promise). Added 2026-09-06
// (Phase 6, decision 14). Handlers are called directly, the same way
// server.test.ts drives read-manifest.ts/detect-stack.ts's own factories
// through a real MCP Client -- these tests call the factories' returned
// functions by hand instead, since server.test.ts already proves the tools
// are reachable through registerTool for every tool on this server.
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { parse } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runGraph } from "../commands/graph.js";
import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import {
  createInitManifestHandler,
  createListIconsHandler,
  createRenderGraphHandler,
  createValidateManifestHandler,
} from "./command-tools.js";

const MANIFEST_HEADER = "# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json";

const TWO_SERVICE_MANIFEST = `${MANIFEST_HEADER}
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
dependencies:
  - [fly-api, supabase-db]
`;

// healthchecks-io is icons.test.ts's own example of a real catalogued slug
// with genuinely no verified icon in either catalog -- the majority
// real-world case, per that file's comment.
const NO_ICON_MANIFEST = `${MANIFEST_HEADER}
catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: uptime
    service: healthchecks-io
    role: monitoring
    added: 2026-01-01
dependencies: []
`;

// "renewal" is a SOFT-tier free-text-guard keyword (packages/schema/src/
// free-text-guard.ts): it never blocks a write by itself, but --strict
// promotes it to a failure (validate.ts's own header comment).
const SOFT_WARNING_MANIFEST = `${MANIFEST_HEADER}
catalogus: 1
project:
  name: Example App
  slug: example-app
  architecture: renewal is automated via GitHub
services: []
dependencies: []
`;

function structured<T>(result: CallToolResult): T {
  return result.structuredContent as T;
}

describe("command-tools", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  describe("init_manifest", () => {
    it("scaffolds a manifest in an empty dir, and returns its text", async () => {
      const handler = createInitManifestHandler();
      const result = await handler({ path: dir });

      expect(result.isError).toBeFalsy();
      const payload = structured<{ exitCode: number; text: string }>(result);
      expect(payload.exitCode).toBe(0);
      expect(payload.text).toContain("# yaml-language-server: $schema=");

      const onDisk = await readFile(join(dir, "catalogus.yaml"), "utf8");
      expect(onDisk).toBe(payload.text);
    });

    it("writes no project.vcs when visibility is not given", async () => {
      const handler = createInitManifestHandler();
      const result = await handler({ path: dir });

      const payload = structured<{ text: string }>(result);
      const parsed = parse(payload.text) as { project: { vcs?: unknown } };
      expect(parsed.project.vcs).toBeUndefined();
    });

    it("writes visibility: private when given", async () => {
      const handler = createInitManifestHandler();
      const result = await handler({ path: dir, visibility: "private" });

      const payload = structured<{ text: string }>(result);
      const parsed = parse(payload.text) as { project: { vcs?: { visibility?: string } } };
      expect(parsed.project.vcs?.visibility).toBe("private");
    });

    it("refuses an existing manifest without force -- the command's own refusal, exit 2", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", TWO_SERVICE_MANIFEST);
      const handler = createInitManifestHandler();

      const result = await handler({ path: dir });

      expect(result.isError).toBe(true);
      const payload = structured<{ exitCode: number; stderr: string[] }>(result);
      expect(payload.exitCode).toBe(2);
      expect(payload.stderr.join("\n")).toContain("already exists");
    });
  });

  describe("validate_manifest", () => {
    it("does not walk up past an explicit path, even when an ancestor has its own manifest", async () => {
      // 2026-09-06 validation, D1: the wrapped command walks up, so an empty
      // subdirectory answered `valid: true` for the parent repo.
      await writeFixtureFile(dir, "catalogus.yaml", TWO_SERVICE_MANIFEST);
      const sub = join(dir, "sub");
      await mkdir(sub, { recursive: true });
      const handler = createValidateManifestHandler();

      const result = await handler({ path: sub });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain("init_manifest");
    });

    it("a valid manifest: valid true, exit 0", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", TWO_SERVICE_MANIFEST);
      const handler = createValidateManifestHandler();

      const result = await handler({ path: dir });

      expect(result.isError).toBeFalsy();
      expect(structured<{ valid: boolean; exitCode: number }>(result)).toMatchObject({ valid: true, exitCode: 0 });
    });

    it("an invalid manifest: isError, with problem lines in stderr", async () => {
      await writeFixtureFile(
        dir,
        "catalogus.yaml",
        `${MANIFEST_HEADER}\ncatalogus: 1\nproject:\n  name: X\n  slug: x\nservices:\n  - id: a\ndependencies: []\n`
      );
      const handler = createValidateManifestHandler();

      const result = await handler({ path: dir });

      expect(result.isError).toBe(true);
      const payload = structured<{ valid: boolean; stderr: string[] }>(result);
      expect(payload.valid).toBe(false);
      expect(payload.stderr.length).toBeGreaterThan(0);
    });

    it("strict promotes a soft private-value warning into a failure", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", SOFT_WARNING_MANIFEST);
      const handler = createValidateManifestHandler();

      const lenient = await handler({ path: dir });
      expect(lenient.isError).toBeFalsy();
      expect(structured<{ valid: boolean; exitCode: number }>(lenient)).toMatchObject({ valid: true, exitCode: 0 });

      const strict = await handler({ path: dir, strict: true });
      expect(strict.isError).toBe(true);
      expect(structured<{ valid: boolean; exitCode: number }>(strict)).toMatchObject({ valid: false, exitCode: 1 });
    });
  });

  describe("render_graph", () => {
    beforeEach(async () => {
      await writeFixtureFile(dir, "catalogus.yaml", TWO_SERVICE_MANIFEST);
    });

    it("text is the default format, and shows the one edge", async () => {
      const handler = createRenderGraphHandler();
      const result = await handler({ path: dir });

      expect(result.isError).toBeFalsy();
      const text = structured<{ stdout: string[] }>(result).stdout.join("\n");
      expect(text).toContain("[fly-api]");
      expect(text).toContain("depends on: supabase-db");
    });

    it("format: \"mermaid\" renders a flowchart with the same edge", async () => {
      const handler = createRenderGraphHandler();
      const result = await handler({ path: dir, format: "mermaid" });

      const payload = structured<{ stdout: string[] }>(result);
      expect(payload.stdout[0]).toBe("flowchart LR");
      expect(payload.stdout.join("\n")).toContain("fly__api --> supabase__db");
    });

    it("strips ANSI colour escapes even under FORCE_COLOR", async () => {
      // ESC via String.fromCharCode rather than a literal escape in this
      // source file, matching command-tools.ts's own choice -- see that
      // file's comment on the same pattern.
      const esc = String.fromCharCode(27);
      const sgrPattern = new RegExp(esc + "\\[");
      const original = process.env.FORCE_COLOR;
      process.env.FORCE_COLOR = "1";
      try {
        // Sanity first: colour really is on for this process/manifest
        // combination, so the assertion below is proving the strip does
        // real work, not merely that there was nothing to strip.
        const rawResult = await runGraph(dir);
        expect(rawResult.stdout.join("\n")).toMatch(sgrPattern);

        const handler = createRenderGraphHandler();
        const result = await handler({ path: dir });
        const text = structured<{ stdout: string[] }>(result).stdout.join("\n");
        expect(text).not.toMatch(sgrPattern);
      } finally {
        if (original === undefined) {
          delete process.env.FORCE_COLOR;
        } else {
          process.env.FORCE_COLOR = original;
        }
      }
    });
  });

  describe("list_icons", () => {
    it("names a service with no icon in the output", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", NO_ICON_MANIFEST);
      const handler = createListIconsHandler();

      const result = await handler({ path: dir });

      expect(result.isError).toBeFalsy();
      const text = structured<{ stdout: string[] }>(result).stdout.join("\n");
      expect(text).toContain("uptime");
      expect(text).toContain("has no icon");
    });
  });
});
