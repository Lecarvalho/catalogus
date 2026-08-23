import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute path to packages/core/test/fixtures/<...segments>. */
export function fixturePath(...segments: string[]): string {
  return join(here, "..", "..", "test", "fixtures", ...segments);
}
