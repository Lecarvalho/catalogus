// Dagstree-specific VCS/CI detector (HANDOFF.md §6): .github/ vs
// .gitlab-ci.yml, refined by the git remote when one is present. The git
// remote is read as a plain text file — this never shells out to `git`.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { pathExists } from "./fs-helpers.js";
import type { CiDetection, VcsDetection } from "../types.js";

const HOST_PROVIDERS: Array<{ host: RegExp; provider: string }> = [
  { host: /github\.com/i, provider: "github" },
  { host: /gitlab\.com/i, provider: "gitlab" },
  { host: /bitbucket\.org/i, provider: "bitbucket" },
];

async function readOriginRemoteUrl(repoPath: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(join(repoPath, ".git", "config"), "utf8");
  } catch {
    return null;
  }
  // Minimal INI read: grab the url= line inside the [remote "origin"] section.
  const section = /\[remote "origin"\]([^[]*)/.exec(raw);
  if (!section) {
    return null;
  }
  const urlLine = /url\s*=\s*(\S+)/.exec(section[1] as string);
  return urlLine ? (urlLine[1] as string) : null;
}

/**
 * Strips any embedded credential from a git remote URL, keeping only
 * host + path. CI checkouts and `git clone https://user:token@host/...`
 * routinely rewrite `origin` with a token baked into the URL
 * (`https://oauth2:glpat-XXXX@gitlab.com/...`); that credential must never
 * reach DetectionResult — see the hard no-secrets rule in HANDOFF.md.
 * Handles both `scheme://[user[:pass]@]host[/path]` and the scp-like SSH
 * form `[user@]host:path`. An unrecognized shape is withheld entirely
 * rather than risk leaking something we didn't anticipate.
 */
function sanitizeRemoteUrl(url: string): string {
  const withScheme = /^\w[\w+.-]*:\/\/(?:[^/@]*@)?([^/]+)(\/.*)?$/.exec(url);
  if (withScheme) {
    return `${withScheme[1]}${withScheme[2] ?? ""}`;
  }
  const scpLike = /^(?:[^@/]*@)?([^:/]+):(.+)$/.exec(url);
  if (scpLike) {
    return `${scpLike[1]}/${scpLike[2]}`;
  }
  return "(unrecognized remote URL format)";
}

export async function detectVcs(repoPath: string): Promise<VcsDetection | null> {
  const remoteUrl = await readOriginRemoteUrl(repoPath);
  if (remoteUrl) {
    const host = HOST_PROVIDERS.find((candidate) => candidate.host.test(remoteUrl));
    return {
      provider: host?.provider ?? "unknown",
      evidence: [{ file: ".git/config", detail: `remote "origin" = ${sanitizeRemoteUrl(remoteUrl)}` }],
    };
  }

  // No remote to read — fall back to hosting-specific markers as a weaker
  // signal. GitLab is checked first, and GitHub requires the
  // `.github/workflows` directory specifically rather than a bare `.github`
  // — a repo can keep `.github/copilot-instructions.md` (a coding-agent
  // marker, not a hosting one) while actually being hosted on GitLab, and a
  // bare-directory check would misread that as GitHub.
  if (await pathExists(join(repoPath, ".gitlab-ci.yml"))) {
    return { provider: "gitlab", evidence: [{ file: ".gitlab-ci.yml" }] };
  }
  if (await pathExists(join(repoPath, ".gitlab"))) {
    return { provider: "gitlab", evidence: [{ file: ".gitlab" }] };
  }
  if (await pathExists(join(repoPath, ".github", "workflows"))) {
    return { provider: "github", evidence: [{ file: ".github/workflows" }] };
  }
  return null;
}

export async function detectCi(repoPath: string): Promise<CiDetection | null> {
  if (await pathExists(join(repoPath, ".github", "workflows"))) {
    return { provider: "github-actions", evidence: [{ file: ".github/workflows" }] };
  }
  if (await pathExists(join(repoPath, ".gitlab-ci.yml"))) {
    return { provider: "gitlab-ci", evidence: [{ file: ".gitlab-ci.yml" }] };
  }
  return null;
}
