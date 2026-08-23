import { describe, expect, it } from "vitest";

import { scanFreeTextForPrivateValues } from "./free-text-guard.js";

// This file exists because of a specific failure mode, not general
// diligence: attempt 1 of the mixed-class high-entropy exclusion in
// findHighEntropyTokens (free-text-guard.ts) shipped with a comment
// claiming a digit-free base64 segment was "vanishingly unlikely" -- a
// claim nobody ever measured. It was false, and every one of that attempt's
// tests used must-flag fixtures that happened to carry digits, so nothing
// ever exercised the assumption that was actually load-bearing. See the
// module comment above looksLikeSeparatedWords in free-text-guard.ts for
// the full story and the numbers this file produces.
//
// The fix here is to make the measurement itself part of the regression
// suite: generate random base64-alphabet tokens with a seeded (never
// Math.random -- this must be deterministic, or a real flake gets deleted
// as a false one) PRNG, run each one through the real scanner exactly as
// shipped, and assert the clean-pass rate stays under an explicit ceiling
// per length. A future change that loosens the exclusion and meaningfully
// increases the leak fails this file with a rate right there in the
// assertion message, instead of shipping unnoticed the way attempt 1 did.
//
// Two populations are sampled, deliberately kept separate:
//
//   "general" -- the full base64 alphabet, digits included. This is what a
//   real high-entropy secret actually looks like, and it's the number that
//   matters for real-world risk.
//
//   "digit-free" -- the base64 alphabet with the ten digit characters
//   removed. This is the specific population attempt 1's predicate failed
//   on, and it's a structurally harder case for ANY shape-only predicate:
//   with no digit signal available at all, and the classes>=2 fallback
//   requiring only upper+lower (which almost every digit-free run of this
//   length has), the whole burden of catching it falls on the word-shape
//   test below.

// mulberry32 -- a tiny, fast, seeded PRNG. Deterministic: the same seed
// always produces the same sequence, so this file's measured rates (and the
// ceilings below) don't drift between runs or between machines.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GENERAL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DIGIT_FREE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/";

function randomToken(rand: () => number, alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(rand() * alphabet.length)];
  }
  return out;
}

// "Passes clean" means what it means for `dagstree validate`: no HARD hit.
// A stray SOFT keyword hit is not the thing under test here (and is
// essentially impossible for a random base64-alphabet string to produce by
// chance) -- see free-text-guard.test.ts for tier coverage generally.
function passesCleanOfHardHits(text: string): boolean {
  return !scanFreeTextForPrivateValues(text).some((hit) => hit.tier === "hard");
}

function measureCleanRate(seed: number, alphabet: string, length: number, sampleSize: number): number {
  const rand = mulberry32(seed);
  let clean = 0;
  for (let i = 0; i < sampleSize; i++) {
    if (passesCleanOfHardHits(randomToken(rand, alphabet, length))) clean++;
  }
  return clean / sampleSize;
}

// Sample size: a few tens of thousands per length/population combination.
// At this size the whole file (8 combinations) runs in well under a second
// -- fast enough to run on every commit -- while still being large enough
// that the measured rate is stable to about +/-1 percentage point run to
// run (verified by re-running at 5x this sample size while tuning the
// ceilings below; the rates agreed to within that margin).
const SAMPLE_SIZE = 20_000;

// Measured with this exact file's PRNG, alphabets and SAMPLE_SIZE (seeds
// 1-8, assigned in the table order below). Ceilings are set with headroom
// above the measured rate -- enough that ordinary sampling noise at this
// N never trips the assertion, tight enough that a real regression (the
// exclusion becoming meaningfully more permissive) still fails loudly.
//
// Re-measured after a second adversarial review found four precision
// defects in the predicate (a doubled-separator edge case, a purely-
// numeric path segment, a PascalCase name past the ordinary length cap,
// and a fixed digit-bearing-segment cap that bought no recall -- see the
// module comment above looksLikeSeparatedWords in free-text-guard.ts for
// each fix). All four widen what counts as "word-shaped", so the leak was
// re-measured rather than assumed unchanged; it moved by less than a
// hundredth of a percentage point on the general column and a fraction of
// a point on the digit-free column -- the widened admissions are still
// gated by the same per-segment shape tests a random chunk fails.
//
//   length  general (real-secret-shaped)   digit-free (worst case)
//   32      0.255%          ceiling 0.6%   29.02%        ceiling 35%
//   40      0.055%          ceiling 0.2%   20.95%        ceiling 26%
//   44      0.010%          ceiling 0.08%  16.165%       ceiling 20%
//   64      0.000%          ceiling 0.1%    4.960%       ceiling 9%
//
// The digit-free numbers are structurally forced this high, not a bug in
// this measurement: the required-clean fixture "MySQL8" (see
// free-text-guard.test.ts) pins the word-start ratio floor at exactly 3.0,
// and a uniformly-random 50/50-case letter sequence has an *expected*
// length-to-word-start ratio of about 4 -- so the shape test the brief
// specifies has limited power against pure letters with no digit signal at
// all. The general-case numbers are the ones that matter for real-world
// risk: a genuine random base64 secret is digit-free at 32+ characters only
// about 0.4% of the time in the first place (10 of the 64 alphabet
// characters are digits), so the two worst-case conditions here -- no
// digits anywhere, and a separator positioned so every resulting segment
// independently looks word-shaped -- compound to a small real risk even
// though the isolated digit-free rate looks large on its own.
const LENGTHS = [32, 40, 44, 64] as const;
const CEILINGS: Record<(typeof LENGTHS)[number], { general: number; digitFree: number }> = {
  32: { general: 0.006, digitFree: 0.35 },
  40: { general: 0.002, digitFree: 0.26 },
  44: { general: 0.0008, digitFree: 0.2 },
  64: { general: 0.001, digitFree: 0.09 },
};

describe("high-entropy exclusion leak -- measured, not assumed", () => {
  it.each(LENGTHS.map((length, i) => [length, 1 + i * 2] as const))(
    "general (digit-including) base64-alphabet tokens of length %i stay under the documented ceiling",
    (length, seed) => {
      const rate = measureCleanRate(seed, GENERAL_ALPHABET, length, SAMPLE_SIZE);
      const ceiling = CEILINGS[length].general;
      expect(
        rate,
        `measured clean-pass rate ${(rate * 100).toFixed(4)}% at length ${length} (general alphabet) ` +
          `exceeds the documented ceiling of ${(ceiling * 100).toFixed(4)}% -- the mixed-class exclusion in ` +
          "findHighEntropyTokens got more permissive; see the module comment above looksLikeSeparatedWords.",
      ).toBeLessThan(ceiling);
    },
  );

  it.each(LENGTHS.map((length, i) => [length, 2 + i * 2] as const))(
    "digit-free base64-alphabet tokens of length %i stay under the documented ceiling",
    (length, seed) => {
      const rate = measureCleanRate(seed, DIGIT_FREE_ALPHABET, length, SAMPLE_SIZE);
      const ceiling = CEILINGS[length].digitFree;
      expect(
        rate,
        `measured clean-pass rate ${(rate * 100).toFixed(4)}% at length ${length} (digit-free alphabet) ` +
          `exceeds the documented ceiling of ${(ceiling * 100).toFixed(4)}% -- the mixed-class exclusion in ` +
          "findHighEntropyTokens got more permissive; see the module comment above looksLikeSeparatedWords.",
      ).toBeLessThan(ceiling);
    },
  );
});
