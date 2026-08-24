// @catalogus/schema — the contract every other Catalogus package consumes,
// and the security boundary that keeps Layer 3 (private overlay) data out
// of Layer 2 (catalogus.yaml, committed to the repo). See docs/HANDOFF.md
// section 3.

export { catalogusSchemaV1 } from "./schema.js";

export type {
  CatalogusManifestV1,
  ProjectMeta,
  VcsInfo,
  VcsVisibility,
  ServiceEntry,
  ServiceKind,
  ServiceStatus,
  DependencyEdge,
  DependencyEdgeTuple,
  DependencyEdgeObject,
} from "./types.js";

export {
  validateManifest,
  parseManifest,
  edgeEndpoints,
  edgePairs,
} from "./validate.js";
export type {
  CatalogusManifestError,
  CatalogusManifestErrorKind,
  CatalogusManifestWarning,
  CatalogusValidationResult,
} from "./validate.js";

export {
  DENIED_KEY_WORDS,
  PRIVATE_KEY_PATTERN,
  PRIVATE_KEY_REGEX,
  looksLikePrivateKey,
} from "./private-key-pattern.js";

// The free-text (property *value*) half of the no-secrets boundary — see
// free-text-guard.ts's module comment for the two-tier design. Exported
// directly so any consumer (the CLI's write-time guard, a future push/MCP
// surface) can run the same checks validateManifest() already runs
// internally, without keeping a second copy of the patterns.
export {
  PRIVATE_VALUE_HARD_CATEGORIES,
  PRIVATE_VALUE_SOFT_CATEGORIES,
  scanFreeTextForPrivateValues,
  scanManifestForPrivateValues,
  hasPrivateFreeTextHit,
  redactExcerpt,
  formatPrivateValueErrorMessage,
  formatPrivateValueWarningMessage,
} from "./free-text-guard.js";
export type {
  PrivateValueTier,
  PrivateValueCategory,
  PrivateValueHardCategory,
  PrivateValueSoftCategory,
  PrivateValueMatch,
  PrivateValueFinding,
} from "./free-text-guard.js";

/** Canonical manifest filename. The CLI always writes this. */
export const MANIFEST_FILENAME = "catalogus.yaml";
/** Accepted when reading, for repos that predate the catalogus.yaml rename. */
export const MANIFEST_FILENAME_FALLBACK = "stack.yaml";
