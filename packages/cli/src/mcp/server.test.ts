// createCatalogusMcpServer, exercised the way a real MCP client would --
// through InMemoryTransport.createLinkedPair() and the SDK's own Client,
// never by calling the tool handlers directly. That's deliberate: it proves
// the tools are actually reachable through registerTool's real
// input-validation and result-shaping path, not just that the handler
// functions in read-manifest.ts/detect-stack.ts happen to return the right
// thing when called by hand.
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { createCatalogusMcpServer } from "./server.js";

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

async function connectedClient(options: Parameters<typeof createCatalogusMcpServer>[0] = {}) {
  const server = createCatalogusMcpServer(options);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

function firstText(result: CallToolResult): string {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`expected a text content block, got: ${JSON.stringify(result.content)}`);
  }
  return first.text;
}

describe("createCatalogusMcpServer", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("lists all eight tools, each with a description", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();

    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      "read_manifest",
      "detect_stack",
      "propose_manifest_edit",
      "apply_manifest_edit",
      "init_manifest",
      "validate_manifest",
      "render_graph",
      "list_icons",
    ]);
    expect(tools.find((t) => t.name === "propose_manifest_edit")?.description).toContain("never writes");
    // decision 14 (docs/plan/decisions.md): apply_manifest_edit is the tool
    // that actually writes, and its description has to say so -- and that
    // it expects a proposal first -- or an agent reading the tool list has
    // no way to tell the two edit tools apart.
    const applyManifestEdit = tools.find((t) => t.name === "apply_manifest_edit");
    expect(applyManifestEdit?.description).toMatch(/writ/i);
    expect(applyManifestEdit?.description).toMatch(/propose_manifest_edit/);

    for (const name of names) {
      expect(tools.find((t) => t.name === name)?.description).toBeTruthy();
    }

    const detectStack = tools.find((t) => t.name === "detect_stack");
    // The tool contract (docs/mcp-server-brief.md): detect_stack's own
    // description has to say it is a claim about one checkout, not about
    // the world -- diff.ts's header is the source of that sentence.
    expect(detectStack?.description).toMatch(/checkout/i);

    await client.close();
  });

  describe("read_manifest", () => {
    it("on a temp dir holding a valid manifest, returns the text and the parsed object", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const { client } = await connectedClient();

      const result = await client.callTool({ name: "read_manifest", arguments: { path: dir } });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(firstText(result as CallToolResult)) as {
        manifestPath: string;
        filename: string;
        text: string;
        valid: boolean;
        manifest: { project: { slug: string } };
      };
      expect(payload.valid).toBe(true);
      expect(payload.text).toBe(VALID_MANIFEST);
      expect(payload.filename).toBe("catalogus.yaml");
      expect(payload.manifestPath).toBe(join(dir, "catalogus.yaml"));
      expect(payload.manifest.project.slug).toBe("x");
      expect(result.structuredContent).toMatchObject({ valid: true });

      await client.close();
    });

    it("on an invalid manifest, returns valid: false with problems, and is not isError", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", INVALID_MANIFEST);
      const { client } = await connectedClient();

      const result = await client.callTool({ name: "read_manifest", arguments: { path: dir } });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(firstText(result as CallToolResult)) as { valid: boolean; problems: string[] };
      expect(payload.valid).toBe(false);
      expect(payload.problems.length).toBeGreaterThan(0);
      expect(payload.problems.join("\n")).toContain("slug");

      await client.close();
    });

    it("on an empty dir, is isError and names catalogus init --yes", async () => {
      const { client } = await connectedClient();

      const result = await client.callTool({ name: "read_manifest", arguments: { path: dir } });
      expect(result.isError).toBe(true);
      expect(firstText(result as CallToolResult)).toContain("catalogus init --yes");

      await client.close();
    });

    it("does not walk up past an explicit path, even when an ancestor has its own manifest", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const sub = join(dir, "sub");
      await mkdir(sub, { recursive: true });
      const { client } = await connectedClient();

      const result = await client.callTool({ name: "read_manifest", arguments: { path: sub } });
      expect(result.isError).toBe(true);
      expect(firstText(result as CallToolResult)).toContain("catalogus init --yes");
      // The walked-up phrasing ("or any parent directory") must not appear
      // here -- an explicit path never gets the upward walk.
      expect(firstText(result as CallToolResult)).not.toContain("parent directory");

      await client.close();
    });

    it("resolves a relative path against the server's defaultPath, not the process cwd", async () => {
      const sub = join(dir, "sub");
      await mkdir(sub, { recursive: true });
      await writeFixtureFile(sub, "catalogus.yaml", VALID_MANIFEST);
      const { client } = await connectedClient({ defaultPath: dir });

      const result = await client.callTool({ name: "read_manifest", arguments: { path: "sub" } });
      expect(result.isError).toBeFalsy();
      expect((result.structuredContent as { manifestPath: string }).manifestPath).toBe(join(sub, "catalogus.yaml"));

      await client.close();
    });

    it("falls back to the server's defaultPath, and that also counts as explicit", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const sub = join(dir, "sub");
      await mkdir(sub, { recursive: true });
      const { client } = await connectedClient({ defaultPath: sub });

      // No `path` argument at all -- the server's own defaultPath is what
      // makes this call explicit, so it must not walk up to dir's manifest.
      const result = await client.callTool({ name: "read_manifest", arguments: {} });
      expect(result.isError).toBe(true);

      await client.close();
    });
  });

  describe("propose_manifest_edit", () => {
    it("returns the diff and the command line for an add, and leaves the real file untouched", async () => {
      const manifestPath = await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const before = await readFile(manifestPath, "utf8");
      const { client } = await connectedClient();

      const result = (await client.callTool({
        name: "propose_manifest_edit",
        arguments: { path: dir, edits: [{ op: "add", service: "fly-io", role: "hosting" }] },
      })) as CallToolResult;
      expect(result.isError).toBeFalsy();
      const payload = result.structuredContent as { ok: boolean; changed: boolean; diff: string; commands: string[] };
      expect(payload.ok).toBe(true);
      expect(payload.changed).toBe(true);
      expect(payload.diff).toContain("+  - id: fly-io");
      expect(payload.commands).toEqual(["catalogus add fly-io --role hosting"]);
      expect(await readFile(manifestPath, "utf8")).toBe(before);

      await client.close();
    });

    it("is isError and names catalogus init --yes when no manifest exists", async () => {
      const { client } = await connectedClient();

      const result = await client.callTool({
        name: "propose_manifest_edit",
        arguments: { path: dir, edits: [{ op: "remove", id: "x" }] },
      });
      expect(result.isError).toBe(true);
      expect(firstText(result as CallToolResult)).toContain("catalogus init --yes");

      await client.close();
    });

    it("rejects an edit whose op the schema does not know, before any command runs", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const { client } = await connectedClient();

      const result = await client.callTool({
        name: "propose_manifest_edit",
        arguments: { path: dir, edits: [{ op: "write", text: "services: []" }] },
      });
      expect(result.isError).toBe(true);

      await client.close();
    });
  });

  describe("apply_manifest_edit", () => {
    it("runs two applies sent at once one after the other, so the second sees the first's write", async () => {
      // 2026-09-06 validation, D2: two pipelined applies with the same
      // baseSha256 both reported ok and one write was lost. Writes are
      // serialized on the server now; the second must be refused as stale.
      const manifestPath = await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const { client } = await connectedClient();
      const proposal = (await client.callTool({
        name: "propose_manifest_edit",
        arguments: { path: dir, edits: [{ op: "add", service: "fly-io", role: "hosting" }] },
      })) as CallToolResult;
      const baseSha256 = (proposal.structuredContent as { baseSha256: string }).baseSha256;

      const [first, second] = await Promise.all([
        client.callTool({
          name: "apply_manifest_edit",
          arguments: { path: dir, baseSha256, edits: [{ op: "add", service: "fly-io", role: "hosting" }] },
        }),
        client.callTool({
          name: "apply_manifest_edit",
          arguments: { path: dir, baseSha256, edits: [{ op: "add", service: "stripe", role: "payments" }] },
        }),
      ]);

      expect(first.isError).toBeFalsy();
      expect(second.isError).toBe(true);
      const text = await readFile(manifestPath, "utf8");
      expect(text).toContain("service: fly-io");
      expect(text).not.toContain("service: stripe");

      await client.close();
    });

    it("applies an add through the real MCP wiring, and the real file changes", async () => {
      const manifestPath = await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const { client } = await connectedClient();

      const result = (await client.callTool({
        name: "apply_manifest_edit",
        arguments: { path: dir, edits: [{ op: "add", service: "fly-io", role: "hosting" }] },
      })) as CallToolResult;
      expect(result.isError).toBeFalsy();
      const payload = result.structuredContent as { ok: boolean; changed: boolean; baseChecked: boolean };
      expect(payload.ok).toBe(true);
      expect(payload.changed).toBe(true);
      expect(payload.baseChecked).toBe(false);
      expect(await readFile(manifestPath, "utf8")).toContain("service: fly-io");

      await client.close();
    });

    it("is isError and names the init_manifest tool when no manifest exists", async () => {
      const { client } = await connectedClient();

      const result = await client.callTool({
        name: "apply_manifest_edit",
        arguments: { path: dir, edits: [{ op: "remove", id: "x" }] },
      });
      expect(result.isError).toBe(true);
      expect(firstText(result as CallToolResult)).toContain("init_manifest");

      await client.close();
    });

    it("is isError, and writes nothing, when baseSha256 does not match the current file", async () => {
      const manifestPath = await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const before = await readFile(manifestPath, "utf8");
      const { client } = await connectedClient();

      const result = await client.callTool({
        name: "apply_manifest_edit",
        arguments: {
          path: dir,
          edits: [{ op: "add", service: "fly-io", role: "hosting" }],
          baseSha256: "0".repeat(64),
        },
      });
      expect(result.isError).toBe(true);
      expect(await readFile(manifestPath, "utf8")).toBe(before);

      await client.close();
    });

    it("rejects an edit whose op the schema does not know, before any command runs", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const { client } = await connectedClient();

      const result = await client.callTool({
        name: "apply_manifest_edit",
        arguments: { path: dir, edits: [{ op: "write", text: "services: []" }] },
      });
      expect(result.isError).toBe(true);

      await client.close();
    });
  });

  describe("detect_stack", () => {
    it("does not walk up past an explicit path, the same as read_manifest", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const sub = join(dir, "sub");
      await mkdir(sub, { recursive: true });
      const { client } = await connectedClient();

      const result = await client.callTool({ name: "detect_stack", arguments: { path: sub } });
      expect(result.isError).toBe(true);
      expect(firstText(result as CallToolResult)).toContain("catalogus init --yes");
      expect(firstText(result as CallToolResult)).not.toContain("parent directory");

      await client.close();
    });

    it("reports a mapped dependency the manifest doesn't declare as a missing service", async () => {
      // redis is a proven mapping.ts entry (category db, kind service) --
      // verified directly against @catalogus/core's detect() before writing
      // this test, so this isn't a guess about what stack-analyser reports.
      await writeFixtureFile(dir, "package.json", JSON.stringify({ name: "probe", dependencies: { redis: "^4.0.0" } }));
      await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const { client } = await connectedClient();

      const result = await client.callTool({ name: "detect_stack", arguments: { path: dir } });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(firstText(result as CallToolResult)) as {
        hasDiff: boolean;
        missingServices: Array<{ slug: string }>;
      };
      expect(payload.hasDiff).toBe(true);
      expect(payload.missingServices.some((s) => s.slug === "redis")).toBe(true);
      expect(result.structuredContent).toMatchObject({ hasDiff: true });

      await client.close();
    });

    it("on an empty dir, is isError and names catalogus init --yes", async () => {
      const { client } = await connectedClient();

      const result = await client.callTool({ name: "detect_stack", arguments: { path: dir } });
      expect(result.isError).toBe(true);
      expect(firstText(result as CallToolResult)).toContain("catalogus init --yes");

      await client.close();
    });
  });

  // The four command-tools.ts factories already have their own thorough,
  // direct-handler tests in command-tools.test.ts (init.ts/validate.ts/
  // graph.ts/icons.ts's own behaviour is exercised there). What only a real
  // MCP client through this server can prove is that each is actually
  // registered under the right name, with the right input keys wired to the
  // right handler -- so one smoke test per tool here, not a repeat of
  // command-tools.test.ts's coverage.
  describe("the four command tools", () => {
    it("init_manifest scaffolds a manifest and returns its text", async () => {
      const { client } = await connectedClient();

      const result = (await client.callTool({ name: "init_manifest", arguments: { path: dir } })) as CallToolResult;
      expect(result.isError).toBeFalsy();
      const payload = result.structuredContent as { text: string };
      expect(payload.text).toContain("# yaml-language-server: $schema=");

      await client.close();
    });

    it("validate_manifest reports valid: true for a valid manifest", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const { client } = await connectedClient();

      const result = (await client.callTool({
        name: "validate_manifest",
        arguments: { path: dir },
      })) as CallToolResult;
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ valid: true });

      await client.close();
    });

    it("render_graph renders mermaid when asked", async () => {
      await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
      const { client } = await connectedClient();

      const result = (await client.callTool({
        name: "render_graph",
        arguments: { path: dir, format: "mermaid" },
      })) as CallToolResult;
      expect(result.isError).toBeFalsy();
      const payload = result.structuredContent as { stdout: string[] };
      expect(payload.stdout[0]).toBe("flowchart LR");

      await client.close();
    });

    it("list_icons reports a service with no icon", async () => {
      const withOneService = `catalogus: 1
project:
  name: X
  slug: x
services:
  - id: uptime
    service: healthchecks-io
    role: monitoring
    added: 2026-01-01
dependencies: []
`;
      await writeFixtureFile(dir, "catalogus.yaml", withOneService);
      const { client } = await connectedClient();

      const result = (await client.callTool({ name: "list_icons", arguments: { path: dir } })) as CallToolResult;
      expect(result.isError).toBeFalsy();
      const text = (result.structuredContent as { stdout: string[] }).stdout.join("\n");
      expect(text).toContain("uptime");

      await client.close();
    });
  });

  // The whole design (docs/mcp-server-brief.md's "the stdout rule"): over
  // stdio, stdout *is* the JSON-RPC channel, so nothing this server's tools
  // reach may ever write to it directly. InMemoryTransport never touches
  // process.stdout at all, so this spy proves the claim about the tool
  // handlers and everything they call (@catalogus/core's detect() included)
  // rather than merely proving the transport doesn't print, which would be
  // true of the wrong implementation just as much as the right one.
  it("never writes to process.stdout while serving either tool", async () => {
    await writeFixtureFile(dir, "package.json", JSON.stringify({ name: "probe", dependencies: { redis: "^4.0.0" } }));
    await writeFixtureFile(dir, "catalogus.yaml", VALID_MANIFEST);
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      const { client } = await connectedClient();
      await client.callTool({ name: "read_manifest", arguments: { path: dir } });
      await client.callTool({ name: "detect_stack", arguments: { path: dir } });
      await client.close();
      // Asserted before mockRestore() runs, deliberately -- mockRestore()
      // does everything mockReset() does (it clears recorded calls, not
      // just the implementation), so a check placed after it would pass
      // trivially regardless of what actually happened.
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
    }
  });
});
