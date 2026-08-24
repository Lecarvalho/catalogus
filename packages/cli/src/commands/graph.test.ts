import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runGraph } from "./graph.js";

const MANIFEST = `dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: supabase-db
    service: supabase
    role: database
    added: 2025-11-02
  - id: supabase-auth
    service: supabase
    role: auth
    added: 2025-11-02
  - id: vertex
    service: google-vertex-ai
    role: ai-models
    added: 2026-01-15
    status: phasing_out
    replaced_by: anthropic-api
  - id: anthropic-api
    service: anthropic
    role: ai-models
    added: 2026-06-01
dependencies:
  - [supabase-auth, supabase-db]
  - [anthropic-api, supabase-db]
`;

describe("runGraph", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("renders readable ASCII by default, showing nodes and their dependencies", async () => {
    const result = await runGraph(dir);
    expect(result.exitCode).toBe(0);
    const text = result.stdout.join("\n");
    expect(text).toContain("[supabase-db]");
    expect(text).toContain("[supabase-auth]");
    expect(text).toContain("depends on: supabase-db");
    // no unicode box-drawing characters (U+2500-U+257F)
    expect(text).not.toMatch(/[─-╿]/);
  });

  it("distinguishes phasing_out status and shows its replaced_by target", async () => {
    const result = await runGraph(dir);
    const text = result.stdout.join("\n");
    expect(text).toContain("phasing_out -> anthropic-api");
  });

  it("produces a valid mermaid flowchart with --mermaid", async () => {
    const result = await runGraph(dir, { mermaid: true });
    expect(result.exitCode).toBe(0);
    const lines = result.stdout;
    expect(lines[0]).toBe("flowchart LR");
    const text = lines.join("\n");

    // every service id appears as a node definition -- "-" is escaped to
    // "__" (see mermaidId), not collapsed to a plain "_"
    expect(text).toContain('supabase__db["supabase-db: supabase (database)"]');
    expect(text).toContain('supabase__auth["supabase-auth: supabase (auth)"]');

    // edges use mermaid's --> syntax with sanitized node ids
    expect(text).toContain("supabase__auth --> supabase__db");
    expect(text).toContain("anthropic__api --> supabase__db");

    // phasing_out node gets a class assignment and a replaced-by edge
    expect(text).toContain("class vertex phasingOut");
    expect(text).toContain("vertex -. replaced by .-> anthropic__api");
  });

  it("keeps hyphen- and underscore-separated ids distinct as mermaid node ids", async () => {
    // "api-db" and "api_db" are two different, both schema-valid ids -- the
    // old sanitizer (`[-_]` -> "_") collapsed both onto the single mermaid
    // node "api_db", silently merging two services and duplicating their
    // edges into one.
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: web
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: api-db
    service: supabase
    role: database
    added: 2025-01-01
  - id: api_db
    service: postgresql
    role: database
    added: 2025-01-01
dependencies:
  - [web, api-db]
  - [web, api_db]
`
    );
    const result = await runGraph(dir, { mermaid: true });
    const text = result.stdout.join("\n");

    // two distinct node definitions, not one merged node
    expect(text).toContain('api__db["api-db: supabase (database)"]');
    expect(text).toContain('api_db["api_db: postgresql (database)"]');

    // two distinct edges, not a single duplicated edge
    expect(text).toContain("web --> api__db");
    expect(text).toContain("web --> api_db");
  });

  it("omits ANSI color codes when stdout is not a TTY (e.g. redirected to a file)", async () => {
    const originalIsTTY = process.stdout.isTTY;
    const originalForceColor = process.env.FORCE_COLOR;
    process.stdout.isTTY = false;
    delete process.env.FORCE_COLOR;
    try {
      const result = await runGraph(dir);
      const text = result.stdout.join("\n");
      // eslint-disable-next-line no-control-regex -- asserting the absence of a raw ANSI escape
      expect(text).not.toMatch(/\x1b\[/);
    } finally {
      process.stdout.isTTY = originalIsTTY;
      if (originalForceColor === undefined) {
        delete process.env.FORCE_COLOR;
      } else {
        process.env.FORCE_COLOR = originalForceColor;
      }
    }
  });

  it("emits ANSI color codes when stdout is a TTY", async () => {
    const originalIsTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;
    try {
      const result = await runGraph(dir);
      const text = result.stdout.join("\n");
      // eslint-disable-next-line no-control-regex -- asserting the presence of a raw ANSI escape
      expect(text).toMatch(/\x1b\[/);
    } finally {
      process.stdout.isTTY = originalIsTTY;
    }
  });

  it("handles a manifest with no services", async () => {
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      "dagstree: 1\nproject:\n  name: X\n  slug: x\nservices: []\ndependencies: []\n"
    );
    const result = await runGraph(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("no services declared");
  });

  it("exits 2 with a clear message when no manifest exists", async () => {
    const empty = await createTempDir();
    try {
      const result = await runGraph(empty);
      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("\n")).toContain("dagstree init");
    } finally {
      await removeTempDir(empty);
    }
  });

  it("names kind and version on the nodes that have them, and stays quiet on the ones that do not", async () => {
    // A manifest field the tool's own renderer cannot show is a field
    // nobody sees. "service" is deliberately absent from the vendor row:
    // printing the default on every line would drown the two that are not.
    const dir = await createTempDir();
    try {
      await writeFixtureFile(
        dir,
        "dagstree.yaml",
        [
          "dagstree: 1",
          "project:",
          "  name: X",
          "  slug: x",
          "services:",
          "  - id: fly-api",
          "    service: fly-io",
          "    role: hosting-api",
          "    added: 2025-11-02",
          "  - id: ingress",
          "    service: nginx",
          "    kind: component",
          "    role: ingress-proxy",
          "    added: 2025-11-02",
          "  - id: dotnet",
          "    service: dotnet",
          "    kind: stack",
          '    version: "10"',
          "    role: runtime-backend",
          "    added: 2025-11-02",
          "dependencies: []",
          "",
        ].join("\n")
      );

      const text = (await runGraph(dir)).stdout.join("\n");
      expect(text).toContain("fly-io (hosting-api)");
      expect(text).toContain("nginx (ingress-proxy, component)");
      expect(text).toContain("dotnet (runtime-backend, stack, v10)");
    } finally {
      await removeTempDir(dir);
    }
  });
});
