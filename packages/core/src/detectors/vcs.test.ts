import { afterEach, describe, expect, it } from "vitest";

import { detectCi, detectVcs } from "./vcs.js";
import { type GitFixture, materializeGitFixture } from "../test-support/git-fixture.js";
import { fixturePath } from "../test-support/fixture-path.js";

// Fixtures that need a real `.git/config` are stored as `dotgit/` (git
// cannot track a `.git`-named path component — see git-fixture.ts) and
// materialised into a temp directory for the duration of one test.
const openFixtures: GitFixture[] = [];

async function gitFixture(...segments: string[]): Promise<string> {
  const fixture = await materializeGitFixture(fixturePath(...segments));
  openFixtures.push(fixture);
  return fixture.repoPath;
}

afterEach(async () => {
  await Promise.all(openFixtures.splice(0).map((fixture) => fixture.dispose()));
});

describe("detectVcs", () => {
  it("identifies GitHub from a git remote", async () => {
    const result = await detectVcs(await gitFixture("vcs", "github-remote"));
    expect(result?.provider).toBe("github");
    expect(result?.evidence[0]?.file).toBe(".git/config");
    // SSH (scp-like) form: git@github.com:example-org/example-repo.git
    expect(result?.evidence[0]?.detail).toBe('remote "origin" = github.com/example-org/example-repo.git');
  });

  it("identifies GitLab from a git remote", async () => {
    const result = await detectVcs(await gitFixture("vcs", "gitlab-remote"));
    expect(result?.provider).toBe("gitlab");
    expect(result?.evidence[0]?.detail).toBe('remote "origin" = gitlab.com/example-org/example-repo.git');
  });

  it("identifies Bitbucket from a git remote", async () => {
    const result = await detectVcs(await gitFixture("vcs", "bitbucket-remote"));
    expect(result?.provider).toBe("bitbucket");
  });

  it("never leaks a credential embedded in the remote URL", async () => {
    const result = await detectVcs(await gitFixture("vcs", "credential-remote"));
    expect(result?.provider).toBe("gitlab");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("glpat-SECRETTOKENVALUE");
    expect(serialized).not.toContain("oauth2");
    expect(result?.evidence[0]?.detail).toBe('remote "origin" = gitlab.com/acme/probe.git');
  });

  it("falls back to the .github/workflows marker when there is no git remote", async () => {
    const result = await detectVcs(fixturePath("vcs", "no-remote-github-ci"));
    expect(result).toEqual({ provider: "github", evidence: [{ file: ".github/workflows" }] });
  });

  it("falls back to the .gitlab-ci.yml marker when there is no git remote", async () => {
    const result = await detectVcs(fixturePath("vcs", "no-remote-gitlab-ci"));
    expect(result).toEqual({ provider: "gitlab", evidence: [{ file: ".gitlab-ci.yml" }] });
  });

  it("prefers the GitLab marker over a bare .github directory that holds only a Copilot file", async () => {
    // .github/copilot-instructions.md is a coding-agent marker, not a
    // hosting one — a repo can carry it while being hosted on GitLab.
    const result = await detectVcs(fixturePath("vcs", "github-marker-gitlab-ci"));
    expect(result).toEqual({ provider: "gitlab", evidence: [{ file: ".gitlab-ci.yml" }] });
  });

  it("returns null when there is no signal at all", async () => {
    const result = await detectVcs(fixturePath("vcs", "none"));
    expect(result).toBeNull();
  });
});

describe("detectCi", () => {
  it("detects GitHub Actions from .github/workflows", async () => {
    const result = await detectCi(fixturePath("vcs", "no-remote-github-ci"));
    expect(result).toEqual({ provider: "github-actions", evidence: [{ file: ".github/workflows" }] });
  });

  it("detects GitLab CI from .gitlab-ci.yml", async () => {
    const result = await detectCi(fixturePath("vcs", "no-remote-gitlab-ci"));
    expect(result).toEqual({ provider: "gitlab-ci", evidence: [{ file: ".gitlab-ci.yml" }] });
  });

  it("returns null when there is no CI marker", async () => {
    const result = await detectCi(fixturePath("vcs", "none"));
    expect(result).toBeNull();
  });
});
