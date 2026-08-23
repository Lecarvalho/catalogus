import { resolve } from "node:path";

/**
 * Every command takes an optional path argument defaulting to the current
 * working directory (HANDOFF.md section 6's cross-cutting requirement).
 * Always resolves to an absolute path via node:path, never assuming a
 * separator -- the Windows dev machine and any POSIX CI runner both go
 * through this one function.
 */
export function resolveTargetPath(pathArg: string | undefined): string {
  return resolve(process.cwd(), pathArg ?? ".");
}
