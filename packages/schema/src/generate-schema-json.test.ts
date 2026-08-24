import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression coverage for a Node-version trap: scripts/generate-schema-
// json.mjs used to `import { catalogusSchemaV1 } from "../src/schema.ts"`
// straight from plain Node, relying on TypeScript type-stripping being on
// by default -- true only from Node 22.18 onward, while the root
// package.json's declared engines range ("node": ">=22") permits older
// 22.x releases where that import throws ERR_UNKNOWN_FILE_EXTENSION before
// tsup ever runs. The fix makes the generator read the already-compiled
// dist/index.js instead (see package.json's "build" script, which now
// runs tsup first), so it no longer depends on stripping being on at all.
// This test proves that by running the generator with stripping forced
// off -- the exact condition that broke the old script -- and asserting
// it still succeeds.
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = fileURLToPath(new URL("../scripts/generate-schema-json.mjs", import.meta.url));
const distExists = existsSync(fileURLToPath(new URL("../dist/index.js", import.meta.url)));

describe.skipIf(!distExists)("scripts/generate-schema-json.mjs", () => {
  it("succeeds even with Node's TypeScript type-stripping forced off", () => {
    // Would throw ERR_UNKNOWN_FILE_EXTENSION on the old `.ts`-importing
    // version of this script; this flag is what makes that reproducible
    // on a Node release where stripping happens to be on by default.
    expect(() =>
      execFileSync(process.execPath, ["--no-experimental-strip-types", scriptPath], {
        cwd: packageRoot,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
