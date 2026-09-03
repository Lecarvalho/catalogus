// Signal red is spent in exactly two places. This is the thing that says so.
//
// OWN-WORLD (apps/web/docs/DIRECTION.md, embedded in apps/web/index.html):
// "Signal red is spent in exactly two places, the status badge and the status
// word, and nowhere else: not a view, not a count." On 2026-08-31 the build was
// found spending it in four more, the owner was offered the amendment that would
// have licensed a third place, and ruled that **the rule stands and the build is
// corrected**. That revision then recorded, as accomplished fact, that "the extra
// sites move onto ink, and a guard now fails the suite on a red site outside the
// two."
//
// Neither half of that sentence was true. On 2026-09-02 a validator executed the
// built app and found the view rail's active-tab underline, the service page's
// uncatalogued marker and two pairs of tag tokens still red, and no guard of any
// kind in the tree. This file is the guard, written two days after it was
// announced, and the delay is the reason it is written the way it is: a rule that
// lives only in prose is a rule that gets read past, and every one of those four
// sites had a comment beside it discussing the red at length.
//
// **Why a source scan and not a rendered one.** CSS Modules resolve to opaque
// class names under jsdom and nothing in this suite computes styles, so the only
// place the question "what colour does this paint" can be asked is the
// stylesheet -- the same argument ServiceNode.test.tsx's own stylesheet block
// makes, widened from one rule to every rule in the app. A render-level check
// would be better and is not available: it would need a real engine, and this
// suite has none.
//
// **What the scan is, precisely.** Comments are stripped first -- prose about the
// rule is not a spend, and half the stylesheets in this app discuss it -- and
// what is left is parsed into declarations, each tagged with the innermost
// selector it sits under, `@media` blocks included. A declaration is red if its
// value names a signal hex, a signal `rgb()`, or any custom property that
// resolves to the signal *transitively*: `--tag-phasing-line: var(--color-signal)`
// was the actual 2026-09-02 defect, and one more hop (`--a: var(--tag-phasing-line)`)
// would have hidden it from a scan that only looked for the token's own name.
//
// **The allow-list names selectors and properties, never files.** A file-level
// exemption is how a guard stops guarding: `ServiceTile.module.css` is licensed
// to paint a badge red, and licensing the file would license the next rule
// somebody adds to it. Naming `.badge` + `border` means a red `background` on
// that same `.badge`, or a red anything on a new `.mark`, still fails. It cuts
// the other way too, and deliberately: rewriting `border: 1.5px solid
// var(--color-signal)` as `border-color: var(--color-signal)` fails until the
// entry is updated, because a guard nobody has to keep current is a guard nobody
// is reading.
//
// **Both lists are self-cleaning.** An entry that no longer matches a real
// declaration fails, so a permission cannot outlive the rule it was written for.
// That is the half a validator usually finds missing: the sweep gets tightened
// and the exemptions accumulate underneath it.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Derived from this file's own path, not `process.cwd()`: that resolves to the
// repo root under `pnpm test` and to `apps/web` under `pnpm --filter
// @catalogus/web test`. `direction-contract.test.ts` and
// `token-references.test.ts` carry the longer version of this finding.
const srcDir = fileURLToPath(import.meta.url).replace(/signal-red\.test\.ts$/, "");

/**
 * Both signal values: the light ground's, and the dark translation's. The
 * optional pair after the six digits is the eight-digit alpha form: `\b`
 * alone cannot match between `0` and `f`, so `#d40010ff` slipped past the
 * first version of this line -- found by a validator's mutation, 2026-09-02.
 */
const SIGNAL_HEX = /#(?:d40010|ff6b60)(?:[0-9a-f]{2})?\b/i;
/** The same two written out, comma- or space-separated, with or without alpha. */
const SIGNAL_RGB = /rgba?\(\s*(?:212\s*[, ]\s*0\s*[, ]\s*16|255\s*[, ]\s*107\s*[, ]\s*96)\b/i;

interface Declaration {
  /** Posix path relative to `apps/web/src`. */
  file: string;
  /** The innermost selector the declaration sits under, whitespace collapsed. */
  selector: string;
  property: string;
  value: string;
}

/** One licensed or quarantined rule site. */
interface Site {
  file: string;
  selector: string;
  property: string;
}

/**
 * Prose is not a spend. Every stylesheet that paints red explains why beside the
 * rule, and several that paint none discuss the rule anyway -- scanning comments
 * would make the guard fire on its own documentation, which is the fastest way
 * to teach a reader to disable it.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Every declaration in one stylesheet, each tagged with the selector it sits
 * under.
 *
 * A character scan with a prelude stack rather than a regex: a declaration
 * inside `@media (...) { .x { ... } }` has to come back tagged `.x`, and a
 * regex over `selector { ... }` either misses the nesting or matches the
 * at-rule as the selector. The stack costs four lines and is right for both.
 * These files carry no strings, `url()`s or nested selectors, which is what
 * makes a scanner this small honest rather than merely short.
 */
function declarationsIn(file: string, css: string): Declaration[] {
  const declarations: Declaration[] = [];
  const preludes: string[] = [];
  let buffer = "";

  function flush(): void {
    const text = buffer.trim();
    buffer = "";
    const colon = text.indexOf(":");
    if (text === "" || colon === -1) return;
    declarations.push({
      file,
      selector: preludes[preludes.length - 1] ?? "",
      property: text.slice(0, colon).trim(),
      value: flat(text.slice(colon + 1)),
    });
  }

  for (const char of stripComments(css)) {
    if (char === "{") {
      preludes.push(flat(buffer));
      buffer = "";
    } else if (char === "}") {
      flush();
      preludes.pop();
    } else if (char === ";") {
      flush();
    } else {
      buffer += char;
    }
  }

  return declarations;
}

/** Every `.css` under `apps/web/src`, module and global alike. */
function stylesheetsUnder(dir: string, prefix = ""): { file: string; css: string }[] {
  const found: { file: string; css: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...stylesheetsUnder(join(dir, entry.name), relative));
    } else if (entry.name.endsWith(".css")) {
      found.push({ file: relative, css: readFileSync(join(dir, entry.name), "utf8") });
    }
  }
  return found;
}

/** Whether a value names one of `names` as a custom property, not as a prefix of a longer one. */
function referencesAny(value: string, names: Iterable<string>): boolean {
  for (const name of names) {
    // `(?![\w-])` and not `\b`: `\b` matches between `l` and `-`, so
    // `--color-signal` would be found inside `--color-signal-ink`, and
    // `--color-signal-ink` is the badge's *foreground* on a red fill, not red.
    if (new RegExp(`${name}(?![\\w-])`).test(value)) return true;
  }
  return false;
}

/**
 * Every custom property that resolves to the signal colour, however many hops
 * away. Seeded with `--color-signal` and run to a fixed point, so an alias of an
 * alias is caught: the tag tokens were one hop and passed unnoticed for two
 * days, and nothing stops the next one being two.
 */
function signalResolvingTokens(declarations: readonly Declaration[]): Set<string> {
  const names = new Set(["--color-signal"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const declaration of declarations) {
      if (!declaration.property.startsWith("--") || names.has(declaration.property)) continue;
      const resolvesToSignal =
        SIGNAL_HEX.test(declaration.value) ||
        SIGNAL_RGB.test(declaration.value) ||
        referencesAny(declaration.value, names);
      if (resolvesToSignal) {
        names.add(declaration.property);
        grew = true;
      }
    }
  }
  return names;
}

const stylesheets = stylesheetsUnder(srcDir);
const allDeclarations = stylesheets.flatMap((sheet) => declarationsIn(sheet.file, sheet.css));

// Resolved over every stylesheet rather than over tokens.css alone. tokens.css is
// where aliases belong and where the defect was, but a module file can declare a
// custom property just as easily, and a guard that only looks where the last
// mistake happened is a guard aimed backwards.
const signalTokens = signalResolvingTokens(allDeclarations);

const redSites = allDeclarations.filter(
  (declaration) =>
    SIGNAL_HEX.test(declaration.value) ||
    SIGNAL_RGB.test(declaration.value) ||
    referencesAny(declaration.value, signalTokens)
);

/**
 * The two places OWN-WORLD licenses -- the status badge and the status word --
 * everywhere they are drawn, plus the three declarations of the token itself.
 *
 * Three surfaces draw the pair, and all three are the same two things rather
 * than three separate permissions: `ServiceTile` draws them on the board,
 * `ServiceNode` on the graph canvas, and `MigrationList` on the migrations
 * board, where the corner chip is dropped because there is no squircle to pin it
 * to and what survives is the glyph and the word (that file's own header states
 * the reasoning). A fact line, a tab, a tag, a count, a link hover, a border on
 * anything else: not licensed, and each of those has been tried.
 *
 * `--color-signal` itself is listed three times because it is declared three
 * times -- once for light, twice for dark (media query and pinned attribute).
 * Listing the declarations rather than exempting tokens.css is the whole point:
 * `--tag-phasing-line: var(--color-signal)` sits in that same `:root` block and
 * must fail there, which a file-level exemption would have prevented forever.
 *
 * Note for whoever is editing MigrationList.module.css: the entry below names
 * `.status` + `color`. Renaming that rule fails this list until the entry
 * follows, which is intended and is not a merge conflict.
 */
const LICENSED: readonly Site[] = [
  { file: "components/ServiceTile.module.css", selector: ".badge", property: "border" },
  { file: "components/ServiceTile.module.css", selector: ".badge", property: "color" },
  { file: "components/ServiceTile.module.css", selector: ".status", property: "color" },
  { file: "components/ServiceNode.module.css", selector: ".badge", property: "border" },
  { file: "components/ServiceNode.module.css", selector: ".badge", property: "color" },
  { file: "components/ServiceNode.module.css", selector: ".status", property: "color" },
  { file: "components/MigrationList.module.css", selector: ".status", property: "color" },
  { file: "tokens.css", selector: ":root", property: "--color-signal" },
  { file: "tokens.css", selector: ':root:not([data-theme="light"])', property: "--color-signal" },
  { file: "tokens.css", selector: ':root[data-theme="dark"]', property: "--color-signal" },
];

/**
 * **Not a licence. A recorded question.**
 *
 * `RankModule` paints a red left border on the selected row and a red chip on
 * the top-ranked one. The chip is the contract's "not a count" clause almost
 * word for word, so neither rule can stay red -- and neither is fixed here,
 * because `RankModule` has no caller. The owner removed the ranking from the
 * board on 2026-08-25 ("the most depend panel is noise for now"), and
 * `ProjectBoard.tsx`'s header records that the component is kept rather than
 * deleted, tested and correct, waiting for a catalog worth judging on.
 *
 * So nothing paints these on any screen, and choosing what they become instead
 * is a design decision on a component the owner took off the board -- the
 * contract says *not red*, it does not say what replaces it, and CLAUDE.md's
 * standing rule is that a value nobody chose does not get written down as though
 * somebody had. Two entries here, dated, is the honest state: the red is real,
 * it reaches no reader, and it is the owner's to rule on when `RankModule` next
 * has a caller. Whichever way that goes, these entries are deleted -- the rules
 * move onto ink, or the file does.
 *
 * What this does not weaken: the entries are per-selector like the licensed
 * ones, so any *other* red rule added to `RankModule.module.css` still fails,
 * and either of these going green makes its own entry stale and fails too.
 */
const QUARANTINED: readonly Site[] = [
  { file: "components/RankModule.module.css", selector: ".selected", property: "border-left" },
  { file: "components/RankModule.module.css", selector: ".top", property: "background" },
];

const ALLOWED = [...LICENSED, ...QUARANTINED];

function matches(site: Site, declaration: Declaration | Site): boolean {
  return (
    site.file === declaration.file &&
    site.selector === declaration.selector &&
    site.property === declaration.property
  );
}

function label(site: Site): string {
  return `${site.file} :: ${site.selector} { ${site.property} }`;
}

describe("signal red is spent only where the contract licenses it", () => {
  // The fail-open check, and it is not a formality: every assertion below is
  // "each thing found is allowed", which a sweep that found nothing satisfies
  // perfectly. A path typo, a rename of `src/components`, or a `readdirSync`
  // that quietly returns [] would all produce a green suite and no guard at all.
  it("swept every stylesheet under src, so an empty sweep cannot pass as a clean one", () => {
    expect(stylesheets.length, "no stylesheets found -- the scan path is wrong").toBeGreaterThanOrEqual(20);
    expect(stylesheets.map((sheet) => sheet.file)).toContain("tokens.css");
    expect(stylesheets.map((sheet) => sheet.file)).toContain("components/ServiceTile.module.css");
    expect(allDeclarations.length, "stylesheets found but nothing parsed out of them").toBeGreaterThan(500);
    expect(redSites.length, "no red found anywhere -- the patterns stopped matching").toBeGreaterThanOrEqual(LICENSED.length);
  });

  it.each(redSites.map((site) => [label(site), site] as const))(
    "%s is one of the two licensed places",
    (_name, site) => {
      expect(
        ALLOWED.some((allowed) => matches(allowed, site)),
        `${label(site)} spends the signal colour, and OWN-WORLD spends it on the status badge and the ` +
          `status word "and nowhere else: not a view, not a count". Either this is one of those two on a ` +
          `surface that does not have an entry yet -- add it to LICENSED and say which -- or it moves onto ` +
          `ink. The owner ruled on 2026-08-31 that the rule stands and the build is corrected; that ruling ` +
          `is not a per-site question any more.`
      ).toBe(true);
    }
  );
});

describe("the allow-list cannot rot", () => {
  it("still names the badge and the status word on all three surfaces that draw them", () => {
    // Pinned by count as well as by content: a list that shrinks silently is a
    // guard that widens silently, and the three-surface fact is the one a
    // future reader is most likely to misread as duplication and tidy away.
    expect(LICENSED.filter((site) => site.selector === ".badge")).toHaveLength(4);
    expect(LICENSED.filter((site) => site.selector === ".status")).toHaveLength(3);
    expect(LICENSED.filter((site) => site.property === "--color-signal")).toHaveLength(3);
  });

  it.each(ALLOWED.map((site) => [label(site), site] as const))(
    "%s is still a real red declaration, not a permission that outlived its rule",
    (_name, site) => {
      expect(
        redSites.some((red) => matches(site, red)),
        `${label(site)} is on the allow-list but no declaration there spends the signal colour any more. ` +
          `Delete the entry: an exemption kept past the rule it was written for is how the next red rule ` +
          `at that selector gets in without anybody deciding to let it.`
      ).toBe(true);
    }
  );
});

describe("no token launders the signal colour under another name", () => {
  // The 2026-09-02 defect stated as its own check rather than left to fall out
  // of the sweep above. `--tag-phasing-line: var(--color-signal)` is red at the
  // point of *use*, in whichever component reads it, and the reader looking for
  // red in Tag.module.css finds `var(--tag-phasing-line)` and stops. Naming the
  // indirection directly is the difference between a failure that says "a tag is
  // red" and one that says "the token is the reason".
  it("only --color-signal resolves to the signal, however many hops away", () => {
    const laundered = [...signalTokens].filter((name) => name !== "--color-signal").sort();
    expect(
      laundered,
      `these custom properties resolve to the signal colour under another name: ${laundered.join(", ")}. ` +
        `An alias is a spend wherever it is read, and it hides from the reader of the stylesheet that reads ` +
        `it. If one of these is genuinely the status badge or the status word, name it in LICENSED with the ` +
        `surface it serves; otherwise it moves onto ink.`
    ).toEqual([]);
  });
});

// The scanner's own tests. Everything above is only as good as the parse, and a
// parse that silently returned nothing for `@media` blocks or that failed to
// strip a comment would be invisible in the results -- green either way. So the
// three behaviours the sweep depends on are asserted against a fixture where the
// right answer is known by construction.
describe("the scanner", () => {
  const FIXTURE = `
    /* Prose naming var(--color-signal) and #d40010 and rgb(212, 0, 16). */
    .plain {
      color: var(--color-text);
      border-color: var(--color-signal-ink);
    }
    @media (max-width: 480px) {
      .nested { border-left: 3px solid var(--color-signal); }
    }
    :root {
      --color-signal: #d40010;
      --alias: var(--color-signal);
      --deep: var(--alias);
      --unrelated: #24211c;
    }
  `;
  const parsed = declarationsIn("fixture.css", FIXTURE);
  const tokens = signalResolvingTokens(parsed);
  const red = parsed.filter(
    (declaration) =>
      SIGNAL_HEX.test(declaration.value) ||
      SIGNAL_RGB.test(declaration.value) ||
      referencesAny(declaration.value, tokens)
  );

  it("reads a declaration inside @media as belonging to its own selector, not to the at-rule", () => {
    expect(red.map(label)).toContain("fixture.css :: .nested { border-left }");
  });

  it("does not see red in a comment, which is where this app explains the rule", () => {
    expect(red.some((site) => site.selector === ".plain")).toBe(false);
  });

  it("does not mistake --color-signal-ink for --color-signal, which is the fill's foreground", () => {
    expect(red.some((site) => site.property === "border-color")).toBe(false);
  });

  it("follows an alias of an alias, which is the hop a one-level scan would miss", () => {
    expect([...tokens].sort()).toEqual(["--alias", "--color-signal", "--deep"]);
    expect(tokens.has("--unrelated")).toBe(false);
  });
});
