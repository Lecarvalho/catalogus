// `catalogus init [--yes]` -- scaffolds a catalogus.yaml. Interactive by
// default (prompts for project name, slug, architecture style, and repo
// visibility); with --yes, infers the project-level fields it can (the
// directory name as the project name) and writes without prompting. Never
// overwrites an existing manifest without --force.
//
// It deliberately writes NO service entries, even though detection knows
// several. It used to prefill one per detected service, and that turned out
// to make the file worse in two ways at once. A service entry needs a
// `role` -- what this instance does here, "database", "hosting-api" -- and
// all detection has is a *category*, so every prefilled entry landed with
// `role: db`, `role: vcs`, or the meaningless `role: other`. Worse, the
// entries were unremovable: `add` only appends and there is no `remove`, so
// an agent following the documented flow (init, then `add supabase --role
// database --id supabase-db`) ended up with `supabase` *and* `supabase-db`
// in the file and no way back except deleting it and starting over. That
// was observed happening.
//
// The VCS provider and every coding agent are exactly this same case now
// (2026-08-24): both used to be project-level fields `--yes` filled in
// straight from detection (project.vcs.provider, project.coding_agents), and
// both are service entries today (role: vcs, role: coding-agent) for the
// reason recorded in HANDOFF.md's amendment log -- a project-level field can
// never be an edge target, and `[github-actions, github]` is a real edge.
// So `--yes` no longer writes either: it follows up with the `catalogus add`
// command that records what detection found, the same way it already does
// for every other detected service.
//
// `catalogus diff` already reports every detected service missing from the
// manifest, which is the same information as a work list rather than as
// entries someone now has to correct.
import { stat } from "node:fs/promises";
import { basename } from "node:path";

import { detect, InvalidRepoPathError } from "@catalogus/core";
import { validateManifest } from "@catalogus/schema";
import prompts from "prompts";
import { stringify } from "yaml";

import { collectDetectedServices } from "../detected-services.js";
import { findManifest, writeManifestText } from "../manifest-io.js";
import { warningLines } from "../manifest-checks.js";
import { resolveTargetPath } from "../paths.js";
import { hasBlockingPrivateFreeText, privateFlagRefusalMessage } from "../private-guard.js";
import { isValidSlug, slugify } from "../slug.js";
import type { CommandResult } from "../types.js";

export interface InitCommandOptions {
  yes?: boolean;
  force?: boolean;
  /**
   * Repo visibility, when the caller already knows it. The only way a value
   * reaches `project.vcs.visibility` under --yes -- see the visibility note
   * further down for why nothing is inferred there.
   */
  visibility?: string;
  /** Injectable for tests; defaults to the real `prompts` package. */
  promptFn?: typeof prompts;
}

// Mirrors the schema's vcs.visibility enum.
const VALID_VISIBILITIES = new Set(["public", "private", "internal"]);

const SCHEMA_MODELINE = "# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json";

export async function runInit(pathArg: string | undefined, options: InitCommandOptions = {}): Promise<CommandResult> {
  const targetDir = resolveTargetPath(pathArg);

  try {
    const info = await stat(targetDir);
    if (!info.isDirectory()) {
      return { exitCode: 2, stdout: [], stderr: [`"${targetDir}" is not a directory.`] };
    }
  } catch {
    return { exitCode: 2, stdout: [], stderr: [`"${targetDir}" does not exist.`] };
  }

  if (!options.force) {
    const existing = await findManifest(targetDir);
    if (existing && existing.dir === targetDir) {
      return {
        exitCode: 2,
        stdout: [],
        stderr: [`${existing.filePath} already exists. Pass --force to overwrite it.`],
      };
    }
  }

  const defaultName = basename(targetDir);
  const defaultSlug = slugify(defaultName);

  let name = defaultName;
  let slug = defaultSlug;
  let architecture: string | undefined;
  let visibility: string | undefined = options.visibility?.trim() || undefined;
  // Things the owner still has to answer, printed after the summary. A
  // follow-up is what this command emits instead of a guess: it names the
  // exact command that fills the gap, so an unanswered field costs one line
  // of output rather than a wrong value in a committed file.
  const followUps: string[] = [];

  if (!options.yes) {
    const ask = options.promptFn ?? prompts;

    // A real terminal is required to prompt at all -- on a closed/piped
    // stdin (CI, an agent invoking init non-interactively, `init < /dev/
    // null`) the underlying readline prompt never gets a keystroke and
    // node's event loop simply runs empty, so the process exits 0 with the
    // `await ask(...)` below still pending and nothing ever written. Fail
    // loudly instead of leaving a silent false "success". Only checked when
    // promptFn isn't injected -- tests supply their own answers directly
    // and never touch real stdin.
    if (!options.promptFn && !process.stdin.isTTY) {
      return {
        exitCode: 2,
        stdout: [],
        stderr: ['stdin is not a TTY, so init cannot prompt interactively. Re-run with --yes to scaffold without prompting.'],
      };
    }

    // The `prompts` library's default onCancel is a no-op that still
    // resolves the overall promise with whatever partial answers were
    // collected before the cancel (Ctrl+C, or any other abort) -- so
    // without an explicit onCancel, a user who bails out at the first
    // question gets a manifest written from directory-name defaults
    // anyway. Track the cancellation ourselves and treat it as "nothing
    // written", not "proceed with defaults".
    let cancelled = false;
    const answers = await ask(
      [
        { type: "text", name: "name", message: "Project name", initial: defaultName },
        { type: "text", name: "slug", message: "Project slug", initial: defaultSlug },
        { type: "text", name: "architecture", message: "Architecture style (optional)" },
        {
          // Asked, never inferred -- see the visibility note further down.
          // Unconditional now: the schema's project.vcs used to require
          // provider and visibility together, so this question was gated on
          // a provider having been given first. project.vcs carries only
          // visibility as of 2026-08-24 (the provider is a service entry,
          // added with `catalogus add <provider> --role vcs`, not asked here
          // -- init does not ask about services at all, see this module's
          // header), so there is no longer a shape to gate on.
          type: "select",
          name: "visibility",
          message: "Repo visibility",
          choices: [
            { title: "private", value: "private" },
            { title: "public", value: "public" },
            { title: "internal (org-visible only)", value: "internal" },
          ],
          initial: 0,
        },
      ],
      {
        onCancel: () => {
          cancelled = true;
          return false;
        },
      }
    );

    if (cancelled) {
      return { exitCode: 2, stdout: [], stderr: ["Aborted -- no manifest written."] };
    }

    name = (typeof answers.name === "string" && answers.name.trim()) || defaultName;
    slug = (typeof answers.slug === "string" && answers.slug.trim()) || defaultSlug;
    architecture = typeof answers.architecture === "string" ? answers.architecture.trim() || undefined : undefined;
    if (typeof answers.visibility === "string" && answers.visibility.trim()) {
      visibility = answers.visibility.trim();
    }
  }

  if (!isValidSlug(slug)) {
    return {
      exitCode: 2,
      stdout: [],
      stderr: [`"${slug}" is not a valid slug (lowercase letters, digits, single - or _ separators).`],
    };
  }

  // Every free-text answer the interactive prompt collects, not just
  // architecture -- `name` is just as unconstrained, and a hard hit in
  // either used to reach validateManifest's failure branch further down,
  // which reports it as "this is a bug -- please report it" (correct for an
  // actual internal fault, wrong for a user typing their own email into a
  // text prompt). Catching it here gives it the same exit-2 redirect
  // message.
  for (const [field, value] of [
    ["name", name],
    ["architecture", architecture],
  ] as const) {
    if (value && hasBlockingPrivateFreeText(value)) {
      return { exitCode: 2, stdout: [], stderr: [privateFlagRefusalMessage(field)] };
    }
  }

  // Always empty. See this module's header: services go in through `add`,
  // with a real role, once someone has decided what each one is. That now
  // includes the VCS provider and every coding agent too -- both are service
  // entries (role: vcs, role: coding-agent), not project fields, so
  // detecting them here only ever produces a followUp naming the `add`
  // command that records them, never a value written straight into the file.
  const services: Array<Record<string, unknown>> = [];
  const fileComments: string[] = [];
  let detectedServiceCount = 0;

  if (options.yes) {
    let detection;
    try {
      detection = await detect(targetDir);
    } catch (error) {
      if (error instanceof InvalidRepoPathError) {
        return { exitCode: 2, stdout: [], stderr: [error.message] };
      }
      throw error;
    }

    // Counted, not written: the summary points at `catalogus diff` for the
    // list, so nobody has to wonder whether detection found anything.
    detectedServiceCount = collectDetectedServices(detection).length;

    // An AGENTS.md with no vendor-specific marker beside it proves an agent
    // reads this repo without saying which. That is a question for the
    // owner, not a value to invent -- the previous behaviour was to write a
    // pseudo-agent called `agents-md`, which named a file convention in a
    // field that names agents.
    if (detection.codingAgents.length === 0 && detection.unidentifiedCodingAgents.length > 0) {
      const files = detection.unidentifiedCodingAgents.map((e) => e.file).join(", ");
      followUps.push(
        `${files} says a coding agent works in this repo but not which one -- ask the owner, then: ` +
          "catalogus add <agent> --role coding-agent"
      );
    } else if (detection.codingAgents.length > 0) {
      for (const agent of detection.codingAgents) {
        followUps.push(
          `coding agent detected (${agent.agent}) and not yet declared -- record it with: ` +
            `catalogus add ${agent.agent} --role coding-agent`
        );
      }
    }

    if (detection.vcs) {
      followUps.push(
        `vcs provider detected (${detection.vcs.provider}) and not yet declared -- record it with: ` +
          `catalogus add ${detection.vcs.provider} --role vcs`
      );
    }
  }

  // Visibility is never inferred and never defaulted.
  //
  // It used to be hardcoded to "private" with a comment in the file owning
  // up to the guess. The guess happened to be right on the repo it was
  // written against, which is the worst outcome -- a wrong default that
  // looks correct is one nobody goes back and checks. And the fact is
  // cheap: whoever runs this knows whether their own repo is public.
  //
  // Detection does not help here either. Nothing in a checkout says whether
  // its remote is public, and shelling out to `gh` would answer only for
  // GitHub while quietly failing for GitLab, Bitbucket, Azure DevOps or a
  // plain origin -- a provider-shaped guess in place of a visibility-shaped
  // one.
  //
  // So: the interactive path asks. The --yes path takes --visibility if it
  // was given, and otherwise omits `project.vcs` entirely rather than
  // filling it in -- the block is optional in the schema, an absent field
  // reads as "not yet answered", and a wrong one reads as an answer.
  if (visibility !== undefined && !VALID_VISIBILITIES.has(visibility)) {
    return {
      exitCode: 2,
      stdout: [],
      stderr: [`--visibility must be one of: ${[...VALID_VISIBILITIES].join(", ")}`],
    };
  }

  if (options.yes && visibility === undefined) {
    followUps.push(
      "repo visibility was not given, so project.vcs is omitted -- set it with: " +
        "catalogus set project.vcs.visibility <public|private|internal>"
    );
  }

  const project: Record<string, unknown> = { name, slug };
  if (architecture) project.architecture = architecture;
  if (visibility) project.vcs = { visibility };

  const manifestObject = {
    catalogus: 1,
    project,
    services,
    dependencies: [],
  };

  const check = validateManifest(manifestObject);
  if (!check.valid) {
    const lines = check.errors.map((e) => `  [${e.kind}] ${e.instancePath || "/"} ${e.message}`);
    return {
      exitCode: 1,
      stdout: [],
      stderr: ["Generated manifest failed validation (this is a bug -- please report it):", ...lines],
    };
  }

  const yamlBody = stringify(manifestObject, { flowCollectionPadding: false });
  const header = [SCHEMA_MODELINE, ...fileComments.map((c) => `# ${c}`)].map((l) => `${l}\n`).join("");
  const filePath = await writeManifestText(targetDir, `${header}${yamlBody}`);

  const summary = [`Wrote ${filePath}`];
  if (detectedServiceCount > 0) {
    summary.push(
      `  ${detectedServiceCount} service(s) detected and not yet declared -- run "catalogus diff" to list them,`
    );
    summary.push('  then "catalogus add <service> --role <role>" for each one you want recorded.');
  }
  for (const followUp of followUps) {
    summary.push(`  ${followUp}`);
  }

  // Same reasoning as add.ts: check.warnings is the SOFT-tier half of the
  // exact scan `catalogus validate` runs, and a SOFT-only hit in any
  // free-text field no longer blocks the write -- print it rather than
  // dropping it.
  return { exitCode: 0, stdout: summary, stderr: warningLines(check.warnings) };
}
