// Drift check between this CLI's real command surface and the shell lines
// `skills/catalogus/SKILL.md` teaches an agent to run.
//
// Why it exists, precisely: `packages/schema/src/skill-drift.test.ts` was
// named in CLAUDE.md as the mechanism that keeps the shipped skill honest,
// and it walks only SKILL.md's single ```yaml fragment. The fenced *shell*
// blocks — the lines an agent copies verbatim into a client's repo — were
// covered by nothing at all. That was proven rather than suspected: during
// the 2026-08-24 schema migration a validator rewrote those blocks to teach
// `catalogus set project.coding_agents ...` and
// `catalogus set project.vcs.provider ...`, both fields removed from `set`
// in the same migration, and all 645 tests stayed green. A skill that
// teaches a removed command does not fail here — it fails in the client's
// repo, where the agent looks broken and nobody has this repo open.
//
// It lives in packages/cli rather than beside the yaml check because the
// facts it needs are this package's: which commands exist, which flags each
// one registers, which fields `set` accepts. packages/schema cannot import
// them — the dependency runs schema -> cli, never back.
//
// **Every fact is read off the live commander program**, not from a list
// copied into this file. A hand-maintained roster of command names here
// would be one more artifact to drift, which is the exact failure under
// test; `createProgram()` is the same function the bin entrypoint runs, so
// a command that exists to this test is a command that exists to a user.
//
// Scope, stated so nobody reads this as wider than it is:
//
//   - **Fenced blocks only.** Prose mentions `catalogus push --private`
//     (Phase 5, not built), which is a deliberate forward reference: the
//     skill tells an agent where cost data will go so it does not put it in
//     catalogus.yaml today. Checking prose would demand an
//     allowed-but-unbuilt exception list, and a list of commands that are
//     allowed to not exist is exactly the shape of thing that stops being
//     read. What an agent copies is what is fenced, so that is what is
//     checked.
//   - **Not the reverse direction.** Nothing here fails when the CLI grows
//     a command SKILL.md never teaches (`view` is one today). Whether the
//     skill should teach the viewer is a scope decision for the owner, not
//     something a drift test gets to decide by going red.
//   - **Names and shapes, not semantics.** That `catalogus link fly-api
//     supabase-db` names two ids which exist in some manifest is not
//     knowable from here; that `link` takes two required arguments is.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import { createProgram } from "./cli.js";
import { SETTABLE_FIELDS } from "./commands/set.js";
import { findRepoRoot } from "./test-support/repo-root.js";

const repoRoot = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
const skillPath = join(repoRoot, "skills", "catalogus", "SKILL.md");

interface SkillCommandLine {
  /** 1-based line number in SKILL.md, so a failure points at the line to edit. */
  lineNumber: number;
  /** The raw line, trimmed. Used as the test title and in failure messages. */
  text: string;
  /** Tokens after `catalogus`, with synopsis punctuation stripped — see normalizeToken. */
  tokens: string[];
}

/**
 * Every `catalogus ...` line inside a fenced code block. Fence tracking is a
 * simple toggle on lines starting with ``` — SKILL.md has no nested or
 * indented fences, and a fence count that came out odd would mean the file's
 * own markdown is broken, which the sanity test below catches.
 */
function extractSkillCommandLines(markdown: string): SkillCommandLine[] {
  const lines = markdown.split(/\r?\n/);
  const found: SkillCommandLine[] = [];
  let insideFence = false;
  lines.forEach((line, index) => {
    if (line.startsWith("```")) {
      insideFence = !insideFence;
      return;
    }
    if (!insideFence) return;
    const trimmed = line.trim();
    if (trimmed !== "catalogus" && !trimmed.startsWith("catalogus ")) return;
    const tokens = tokenize(trimmed).slice(1);
    found.push({ lineNumber: index + 1, text: trimmed, tokens });
  });
  return found;
}

/**
 * Splits a command line into shell-ish tokens, keeping a quoted argument
 * whole (`"modular monolith (.NET 10, vertical slices)"` is one token, not
 * five) and dropping the trailing `# ...` comment several lines carry.
 * Synopsis punctuation is stripped per token by normalizeToken; a token that
 * normalizes to nothing (the bare `...]` closing a variadic synopsis) is
 * dropped.
 */
function tokenize(line: string): string[] {
  const raw = line.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const tokens: string[] = [];
  for (const token of raw) {
    if (token.startsWith("#")) break;
    const normalized = normalizeToken(token);
    if (normalized.length > 0) tokens.push(normalized);
  }
  return tokens;
}

/**
 * Strips the synopsis notation SKILL.md's usage blocks use — `[optional]`
 * brackets and a `...` variadic marker — from an unquoted token. Quoted
 * tokens are returned untouched: a `[` inside quotes is a value, not
 * notation.
 */
function normalizeToken(raw: string): string {
  if (raw.startsWith('"') || raw.startsWith("'")) return raw;
  let token = raw;
  while (token.startsWith("[")) token = token.slice(1);
  while (token.endsWith("]")) token = token.slice(0, -1);
  while (token.endsWith("...")) token = token.slice(0, -3);
  return token;
}

/** A `<placeholder>` in a usage synopsis stands for a value the reader supplies, so there is nothing to check about it. */
function isPlaceholder(token: string): boolean {
  return token.startsWith("<") && token.endsWith(">");
}

function isFlag(token: string): boolean {
  return token.startsWith("-") && token !== "-";
}

/** `--flag=value` is legal shell; only the flag half is a name to check. */
function flagName(token: string): string {
  const equals = token.indexOf("=");
  return equals === -1 ? token : token.slice(0, equals);
}

const program = createProgram();

/**
 * Flags accepted on any command line regardless of the subcommand.
 * `--version` and `-V` come off the program's own option list;
 * `--help`/`-h` are commander's built-in, which it does not put in
 * `program.options`, so they are named here — the one place this file states
 * a flag rather than reading it, and only because commander gives it no
 * other way.
 */
const GLOBAL_FLAGS = new Set<string>([
  ...program.options.flatMap((option) => [option.short, option.long]).filter((f): f is string => Boolean(f)),
  "--help",
  "-h",
]);

function findCommand(name: string): Command | undefined {
  return program.commands.find((command) => command.name() === name || command.aliases().includes(name));
}

function flagsOf(command: Command): Set<string> {
  const flags = new Set<string>(GLOBAL_FLAGS);
  for (const option of command.options) {
    if (option.short) flags.add(option.short);
    if (option.long) flags.add(option.long);
  }
  return flags;
}

/** True when this option takes a value, so the token after it is that value rather than a positional argument. */
function optionTakesValue(command: Command, flag: string): boolean {
  const option = command.options.find((candidate) => candidate.short === flag || candidate.long === flag);
  if (!option) return false;
  return option.required || option.optional;
}

/**
 * `set`'s field names, with per-entry fields collapsed onto the placeholder
 * form `SETTABLE_FIELDS` publishes. `services.supabase-db.role` in the skill
 * and `services.<id>.role` in the CLI's own vocabulary are the same field:
 * the id between the dots is chosen when the entry is added, so it is a
 * value, not a name (see commands/set.ts's SERVICE_FIELD).
 */
function canonicalFieldName(field: string): string {
  return field.replace(/^services\.[^.]+\./, "services.<id>.");
}

const settableFields = new Set(SETTABLE_FIELDS);

const skillMarkdown = readFileSync(skillPath, "utf8");
const commandLines = extractSkillCommandLines(skillMarkdown);

describe("skills/catalogus/SKILL.md's `catalogus ...` shell lines vs. this CLI's command surface", () => {
  it("finds catalogus command lines to check", () => {
    expect(
      commandLines.length,
      `found no fenced \`catalogus ...\` lines at all in ${skillPath}. Either the skill stopped teaching ` +
        "the CLI (it is CLI-mandatory, so that would be a rewrite, not a tweak), or the fence tracking in " +
        "extractSkillCommandLines no longer matches how the file fences its examples. Check both before " +
        "assuming this is fine — a drift test that silently checks nothing is worse than no drift test.",
    ).toBeGreaterThan(0);
  });

  it("reads a balanced set of code fences", () => {
    const fences = skillMarkdown.split(/\r?\n/).filter((line) => line.startsWith("```")).length;
    expect(
      fences % 2,
      "skills/catalogus/SKILL.md has an odd number of ``` fences, so the open/close toggle in " +
        "extractSkillCommandLines is out of step with the file and every line after the unbalanced fence " +
        "is being read as the wrong side of it.",
    ).toBe(0);
  });

  it.each(commandLines)("SKILL.md:$lineNumber `$text` names a command this CLI registers", (line) => {
    const [first] = line.tokens;
    expect(
      first,
      `SKILL.md:${line.lineNumber} is a bare "catalogus" with no subcommand and no flag.`,
    ).toBeDefined();
    if (first === undefined) return;

    // `catalogus --version` and friends: a program-level flag, no subcommand.
    if (isFlag(first)) {
      expect(
        GLOBAL_FLAGS.has(flagName(first)),
        `SKILL.md:${line.lineNumber} runs "${line.text}", but "${flagName(first)}" is not an option this ` +
          `CLI registers on the program itself. Program flags: ${[...GLOBAL_FLAGS].sort().join(", ")}.`,
      ).toBe(true);
      return;
    }

    const command = findCommand(first);
    expect(
      command,
      `SKILL.md:${line.lineNumber} teaches "${line.text}", but "${first}" is not a command this CLI ` +
        "registers. The skill is installed into client repos, so as written it tells an agent to run " +
        `something that exits non-zero in front of the client. Registered commands: ` +
        `${program.commands.map((c) => c.name()).sort().join(", ")}. Either the command was renamed or ` +
        "removed and SKILL.md was not updated with it (they change in the same commit — see CLAUDE.md), " +
        "or the line is a typo.",
    ).toBeDefined();
  });

  it.each(commandLines)("SKILL.md:$lineNumber `$text` uses only flags that command registers", (line) => {
    const [first, ...rest] = line.tokens;
    if (first === undefined || isFlag(first)) return;
    const command = findCommand(first);
    if (!command) return; // Already reported by the command-name test above.

    const known = flagsOf(command);
    const used = rest.filter(isFlag).map(flagName);
    const unknown = used.filter((flag) => !known.has(flag));
    expect(
      unknown,
      `SKILL.md:${line.lineNumber} teaches "${line.text}", which passes ${unknown.join(", ")} to ` +
        `\`catalogus ${first}\` — not an option it registers. commander exits 2 on an unknown option, so ` +
        `this line fails outright in a client repo. Options on \`${first}\`: ` +
        `${command.options.map((o) => o.long ?? o.short).sort().join(", ") || "(none)"}.`,
    ).toEqual([]);
  });

  it.each(commandLines)("SKILL.md:$lineNumber `$text` supplies every required option and argument", (line) => {
    const [first, ...rest] = line.tokens;
    if (first === undefined || isFlag(first)) return;
    const command = findCommand(first);
    if (!command) return;

    const usedFlags = new Set(rest.filter(isFlag).map(flagName));
    const missingMandatory = command.options
      .filter((option) => option.mandatory)
      .map((option) => option.long ?? option.short)
      .filter((flag): flag is string => flag !== undefined)
      .filter((flag) => !usedFlags.has(flag));
    expect(
      missingMandatory,
      `SKILL.md:${line.lineNumber} teaches "${line.text}" without ${missingMandatory.join(", ")}, which ` +
        `\`catalogus ${first}\` requires. commander exits 2 on a missing required option.`,
    ).toEqual([]);

    // Positional count. Flags and the values they consume are removed first,
    // so what is left is what commander would hand to the action as
    // arguments. A `<placeholder>` still counts: the synopsis is showing
    // that an argument goes there, which is the thing being counted.
    const positionals: string[] = [];
    for (let i = 0; i < rest.length; i += 1) {
      const token = rest[i] as string;
      if (isFlag(token)) {
        if (!token.includes("=") && optionTakesValue(command, flagName(token))) i += 1;
        continue;
      }
      positionals.push(token);
    }
    const required = command.registeredArguments.filter((argument) => argument.required).length;
    expect(
      positionals.length,
      `SKILL.md:${line.lineNumber} teaches "${line.text}", which passes ${positionals.length} positional ` +
        `argument(s) to \`catalogus ${first}\` — it requires ${required} ` +
        `(${command.registeredArguments.map((a) => (a.required ? `<${a.name()}>` : `[${a.name()}]`)).join(" ")}).`,
    ).toBeGreaterThanOrEqual(required);
  });

  // The specific hole this file was written for. `set`'s field vocabulary is
  // the part of the CLI that changed under SKILL.md during the 2026-08-24
  // migration, and the part where a stale line is most plausible-looking:
  // `catalogus set project.vcs.provider github` reads exactly like a line
  // that works.
  const setLines = commandLines.filter((line) => line.tokens[0] === "set");

  it("finds `catalogus set` lines to check", () => {
    expect(
      setLines.length,
      "found no fenced `catalogus set` lines in SKILL.md. `set` is the command whose field vocabulary " +
        "drifted under the skill once already, so its examples disappearing entirely is a change worth " +
        "looking at rather than a green test.",
    ).toBeGreaterThan(0);
  });

  it.each(setLines)("SKILL.md:$lineNumber `$text` sets only fields `catalogus set` accepts", (line) => {
    const rest = line.tokens.slice(1);
    // Strip `--path <dir>`; everything left alternates field, value.
    const pairs: string[] = [];
    for (let i = 0; i < rest.length; i += 1) {
      const token = rest[i] as string;
      if (isFlag(token)) {
        if (!token.includes("=") && optionTakesValue(findCommand("set") as Command, flagName(token))) i += 1;
        continue;
      }
      pairs.push(token);
    }

    const badFields = pairs
      .filter((_token, index) => index % 2 === 0)
      .filter((field) => !isPlaceholder(field))
      .map(canonicalFieldName)
      .filter((field) => !settableFields.has(field));

    expect(
      badFields,
      `SKILL.md:${line.lineNumber} teaches "${line.text}", which sets ${badFields.join(", ")} — not a ` +
        "field `catalogus set` accepts, so the command exits 2 in a client repo. This is the exact drift " +
        "this file exists to catch: `project.pm`, `project.vcs.provider` and `project.coding_agents` were " +
        "removed from `set` on 2026-08-24 (they are `catalogus add <slug> --role pm|vcs|coding-agent` " +
        `now), and nothing noticed the skill still teaching them. Settable fields: ` +
        `${SETTABLE_FIELDS.join(", ")}.`,
    ).toEqual([]);
  });
});
