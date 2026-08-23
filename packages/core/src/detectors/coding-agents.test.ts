import { describe, expect, it } from "vitest";

import { detectCodingAgents } from "./coding-agents.js";
import { fixturePath } from "../test-support/fixture-path.js";

describe("detectCodingAgents", () => {
  it("detects Claude Code from CLAUDE.md", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "claude-md-only"));
    expect(result).toEqual([{ agent: "claude-code", name: "Claude Code", evidence: [{ file: "CLAUDE.md" }] }]);
  });

  it("detects Claude Code from a .claude/ directory", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "claude-dir-only"));
    expect(result).toEqual([{ agent: "claude-code", name: "Claude Code", evidence: [{ file: ".claude" }] }]);
  });

  it("detects the generic AGENTS.md convention", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "agents-md-only"));
    expect(result).toEqual([{ agent: "agents-md", name: "AGENTS.md", evidence: [{ file: "AGENTS.md" }] }]);
  });

  it("detects .agents/", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "agents-dir-only"));
    expect(result).toEqual([{ agent: "agents-md", name: "AGENTS.md", evidence: [{ file: ".agents" }] }]);
  });

  it("detects Cursor", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "cursor-dir"));
    expect(result).toEqual([{ agent: "cursor", name: "Cursor", evidence: [{ file: ".cursor" }] }]);
  });

  it("detects GitHub Copilot instructions", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "copilot-instructions"));
    expect(result).toEqual([
      { agent: "github-copilot", name: "GitHub Copilot", evidence: [{ file: ".github/copilot-instructions.md" }] },
    ]);
  });

  it("folds CLAUDE.md and .claude/ into one claude-code entry, not two, when both are present", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "multiple-agents"));
    const claude = result.find((entry) => entry.agent === "claude-code");
    expect(claude?.evidence).toEqual([{ file: "CLAUDE.md" }]);

    // three distinct agents detected from three distinct markers
    expect(result.map((entry) => entry.agent).sort()).toEqual(["agents-md", "claude-code", "cursor"]);
  });

  it("returns an empty list when no marker is present", async () => {
    const result = await detectCodingAgents(fixturePath("coding-agents", "none"));
    expect(result).toEqual([]);
  });
});
