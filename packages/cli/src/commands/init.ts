// `dagstree init [--yes]` -- scaffolds a dagstree.yaml. Interactive by
// default (prompts for project name, slug, architecture style, PM method,
// and VCS provider); with --yes, infers everything it can (detection
// prefills the service list and coding agents, the directory name becomes
// the project name) and writes without prompting. Never overwrites an
// existing manifest without --force.
import { stat } from "node:fs/promises";
import { basename } from "node:path";

import { detect, InvalidRepoPathError } from "@dagstree/core";
import { validateManifest } from "@dagstree/schema";
import prompts from "prompts";
import { stringify } from "yaml";

import { collectDetectedServices } from "../detected-services.js";
import { findManifest, writeManifestText } from "../manifest-io.js";
import { warningLines } from "../manifest-checks.js";
import { resolveTargetPath } from "../paths.js";
import { hasBlockingPrivateFreeText, privateFlagRefusalMessage } from "../private-guard.js";
import { deriveLocalId, isValidSlug, slugify } from "../slug.js";
import type { CommandResult } from "../types.js";

export interface InitCommandOptions {
  yes?: boolean;
  force?: boolean;
  /** Injectable for tests; defaults to the real `prompts` package. */
  promptFn?: typeof prompts;
}

const SCHEMA_MODELINE = "# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json";

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
  let pm: string | undefined;
  let vcsProvider: string | undefined;

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
        { type: "text", name: "pm", message: "PM methodology (optional)" },
        { type: "text", name: "vcsProvider", message: "VCS provider (optional, e.g. github)" },
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
    pm = typeof answers.pm === "string" ? answers.pm.trim() || undefined : undefined;
    vcsProvider = typeof answers.vcsProvider === "string" ? answers.vcsProvider.trim() || undefined : undefined;
  }

  if (!isValidSlug(slug)) {
    return {
      exitCode: 2,
      stdout: [],
      stderr: [`"${slug}" is not a valid slug (lowercase letters, digits, single - or _ separators).`],
    };
  }

  // Every free-text answer the interactive prompt collects, not just
  // architecture/pm -- `name` and `vcsProvider` are just as unconstrained,
  // and a hard hit in either used to reach validateManifest's failure
  // branch further down, which reports it as "this is a bug -- please
  // report it" (correct for an actual internal fault, wrong for a user
  // typing their own email into a text prompt). Catching it here gives it
  // the same exit-2 redirect message as architecture/pm.
  for (const [field, value] of [
    ["name", name],
    ["architecture", architecture],
    ["pm", pm],
    ["vcsProvider", vcsProvider],
  ] as const) {
    if (value && hasBlockingPrivateFreeText(value)) {
      return { exitCode: 2, stdout: [], stderr: [privateFlagRefusalMessage(field)] };
    }
  }

  const services: Array<Record<string, unknown>> = [];
  let codingAgents: string[] = [];
  const fileComments: string[] = [];

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

    const today = new Date().toISOString().slice(0, 10);
    const existingIds = new Set<string>();
    for (const candidate of collectDetectedServices(detection)) {
      const id = deriveLocalId(candidate.slug, candidate.category, existingIds);
      existingIds.add(id);
      services.push({ id, service: candidate.slug, role: candidate.category, added: today });
    }

    codingAgents = detection.codingAgents.map((a) => a.agent);

    if (detection.vcs) {
      vcsProvider = detection.vcs.provider;
      fileComments.push("visibility below is a guess (private) -- edit if this repo is public");
    }
  }

  const project: Record<string, unknown> = { name, slug };
  if (architecture) project.architecture = architecture;
  if (pm) project.pm = pm;
  if (vcsProvider) project.vcs = { provider: vcsProvider, visibility: "private" };
  if (codingAgents.length > 0) project.coding_agents = codingAgents;

  const manifestObject = {
    dagstree: 1,
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
  if (services.length > 0) {
    summary.push(`  ${services.length} service(s) prefilled from detection`);
  }
  if (codingAgents.length > 0) {
    summary.push(`  coding agents: ${codingAgents.join(", ")}`);
  }

  // Same reasoning as add.ts: check.warnings is the SOFT-tier half of the
  // exact scan `dagstree validate` runs, and a SOFT-only hit in any
  // free-text field no longer blocks the write -- print it rather than
  // dropping it.
  return { exitCode: 0, stdout: summary, stderr: warningLines(check.warnings) };
}
