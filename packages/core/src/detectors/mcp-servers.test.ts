import { describe, expect, it } from "vitest";

import { detectMcpServers } from "./mcp-servers.js";
import { fixturePath } from "../test-support/fixture-path.js";

function names(result: Awaited<ReturnType<typeof detectMcpServers>>) {
  return result.servers.map((entry) => entry.name).sort();
}

describe("detectMcpServers", () => {
  it("reads server names from .mcp.json", async () => {
    const result = await detectMcpServers(fixturePath("mcp", "mcp-json-only"));
    expect(names(result)).toEqual(["playwright", "trello"]);
    expect(result.servers.find((entry) => entry.name === "trello")?.evidence).toEqual([{ file: ".mcp.json" }]);
    expect(result.warnings).toEqual([]);
  });

  it("reads server names from .claude/settings.json's enabledMcpjsonServers list", async () => {
    const result = await detectMcpServers(fixturePath("mcp", "claude-settings-enabled"));
    expect(names(result)).toEqual(["slack", "trello"]);
    expect(result.servers.find((entry) => entry.name === "slack")?.evidence).toEqual([
      { file: ".claude/settings.json" },
    ]);
  });

  it("reads server names from an inline mcpServers object in .claude/settings.json", async () => {
    const result = await detectMcpServers(fixturePath("mcp", "claude-settings-inline"));
    expect(names(result)).toEqual(["sentry"]);
  });

  it("merges evidence from both files when a server appears in both, and keeps distinct servers separate", async () => {
    const result = await detectMcpServers(fixturePath("mcp", "both-sources-overlap"));
    expect(names(result)).toEqual(["playwright", "trello"]);

    const trello = result.servers.find((entry) => entry.name === "trello");
    expect(trello?.evidence).toEqual([{ file: ".mcp.json" }, { file: ".claude/settings.json" }]);

    const playwright = result.servers.find((entry) => entry.name === "playwright");
    expect(playwright?.evidence).toEqual([{ file: ".claude/settings.json" }]);
  });

  it("returns an empty list when no MCP config is present", async () => {
    const result = await detectMcpServers(fixturePath("mcp", "none"));
    expect(result.servers).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("distinguishes an absent MCP config from one that exists but fails to parse", async () => {
    // .claude/settings.json here has a trailing comma — invalid JSON, as
    // opposed to simply not existing. Silently returning [] for it would
    // make a broken hand-edited config indistinguishable from a genuine
    // "no servers enabled" negative.
    const result = await detectMcpServers(fixturePath("mcp", "unparseable-settings"));
    expect(names(result)).toEqual(["trello"]);
    expect(result.warnings).toEqual([".claude/settings.json: present but could not be parsed as JSON"]);
  });
});
