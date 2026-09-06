// `runEdit` and `buildCommand` -- extracted from propose-edit.ts (Phase 6,
// decision 14) so `apply_manifest_edit` can run the exact same dispatch
// against the real directory that `propose_manifest_edit` already runs
// against a scratch copy of it. This was the whole point of the split: the
// proposal and the application must run the same code, or the diff a user
// approved is not the diff that lands -- a second hand-copied switch
// statement here would be exactly the kind of duplicated check this repo's
// own history says drifts apart (private-guard.ts's header names four
// instances of that same defect shape). (2026-09-06.)
//
// This module never touches a scratch directory, a snapshot, or `.catalogus/`
// itself -- it only knows how to turn one `Edit` into a `catalogus ...`
// command line and run the matching command function against whatever
// directory its caller hands it. What that directory *is* (a throwaway copy
// for propose-edit.ts, the real project for apply-edit.ts) is entirely the
// caller's business.
//
// `Edit` is imported as a type only from propose-edit.ts, which in turn
// imports `runEdit`/`buildCommand` (as values) from here. That is a
// circular reference between the two files, but a `import type` is erased
// before either the type-checker's module graph or the bundler ever sees a
// runtime dependency -- there is no cycle left once compilation finishes,
// only the one type that both files need to agree on. `editSchema` (the zod
// union `Edit` is inferred from) stays defined in propose-edit.ts, per the
// brief this file was written from: apply-edit.ts reuses it by importing it
// from there, rather than this file duplicating or relocating the union.
import { runAdd } from "../commands/add.js";
import { runDeprecate } from "../commands/deprecate.js";
import { runLink } from "../commands/link.js";
import { runRemove } from "../commands/remove.js";
import { runRename } from "../commands/rename.js";
import { runSet } from "../commands/set.js";
import { runUnlink } from "../commands/unlink.js";
import type { CommandResult } from "../types.js";
import type { Edit } from "./propose-edit.js";

// --- POSIX shell quoting -----------------------------------------------------
//
// Every fenced `catalogus ...` line in SKILL.md is written for a POSIX
// shell, so the `command`/`commands` strings both propose-edit.ts and
// apply-edit.ts return are quoted for one too -- not for cmd.exe or
// PowerShell, which the skill never targets. A token is left bare when a
// POSIX shell would treat every character in it literally; otherwise it is
// wrapped in single quotes, with any embedded single quote closed, escaped,
// and reopened (the standard POSIX trick: `it's` becomes `'it'\''s'`, read
// as the three concatenated pieces `it` + `'s` + `s`... i.e. `'it'` + `\'`
// + `'s'`). An allowlist rather than a denylist of "dangerous" characters,
// so a POSIX metacharacter this list's author didn't think of still gets
// quoted rather than passed through bare.
const SHELL_SAFE_TOKEN = /^[A-Za-z0-9_.,:/@=+-]+$/;

function shellQuote(token: string): string {
  if (SHELL_SAFE_TOKEN.test(token)) {
    return token;
  }
  return `'${token.replace(/'/g, "'\\''")}'`;
}

export function buildCommand(tokens: string[]): string {
  return tokens.map(shellQuote).join(" ");
}

// --- running one edit against a directory ------------------------------------

export interface EditRun {
  /** Unquoted tokens; `buildCommand` quotes them for the returned `command`/`commands` strings. */
  tokens: string[];
  result: CommandResult;
}

/**
 * Runs one edit against `targetDir` through the real command function
 * (`runAdd`, `runSet`, ...) and returns both the tokens for the
 * `catalogus ...` line that reproduces it and the command's own result.
 *
 * `targetDir` is passed straight through as each command's `pathArg`, so
 * whatever no-upward-walk or explicit-path behaviour that command already
 * has applies unchanged -- this function decides nothing about paths.
 */
export async function runEdit(edit: Edit, targetDir: string, fetchImpl: typeof fetch): Promise<EditRun> {
  switch (edit.op) {
    case "add": {
      const tokens = ["catalogus", "add", edit.service, "--role", edit.role];
      if (edit.id !== undefined) tokens.push("--id", edit.id);
      if (edit.dependsOn !== undefined && edit.dependsOn.length > 0) tokens.push("--depends-on", ...edit.dependsOn);
      if (edit.status !== undefined) tokens.push("--status", edit.status);
      if (edit.kind !== undefined) tokens.push("--kind", edit.kind);
      if (edit.version !== undefined) tokens.push("--version", edit.version);
      if (edit.replacedBy !== undefined) tokens.push("--replaced-by", edit.replacedBy);
      if (edit.added !== undefined) tokens.push("--added", edit.added);
      if (edit.notes !== undefined) tokens.push("--notes", edit.notes);
      const result = await runAdd(targetDir, edit.service, {
        role: edit.role,
        id: edit.id,
        dependsOn: edit.dependsOn,
        status: edit.status,
        kind: edit.kind,
        version: edit.version,
        replacedBy: edit.replacedBy,
        added: edit.added,
        notes: edit.notes,
      });
      return { tokens, result };
    }
    case "set": {
      // A value beginning with `-` is data to runSet, which takes plain
      // tokens, but a flag to commander, which parses the emitted line:
      // `catalogus set project.architecture -x` was proposed as ok and then
      // refused by the real binary with `error: unknown option '-x'`
      // (2026-09-06 validation, defect D2). Quoting cannot help -- the shell
      // strips the quotes before commander sees the token -- so the line
      // carries `--`, commander's end-of-options marker, whenever either
      // positional starts with `-`. Only `set` needs it: every other
      // positional this function emits is a slug or an id, and the schema's
      // slug pattern cannot begin with `-`.
      const needsEndOfOptions = edit.field.startsWith("-") || edit.value.startsWith("-");
      const tokens = needsEndOfOptions
        ? ["catalogus", "set", "--", edit.field, edit.value]
        : ["catalogus", "set", edit.field, edit.value];
      const result = await runSet(targetDir, [edit.field, edit.value], fetchImpl);
      return { tokens, result };
    }
    case "link": {
      const tokens = ["catalogus", "link", edit.from, edit.to];
      const result = await runLink(targetDir, edit.from, edit.to);
      return { tokens, result };
    }
    case "unlink": {
      const tokens = ["catalogus", "unlink", edit.from, edit.to];
      const result = await runUnlink(targetDir, edit.from, edit.to);
      return { tokens, result };
    }
    case "deprecate": {
      const tokens = ["catalogus", "deprecate", edit.id];
      if (edit.status !== undefined) tokens.push("--status", edit.status);
      if (edit.replacedBy !== undefined) tokens.push("--replaced-by", edit.replacedBy);
      const result = await runDeprecate(targetDir, edit.id, { status: edit.status, replacedBy: edit.replacedBy });
      return { tokens, result };
    }
    case "remove": {
      const tokens = ["catalogus", "remove", edit.id];
      const result = await runRemove(targetDir, edit.id);
      return { tokens, result };
    }
    case "rename": {
      const tokens = ["catalogus", "rename", edit.from, edit.to];
      const result = await runRename(targetDir, edit.from, edit.to);
      return { tokens, result };
    }
  }
}
