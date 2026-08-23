// Common "find it, read it, it must already be schema-valid" precondition
// shared by diff/graph/add -- each needs a manifest object to work with and
// none of them is the place to report raw schema errors line-by-line
// (that's `dagstree validate`'s job); they just point at it.
import { parseManifest } from "@dagstree/schema";
import type { DagstreeManifestV1 } from "@dagstree/schema";

import { findManifest, ManifestNotFoundError, readManifestText } from "./manifest-io.js";
import type { ManifestLocation } from "./manifest-io.js";
import type { CommandResult } from "./types.js";
import { errorMessage } from "./types.js";

export interface LoadedManifest {
  location: ManifestLocation;
  text: string;
  manifest: DagstreeManifestV1;
}

export type LoadOutcome = { ok: true; value: LoadedManifest } | { ok: false; error: CommandResult };

export async function loadValidManifest(targetDir: string): Promise<LoadOutcome> {
  const location = await findManifest(targetDir);
  if (!location) {
    return { ok: false, error: { exitCode: 2, stdout: [], stderr: [new ManifestNotFoundError(targetDir).message] } };
  }

  let text: string;
  try {
    text = await readManifestText(location);
  } catch (error) {
    return {
      ok: false,
      error: { exitCode: 2, stdout: [], stderr: [`Could not read ${location.filePath}: ${errorMessage(error)}`] },
    };
  }

  const parsed = parseManifest(text);
  if (!parsed.valid) {
    return {
      ok: false,
      error: {
        exitCode: 2,
        stdout: [],
        stderr: [`${location.filePath} does not currently pass validation; run "dagstree validate" for details.`],
      },
    };
  }

  return { ok: true, value: { location, text, manifest: parsed.manifest } };
}
