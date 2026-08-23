// The two-stage check `dagstree validate` runs -- schema (incl. referential
// integrity) then acyclicity -- factored out so `dagstree add` can run the
// exact same check on a candidate manifest before writing it ("refuse to
// write a manifest that would not pass validate").
import { edgePairs, parseManifest, validateManifest } from "@dagstree/schema";
import type { DagstreeManifestErrorKind, DagstreeManifestV1, DagstreeManifestWarning } from "@dagstree/schema";

import { findCycles } from "./toposort.js";

// Soft private-value hits (see @dagstree/schema's free-text-guard.ts) never
// block a manifest by themselves -- validateManifest surfaces them on their
// own `warnings` channel precisely so a caller can choose what to do with
// them. Threaded through both branches here (an otherwise-valid manifest can
// still carry warnings, and an invalid one can too) so `dagstree validate`
// can print them regardless of which branch it lands in, and so it has what
// it needs to implement --strict without re-running the scan itself.
export type ManifestCheckResult =
  | { ok: true; manifest: DagstreeManifestV1; warnings: DagstreeManifestWarning[] }
  | { ok: false; lines: string[]; warnings: DagstreeManifestWarning[] };

/** Formats soft private-value warnings the one way every command that surfaces them (validate, add, init) prints them, so a warning reads identically regardless of which command produced it. */
export function warningLines(warnings: DagstreeManifestWarning[]): string[] {
  return warnings.map((w) => `warning: ${w.message}`);
}

function schemaErrorLines(
  errors: ReadonlyArray<{ kind: DagstreeManifestErrorKind; instancePath: string; message: string }>
): string[] {
  return errors.map((e) => `  [${e.kind}] ${e.instancePath || "/"} ${e.message}`);
}

function checkAcyclic(manifest: DagstreeManifestV1, warnings: DagstreeManifestWarning[]): ManifestCheckResult {
  const nodeIds = manifest.services.map((s) => s.id);
  const edges = edgePairs(manifest);
  const result = findCycles(nodeIds, edges);
  if (!result.ok) {
    return {
      ok: false,
      lines: [
        "cyclic dependency -- dependencies must form a DAG:",
        ...result.cycles.map((cycle) => `  ${cycle.join(" -> ")}`),
      ],
      warnings,
    };
  }
  return { ok: true, manifest, warnings };
}

/** Parses + validates manifest YAML text (used by `dagstree validate`, which reads the file itself). */
export function checkManifestText(text: string): ManifestCheckResult {
  const parsed = parseManifest(text);
  if (!parsed.valid) {
    return { ok: false, lines: schemaErrorLines(parsed.errors), warnings: parsed.warnings };
  }
  return checkAcyclic(parsed.manifest, parsed.warnings);
}

/** Validates an already-parsed candidate object (used by `dagstree add`, which edits a yaml Document in memory). */
export function checkManifestObject(candidate: unknown): ManifestCheckResult {
  const parsed = validateManifest(candidate);
  if (!parsed.valid) {
    return { ok: false, lines: schemaErrorLines(parsed.errors), warnings: parsed.warnings };
  }
  return checkAcyclic(parsed.manifest, parsed.warnings);
}
