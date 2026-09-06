// One rule for how a tool call's `path` and the server's default directory
// combine, shared by all three tools so they cannot answer the same
// arguments differently.
//
// The server's default is the directory the user named on the command line
// (`catalogus mcp <dir>`), and an agent that was given that server will
// reasonably say `path: "sub"` meaning "sub under that repo". Resolving a
// relative `path` against the process cwd instead -- which is what
// resolveTargetPath alone does, correctly, for a CLI invocation -- sent the
// validator's `path: "sub"` to packages/cli/sub (2026-09-06 validation,
// defect D3) because the server had been started from packages/cli. So: an
// absolute `path` stands; a relative one resolves against the default
// directory when there is one, and against cwd (through resolveTargetPath,
// later) when there is not; no `path` at all means the default itself,
// which may be undefined -- and undefined must survive here, because
// "no path anywhere" is what allows the upward manifest walk that an
// explicit path forbids (read-manifest.ts's header). (2026-09-06.)
import { isAbsolute, resolve } from "node:path";

export function resolveToolPath(inputPath: string | undefined, defaultPath: string | undefined): string | undefined {
  if (inputPath === undefined) {
    return defaultPath;
  }
  if (defaultPath === undefined || isAbsolute(inputPath)) {
    return inputPath;
  }
  return resolve(defaultPath, inputPath);
}
