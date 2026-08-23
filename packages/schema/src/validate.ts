// Plain default imports of these two don't type-check under
// moduleResolution NodeNext: neither package ships a package.json
// "exports" map or "type": "module", so TypeScript classifies their .d.ts
// files as CommonJS despite them being written with ESM `export default`
// syntax, and `import X from "..."` resolves X to the whole module-
// namespace object instead of unwrapping `.default`. Ajv2020 sidesteps this
// by using its named export; ajv-formats has none, so it's imported as a
// namespace and unwrapped by hand at runtime instead.
//
// This has to be a real ESM `import * as`, not the TS-only
// `import X = require(...)` form: esbuild (via tsup) compiles that CJS-style
// import into a literal `require(...)` call, which throws
// "Dynamic require ... is not supported" the moment an ESM consumer loads
// the built dist/index.js — there's no CJS `require` in a pure-ESM output
// file. `import * as` bundles cleanly because esbuild resolves and inlines
// ajv-formats itself, synthesizing the `.default` property on the namespace
// object rather than emitting a runtime require. See index.test.ts for a
// regression test that imports the built dist/index.js and would fail if
// this regresses.
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import * as ajvFormatsNs from "ajv-formats";
import { parse as parseYaml } from "yaml";
import { dagstreeSchemaV1 } from "./schema.js";
import { looksLikePrivateKey } from "./private-key-pattern.js";
import {
  formatPrivateValueErrorMessage,
  formatPrivateValueWarningMessage,
  scanManifestForPrivateValues,
} from "./free-text-guard.js";
import type { PrivateValueFinding } from "./free-text-guard.js";
import type {
  DagstreeManifestV1,
  DependencyEdge,
  DependencyEdgeObject,
} from "./types.js";

// `ajvFormatsNs.default` itself can't be used directly: esModuleInterop's
// synthetic-default handling makes TypeScript type that property as an
// alias for the whole namespace object again (no call signatures), not the
// real default export. A fresh `typeof import(...)` type query sidesteps
// the synthetic alias and resolves ajv-formats's own `export default`
// declaration, which at runtime is exactly the `.default` property esbuild
// puts on the namespace object when it inlines this CJS dependency.
const addFormats = (
  ajvFormatsNs as unknown as { default: typeof import("ajv-formats").default }
).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile<DagstreeManifestV1>(dagstreeSchemaV1);

export type DagstreeManifestErrorKind = "schema" | "private-key" | "private-value" | "reference";

export interface DagstreeManifestError {
  /**
   * "schema" — an ordinary JSON Schema failure (wrong type, missing
   * required field, bad enum value, ...).
   * "private-key" — a property name looks like Layer 3 (cost/billing/
   * account/credential) data; message redirects to the private overlay.
   * "private-value" — a property *value* (free text anywhere in the
   * document) matched a high-precision Layer 3 shape (email, currency
   * amount, card number, API key, credential URL); message redirects to
   * the private overlay. See free-text-guard.ts.
   * "reference" — passed schema validation but fails a check the schema
   * can't express: duplicate service id, or a dependency edge naming an
   * id no services[] entry has.
   */
  kind: DagstreeManifestErrorKind;
  instancePath: string;
  message: string;
  /** Set only for kind "private-key": the offending property name. */
  property?: string;
  /** Set only for kind "private-value": which free-text shape matched (see free-text-guard.ts). */
  category?: string;
}

/**
 * A lower-precision "this might be Layer 3 data" signal (free-text keyword
 * hits like "billing" or "renewal") -- never blocks validation on its own.
 * Kept as its own channel, not folded into `errors`, precisely so a caller
 * can choose an exit code: `dagstree validate` prints these to stderr and
 * still exits 0, `dagstree validate --strict` promotes them to errors.
 */
export interface DagstreeManifestWarning {
  instancePath: string;
  category: string;
  message: string;
}

export type DagstreeValidationResult =
  | { valid: true; manifest: DagstreeManifestV1; warnings: DagstreeManifestWarning[] }
  | { valid: false; errors: DagstreeManifestError[]; warnings: DagstreeManifestWarning[] };

function privateKeyMessage(property: string, instancePath: string): string {
  return (
    `Property "${property}" at "${instancePath}" looks like private data ` +
    "(cost, billing, account, or credential info). That belongs in the " +
    'private overlay, not dagstree.yaml — run "dagstree push --private" ' +
    "to store it instead."
  );
}

function parentPath(instancePath: string): string {
  const idx = instancePath.lastIndexOf("/");
  return idx <= 0 ? "" : instancePath.slice(0, idx);
}

// A property matching the deny pattern trips two independent Ajv keywords
// at once (see schema.ts): the dedicated patternProperties rule, reported
// as a "false schema" error pointing straight at the property, and the
// ordinary additionalProperties rule, reported on the parent with the
// property name in `params`. Both get folded into one friendly
// PRIVATE-KEY error per offending property instead of surfacing twice.
function isPrivateKeyDenyError(err: ErrorObject): boolean {
  return err.keyword === "false schema" && err.schemaPath.includes("/patternProperties/");
}

function additionalPropertyName(err: ErrorObject): string | undefined {
  if (err.keyword !== "additionalProperties") return undefined;
  const params = err.params as { additionalProperty?: unknown };
  return typeof params.additionalProperty === "string" ? params.additionalProperty : undefined;
}

function classifyAjvErrors(rawErrors: readonly ErrorObject[]): DagstreeManifestError[] {
  const privateByPath = new Map<string, DagstreeManifestError>();
  // Parent object paths where a private-key hit already explains the
  // failure, so the oneOf branch's "must match exactly one schema" noise
  // (dependency edges try both the tuple and object shape) can be dropped.
  const explainedParents = new Set<string>();

  for (const err of rawErrors) {
    if (isPrivateKeyDenyError(err)) {
      const path = err.instancePath;
      const property = path.slice(path.lastIndexOf("/") + 1);
      if (!privateByPath.has(path)) {
        privateByPath.set(path, {
          kind: "private-key",
          instancePath: path,
          property,
          message: privateKeyMessage(property, path),
        });
      }
      explainedParents.add(parentPath(path));
      continue;
    }

    const property = additionalPropertyName(err);
    if (property !== undefined && looksLikePrivateKey(property)) {
      const path = err.instancePath === "" ? `/${property}` : `${err.instancePath}/${property}`;
      if (!privateByPath.has(path)) {
        privateByPath.set(path, {
          kind: "private-key",
          instancePath: path,
          property,
          message: privateKeyMessage(property, path),
        });
      }
      explainedParents.add(err.instancePath);
    }
  }

  const others: DagstreeManifestError[] = [];
  for (const err of rawErrors) {
    if (isPrivateKeyDenyError(err)) continue;
    const property = additionalPropertyName(err);
    if (property !== undefined && looksLikePrivateKey(property)) continue;
    if (err.keyword === "oneOf" && explainedParents.has(err.instancePath)) continue;
    // A "type" mismatch at the same path as a private-key hit is
    // guaranteed noise, not a second real problem: the private-key hit
    // only ever fires from an object schema's patternProperties/
    // additionalProperties, which proves the runtime value here really is
    // an object, so oneOf's non-matching branch (e.g. dependencyEdgeTuple
    // wanting an array) complaining about this same path can't be
    // describing the actual data. Other keywords at that path -- a
    // genuinely missing required property, say -- are kept: allErrors
    // promises every real problem is reported, not just the private-key
    // one.
    if (err.keyword === "type" && explainedParents.has(err.instancePath)) continue;
    others.push({
      kind: "schema",
      instancePath: err.instancePath,
      message: err.message ?? "does not match the dagstree.yaml schema",
    });
  }

  return [...privateByPath.values(), ...others];
}

/**
 * Pulls {from, to} out of either edge form. Exported so the CLI's toposort
 * (and anything else walking the DAG) never has to branch on tuple-vs-
 * object itself.
 */
export function edgeEndpoints(edge: DependencyEdge): { from: string; to: string } {
  if (Array.isArray(edge)) {
    // Validated by the schema to be exactly 2 slug strings (minItems/
    // maxItems: 2) — see schema.ts's comment on why this is a plain
    // string[] type rather than a real tuple.
    const [from, to] = edge;
    return { from: from as string, to: to as string };
  }
  const obj = edge as DependencyEdgeObject;
  return { from: obj.from, to: obj.to };
}

/** Every dependency edge normalized to {from, to, notes?}, in file order. */
export function edgePairs(
  manifest: Pick<DagstreeManifestV1, "dependencies">,
): Array<{ from: string; to: string; notes?: string }> {
  return manifest.dependencies.map((edge) => {
    const { from, to } = edgeEndpoints(edge);
    const notes = Array.isArray(edge) ? undefined : (edge as DependencyEdgeObject).notes;
    return notes === undefined ? { from, to } : { from, to, notes };
  });
}

// Referential integrity that JSON Schema has no vocabulary for: uniqueness
// of an id across services[], dependency edges naming ids that exist, and
// replaced_by naming another entry's id (the serviceEntry schema's own
// description promises this check happens here — see schema.ts).
// Acyclicity is deliberately not checked here — that's `dagstree validate`
// (see HANDOFF.md section 6); edgePairs() above is what it needs to run a
// toposort without re-parsing the manifest.
function checkReferentialIntegrity(manifest: DagstreeManifestV1): DagstreeManifestError[] {
  const errors: DagstreeManifestError[] = [];
  const firstIndexById = new Map<string, number>();

  manifest.services.forEach((service, index) => {
    const first = firstIndexById.get(service.id);
    if (first !== undefined) {
      errors.push({
        kind: "reference",
        instancePath: `/services/${index}/id`,
        message: `Duplicate service id "${service.id}" — already used by services[${first}]. Local ids must be unique within the file.`,
      });
    } else {
      firstIndexById.set(service.id, index);
    }
  });

  const knownIds = new Set(manifest.services.map((service) => service.id));

  manifest.services.forEach((service, index) => {
    if (service.replaced_by === undefined) return;
    if (service.replaced_by === service.id) {
      errors.push({
        kind: "reference",
        instancePath: `/services/${index}/replaced_by`,
        message: `Service "${service.id}" names itself in replaced_by — it must name a different entry's id.`,
      });
    } else if (!knownIds.has(service.replaced_by)) {
      errors.push({
        kind: "reference",
        instancePath: `/services/${index}/replaced_by`,
        message: `Service "${service.id}" has replaced_by "${service.replaced_by}" — no services[] entry has this id.`,
      });
    }
  });

  manifest.dependencies.forEach((edge, index) => {
    const { from, to } = edgeEndpoints(edge);
    for (const [role, id] of [
      ["from", from],
      ["to", to],
    ] as const) {
      if (!knownIds.has(id)) {
        errors.push({
          kind: "reference",
          instancePath: `/dependencies/${index}/${role}`,
          message: `Dependency edge references unknown service id "${id}" — no services[] entry has this id.`,
        });
      }
    }
  });

  return errors;
}

function toPrivateValueError(finding: PrivateValueFinding): DagstreeManifestError {
  return {
    kind: "private-value",
    instancePath: finding.instancePath,
    category: finding.category,
    message: formatPrivateValueErrorMessage(finding),
  };
}

function toWarning(finding: PrivateValueFinding): DagstreeManifestWarning {
  return {
    instancePath: finding.instancePath,
    category: finding.category,
    message: formatPrivateValueWarningMessage(finding),
  };
}

/**
 * Validates a parsed manifest object against the dagstree.yaml v1 schema,
 * then (only once the shape is confirmed sound) runs the referential
 * integrity checks JSON Schema can't express, plus the free-text guard's
 * generic walk over every string value in the document (property *names*
 * are already covered by the schema's own patternProperties deny rule,
 * folded into the `!schemaOk` branch below). Ajv is configured with
 * allErrors so every problem is reported at once, not just the first; the
 * free-text walk likewise collects every hit rather than stopping at the
 * first one.
 */
export function validateManifest(candidate: unknown): DagstreeValidationResult {
  const schemaOk = validateSchema(candidate);
  if (!schemaOk) {
    return { valid: false, errors: classifyAjvErrors(validateSchema.errors ?? []), warnings: [] };
  }

  const manifest = candidate as DagstreeManifestV1;

  const { hard, soft } = scanManifestForPrivateValues(candidate);
  const warnings = soft.map(toWarning);
  const errors = [...hard.map(toPrivateValueError), ...checkReferentialIntegrity(manifest)];
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return { valid: true, manifest, warnings };
}

/**
 * Parses dagstree.yaml text and validates it in one step, so a caller can
 * never forget the validate half — a YAML syntax error comes back as an
 * ordinary invalid result instead of a thrown exception.
 */
export function parseManifest(yamlText: string): DagstreeValidationResult {
  let candidate: unknown;
  try {
    candidate = parseYaml(yamlText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      errors: [{ kind: "schema", instancePath: "", message: `Could not parse YAML: ${message}` }],
      warnings: [],
    };
  }
  return validateManifest(candidate);
}
