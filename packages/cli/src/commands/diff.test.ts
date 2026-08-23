import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runDiff } from "./diff.js";

describe("runDiff", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("reports both directions: detected-but-missing and declared-but-stale", async () => {
    // fly.toml on disk -> detect() will find fly-io. The manifest neither
    // declares fly-io (the "missing" direction) nor still matches
    // "postgresql" -- a real, mapped, detectable catalog slug (mapping.ts)
    // that nothing in this repo actually references, so it's genuinely
    // stale rather than merely undetectable-by-design (the "stale"
    // direction).
    await writeFixtureFile(dir, "fly.toml", 'app = "example"\n');
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: old-db
    service: postgresql
    role: db
    added: 2025-01-01
dependencies: []
`
    );

    const result = await runDiff(dir);
    expect(result.exitCode).toBe(1);
    const text = result.stdout.join("\n");
    expect(text).toContain("Detected but missing from the manifest");
    expect(text).toContain("fly-io");
    expect(text).toContain("Declared in the manifest but no longer detected");
    expect(text).toContain("old-db");
  });

  it("reports a clean match when nothing differs", async () => {
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services: []
dependencies: []
`
    );
    const result = await runDiff(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("matches the detected stack");
  });

  it("does not report a role: dns / role: pm entry as stale -- it's undetectable by design", async () => {
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: namecheap
    service: namecheap
    role: dns
    added: 2025-01-01
  - id: trello
    service: trello
    role: pm
    added: 2025-01-01
dependencies: []
`
    );
    const result = await runDiff(dir);
    expect(result.exitCode).toBe(0);
    const text = result.stdout.join("\n");
    expect(text).not.toContain("namecheap");
    expect(text).not.toContain("trello");
  });

  it("still exempts a genuinely undetectable service under a role word other than dns/pm -- exemption is by slug, not role text", async () => {
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: namecheap
    service: namecheap
    role: registrar
    added: 2025-01-01
  - id: trello
    service: trello
    role: project-management
    added: 2025-01-01
dependencies: []
`
    );
    const result = await runDiff(dir);
    expect(result.exitCode).toBe(0);
    const text = result.stdout.join("\n");
    expect(text).not.toContain("namecheap");
    expect(text).not.toContain("trello");
  });

  it("flags a mapped, detectable service as stale even under role: dns -- role alone doesn't grant the exemption", async () => {
    // "cloudflare" is a real row in @dagstree/core's SPECFY_TO_DAGSTREE
    // (mapping.ts), so it's reachable by a scan; declaring it under
    // role: dns doesn't make it undetectable the way an actual DNS
    // registrar (namecheap) is.
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: cf
    service: cloudflare
    role: dns
    added: 2025-01-01
dependencies: []
`
    );
    const result = await runDiff(dir);
    expect(result.exitCode).toBe(1);
    const text = result.stdout.join("\n");
    expect(text).toContain("Declared in the manifest but no longer detected");
    expect(text).toContain("cf (service: cloudflare, role: dns)");
  });

  it("does not flag an unmapped-but-still-detected technology as stale", async () => {
    // The manifest can legally name an unmapped technology's own slug --
    // by hand, or from an old `init --yes` scaffold predating a mapping.ts
    // entry for it. Comparing staleness against the catalog-known-only
    // detection set (as opposed to every detection) would flag this on
    // every run even though the repo still has it.
    await writeFixtureFile(dir, "package.json", JSON.stringify({ name: "probe", devDependencies: { typescript: "^5.6.0" } }));
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services:
  - id: typescript
    service: typescript
    role: other
    added: 2025-01-01
dependencies: []
`
    );
    const result = await runDiff(dir, { json: true });
    const payload = JSON.parse(result.stdout[0] as string) as { staleServices: Array<{ service: string }> };
    expect(payload.staleServices.some((s) => s.service === "typescript")).toBe(false);
  });

  it("exits 2 with a clear message when no manifest exists", async () => {
    const result = await runDiff(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("dagstree init");
  });

  // Same lead-with-services treatment as `dagstree detect` (see diff.ts's
  // pushServiceLines): collectDetectedServices already excludes most
  // library noise, but a known catalog row can itself be a library
  // (lucide-icons) rather than a service, and that shouldn't read as a
  // missed service in the "detected but missing" list either.
  it("collapses a library-kind catalog entry in the missing-services list rather than listing it as a service", async () => {
    await writeFixtureFile(dir, "package.json", JSON.stringify({ name: "probe", dependencies: { "lucide-react": "^0.400.0" } }));
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services: []
dependencies: []
`
    );

    const result = await runDiff(dir);
    const text = result.stdout.join("\n");
    expect(text).not.toMatch(/\+ lucide-icons \(/);
    expect(text).toMatch(/\+ 1 library also detected but not declared/);

    const payload = JSON.parse((await runDiff(dir, { json: true })).stdout[0] as string);
    const lucide = payload.missingServices.find((s: { slug: string }) => s.slug === "lucide-icons");
    expect(lucide).toBeDefined();
    expect(lucide.kind).toBe("library");
  });

  it("supports --json output", async () => {
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: X
  slug: x
services: []
dependencies: []
`
    );
    const result = await runDiff(dir, { json: true });
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout[0] as string);
    expect(payload).toHaveProperty("missingServices");
    expect(payload).toHaveProperty("staleServices");
  });
});
