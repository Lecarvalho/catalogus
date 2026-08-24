// Shared result types for the detection engine (Layer 1). Every shape here
// is plain data — arrays and objects only, no Map/Set — so a DetectionResult
// round-trips through JSON.stringify without loss, which matters because the
// CLI and (later) MCP server ship it over stdout/stdio verbatim.

/**
 * Matches services.category in HANDOFF.md §4.
 *
 * `monitoring`, `queue` and `messaging` were added on 2026-08-23 (see that
 * document's amendment log). Before them, Sentry, Datadog, New Relic, SQS,
 * RabbitMQ, Resend, SendGrid, Mailgun and Twilio all landed in `other`
 * despite passing HANDOFF's own test for a service: it can go down, and it
 * sends an invoice. `messaging` rather than `email` because Twilio is SMS
 * and voice, so an email-only bucket does not hold it.
 *
 * `analytics` stays what it always was -- product and usage analytics
 * (PostHog, Plausible, GA). Observability that exists to tell you the
 * system is broken is `monitoring`, which is why Grafana, Loki,
 * OpenTelemetry and Prometheus moved out of `analytics` when this landed.
 *
 * A runtime array rather than a bare union, with the type derived from it,
 * because the union alone is erased at build time and every consumer that
 * needs to *check* a category -- the mapping table's own invariant test was
 * the first -- ends up writing a second copy of the list. Two copies of an
 * enum is how one of them stops matching the spec.
 */
export const SERVICE_CATEGORIES = [
  "db",
  "auth",
  "ai",
  "hosting",
  "dns",
  "payments",
  "analytics",
  "monitoring",
  "queue",
  "messaging",
  "storage",
  "ci",
  "agent",
  "pm",
  "vcs",
  "stack",
  "other",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/**
 * A single piece of proof behind a detection. `file` is the human-readable
 * answer to "why does it think this?" — usually a filename or glob, but for
 * dependency/env-var based signals it may be a paraphrase of the underlying
 * regex match. `detail`, when present, is the verbatim signal string.
 */
export interface Evidence {
  file: string;
  detail?: string;
}

/**
 * What a Layer 1 detection is, on the axis that decides whether it earns a
 * node in the manifest:
 *
 * - "service" — a vendor relationship. It has an account, it can bill, and
 *   someone else's outage takes it down. Supabase, Stripe, Fly.io.
 * - "component" — runtime infrastructure the project runs itself. No
 *   account, no invoice, but it is on the request path and it can fail:
 *   nginx inside the web image, the OpenTelemetry transport between the API
 *   and Loki. A node, and an edge target.
 * - "stack" — the language, runtime or framework the project is written in.
 *   Not on the request path, but a real dependency with a real end-of-life
 *   date, which is the same impact-analysis question a vendor sunset asks
 *   ("what breaks when .NET 10 goes EOL?"). Attached to the node that runs
 *   it, e.g. `[fly-api, dotnet]`.
 * - "library" — code the project merely imports, or a tool a developer runs
 *   locally. ESLint, Vitest, Prettier. Never a node; reported by `detect`
 *   under a count so it does not bury the three kinds above.
 *
 * The first three are all manifest-worthy and all appear in `diff`'s
 * missing-services list; only "library" is filtered out. Note this is a
 * superset of the manifest's own `kind` field, which has no "library" value
 * because a library never becomes an entry in the first place.
 *
 * Exported as a list, not just a union, for the same reason
 * SERVICE_CATEGORIES is: the mapping table's invariant test kept a second,
 * hand-typed copy of the values, and that copy passed green while this
 * union grew "component" and "stack" underneath it.
 *
 * Only DetectedTechnology and ConfigServiceDetection carry this: a
 * HostingDetection or coding-agent/MCP detection is a service by
 * construction (see each type's own doc comment), so those need no field —
 * a caller that folds several detection kinds into one shape (see the CLI's
 * DetectedServiceCandidate) treats them as "service" outright.
 */
export const DETECTION_KINDS = ["service", "component", "stack", "library"] as const;

export type DetectionKind = (typeof DETECTION_KINDS)[number];

export interface DetectedTechnology {
  /** Catalogus catalog slug. Equal to specfySlug when unmapped. */
  slug: string;
  category: ServiceCategory;
  name: string;
  evidence: Evidence[];
  /** The raw slug @specfy/stack-analyser emitted for this detection. */
  specfySlug: string;
  /** True when specfySlug had no entry in mapping.ts — a pass-through, not a discard. */
  unmapped: boolean;
  /**
   * "service" or "library" — see DetectionKind. Derived in mapping.ts:
   * explicit for every known catalog row, and from stack-analyser's own
   * `type` field for an unmapped pass-through (classifyDetectionKind).
   * This is what lets `catalogus detect` lead with services instead of
   * burying them among the languages, frameworks and build tools
   * stack-analyser reports in equal volume — see PLAN.md's dogfooding
   * notes, "detect output buries services among the libraries".
   */
  kind: DetectionKind;
}

export interface CodingAgentDetection {
  agent: string;
  name: string;
  evidence: Evidence[];
}

export interface CodingAgentDetectionResult {
  /** Agents a marker names outright: Claude Code, Codex, Cursor, Copilot. */
  agents: CodingAgentDetection[];
  /**
   * Files proving an agent reads this repo without naming which one --
   * AGENTS.md, .agents/. Reported so a caller can ask the owner instead of
   * inventing an agent id for a vendor-neutral convention file. Empty on
   * most repos, and routinely non-empty *alongside* a full `agents` list,
   * where it says nothing new and can be ignored.
   */
  unidentified: Evidence[];
}

export interface McpServerDetection {
  name: string;
  evidence: Evidence[];
}

export interface HostingDetection {
  slug: string;
  name: string;
  evidence: Evidence[];
}

/**
 * A service proven by a configuration key NAME rather than by a dependency
 * manifest — the signal a .NET, Rails, Go or Python backend leaves behind
 * (see detectors/config-keys.ts). Carries a category directly, because the
 * catalog it came from already knows one; there is no `unmapped`
 * pass-through here, since an unrecognised key name is not a detection at
 * all.
 */
export interface ConfigServiceDetection {
  slug: string;
  category: ServiceCategory;
  name: string;
  evidence: Evidence[];
  /**
   * Omitted for the overwhelming majority of rows, which are vendors and so
   * "service" by default. Set explicitly only where a configuration key
   * proves something the project runs itself — `Otlp__Endpoint` proves
   * OpenTelemetry, which is a wire protocol with no account behind it.
   */
  kind?: DetectionKind;
}

export interface VcsDetection {
  provider: string;
  evidence: Evidence[];
}

export interface CiDetection {
  provider: string;
  evidence: Evidence[];
}

export interface DetectionResult {
  repoPath: string;
  scannedAt: string;
  technologies: DetectedTechnology[];
  codingAgents: CodingAgentDetection[];
  /**
   * Evidence that some coding agent is in use here that no marker names --
   * see CodingAgentDetectionResult.unidentified. Worth surfacing only when
   * `codingAgents` is empty; otherwise the specific markers already
   * answered the question.
   */
  unidentifiedCodingAgents: Evidence[];
  mcpServers: McpServerDetection[];
  hosting: HostingDetection[];
  /**
   * Services named by a configuration key. Kept as its own list rather than
   * folded into `technologies` because a DetectedTechnology carries a
   * `specfySlug`, and there is no stack-analyser slug behind these — writing
   * one would be inventing provenance for a detection that came from
   * somewhere else entirely.
   */
  configServices: ConfigServiceDetection[];
  vcs: VcsDetection | null;
  ci: CiDetection | null;
  /**
   * Human-readable notes about detection that couldn't complete cleanly —
   * e.g. an MCP config file that exists but failed to parse as JSON. Never
   * silently dropped: a partial read must be distinguishable from a
   * genuine "nothing configured" negative.
   */
  warnings: string[];
}
