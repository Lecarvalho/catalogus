// Test-only fixture helpers. Not exported from index.ts / not part of the
// public API — tsup only bundles what index.ts's module graph reaches, so
// this never ships in dist.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const fixturesRoot = fileURLToPath(new URL("../test/fixtures", import.meta.url));

export function fixturePath(kind: "valid" | "invalid", filename: string): string {
  return join(fixturesRoot, kind, filename);
}

export function readFixture(kind: "valid" | "invalid", filename: string): string {
  return readFileSync(fixturePath(kind, filename), "utf8");
}

export function listFixtures(kind: "valid" | "invalid"): string[] {
  return readdirSync(join(fixturesRoot, kind))
    .filter((name) => name.endsWith(".yaml"))
    .sort();
}
