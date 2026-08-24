import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runValidate } from "./validate.js";

const VALID_MANIFEST = `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: supabase-db
    service: supabase
    role: database
    added: 2025-11-02
  - id: fly
    service: fly-io
    role: hosting
    added: 2025-11-02
dependencies:
  - [fly, supabase-db]
`;

describe("runValidate", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("exits 0 for a valid manifest", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", VALID_MANIFEST);
    const result = await runValidate(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    expect(result.stdout.join("\n")).toContain("is valid");
  });

  it("exits 1 with every schema error printed for an invalid manifest", async () => {
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      "dagstree: 1\nproject:\n  name: X\n  slug: x\nservices:\n  - id: a\ndependencies: []\n"
    );
    const result = await runValidate(dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toEqual([]);
    const text = result.stderr.join("\n");
    // missing required service/role/added on the single entry -- more than one error, all reported
    expect(result.stderr.length).toBeGreaterThan(2);
    expect(text).toContain("services/0");
  });

  it("exits 2 with a clear message naming the init command when no manifest exists", async () => {
    const result = await runValidate(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toEqual([]);
    expect(result.stderr.join("\n")).toContain("dagstree init");
  });

  it("exits 1 and prints the actual cycle path, not just 'a cycle exists'", async () => {
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: a
    service: svc-a
    role: other
    added: 2025-01-01
  - id: b
    service: svc-b
    role: other
    added: 2025-01-01
  - id: c
    service: svc-c
    role: other
    added: 2025-01-01
dependencies:
  - [a, b]
  - [b, c]
  - [c, a]
`
    );
    const result = await runValidate(dir);
    expect(result.exitCode).toBe(1);
    const text = result.stderr.join("\n");
    expect(text).toContain("a -> b -> c -> a");
  });

  it("catches a self-edge (a node depending on itself) as a cycle", async () => {
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: a
    service: svc-a
    role: other
    added: 2025-01-01
dependencies:
  - [a, a]
`
    );
    const result = await runValidate(dir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("a -> a");
  });

  it("finds the manifest walking up from a subdirectory", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", VALID_MANIFEST);
    const sub = join(dir, "nested", "deep");
    await mkdir(sub, { recursive: true });
    const result = await runValidate(sub);
    expect(result.exitCode).toBe(0);
  });

  // FIX 1b -- wiring the value-level guard (now living in @dagstree/schema)
  // into `dagstree validate`: hard hits are errors (exit 1), soft hits are
  // warnings on stderr (exit 0 unless --strict), and pipelines stay clean
  // because warnings never touch stdout.
  describe("the free-text private-value guard", () => {
    const HARD_HIT_MANIFEST = `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: namecheap
    service: namecheap
    role: dns
    added: 2025-11-02
    notes: "billing contact dsnk@example.com"
dependencies: []
`;

    const SOFT_HIT_MANIFEST = `dagstree: 1
project:
  name: X
  slug: x
  architecture: "renewal is automated via GitHub Actions"
services: []
dependencies: []
`;

    it("a hard hit (e.g. an email address) is a validation error, exit 1, with the raw value never echoed", async () => {
      await writeFixtureFile(dir, "dagstree.yaml", HARD_HIT_MANIFEST);
      const result = await runValidate(dir);
      expect(result.exitCode).toBe(1);
      const text = result.stderr.join("\n");
      expect(text).toContain("push --private");
      expect(text).not.toContain("dsnk@example.com");
    });

    it("a soft hit (a bare billing-adjacent keyword) is a warning on stderr, exit 0, and never touches stdout", async () => {
      await writeFixtureFile(dir, "dagstree.yaml", SOFT_HIT_MANIFEST);
      const result = await runValidate(dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join("\n")).not.toContain("renewal");
      const text = result.stderr.join("\n");
      expect(text).toContain("renewal");
      expect(text).toContain("--strict");
    });

    it("--strict promotes the same soft hit to a hard error, exit 1", async () => {
      await writeFixtureFile(dir, "dagstree.yaml", SOFT_HIT_MANIFEST);
      const result = await runValidate(dir, { strict: true });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join("\n")).toContain("renewal");
    });

    it.each([
      ["architecture", "modular monolith (.NET 10, vertical slices)"],
      ["architecture", "vertical slices + MediatR"],
      ["architecture", "Trello kanban (PAUTA agent sync)"],
    ])("%s: %j produces no error and no warning (false-positive guard)", async (field, value) => {
      await writeFixtureFile(
        dir,
        "dagstree.yaml",
        `dagstree: 1\nproject:\n  name: X\n  slug: x\n  ${field}: ${JSON.stringify(value)}\nservices: []\ndependencies: []\n`
      );
      const result = await runValidate(dir);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toEqual([]);
    });

    it.each([
      "upgraded to Next.js 15.4 in March",
      "costs are tracked in the private overlay, not here",
      "migrated off Vertex on 2026-06-01",
      "see RFC 7519 and issue 12345",
    ])("notes: %j produces no error and no warning (false-positive guard)", async (notes) => {
      await writeFixtureFile(
        dir,
        "dagstree.yaml",
        `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: svc
    service: svc-a
    role: other
    added: 2025-01-01
    notes: ${JSON.stringify(notes)}
dependencies: []
`
      );
      const result = await runValidate(dir);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toEqual([]);
    });

    it("a service id with a hyphen and digits (e.g. s3-bucket-2) is not mistaken for private data", async () => {
      await writeFixtureFile(
        dir,
        "dagstree.yaml",
        `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: s3-bucket-2
    service: aws-s3
    role: storage
    added: 2025-01-01
dependencies: []
`
      );
      const result = await runValidate(dir);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toEqual([]);
    });
  });
});
