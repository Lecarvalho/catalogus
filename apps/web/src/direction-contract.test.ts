// The direction contract, checked where it has to survive and checked against
// what it is a copy of.
//
// `apps/web/index.html` is the source, but the thing the Impeccable flow
// requires is that the contract is still in the markup a user is served,
// greppable by seed key `ac1ba604`. Vite rewrites `index.html` on every build --
// it injects the content-hashed script and stylesheet tags and drops the dev
// `main.tsx` module tag -- so "the comment is in the source file" and "the
// comment is in the built page" are two different claims, and only the second
// one is the step that was owed. `scripts/bundle-web.mjs` then copies the built
// tree into `packages/cli/dist/web`, which is what `catalogus view` serves, so
// there are three copies and this file checks all of them.
//
// Why a test at all, for a comment nothing reads at runtime: an HTML comment has
// no failure mode a human notices. Nothing renders differently, no console
// warning fires, and a build tool that started stripping comments (a Vite major,
// an added html-minifier) would remove it silently -- as would someone editing
// `index.html` for the script tag and taking the comment with it.
//
// **The first version of this file checked only presence, and that was not
// enough.** A validator applied four mutations to the embedded contract at once
// -- flipping `Mode: **Read**` to Edit, replacing THESIS's body with prose
// arguing the opposite direction, deleting the whole disclosure section, and
// swapping the warmed hairline `#d5cebe` back to the pre-warming neutral
// `#e0e0e0` -- rebuilt, and the file stayed green on all sixteen tests. A guard
// that proves a comment exists while its content says the opposite of the
// design is the same shape as the defects this repo keeps producing: green,
// plausible, and wrong.
//
// So the check is now a comparison, not a lookup. `apps/web/docs/DIRECTION.md`
// holds the contract the owner chose; the embedded copy must match it word for
// word in all five sections, except for the departures declared in
// `DECLARED_DEPARTURES` below. Every declared departure is a fact somebody
// decided, and a departure that is not declared fails whichever direction it
// came from -- the embedded copy edited to flatter the build, or the contract
// edited without the page following.
//
// What this does NOT check, stated plainly:
//
//  - That the prose is *true* of the built world. THESIS, STORY and FIRST
//    VIEWPORT are claims about a design; only the finish review can rule on
//    them, and it has not run (see `apps/web/docs/DIRECTION.md`). This file
//    proves the contract is present, that it is the contract, and that its
//    colour facts match the token layer -- nothing more. The places where the
//    build is known to disagree with it are written into the comment's own
//    disclosure section rather than asserted here, because they are open design
//    work and pinning them here would encode the gap as a requirement.
//  - Anything outside the five sections. The preamble, DEPARTURES, the
//    disclosure section and FINISH are this repo's own prose, not the owner's
//    contract, and are checked only for the load-bearing pieces below.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Derived from this file's own path, not `process.cwd()`: that resolves to the
// repo root under `pnpm test` and to `apps/web` under `pnpm --filter
// @catalogus/web test`. `token-references.test.ts` carries the longer version of
// this finding.
const srcDir = fileURLToPath(import.meta.url).replace(/direction-contract\.test\.ts$/, "");
const webDir = join(srcDir, "..");
const repoRoot = join(webDir, "..", "..");

const SEED_KEY = "ac1ba604";
const DEPARTURES_HEADING = "DEPARTURES: where the text above differs from DIRECTION.md's contract";
const DISCLOSURE_HEADING = "WHAT THIS CONTRACT DOES NOT YET DESCRIBE";
const FINISH_LINE = "FINISH: unreviewed and undocumented is unfinished.";
const NUMBER_WORDS = { Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8 } as const;

const sourceHtmlPath = join(webDir, "index.html");
const builtHtmlPath = join(webDir, "dist", "index.html");
const servedHtmlPath = join(repoRoot, "packages", "cli", "dist", "web", "index.html");
const directionPath = join(webDir, "docs", "DIRECTION.md");

/** The contract block itself, or null where the file carries none. */
function contractIn(htmlPath: string): string | null {
  const html = readFileSync(htmlPath, "utf8");
  return html.match(/<!--\s*IMPECCABLE DIRECTION CONTRACT[\s\S]*?-->/)?.[0] ?? null;
}

const sourceContract = contractIn(sourceHtmlPath);

/**
 * One section's body, with every run of whitespace collapsed to a single space.
 * The two copies are wrapped to different widths and indented differently -- the
 * embedded one sits four spaces deep inside an HTML comment -- so a comparison
 * that respected line breaks would fail on formatting and say nothing about
 * wording, which is the only thing worth comparing here.
 */
/**
 * Whitespace collapsed to single spaces. Both copies wrap to different widths --
 * the embedded one to fit inside an indented HTML comment -- so every comparison
 * in this file is about wording, never about line breaks.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The text between two markers, exclusive of both. Used to scope a check to one
 * region of the comment, so a string that also appears elsewhere cannot satisfy
 * it -- the shadowing defect that made three disclosure pins vacuous.
 */
function regionBetween(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start === -1 ? 0 : start + from.length);
  if (start === -1 || end === -1) return "";
  return text.slice(start + from.length, end);
}

function sectionBody(text: string, heading: string, nextHeadings: readonly string[]): string {
  const at = (needle: string, from = 0) => {
    // Anchored to a line of its own, never a bare `indexOf`. An earlier version
    // matched the heading anywhere, so a preamble line containing the word
    // "PLATFORM" was found as the FORM heading and the FORM comparison then
    // failed on text that had nothing to do with FORM. Red rather than green,
    // but it pointed the reader at the wrong section, and `HISTORY`,
    // `TRANSFORM` and `INFORM` are the same trap waiting.
    const anchored = new RegExp(`^[ \t]*${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \t]*$`, "m");
    const match = anchored.exec(text.slice(from));
    return match?.index === undefined ? -1 : from + match.index;
  };

  const start = at(heading);
  if (start === -1) throw new Error(`no ${heading} section`);
  // Past the heading *line*, not past `heading.length` characters from the
  // line's start -- the embedded copy indents every line four spaces, so those
  // two differ by the indentation and the body would open with the tail of its
  // own heading.
  const after = start + text.slice(start).indexOf(heading) + heading.length;
  const ends = nextHeadings.map((next) => at(next, after)).filter((index) => index !== -1);
  const end = ends.length > 0 ? Math.min(...ends) : text.length;
  return flat(text.slice(after, end).replace(/^\s*#*\s*/, ""));
}

// Every section of the contract, in the order both copies carry them, each as
// the pair of headings the two files use: DIRECTION.md writes them as markdown
// `## Sentence case`, the embedded copy as a bare CAPS line. Collapsing
// whitespace makes the bodies comparable.
//
// The last two were outside this list until a validator deleted the whole of
// CONSTRAINTS from the embedded copy -- the section carrying "No search",
// "Read-only: no editing affordance anywhere" and "Keep meaning out of colour
// alone" -- and the suite stayed green. A guard over five of seven sections
// invites exactly that.
const SECTIONS = [
  { embedded: "THESIS", direction: "## THESIS" },
  { embedded: "OWN-WORLD", direction: "## OWN-WORLD" },
  { embedded: "STORY", direction: "## STORY" },
  { embedded: "FIRST VIEWPORT", direction: "## FIRST VIEWPORT" },
  { embedded: "FORM", direction: "## FORM" },
  { embedded: "MAPPED FROM THE WORLD'S OWN GRAMMAR, NOT INVENTED", direction: "## Mapped from the world's own grammar, not invented" },
  { embedded: "CONSTRAINTS CARRIED IN FROM PRODUCT.md", direction: "## Constraints carried in from PRODUCT.md" },
] as const;

// What ends a section, per copy. The embedded copy's last contract section is
// followed by its own DEPARTURES prose; DIRECTION.md's is followed by the
// "Open, to solve honestly during the build" heading.
const EMBEDDED_BOUNDARIES = [...SECTIONS.slice(1).map((section) => section.embedded), "DEPARTURES: where the text above differs from DIRECTION.md's contract"];
const DIRECTION_BOUNDARIES = [...SECTIONS.slice(1).map((section) => section.direction), "## Open, to solve honestly during the build"];

/**
 * Every difference the embedded copy is allowed to have from the contract as the
 * owner chose it, applied to DIRECTION.md's text before the comparison. Adding
 * an entry here is the act of declaring a departure: it is deliberately more
 * work than editing the comment, because a departure nobody had to declare is
 * how a contract quietly becomes a description of whatever got built.
 *
 * The `why` is not read by the test. It is here so that the reason lives beside
 * the exception rather than three documents away.
 */
const DECLARED_DEPARTURES: readonly { section: string; from: string; to: string; why: string }[] = [
  {
    section: "THESIS",
    from: "this app currently ships",
    to: "this app once shipped",
    why: "The dark dashboard of evenly-weighted cards is gone. Present tense when written, past tense now.",
  },
  {
    section: "OWN-WORLD",
    from: "Bright white ground (#FFFFFF)",
    to: "Warm cream ground (#f4f1ea)",
    why: "The 2026-08-25 warming, an owner decision recorded in DIRECTION.md's own revision.",
  },
  { section: "OWN-WORLD", from: "ink (#111111)", to: "ink (#24211c)", why: "Same warming." },
  { section: "OWN-WORLD", from: "Hairline grey (#E0E0E0)", to: "Hairline grey (#d5cebe)", why: "Same warming; the rule keeps its 1.4:1 against the ground." },
  { section: "OWN-WORLD", from: "light grey (#F2F2F2)", to: "light grey (#e9e4d8)", why: "Same warming." },
  {
    section: "OWN-WORLD",
    from: "one utility red (#E60012)",
    to: "one utility red (#d40010)",
    why:
      "NOT the warming, and the one departure here that nobody decided. `--color-signal` has been #d40010 " +
      "since the commit that introduced the token (e92761d) -- before the warming commit, while the ground " +
      "was still #ffffff -- and #E60012 has never appeared in a stylesheet in this repo's history. The embedded copy " +
      "carries the shipped value because a contract in the page must describe the page; the divergence is " +
      "the owner's to rule on, and the comment says so rather than inventing a reason for it.",
  },
];

const directionMd = readFileSync(directionPath, "utf8");

describe("the direction contract is present in apps/web/index.html", () => {
  it("is there at all, and carries the seed key the flow greps for", () => {
    expect(sourceContract).not.toBeNull();
    expect(sourceContract).toContain(SEED_KEY);
  });

  it("names the direction, so the seed key is not the only thing identifying the world", () => {
    expect(sourceContract).toContain("japanese-high-density-web");
  });

  // The preamble is the one region of the comment with nothing to compare
  // against -- it is this repo's own framing, above the first contract section.
  // A validator rewrote "DIRECTION.md remains the source of truth" to "is
  // superseded by this comment" and nothing failed, which would invert the whole
  // arrangement: the page is a copy, and the copy claiming authority over its
  // source is how the source stops being maintained. The two *counts* the
  // preamble used to carry were deleted rather than pinned, since both are
  // stated further down where the guard already checks them.
  it("keeps DIRECTION.md as the source of truth, in the paragraph a reader meets first", () => {
    const preamble = flat(regionBetween(sourceContract ?? "", "Mode: **Read**.", "THESIS"));
    expect(preamble.length, "the preamble is empty or its boundaries moved").toBeGreaterThan(500);
    expect(preamble).toContain("`apps/web/docs/DIRECTION.md` remains the source of truth");
    expect(preamble).toContain("Every contract section below is verbatim from that file");
    // The counts stay out. Restating one here is how the stale "five" survived
    // three passes in the copy a reader of the shipped page actually sees.
    expect(preamble).not.toMatch(/(two|three|four|five|six|seven|eight|nine) (contract sections|differences|departures)/i);
  });

  // `Mode: **Read**` is a product constraint, not a formality: it is why the
  // contract's FIRST VIEWPORT ends "no primary action", and why every component
  // in this app is read-only until Phase 4. A mutation flipping it to Edit was
  // one of the four the presence-only version of this file failed to catch.
  it("carries the mode, which is the constraint the whole read-only design rests on", () => {
    expect(sourceContract).toMatch(/Mode:\s*\*\*Read\*\*/);
  });

  // The disclosure section is where the build's known disagreements with the
  // contract are written down. Deleting it leaves a contract that reads as a
  // description of the shipped app -- which it is not, and which is exactly the
  // impression this whole comment exists to avoid giving.
  // Scoped to the disclosure section itself, not to the whole comment. Three of
  // these five strings also occur in FIRST VIEWPORT or in the DEPARTURES prose
  // that discusses them, and a whole-comment `toContain` was satisfied by those
  // other occurrences: a validator deleted the "routed chain" and "MOST DEPENDED
  // ON" bullets outright and the suite stayed green, because the words were
  // still in the file somewhere else. A pin shadowed by a second occurrence is
  // not a pin.
  it("carries its disclosure section, naming what the build does not do", () => {
    const disclosure = flat(regionBetween(sourceContract ?? "", DISCLOSURE_HEADING, FINISH_LINE));
    expect(disclosure.length, "the disclosure section is empty or its FINISH boundary moved").toBeGreaterThan(500);
    for (const known of ["left rail is unbuilt", "routed chain", "MOST DEPENDED ON", "band names", "mark is deferred"]) {
      expect(disclosure).toContain(known);
    }
  });

  // FINISH carries the run's own status, and v3 of this file stopped pinning it
  // while widening everything else -- a validator rewrote it to "this run is
  // complete" and nothing failed. It is one line, and it is the line that says
  // the finish review has not happened.
  it("carries FINISH, which is where the run says it is not finished", () => {
    const contract = flat(sourceContract ?? "");
    expect(contract).toContain(FINISH_LINE);
    expect(contract).toContain("The finish review and DESIGN.md are deliberately still open");
  });
});

describe("the embedded contract is DIRECTION.md's contract, word for word", () => {
  it.each(SECTIONS.map((section) => [section.embedded, section.direction] as const))(
    "%s matches, once the declared departures are applied",
    (heading, directionHeading) => {
    const embedded = sectionBody(sourceContract ?? "", heading, EMBEDDED_BOUNDARIES);
    let expected = sectionBody(directionMd, directionHeading, DIRECTION_BOUNDARIES);

    // Neither side may be empty. A renamed or truncated section would otherwise
    // compare "" to "" and pass -- the classic way a discovery-based guard
    // fails open, which `token-references.test.ts` guards against the same way.
    expect(embedded.length, `the embedded ${heading} section is empty`).toBeGreaterThan(100);
    expect(expected.length, `DIRECTION.md's ${heading} section is empty`).toBeGreaterThan(100);

    for (const departure of DECLARED_DEPARTURES.filter((entry) => entry.section === heading)) {
      expect(expected, `declared departure no longer matches DIRECTION.md: "${departure.from}"`).toContain(departure.from);
      expected = expected.replace(departure.from, departure.to);
    }

      // A failure here is one of two things, and both want the same response:
      // either the embedded copy drifted from the contract, or the contract
      // changed and the page did not follow. Declaring the difference in
      // DECLARED_DEPARTURES is the fix only when somebody decided it.
      expect(embedded).toBe(expected);
    }
  );
});

// Three checks over the DEPARTURES region, which the comparison above cannot
// reach: it is this repo's prose, not the owner's contract, so there is nothing
// to compare it against. That was tolerable when the region held only
// bookkeeping. It is not tolerable now, because the honest account of the red is
// there, and a validator demonstrated the consequence -- it replaced that
// account with "the red moved with the ramp after all: it was lowered to sit
// correctly on the cream ground, and the owner approved it in the same
// conversation that chose the warming", an invented reason of exactly the kind
// this whole pass exists to remove, and the suite stayed green on all 25 tests.
describe("the DEPARTURES section keeps saying what it is for", () => {
  const contract = sourceContract ?? "";
  const departures = flat(contract.slice(contract.indexOf(DEPARTURES_HEADING)));

  it("has exactly one DEPARTURES marker, so the positional checks below mean something", () => {
    expect(contract.split(DEPARTURES_HEADING).length - 1).toBe(1);
  });

  // Pinned as literals rather than paraphrased, because the failure mode is a
  // rewrite that still reads plausibly. Each of these is a claim that was
  // verified by execution against this repo's history (`git log --all -S`), and
  // together they are the difference between recording an open question and
  // narrating an answer to it.
  it.each([
    "**not** the warming",
    "has never appeared in any stylesheet in this repo's history",
    "nothing in the repo records a decision to do that",
    "it is the owner's to rule on",
  ])("still says: %s", (claim) => {
    expect(departures).toContain(claim);
  });

  // Every declared departure must also be visible to a reader of the page, not
  // only to a reader of this test file. It does not stop someone adding a
  // seventh -- W2 in the validator's report, and no test can stop it, since
  // declaring a departure is by construction the way a legitimate one is
  // recorded -- but it makes the addition show up in two diffs instead of one.
  it.each(DECLARED_DEPARTURES.map((departure) => [departure.from, departure.to] as const))(
    "declares %s -> %s in the page, not only in this file",
    (from, to) => {
      // The whole phrase, not the hex inside it. An earlier version stripped
      // everything but the hex, which meant the page only had to name #FFFFFF
      // somewhere -- not to say what it was replaced by, or in which sentence.
      expect(departures).toContain(from);
      expect(departures).toContain(to);
    }
  );

  // The paragraph stating what the guard cannot do is the mitigation both
  // `docs/PLAN.md` and `DIRECTION.md` point at for the limits below. A validator
  // deleted it and nothing failed, which would have left two documents citing a
  // paragraph that no longer existed.
  it("keeps the paragraph saying what the guard cannot do", () => {
    expect(departures).toContain("**What the guard cannot do, so that nobody trusts it further than it goes.**");
    expect(departures).toContain("it cannot prove either one is what the owner chose");
    expect(departures).toContain("review of the diff is the control, not the test");
  });

  // A tripwire, and worth being precise about what it is not. No test can tell
  // whether prose is truthful: a validator left all four pinned claims above
  // intact and appended one sentence saying the question had since been
  // resolved, and every assertion here still passed. What *is* machine-checkable
  // is the fact underneath -- while `tokens.css` ships a red the contract does
  // not name, a claim that the divergence is settled is false. So this fires on
  // the phrasing that claim takes, which catches the sentence a careless or
  // hurried writer produces and not the class. The real control is review, and
  // the page says so in the paragraph above.
  it("does not claim the red question is settled while the token still diverges", () => {
    const tokensCss = readFileSync(join(srcDir, "tokens.css"), "utf8");
    const shipsTheContractsRed = /--color-signal:\s*#E60012/i.test(tokensCss);
    if (shipsTheContractsRed) return;
    for (const settled of ["Since resolved", "no decision is outstanding", "the owner confirmed", "no longer open"]) {
      expect(departures, `the page claims the red divergence is settled while --color-signal is not #E60012`).not.toContain(settled);
    }
  });

  it("says how many departures there are, and that number is the table's length", () => {
    const stated = departures.match(/(\w+) differences/)?.[1];
    expect(stated, "the DEPARTURES preamble no longer states a count").toBeDefined();
    expect(NUMBER_WORDS[stated as keyof typeof NUMBER_WORDS]).toBe(DECLARED_DEPARTURES.length);
  });
});

// The owner's own words, typed here as a third copy on purpose.
//
// Everything else in this file proves the page and DIRECTION.md agree -- which
// is not the same as proving either is what the owner chose. A validator
// inverted "no search field" to "a prominent search field" in *both* files and
// the suite stayed green; "No search. It should fit." is one of the three
// constraints the owner named as hardest.
//
// **Scoped to the contract sections**, everything above the DEPARTURES marker.
// The first version of this check read the whole comment, and the prose below
// that marker quotes `no search field` while describing that very attack -- so
// the pin was satisfied by the paragraph about the attack while the constraint
// itself was inverted. The validator found it by editing only the FIRST
// VIEWPORT occurrence, which is the edit real drift would make; the careless
// global replace was the only one that failed.
describe("the owner's hardest named constraints survive in the page", () => {
  const contract = sourceContract ?? "";
  const sections = flat(contract.slice(0, contract.indexOf(DEPARTURES_HEADING)));

  it("scopes itself to the contract sections, not to the whole comment", () => {
    expect(sections.length, "the DEPARTURES heading moved or the sections are empty").toBeGreaterThan(2000);
  });

  it.each([
    'No search. "It should fit." (owner)',
    "Organize by architecture, not alphabet. (owner)",
    "First screen = the shape of the system. (owner)",
    "no search field",
    "Read-only: no editing affordance anywhere.",
  ])("still carries: %s", (constraint) => {
    expect(sections).toContain(constraint);
  });
});

describe("the contract's colour facts match the token layer", () => {
  const tokensCss = readFileSync(join(srcDir, "tokens.css"), "utf8");

  // Read out of tokens.css's light `:root` block rather than the whole file:
  // the dark translation below it redeclares the same names with different
  // values, and the contract describes the light world, which tokens.css's own
  // header calls "the committed design, not a preference".
  const lightRoot = tokensCss.slice(tokensCss.indexOf(":root {"), tokensCss.indexOf("@media"));
  const declaredValues = new Set(
    Array.from(lightRoot.matchAll(/^\s*--[\w-]+\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/gm), (match) => match[1]!.toLowerCase())
  );

  // Every hex the contract names, not a list typed here. The four warmed values
  // and the red are all covered by this without being enumerated, and so is any
  // hex a future edit adds -- which is the hole the first version of this file
  // had: it checked the three colours it happened to know about, and a
  // validator changed a fourth (`#d5cebe` back to the pre-warming `#e0e0e0`)
  // with the suite staying green.
  // The five values the contract as written named, all of which the embedded
  // copy names once more under DEPARTURES to say what they were replaced by.
  // They are excluded from the sweep because tokens.css deliberately does not
  // declare them any more -- that is the whole point of the DEPARTURES entry.
  const SUPERSEDED = ["#ffffff", "#111111", "#e60012", "#e0e0e0", "#f2f2f2"];
  const contractHexes = [...new Set(Array.from((sourceContract ?? "").matchAll(/#[0-9a-fA-F]{6}\b/g), (match) => match[0].toLowerCase()))];

  it("names some hexes at all, so an empty sweep cannot pass as a clean one", () => {
    expect(contractHexes.length).toBeGreaterThanOrEqual(5);
  });

  it.each(contractHexes.filter((hex) => !SUPERSEDED.includes(hex)))(
    "%s is a value tokens.css's light :root actually declares",
    (hex) => {
      expect([...declaredValues]).toContain(hex);
    }
  );

  it.each([
    ["--color-bg", "the ground"],
    ["--color-text", "the ink"],
    ["--color-signal", "the one utility red"],
    ["--color-line", "the hairline every module is drawn with"],
    ["--color-header-fill", "the header bar fill"],
  ])("%s (%s) appears in the contract with the value tokens.css declares", (token) => {
    const match = lightRoot.match(new RegExp(`^\\s*${token}\\s*:\\s*([^;]+);`, "m"));
    const value = match?.[1];
    if (value === undefined) throw new Error(`tokens.css's light :root block declares no ${token}`);
    expect(sourceContract?.toLowerCase()).toContain(value.trim().toLowerCase());
  });

  // The failure this pair exists to catch is a *stale* contract, not a missing
  // one -- so the superseded hexes must appear only in the DEPARTURES section
  // that says they were superseded, never as the contract's live claim.
  // Asserting their absence outright would be wrong: the comment names them
  // deliberately, because a revision that quietly rewrote the numbers would
  // erase the fact that the owner changed them.
  it("names the pre-warming hexes only under DEPARTURES, never in a contract section", () => {
    const contract = sourceContract ?? "";
    // The full heading, not the bare `DEPARTURES:` prefix. Keying on the prefix
    // let a validator move this boundary by writing "(DEPARTURES: see the
    // section of that name below.)" into the preamble, which silently collapses
    // the region this test reasons about.
    const departuresAt = contract.indexOf(DEPARTURES_HEADING);
    expect(departuresAt).toBeGreaterThan(-1);
    // Everything the owner's contract itself claims lives above that marker.
    // Counting occurrences would be the wrong assertion -- the DEPARTURES entry
    // for the red legitimately names #E60012 three times, arguing about it --
    // whereas *where* they appear is the invariant that matters.
    const contractSections = contract.slice(0, departuresAt).toLowerCase();
    for (const hex of SUPERSEDED) {
      expect(contract.toLowerCase().slice(departuresAt)).toContain(hex);
      expect(contractSections).not.toContain(hex);
    }
  });
});

// The two build outputs. `pnpm build && pnpm test` is this repo's verify
// command, so in the flow that matters both exist; a bare `pnpm test` on a fresh
// clone has neither, and skipping is honest there in a way that failing is not
// -- nothing is wrong with the tree, the artifact simply has not been produced.
// Vitest's summary reports the *count* of skipped tests and not which block went
// dark, so the skip is legible only from this comment and the block's own name:
// on a tree with no dist, `2 skipped` here means the two built-copy assertions,
// and nothing else in this file can skip.
const builtOutputs = [
  ["apps/web/dist/index.html, what vite emits", builtHtmlPath],
  ["packages/cli/dist/web/index.html, what `catalogus view` serves", servedHtmlPath],
] as const;

for (const [label, path] of builtOutputs) {
  describe.skipIf(!existsSync(path))(`the contract survives into ${label}`, () => {
    it("is byte-identical to the source contract", () => {
      // Identity, not presence: a build step that reflowed, escaped or
      // truncated the comment would still leave something greppable behind
      // while having mangled the contract a reader is meant to be able to read.
      //
      // Compared as a boolean with a message rather than with `toBe`, because
      // `toBe` on two ~7KB strings prints the whole of both, and the most
      // common cause of this failing is not a mangled build at all -- it is a
      // source edit since the last build, which the message can say and a
      // 7KB character diff cannot.
      const built = contractIn(path);
      expect(
        built === sourceContract,
        `${label} does not carry the source contract byte for byte. If you edited apps/web/index.html since ` +
          `the last build, run \`pnpm build\` before \`pnpm test\` -- this compares source against build output. ` +
          `If you did not, the build mangled or dropped the comment: source ${sourceContract?.length ?? 0} chars, ` +
          `built ${built?.length ?? 0} chars.`
      ).toBe(true);
    });

    it("is greppable by seed key", () => {
      expect(readFileSync(path, "utf8")).toContain(SEED_KEY);
    });
  });
}
