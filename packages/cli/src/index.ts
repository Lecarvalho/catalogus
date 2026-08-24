// @catalogus/cli's public surface -- the offline command surface of the
// `catalogus` binary (init, detect, diff, validate, graph, add). Every
// command is a plain async function returning a CommandResult rather than
// printing/exiting itself, so it can be called directly in tests or from
// another program; src/cli.ts is the only place that turns a CommandResult
// into actual stdout/stderr output and a process exit code.
export const CLI_PACKAGE_NAME = "@catalogus/cli";

export type { CommandResult } from "./types.js";

export { resolveTargetPath } from "./paths.js";

export {
  findManifest,
  ManifestNotFoundError,
  readManifestText,
  writeManifestText,
} from "./manifest-io.js";
export type { ManifestLocation } from "./manifest-io.js";

export { loadValidManifest } from "./load-manifest.js";
export type { LoadedManifest, LoadOutcome } from "./load-manifest.js";

export { checkManifestObject, checkManifestText } from "./manifest-checks.js";
export type { ManifestCheckResult } from "./manifest-checks.js";

export { findCycles } from "./toposort.js";
export type { CycleCheckResult, Edge } from "./toposort.js";

export { collectDetectedServices, groupAllDetections } from "./detected-services.js";
export type { DetectedServiceCandidate } from "./detected-services.js";

export { deriveLocalId, isValidSlug, SLUG_PATTERN, slugify } from "./slug.js";

export { looksLikePrivateFlagName, privateFlagRefusalMessage } from "./private-guard.js";

export { runInit } from "./commands/init.js";
export type { InitCommandOptions } from "./commands/init.js";

export { runDetect } from "./commands/detect.js";
export type { DetectCommandOptions } from "./commands/detect.js";

export { runDiff } from "./commands/diff.js";
export type { DiffCommandOptions } from "./commands/diff.js";

export { runValidate } from "./commands/validate.js";

export { runGraph } from "./commands/graph.js";
export type { GraphCommandOptions } from "./commands/graph.js";

export { runAdd } from "./commands/add.js";
export type { AddCommandOptions } from "./commands/add.js";

export { buildViewPayload } from "./view-payload.js";
export type { ViewPayload, ViewService } from "./view-payload.js";

export { createViewServer, DEFAULT_VIEW_PORT, runView } from "./commands/view.js";
export type { CreateViewServerOutcome, ViewCommandOptions, ViewServerHandle } from "./commands/view.js";

export { InvalidWorkspaceRootError, scanWorkspace } from "./workspace-scan.js";
export type {
  WorkspaceManifestEntry,
  WorkspaceManifestFailure,
  WorkspaceManifestFailureReason,
  WorkspaceRepoRef,
  WorkspaceScanResult,
} from "./workspace-scan.js";
