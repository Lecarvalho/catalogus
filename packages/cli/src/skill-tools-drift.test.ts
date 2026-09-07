// Drift check between the `catalogus` MCP server's registered tools and what
// `skills/catalogus/SKILL.md` teaches an agent to call. Beside
// skill-commands-drift.test.ts (the CLI's fenced shell lines) and in the same
// register: both files walk the live surface a running program actually
// exposes rather than a hand-maintained list here, so a rename or a removal
// is caught the moment it lands rather than the moment a client notices.
//
// Unlike skill-commands-drift.test.ts, **both directions are checked here**,
// and it is worth saying why the two files differ on that. The CLI's fenced
// lines are one-directional on purpose (that file's own header: the CLI is
// allowed to grow a command the skill never teaches -- whether to document a
// given command is a scope decision for the owner, not something a drift
// test gets to force). The MCP tools have no such asymmetry: decision 14
// (docs/plan/decisions.md, 2026-09-06) made them the first-class surface an
// agent is instructed to use, so every tool exists *because* the skill is
// meant to drive it. A tool the skill never names is a tool no agent will
// ever load (dead code with a description nobody reads); a name the skill
// teaches that the server does not register is a call that fails the moment
// a client's agent tries it. Both are the same defect this file exists to
// catch, just pointing opposite directions.
//
// The server is built and listed through a real MCP `Client` over an
// `InMemoryTransport` pair, the same way mcp/server.test.ts does it -- proof
// the tools are reachable through registerTool's real listing path, not just
// that createCatalogusMcpServer() happens to have been called with the right
// arguments somewhere.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { editSchema } from "./mcp/propose-edit.js";
import { createCatalogusMcpServer } from "./mcp/server.js";
import { findRepoRoot } from "./test-support/repo-root.js";

const repoRoot = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
const skillPath = join(repoRoot, "skills", "catalogus", "SKILL.md");
const skillMarkdown = readFileSync(skillPath, "utf8");

// --- tokens SKILL.md actually names -----------------------------------------

interface SkillToken {
  /** e.g. "detect_stack" -- the identifier itself, never the surrounding decoration. */
  token: string;
  /** 1-based line number in SKILL.md, so a failure points at the line to edit. */
  lineNumber: number;
}

/** `^[a-z]+(_[a-z]+)+$` -- lowercase, at least two words joined by `_`. Every registered tool name has this shape; so do a handful of manifest fields this skill legitimately mentions (see ALLOWED_NON_TOOL_TOKENS below). */
const SNAKE_CASE_RE = /^[a-z]+(?:_[a-z]+)+$/;

/** The leading run of word characters in a backticked span, e.g. "detect_stack" out of "detect_stack {path?}" -- the tool table's own row shape (name plus its input shape in one span). A span that is exactly the identifier, like `apply_manifest_edit`, is the same case with nothing left over. */
const LEADING_WORD_RE = /^\w+/;

/**
 * Every backticked token in SKILL.md whose leading word matches
 * `SNAKE_CASE_RE`, with its line number. Scoped to prose, not fenced shell
 * blocks: decision 11 (docs/plan/decisions.md) already draws that line for
 * commands ("fenced means the agent runs it, prose means it is for the
 * user"), and a tool name is neither a shell command nor ever meant to be
 * fenced -- SKILL.md's own "Two ways to drive Catalogus" section says tool
 * names are written in backticks in prose. Fence tracking mirrors
 * skill-commands-drift.test.ts's extractSkillCommandLines exactly, for the
 * same reason: this file has no nested or indented fences, and a fence count
 * that came out odd would mean the markdown itself is broken, which the
 * sanity test below catches.
 */
function extractSnakeCaseTokens(markdown: string): SkillToken[] {
  const lines = markdown.split(/\r?\n/);
  const found: SkillToken[] = [];
  let insideFence = false;
  lines.forEach((line, index) => {
    if (line.startsWith("```")) {
      insideFence = !insideFence;
      return;
    }
    if (insideFence) return;
    const backtickSpans = line.match(/`([^`]+)`/g) ?? [];
    for (const spanWithTicks of backtickSpans) {
      const span = spanWithTicks.slice(1, -1);
      const leadingWord = LEADING_WORD_RE.exec(span)?.[0];
      if (leadingWord && SNAKE_CASE_RE.test(leadingWord)) {
        found.push({ token: leadingWord, lineNumber: index + 1 });
      }
    }
  });
  return found;
}

// Non-tool snake_case identifiers the skill legitimately uses in backticks.
// Commented per entry, the same discipline skill-commands-drift.test.ts's
// own header insists on for itself -- an allow-list nobody explains is the
// next thing that quietly grows past being read:
//   - push_private: the forward reference to the Phase 5 tool that does not
//     exist yet (decision 14's own text: "becomes the push_private tool once
//     Phase 5 lands").
//   - phasing_out, replaced_by: manifest fields (serviceEntry.status,
//     serviceEntry.replaced_by), not tools.
//   - coding_agents: the removed project.coding_agents field, if a future
//     edit of the skill's history section names it again in backticks.
const ALLOWED_NON_TOOL_TOKENS = new Set(["push_private", "phasing_out", "replaced_by", "coding_agents"]);

// --- the live tool list -------------------------------------------------------

async function listServerToolNames(): Promise<string[]> {
  const server = createCatalogusMcpServer();
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "skill-tools-drift-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  return tools.map((tool) => tool.name);
}

// --- the edits op vocabulary, read off the schema rather than retyped --------
//
// zod's discriminated union stores each branch's literal discriminant as
// `.def.values` (a one-element array for a plain `z.literal("add")`) --
// reading it here, rather than hand-listing ["add", "set", ...], means a
// branch added to or removed from editSchema in propose-edit.ts changes what
// this test expects without anyone having to remember to update this file
// too.
function editSchemaOpLiterals(): string[] {
  return (editSchema.options as unknown as { shape: { op: { def: { values: string[] } } } }[]).map(
    (option) => option.shape.op.def.values[0] as string
  );
}

describe("skills/catalogus/SKILL.md's tool names vs. the catalogus MCP server's registered tools", () => {
  it("finds backticked snake_case tokens in SKILL.md to check", () => {
    expect(
      extractSnakeCaseTokens(skillMarkdown).length,
      `found no backticked snake_case tokens at all in ${skillPath}. Either the skill stopped naming ` +
        "its MCP tools by name (a rewrite, not a tweak -- decision 14 made them the first-class " +
        "surface), or extractSnakeCaseTokens no longer matches how the file writes them. Check both " +
        "before assuming this is fine."
    ).toBeGreaterThan(0);
  });

  it("reads a balanced set of code fences", () => {
    const fences = skillMarkdown.split(/\r?\n/).filter((line) => line.startsWith("```")).length;
    expect(
      fences % 2,
      "skills/catalogus/SKILL.md has an odd number of ``` fences, so the open/close toggle in " +
        "extractSnakeCaseTokens is out of step with the file and every line after the unbalanced " +
        "fence is being read as the wrong side of it."
    ).toBe(0);
  });

  it("every backticked snake_case token in SKILL.md is a registered tool or an allow-listed non-tool identifier", async () => {
    const toolNames = new Set(await listServerToolNames());
    const tokens = extractSnakeCaseTokens(skillMarkdown);
    const offenders = tokens.filter(
      (t) => !toolNames.has(t.token) && !ALLOWED_NON_TOOL_TOKENS.has(t.token)
    );
    expect(
      offenders.map((t) => `SKILL.md:${t.lineNumber} \`${t.token}\``),
      "SKILL.md names a backticked snake_case identifier that is neither a tool this server registers " +
        `nor on ALLOWED_NON_TOOL_TOKENS (this file). Registered tools: ${[...toolNames].sort().join(", ")}. ` +
        "Either the tool was renamed or removed and SKILL.md was not updated with it (they change in " +
        "the same commit -- decision 14), the token is a typo, or it names a real non-tool field this " +
        "test's allow-list has not caught up with yet."
    ).toEqual([]);
  });

  it("every registered tool name appears at least once in SKILL.md", async () => {
    const toolNames = await listServerToolNames();
    const namedTokens = new Set(extractSnakeCaseTokens(skillMarkdown).map((t) => t.token));
    const missing = toolNames.filter((name) => !namedTokens.has(name));
    expect(
      missing,
      `${missing.join(", ")} ${missing.length === 1 ? "is a tool" : "are tools"} this server registers ` +
        `that skills/catalogus/SKILL.md never names. The skill is what teaches an agent this tool ` +
        "exists at all -- a tool never named in SKILL.md is a tool no client-repo agent will ever " +
        "discover or load, decision 14's whole point notwithstanding. Add it to the tool table (and to " +
        "whichever numbered step actually calls it) or explain in this test why it is deliberately " +
        "absent."
    ).toEqual([]);
  });

  it("every op list SKILL.md writes matches editSchema's literals, in the same order", () => {
    const schemaOps = editSchemaOpLiterals();
    const expectedBacktickList = schemaOps.map((op) => `\`${op}\``).join("/");
    // Every backtick-slash run in the skill that names even one op literal
    // is taken to be *the* op list and must match it exactly, on one line.
    // The skill writes the list in more than one place (the tool table's
    // apply_manifest_edit row and step 6's "batch every edit" sentence, as of
    // 2026-09-06); asserting only that the expected list appears *somewhere*
    // let one occurrence go stale as long as the other stayed current, which
    // is the 2026-09-06 validator's D4 (docs/plan/phase-6-mcp.md). Each
    // occurrence is checked on its own, with its line number, so a stale one
    // is the failure.
    //
    // "Even one op" is deliberate, and it constrains the skill's prose: a
    // slash-joined backtick run of ops is reserved for the full list, so a
    // sentence that offers two or three ops as alternatives writes them
    // with commas ("`set`, `rename` or `unlink`"). The first cut of this
    // test required a majority of ops, all of them literals, and the same
    // day's validator showed both halves of that leak: a list cut to three
    // ops fell under the threshold and went unchecked, and swapping one op
    // for a made-up word made the run stop being a candidate at all -- the
    // more wrong the list, the less the test looked at it.
    const lines = skillMarkdown.split(/\r?\n/);
    const occurrences: { lineNumber: number; list: string }[] = [];
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/`[a-z]+`(?:\/`[a-z]+`)+/g)) {
        const members = match[0].split("/").map((m) => m.slice(1, -1));
        if (members.some((m) => schemaOps.includes(m))) {
          occurrences.push({ lineNumber: index + 1, list: match[0] });
        }
      }
    });
    expect(
      occurrences.length,
      `expected skills/catalogus/SKILL.md to write the \`edits\` op list ("${expectedBacktickList}") ` +
        "at least once -- e.g. in the tool table's apply_manifest_edit row, or step 6's \"batch every " +
        "edit\" sentence. Either the skill stopped listing the ops (a rewrite, not a tweak) or it " +
        "writes them in a shape this test's regex no longer recognises."
    ).toBeGreaterThan(0);
    const stale = occurrences.filter((o) => o.list !== expectedBacktickList);
    expect(
      stale.map((o) => `SKILL.md:${o.lineNumber} ${o.list}`),
      `every op list in skills/catalogus/SKILL.md must be exactly "${expectedBacktickList}" ` +
        `(editSchema's op literals, in propose-edit.ts's own union order: ${schemaOps.join(", ")}). ` +
        "If propose-edit.ts's editSchema gained, lost or reordered an op, update every occurrence in " +
        "SKILL.md to match; if one occurrence in SKILL.md changed on its own, put it back. A list that " +
        "is right but wrapped across two lines also lands here: keep it on one line. And a sentence " +
        "that offers two or three ops as alternatives writes them with commas, never slash-joined -- " +
        "the slash form is reserved for the full list."
    ).toEqual([]);
  });
});
