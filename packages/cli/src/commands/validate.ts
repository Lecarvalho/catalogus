// `catalogus validate` -- the CI entrypoint. Exit codes are the contract:
// 0 valid, 1 a validation failure (schema, referential integrity, a
// dependency cycle, or -- with --strict -- a soft private-value warning),
// 2 a usage error (no manifest, or it can't be read). Prints every error at
// once (ajv is configured with allErrors, and cycle detection reports every
// disjoint cycle it finds), never just the first.
//
// Soft private-value hits (see @catalogus/schema's free-text-guard.ts) are
// warnings, not errors: a manifest carrying one is still `valid` and still
// exits 0, but the warning is always printed to stderr so it's never
// missed, and never to stdout -- --json-style pipelines on other commands,
// and anything piping this command's stdout, must stay clean. --strict
// promotes every warning to a hard failure (exit 1).
//
// --strict is deliberately not the recommended CI setting, and used to be.
// The soft tier matches words -- `billing`, `subscription`, `seat` -- and
// whether such a word is a leak or the project's ordinary vocabulary
// depends on what the project does, which no word list can know. A real
// manifest tripped it on a payments provider's notes ("Checkout, Billing
// Portal, webhooks; subscription tiers plus credit packs"), which named a
// vendor's products rather than the owner's plan or price. Gating CI on
// that means no project with a payment processor can pass, and a guard that
// cries wolf is a guard someone switches off -- see PLAN.md decision 7.
// Soft hits are for a person to read; the hard tier is what holds the
// boundary in CI, and it needs no flag.
import { checkManifestText, warningLines } from "../manifest-checks.js";
import { findManifest, ManifestNotFoundError, readManifestText } from "../manifest-io.js";
import { resolveTargetPath } from "../paths.js";
import type { CommandResult } from "../types.js";
import { errorMessage } from "../types.js";

export interface ValidateCommandOptions {
  strict?: boolean;
}

export async function runValidate(
  pathArg: string | undefined,
  options: ValidateCommandOptions = {}
): Promise<CommandResult> {
  const targetDir = resolveTargetPath(pathArg);

  const location = await findManifest(targetDir);
  if (!location) {
    return { exitCode: 2, stdout: [], stderr: [new ManifestNotFoundError(targetDir).message] };
  }

  let text: string;
  try {
    text = await readManifestText(location);
  } catch (error) {
    return { exitCode: 2, stdout: [], stderr: [`Could not read ${location.filePath}: ${errorMessage(error)}`] };
  }

  const check = checkManifestText(text);
  const warnings = warningLines(check.warnings);

  if (!check.ok) {
    return { exitCode: 1, stdout: [], stderr: [`${location.filePath} is not valid:`, ...check.lines, ...warnings] };
  }

  if (options.strict && check.warnings.length > 0) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`${location.filePath} is not valid (--strict promotes warnings to errors):`, ...warnings],
    };
  }

  return { exitCode: 0, stdout: [`${location.filePath} is valid.`], stderr: warnings };
}
