// Regenerates supabase/seed.sql from CATALOGUS_CATALOG -- see package.json's
// "build" script. seed-sync.test.ts double-checks the two agree even between
// builds.
//
// Imports @catalogus/core rather than reading packages/core/src/catalog.ts
// directly, so this reads the package's built dist/index.js (its package.json
// "exports" has no other condition to resolve to) -- the same reason
// packages/schema/scripts/generate-schema-json.mjs reads its own package's
// dist/index.js rather than importing TypeScript source: no reliance on
// Node's TypeScript type-stripping, which is only on by default from Node
// 22.18 onward, while the root package.json permits any Node >=22.
//
// The SQL-building itself lives in ./seed-sql.mjs, not here, so
// seed-sync.test.ts can call the exact same function this script does.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CATALOGUS_CATALOG } from "@catalogus/core";
import { buildSeedSql } from "./seed-sql.mjs";

const outPath = fileURLToPath(new URL("../../../supabase/seed.sql", import.meta.url));
await writeFile(outPath, buildSeedSql(CATALOGUS_CATALOG), "utf8");
console.log(`wrote ${outPath}`);
