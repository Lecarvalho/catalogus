import { describe, expect, it } from "vitest";

import { detectCodingAgents } from "./coding-agents.js";
import { fixturePath } from "../test-support/fixture-path.js";

describe("detectCodingAgents", () => {
  it("detects Claude Code from CLAUDE.md", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "claude-md-only"));
    expect(result.agents).toEqual([{ agent: "claude-code", name: "Claude Code", evidence: [{ file: "CLAUDE.md" }] }]);
    expect(result.unidentified).toEqual([]);
  });

  it("detects Claude Code from a .claude/ directory", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "claude-dir-only"));
    expect(result.agents).toEqual([{ agent: "claude-code", name: "Claude Code", evidence: [{ file: ".claude" }] }]);
  });

  it("detects Codex from a .codex/ directory", async () => {
    // The marker that did not exist until 2026-08-23. Its absence was not
    // silent: a manifest that correctly declared `codex` was reported by
    // `dagstree diff` as "declared but no longer detected" on every run,
    // which reads as drift and is not.
    const result = await detectCodingAgents(fixturePath("coding-agents", "codex-dir"));
    expect(result.agents).toEqual([{ agent: "codex", name: "Codex", evidence: [{ file: ".codex" }] }]);
  });

  it("detects Cursor", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "cursor-dir"));
    expect(result.agents).toEqual([{ agent: "cursor", name: "Cursor", evidence: [{ file: ".cursor" }] }]);
  });

  it("detects GitHub Copilot instructions", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "copilot-instructions"));
    expect(result.agents).toEqual([
      { agent: "github-copilot", name: "GitHub Copilot", evidence: [{ file: ".github/copilot-instructions.md" }] },
    ]);
  });

  it("reports AGENTS.md as unidentified rather than inventing an agent named after the file", async () => {
    // AGENTS.md is vendor-neutral by design: it proves an agent reads this
    // repo and says nothing about which. It used to be emitted as an agent
    // called `agents-md`, which answered "which agents are used here" with
    // the name of an instruction file.
    const result = await detectCodingAgents(fixturePath("coding-agents", "agents-md-only"));
    expect(result.agents).toEqual([]);
    expect(result.unidentified).toEqual([{ file: "AGENTS.md" }]);
  });

  it("reports .agents/ the same way", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "agents-dir-only"));
    expect(result.agents).toEqual([]);
    expect(result.unidentified).toEqual([{ file: ".agents" }]);
  });

  it("folds CLAUDE.md and .claude/ into one claude-code entry, not two, when both are present", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "multiple-agents"));
    const claude = result.agents.find((entry) => entry.agent === "claude-code");
    expect(claude?.evidence).toEqual([{ file: "CLAUDE.md" }]);

    // Two named agents from two distinct markers. AGENTS.md sits in this
    // fixture too and no longer contributes a third: it is reported as
    // unidentified, where it says nothing the specific markers have not
    // already answered.
    expect(result.agents.map((entry) => entry.agent).sort()).toEqual(["claude-code", "cursor"]);
    expect(result.unidentified).toEqual([{ file: "AGENTS.md" }]);
  });

  it("returns an empty list when no marker is present", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "none"));
    expect(result.agents).toEqual([]);
    expect(result.unidentified).toEqual([]);
  });
});
