// The dagstree.yaml v1 JSON Schema, authored here as a TypeScript `as const`
// literal rather than a plain .json file. That's not a style choice: only a
// literal object TypeScript can see at compile time lets json-schema-to-ts's
// FromSchema derive the manifest types below without hand-written duplicates
// (a JSON module import widens `"type": "object"` down to `string`, which
// FromSchema can't work with — see the notes in index.test.ts).
//
// packages/schema/schema/dagstree.v1.json is generated from this object by
// scripts/generate-schema-json.mjs (part of `pnpm build`) so the published,
// standalone artifact and this source can never diverge; schema-sync.test.ts
// enforces that even between builds.
//
// PRIVATE_KEY_PATTERN (private-key-pattern.ts) is reproduced here as a
// literal string rather than interpolated, for two reasons: Ajv strict mode
// requires `patternProperties` to be real JSON, not a computed key, and
// `patternProperties` is repeated as a direct sibling of `properties` in
// every object schema below rather than factored into one $defs entry reused
// via `allOf` — reusing it through `allOf` type-checks fine at runtime but
// makes json-schema-to-ts's FromSchema collapse the whole manifest type to
// `never` (patternProperties: false, once resolved to its own object type by
// `allOf`'s intersection, synthesizes a blanket `{ [x: string]: never }`
// index signature that swallows every named property it's intersected
// with). Kept as a direct sibling, FromSchema special-cases it correctly and
// only that empty pattern-property "hidden index" is discarded — a scratch
// repro of both encodings is what this comment is describing.
// schema-sync.test.ts asserts every occurrence below equals
// PRIVATE_KEY_PATTERN, so the five copies can't drift from each other or
// from private-key-pattern.ts.
const PRIVATE_KEY_PATTERN =
  "(?:[cC][oO][sS][tT]|[pP][rR][iI][cC][eE]|[pP][rR][iI][cC][iI][nN][gG]|[aA][mM][oO][uU][nN][tT]|[aA][cC][cC][oO][uU][nN][tT]|[aA][cC][cC][oO][uU][nN][tT][_-]?[iI][dD]|[uU][sS][eE][rR][nN][aA][mM][eE]|[uU][sS][eE][rR]|[eE][mM][aA][iI][lL]|[tT][oO][kK][eE][nN]|[aA][pP][iI][_-]?[kK][eE][yY]|[kK][eE][yY]|[sS][eE][cC][rR][eE][tT]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][aA][sS][sS][wW][dD]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL][sS]|[bB][iI][lL][lL][iI][nN][gG]|[iI][nN][vV][oO][iI][cC][eE]|[rR][eE][nN][eE][wW][aA][lL]|[sS][uU][bB][sS][cC][rR][iI][pP][tT][iI][oO][nN][_-]?[iI][dD]|[pP][aA][yY][mM][eE][nN][tT]|[cC][aA][rR][dD]|[pP][lL][aA][nN][_-]?[tT][iI][eE][rR]|[sS][eE][aA][tT]|[sS][pP][eE][nN][dD])";

export const dagstreeSchemaV1 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dagstree.dev/schema/v1.json",
  title: "Dagstree manifest v1",
  description:
    "dagstree.yaml (Layer 2 of the Dagstree data model): project metadata and the service DAG for one project. Committed to the repo — safe in a public repo. Anything cost, billing, or account-shaped belongs in the private overlay instead (`dagstree push --private`), and this schema actively rejects it — see the patternProperties deny rule repeated on every object below.",

  $defs: {
    slug: {
      type: "string",
      pattern: "^[a-z0-9]+(?:[_-][a-z0-9]+)*$",
      description:
        "Lowercase identifier: letters, digits, and single internal - or _ separators. No leading/trailing separators, no doubled separators.",
    },

    vcs: {
      type: "object",
      description: "Source control provider and repo visibility.",
      patternProperties: { [PRIVATE_KEY_PATTERN]: false },
      properties: {
        provider: {
          type: "string",
          minLength: 1,
          description: "VCS host, e.g. \"github\", \"gitlab\", \"bitbucket\".",
        },
        visibility: {
          enum: ["public", "private", "internal"],
          description:
            "Repo visibility as configured on the VCS host. \"internal\" covers org-visible-only repos (GitHub/GitLab Enterprise).",
        },
      },
      required: ["provider", "visibility"],
      additionalProperties: false,
    },

    project: {
      type: "object",
      description:
        "Layer 2 project-level metadata: identity, architecture style, PM method, VCS, and coding agents in use. Everything except name/slug is optional so a freshly-scaffolded manifest is already valid.",
      patternProperties: { [PRIVATE_KEY_PATTERN]: false },
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description: "Human-readable project name, e.g. \"Clapline\".",
        },
        slug: {
          $ref: "#/$defs/slug",
          description: "Machine identifier for the project.",
        },
        architecture: {
          type: "string",
          minLength: 1,
          description:
            "Architecture style in free text, e.g. \"modular monolith (.NET 10, vertical slices)\".",
        },
        pm: {
          type: "string",
          minLength: 1,
          description:
            "Project management methodology in free text, e.g. \"Trello kanban (PAUTA agent sync)\".",
        },
        vcs: {
          $ref: "#/$defs/vcs",
          description: "Source control provider and repo visibility.",
        },
        coding_agents: {
          type: "array",
          items: { type: "string", minLength: 1 },
          description:
            "Coding agents used on this project, e.g. \"claude-code\", \"pauta\".",
        },
      },
      required: ["name", "slug"],
      additionalProperties: false,
    },

    serviceEntry: {
      type: "object",
      description:
        "One service instance inside this project's DAG (a node). The same catalog service can appear more than once under different roles/ids — e.g. supabase-db and supabase-auth both service: supabase.",
      patternProperties: { [PRIVATE_KEY_PATTERN]: false },
      properties: {
        id: {
          $ref: "#/$defs/slug",
          description:
            "Local identifier for this service instance, unique within the file. Referenced by dependencies[] and by other entries' replaced_by.",
        },
        service: {
          $ref: "#/$defs/slug",
          description:
            "Slug into the global Dagstree service catalog, e.g. \"supabase\", \"fly-io\". Not the same namespace as @specfy/stack-analyser's slugs — the CLI maps between them.",
        },
        role: {
          $ref: "#/$defs/slug",
          description:
            "The role this instance plays in the project, e.g. \"database\", \"auth\", \"hosting\".",
        },
        added: {
          type: "string",
          format: "date",
          description: "Date this dependency was added, ISO 8601 (YYYY-MM-DD).",
        },
        status: {
          enum: ["active", "deprecated", "phasing_out", "removed"],
          description:
            "Lifecycle status of this service instance. Treated as \"active\" when omitted.",
        },
        replaced_by: {
          $ref: "#/$defs/slug",
          description:
            "Local id of the service instance that replaces this one when phasing out. Must name another entry's id — the schema can't express that; `dagstree validate` checks it.",
        },
        notes: {
          type: "string",
          description:
            "Free-text annotation. Public information only — never cost, billing, or account details; those belong in the private overlay.",
        },
      },
      required: ["id", "service", "role", "added"],
      additionalProperties: false,
    },

    // Compact edge form from HANDOFF.md section 5: [from, to]. Deliberately
    // encoded as "every item is a slug, exactly 2 items" rather than 2020-12
    // `prefixItems` — equally strict at validation time, and (unlike
    // prefixItems, which json-schema-to-ts 3.x doesn't understand yet) it
    // derives a real `string[]` type instead of `unknown[]`.
    dependencyEdgeTuple: {
      type: "array",
      description: "Compact edge form: [from, to], both local service ids.",
      items: { $ref: "#/$defs/slug" },
      minItems: 2,
      maxItems: 2,
    },

    // Object form of an edge, for when it needs a note. Same information as
    // the tuple form plus an optional annotation — see index.ts for why both
    // forms are accepted.
    dependencyEdgeObject: {
      type: "object",
      description:
        "Annotated edge form, for when an edge needs a note the tuple form has no room for.",
      patternProperties: { [PRIVATE_KEY_PATTERN]: false },
      properties: {
        from: {
          $ref: "#/$defs/slug",
          description: "Local id of the dependent service instance.",
        },
        to: {
          $ref: "#/$defs/slug",
          description: "Local id of the service instance depended on.",
        },
        notes: { type: "string", description: "Free-text annotation for this edge." },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },

    dependencyEdge: {
      description:
        "One dependency edge (from -> to) in the project's service DAG. Accepts the compact array form or the object form; acyclicity is checked by `dagstree validate`, not by this schema.",
      oneOf: [
        { $ref: "#/$defs/dependencyEdgeTuple" },
        { $ref: "#/$defs/dependencyEdgeObject" },
      ],
    },
  },

  type: "object",
  patternProperties: { [PRIVATE_KEY_PATTERN]: false },
  properties: {
    dagstree: {
      const: 1,
      description: "Manifest format version. Always 1 for this schema.",
    },
    project: {
      $ref: "#/$defs/project",
      description: "This project's identity, architecture, PM method, VCS, and coding agents.",
    },
    services: {
      type: "array",
      items: { $ref: "#/$defs/serviceEntry" },
      description:
        "Every service instance (node) in this project's DAG. Can be empty on a freshly-scaffolded manifest.",
    },
    dependencies: {
      type: "array",
      items: { $ref: "#/$defs/dependencyEdge" },
      description:
        "Every dependency edge (from -> to) between the service instances above. Can be empty.",
    },
  },
  required: ["dagstree", "project", "services", "dependencies"],
  additionalProperties: false,
} as const;
