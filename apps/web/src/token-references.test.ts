// Every stylesheet's `var(--x)` calls, checked against the one thing that
// decides whether they resolve: the custom properties tokens.css actually
// declares. A stylesheet that names a property nothing defines gets
// **nothing** for that declaration -- no build error, no runtime error, and
// (per the bar this repo holds itself to) no jsdom difference either, since
// jsdom does not compute styles at all. It looks like a design choice in a
// screenshot.
//
// This replaces two hand-written guards -- one that lived in
// ServiceNode.test.tsx, one in GraphCanvas.test.tsx -- that each read their
// own stylesheet and checked it against a list of names typed into the test
// by hand (the ones tokens.css's migration bridge, deleted 2026-08-26, used
// to alias). Each protected exactly the one file it was written against:
// together they covered 2 of the component stylesheets under apps/web/src,
// and neither covered anything written afterward. A validator proved the
// gap by reintroducing `--color-surface-raised` into
// MigrationList.module.css -- a stylesheet neither guard read -- which
// silently drops that board's background, and the full suite (1152 tests,
// 70 files) stayed green.
//
// Two choices close that gap rather than patch it:
//
//  - Discovery instead of a file list. This walks every `*.module.css` under
//    apps/web/src rather than importing named stylesheets, so a new
//    component's stylesheet is covered the moment it exists, not the moment
//    someone remembers to add it to a list in this file.
//  - tokens.css's own declarations instead of a hand-typed forbidden set.
//    The old guards' names were exactly as good as whoever last updated the
//    list; deleting a token from tokens.css without deleting it from an
//    array in a test file is indistinguishable from deleting it correctly,
//    right up until the reproduction above. Reading tokens.css once and
//    comparing every stylesheet's references against it catches the whole
//    class of "this custom property does not exist" defects, not only the
//    ones that happened to prompt this file.
//
// What this does NOT catch, stated plainly because a discovery-based guard
// invites the assumption that it is exhaustive:
//
//  - A token tokens.css still defines but that now holds the wrong *value*
//    for the rule using it (a colour swapped for the wrong colour, say).
//    This only proves the name resolves to something, never that the
//    something is right -- the same limit ServiceNode.test.tsx's own
//    stylesheet-reading tests already state for themselves.
//  - A dead name reintroduced as a fresh *declaration* inside a component's
//    own stylesheet (e.g. a rule that declares its own local
//    `--color-border: red;`) rather than a *reference* to the deleted global
//    one. Nothing under apps/web/src does this today; if one ever did, this
//    file's "defined" set would pick up that local declaration and wrongly
//    treat the name as legitimate everywhere.
//  - A custom property set from a React `style` prop rather than declared in
//    a stylesheet. No component under apps/web/src does this today (checked
//    when this file was written); a `var()` fed that way would not go
//    through tokens.css at all, and this guard only ever reads stylesheets.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Derived from this file's own path by string replacement, deliberately not
// `process.cwd()`: that resolves to the repo root under `pnpm test` run from
// the root and to `apps/web` under a per-package
// `pnpm --filter @catalogus/web test` -- ServiceNode.test.tsx's header
// carries the same finding, for the same reason. Not
// `new URL("./tokens.css", import.meta.url)` either -- under jsdom (most
// files in this directory opt into it) the global `URL` resolves a relative
// reference against the *document* base rather than the module's, and
// `node:fs` then rejects the resulting `http://localhost:3000/...` URL with
// "The URL must be of scheme file". This file runs under vitest's plain node
// environment (no `@vitest-environment jsdom` docblock, and none is needed
// for reading files), but it derives its paths the same way regardless.
const srcDir = fileURLToPath(import.meta.url).replace(/token-references\.test\.ts$/, "");

const tokensCss = readFileSync(join(srcDir, "tokens.css"), "utf8");

// Every custom property tokens.css declares. There is one palette block since
// 2026-09-03 (the dark override and its `data-theme` pin were removed by the
// owner's decision), but the match is over the whole file on purpose, so a
// block added later declares names this guard sees without an edit. Matched
// only at the start of a line (after leading whitespace) so the deleted
// migration bridge's replacement comment -- prose that *names* several
// identifiers without declaring them -- is never mistaken for a declaration.
const DEFINED_TOKENS = new Set(Array.from(tokensCss.matchAll(/^[ \t]*(--[\w-]+)\s*:/gm), (match) => match[1]));

// Every `*.module.css` path under this directory, relative to it, found by
// walking rather than by naming one -- the whole point of this guard over
// the two it replaces. `{ recursive: true }` on `readdirSync` (Node 20.1+;
// this repo requires >=22) returns paths already relative to `srcDir`, using
// this platform's own separator -- rejoined with `join` per file below
// rather than string-concatenated, since that separator is not the same on
// every platform this suite runs on.
const stylesheetPaths = readdirSync(srcDir, { recursive: true })
  .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".module.css"))
  .sort();

describe("every apps/web stylesheet references only tokens tokens.css defines", () => {
  // A guard that discovers its own scope can fail open just as easily as the
  // guards it replaces failed closed: a typo'd extension, a moved directory,
  // or a `readdirSync` call that silently returned nothing would leave
  // `stylesheetPaths` empty, and an empty list makes every test below
  // vacuously pass -- exactly the "green suite, nothing actually checked"
  // shape this file exists to close off. 21 stylesheets exist under
  // apps/web/src as of this writing; the threshold is comfortably below that
  // so an added or removed component does not make this brittle.
  it("actually discovers stylesheets, so an empty scan cannot pass as a clean one", () => {
    expect(stylesheetPaths.length).toBeGreaterThanOrEqual(15);
  });

  it.each(stylesheetPaths)("%s references no undefined custom property", (relativePath) => {
    const css = readFileSync(join(srcDir, relativePath), "utf8");
    const referenced = Array.from(css.matchAll(/var\(\s*(--[\w-]+)/g), (match) => match[1]);
    const undefinedReferences = [...new Set(referenced.filter((name) => !DEFINED_TOKENS.has(name)))];
    // A failure here names both halves in one assertion: the file, in the
    // test's own title (vitest's `%s`), and the token, in the array
    // `toEqual` prints on mismatch -- naming the file and the token is the
    // whole point, per this repo's brief for this guard.
    expect(undefinedReferences).toEqual([]);
  });
});
