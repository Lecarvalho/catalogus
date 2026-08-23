// Regenerates schema/dagstree.v1.json from the built dist/index.js — see
// package.json's "build" script, which runs tsup before this. schema-
// sync.test.ts double-checks the two agree even between builds.
//
// This reads dist/index.js rather than importing src/schema.ts directly
// so the generator doesn't depend on Node's TypeScript type-stripping,
// which is only on by default from Node 22.18 onward; the root package.json
// permits any Node >=22, so a plain `node ../src/schema.ts` here would fail
// with ERR_UNKNOWN_FILE_EXTENSION on an older-but-permitted 22.x. dist/
// index.js is already-compiled JS, so any Node in the declared range can
// run it without a flag or an extra build-only tool.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dagstreeSchemaV1 } from "../dist/index.js";

const outPath = fileURLToPath(new URL("../schema/dagstree.v1.json", import.meta.url));
const json = `${JSON.stringify(dagstreeSchemaV1, null, 2)}\n`;
await writeFile(outPath, json, "utf8");
console.log(`wrote ${outPath}`);
