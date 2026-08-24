import type { FromSchema } from "json-schema-to-ts";
import { catalogusSchemaV1 } from "./schema.js";

// The manifest type is derived from catalogusSchemaV1, not hand-maintained:
// FromSchema reads the schema's `properties`/`required`/`enum`/`const` at
// the type level, so a shape change to the schema shows up here (and in
// every consumer's typecheck) without anyone needing to update a parallel
// interface. See schema.ts's top comment for the one place this isn't
// fully automatic (the two-element edge tuple, kept as a plain `string[]`
// because json-schema-to-ts 3.x doesn't yet understand `prefixItems`).
export type CatalogusManifestV1 = FromSchema<typeof catalogusSchemaV1>;

export type ProjectMeta = CatalogusManifestV1["project"];
export type VcsInfo = NonNullable<ProjectMeta["vcs"]>;
export type VcsVisibility = VcsInfo["visibility"];

export type ServiceEntry = CatalogusManifestV1["services"][number];
export type ServiceStatus = NonNullable<ServiceEntry["status"]>;
export type ServiceKind = NonNullable<ServiceEntry["kind"]>;

export type DependencyEdge = CatalogusManifestV1["dependencies"][number];
// The oneOf's two branches: pull each back out of the union by shape.
export type DependencyEdgeTuple = Extract<DependencyEdge, readonly unknown[]>;
export type DependencyEdgeObject = Exclude<DependencyEdge, readonly unknown[]>;
