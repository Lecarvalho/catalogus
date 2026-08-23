// The other half of the no-secrets boundary (see private-key-pattern.ts for
// the first half). That module only ever looks at property *names* --
// `patternProperties`/`additionalProperties` in JSON Schema have no
// vocabulary for inspecting a *value*, so a manifest with a perfectly
// innocent-looking key (`notes`, `architecture`, `pm`) can still carry a
// cost amount, an email address, or a renewal date typed straight into
// that value by a human or an agent hand-editing the file. `dagstree
// validate` never caught this -- see the bug this module closes, described
// in the module comment on validate.ts.
//
// This is the single implementation of that check. Everything else that
// wants "does this string look like Layer 3 data" -- the CLI's write-time
// guard (private-guard.ts) included -- calls into this module rather than
// keeping its own copy; a second copy of these patterns is exactly how the
// two drift apart and one of them silently stops catching things.
//
// Two tiers, deliberately:
//
//   HARD -- high-precision *shape* matches (an email address, a currency
//   amount, a card-like digit run, an API-key shape, a credential URL).
//   Each of these essentially never fires on ordinary technical prose, so a
//   hit is a real validation error.
//
//   SOFT -- lower-precision *keyword* hits (billing, renewal, account, ...).
//   These genuinely do show up in innocent prose ("renewal is automated via
//   GitHub Actions"), so a hit is a warning, not a hard failure -- it's
//   validateManifest()'s caller (dagstree validate --strict) that decides
//   whether to promote soft hits to errors.
//
// The guard is applied as a generic walk over every string value anywhere
// in the parsed manifest (scanManifestForPrivateValues), not a hardcoded
// list of field paths -- a new free-text field added to the schema later
// inherits this protection automatically, with nobody needing to remember
// to wire it up. Property *names* are already covered by
// private-key-pattern.ts; this module only ever looks at values.

export type PrivateValueTier = "hard" | "soft";

export type PrivateValueHardCategory =
  | "email"
  | "currency-amount"
  | "billing-period-amount"
  | "card-number"
  | "api-key"
  | "high-entropy-token"
  | "credential-url";

export type PrivateValueSoftCategory =
  | "billing"
  | "invoice"
  | "renewal"
  | "subscription"
  | "seat"
  | "plan-tier"
  | "account"
  | "credentials"
  | "currency-word";

export type PrivateValueCategory = PrivateValueHardCategory | PrivateValueSoftCategory;

export const PRIVATE_VALUE_HARD_CATEGORIES: readonly PrivateValueHardCategory[] = [
  "email",
  "currency-amount",
  "billing-period-amount",
  "card-number",
  "api-key",
  "high-entropy-token",
  "credential-url",
];

export const PRIVATE_VALUE_SOFT_CATEGORIES: readonly PrivateValueSoftCategory[] = [
  "billing",
  "invoice",
  "renewal",
  "subscription",
  "seat",
  "plan-tier",
  "account",
  "credentials",
  "currency-word",
];

/** One match found inside a single string value. Not yet located within the manifest -- see PrivateValueFinding for that. */
export interface PrivateValueMatch {
  tier: PrivateValueTier;
  category: PrivateValueCategory;
  /** First and last couple of characters of the matched text, never the full match -- see redactExcerpt(). */
  redacted: string;
}

/** A PrivateValueMatch located at a specific point in a manifest, in the same instancePath shape Ajv errors use (e.g. "/services/0/notes"). */
export interface PrivateValueFinding extends PrivateValueMatch {
  instancePath: string;
}

// --- redaction --------------------------------------------------------
//
// A hard hit's message must never echo the matched text back verbatim --
// printing a full API key or card number puts the secret straight into
// terminal scrollback and CI logs, which is the exact thing this guard
// exists to prevent. Anything long enough to matter is cut down to its
// first two and last two characters; anything too short for that split to
// hide anything meaningful is fully masked instead.
export function redactExcerpt(matched: string): string {
  const trimmed = matched.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length <= 4) return "*".repeat(trimmed.length);
  return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
}

// --- HARD: email --------------------------------------------------------
// The optional space right after `@` exists for one reason: a YAML folded
// (`>`) block scalar joins wrapped lines with a single space, so an email
// address broken right at the `@` -- the most natural place to wrap one --
// survives parsing as "local@ domain.tld" rather than "local@domain.tld".
// Not extended to the dot boundary too (no `example. com` allowance): that
// would also match ordinary prose like "foo@bar. Bar handles this", an
// end-of-sentence period followed by a capitalized word, so the trade-off
// only holds at the `@` boundary specifically.
const EMAIL_RE = /[a-z0-9._%+-]+@ ?[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

// --- HARD: currency amounts ---------------------------------------------
// A symbol-prefixed amount ($25, €12, £9, ¥100, R$50), or an amount
// adjacent to an ISO currency code in either order (25 USD, USD 25).
// Deliberately requires a digit *directly* next to the symbol/code (no
// arbitrary text between) -- a bare three-letter currency code embedded
// inside an ordinary word (there is no such collision among the codes
// below, but the digit-adjacency requirement is what actually guarantees
// it) never matches on its own.
const CURRENCY_CODES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "BRL", "MXN"];
const AMOUNT = String.raw`\d[\d,]*(?:\.\d+)?`;
// Bare `$` gets a tighter amount pattern than the other symbols: `$1`
// through `$9` are shell positional parameters and regex backreferences far
// more often than they're a price ("run deploy.sh with $1 as the app
// name", "awk {print $3}"), and unlike the ISO-code branches below (where
// the code itself is the disambiguating context) the bare symbol alone
// carries no such signal. `$25`, `$9.99`, and `$25/month` (two-plus digits,
// or a decimal fraction) still match; `$1` does not. `£`/`€`/`¥`/`R$` don't
// have this collision with a scripting metacharacter, so a genuine
// single-digit price in those ("billed at £9 a pop") is left alone.
const SYMBOL_AMOUNT = String.raw`\d{2,}[\d,]*(?:\.\d+)?|\d\.\d+`;
const CURRENCY_AMOUNT_RE = new RegExp(
  String.raw`\$\s?(?:${SYMBOL_AMOUNT})` +
    String.raw`|(?:${SYMBOL_AMOUNT})\s?\$` +
    String.raw`|(?:R\$|[€£¥])\s?${AMOUNT}` +
    String.raw`|${AMOUNT}\s?(?:R\$|[€£¥])` +
    String.raw`|\b${AMOUNT}\s?(?:${CURRENCY_CODES.join("|")})\b` +
    String.raw`|\b(?:${CURRENCY_CODES.join("|")})\s?${AMOUNT}\b`,
  "gi",
);

// --- SOFT: word-form currency mentions ------------------------------------
// "$25" and "25 USD" are already HARD (symbol/ISO-code shapes are
// unambiguous); the everyday word form ("25 dollars", "12 euros") is common
// in prose an agent writes but a bare currency word is a weaker signal than
// a symbol or code -- ordinary prose uses these words more loosely -- so a
// hit here is a SOFT nudge. Deliberately requires a digit directly
// adjacent, same as the hard forms; spelled-out numbers ("twenty-five
// dollars") aren't covered -- that's natural-language number parsing, out
// of scope for a shape-based guard, and "dollars a month" is still caught
// by the numeral+word match alone without needing separate period-suffix
// handling.
const CURRENCY_WORD_RE =
  /\b\d[\d,]*(?:\.\d+)?\s?(?:dollars?|euros?|pounds?|yen)\b|\b(?:dollars?|euros?|pounds?|yen)\s?\d[\d,]*(?:\.\d+)?\b/gi;

// --- HARD: amount bound to a billing period ------------------------------
// 25/mo, 25/month, 12 per month, 199/yr, 199 per year -- no currency
// symbol/code required, just a number tied to a recurring period. Requires
// the literal period word right after the amount, so an ordinary version
// number ("Next.js 15.4") or a bare date never qualifies.
const BILLING_PERIOD_AMOUNT_RE = new RegExp(
  String.raw`\b${AMOUNT}\s*/\s*(?:mo|month|yr|year)\b` + String.raw`|\b${AMOUNT}\s+per\s+(?:month|year)\b`,
  "gi",
);

// --- HARD: card-like digit runs ------------------------------------------
// 13 to 19 digits, either raw or grouped with a single consistent separator
// (space or hyphen) -- covers both "raw" and human-formatted card numbers.
// Anchored so a run can't start or end mid-token: without that, a run could
// begin inside a UUID segment ("...a716-446655440000") or straddle two
// unrelated numbers.
//
// Shape alone can't actually tell a formatted card number from four
// unrelated numbers that happen to sit next to each other -- "4111 1111
// 1111 1111" and "8080 8081 3000 5432" (a port list) are both exactly four
// space-separated 4-digit groups. What genuinely distinguishes them is the
// Luhn check digit real card numbers are constructed to satisfy: an
// arbitrary run of digits (a port list, two adjacent ISO dates, a UUID's
// numeric-only segment) passes Luhn only by chance (roughly 1 in 10), so
// requiring it turns this from a shape guess into an actual signal, without
// narrowing the length range or the grouping shape that catches genuine
// card numbers.
const CARD_RAW_RE = /(?<![A-Za-z0-9])\d{13,19}(?![A-Za-z0-9])/g;
const CARD_GROUPED_RE = /(?<![A-Za-z0-9])\d{1,6}([ -])\d{1,6}(?:\1\d{1,6}){1,4}(?![A-Za-z0-9])/g;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function findCardLikeDigitRuns(text: string): string[] {
  const hits: string[] = [];
  const seen = new Set<string>();
  const consider = (matched: string) => {
    const digitsOnly = matched.replace(/[ -]/g, "");
    if (digitsOnly.length < 13 || digitsOnly.length > 19) return;
    if (!luhnValid(digitsOnly)) return;
    if (seen.has(matched)) return;
    seen.add(matched);
    hits.push(matched);
  };
  for (const match of text.matchAll(CARD_RAW_RE)) consider(match[0]);
  for (const match of text.matchAll(CARD_GROUPED_RE)) consider(match[0]);
  return hits;
}

// --- HARD: API-key shapes -------------------------------------------------
// Fixed-prefix formats (sk-, ghp_/gho_/ghs_, xoxb-/xoxp-/xoxa-/xoxs-, AKIA)
// are matched case-sensitively -- real keys in these families are always
// cased exactly this way, and case-sensitivity here is what keeps the
// pattern from firing on unrelated text.
const API_KEY_RE = new RegExp(
  [
    String.raw`\bsk-[A-Za-z0-9]{16,}\b`,
    String.raw`\bgh[pos]_[A-Za-z0-9]{20,}\b`,
    String.raw`\bxox[bpas]-[A-Za-z0-9-]{10,}\b`,
    String.raw`\bAKIA[A-Z0-9]{16}\b`,
  ].join("|"),
  "g",
);

// Unbroken high-entropy base64/hex runs of 32+ characters -- a plain length
// threshold would also catch a 32-character run-together English phrase, so
// a run only counts if it's pure hex, or mixes at least two of
// {uppercase, lowercase, digit} the way base64 output does.
//
// A pure-hex run gets different treatment than a mixed-class one, because
// its false-positive rate is much higher: a git commit SHA (40 hex chars)
// and a sha256 or md5 digest (64 or 32 hex chars) are exactly this shape,
// and are among the most ordinary things anyone writes in a `notes` field
// -- "pinned at <sha> until the drizzle bump lands" is plain technical
// prose, not a secret. A bare pure-hex run is therefore no hit at all.
//
// But a hex-encoded key is also a real thing people paste (a 256-bit key
// is 64 hex characters), and "SECRET_KEY=<64 hex>" in a notes field is a
// plausible way for that to happen. So a pure-hex run is context-gated --
// but the gate is a *label*, not mere co-occurrence in the same string. A
// first version of this gate fired whenever a secret-ish word appeared
// anywhere within 40 characters of the run, on the theory that a commit
// SHA is essentially never written near the word "secret". That held for
// "secret" but not for the rest of the word list: "key", "auth", "token"
// and "password" are all ordinary English that shows up near an unrelated
// hash all the time -- "the key fix landed in <sha>", "auth: fix session
// refresh (<sha>)" (a plain git-log subject line), "password reset flow
// fixed in <sha>", "bundle integrity <sha>; key rotation is manual" -- and
// a wide window fires HARD on every one of them.
//
// What "SECRET_KEY=" and "api token:" actually have that those sentences
// don't is that the word is a *label directly attached to the run* --
// nothing but punctuation/whitespace between the word and the value it
// names. So the gate now requires exactly that: a secret-ish word (key,
// secret, token, password, passwd, credential, apikey, api_key, bearer,
// auth), immediately followed by a short run of separator characters and
// then the token, with no other word in between. "SECRET_KEY=", "api
// token: ", and "apiKey " all satisfy it; "the key fix landed in <sha>"
// doesn't, because "fix landed in" sits between "key" and the run and
// none of those are separator characters.
//
// The gate only looks *before* the run, not after. A trailing form ("<sha>
// is the secret") looks appealing to also support, but it can't be told
// apart from ordinary prose that simply continues past a hash with the
// same shape: "bundle integrity <sha>; key rotation is manual" has a
// context word within two characters of the run *after* it, exactly the
// distance a genuine trailing label would need. Rather than try to
// distinguish "label" from "next clause" on the trailing side, that side
// gets no gate at all -- trading a small amount of recall (a hex run
// explicitly called out only after the fact) for not reopening the same
// false-positive class the leading gate exists to close.
//
// When the gate is satisfied the hit is HARD, not soft -- there's no
// meaningful "maybe" left once a label is directly attached to the run,
// so downgrading it to a warning would just be the same defect (breaking
// --strict on ordinary prose) in a smaller box.
//
// A mixed-class run (upper+lower+digit, the shape base64 output actually
// has) is a much higher-precision signal on its own -- nothing as mundane
// as a commit hash or digest produces one -- so that stays HARD unconditionally,
// same as before.
const LONG_TOKEN_RE = /[A-Za-z0-9+/]{32,}={0,2}/g;

// Letter-delimited, not \b-delimited: \b treats "_" as a word character,
// which would stop "key" from matching inside "SECRET_KEY" (no boundary
// between "_" and "K"). Bounding on letters only means "_", digits, "=",
// ":" and whitespace all count as separators, so "SECRET_KEY=", "api_key",
// and "api token:" are all recognized.
const SECRET_CONTEXT_WORDS = [
  "key",
  "secret",
  "token",
  "password",
  "passwd",
  "credentials?",
  "apikey",
  "api_key",
  "bearer",
  "auth",
];

// A label sitting directly against the run: the context word, then
// nothing but a short run of separator punctuation/whitespace, then the
// string ends (the run starts right where the tested slice ends -- see
// hasSecretLabelBefore). The separator class deliberately excludes
// letters -- that's what stops "keychain" or "monkey " from reading as
// the word "key" followed by a separator: the character right after the
// word would have to be a letter for those, which the class can't
// consume, so the match fails without needing a separate lookahead. The
// leading lookbehind is still needed for the mirror case, a context word
// that is itself the tail of a longer word ("monkey" ending in "key"
// immediately before a run).
const SECRET_LABEL_RE = new RegExp(
  String.raw`(?<![A-Za-z])(?:${SECRET_CONTEXT_WORDS.join("|")})[ \t:=_-]{0,4}$`,
  "i",
);

// How much text before the run is even considered. This only has to be
// wide enough to hold the longest context word ("credentials") plus its
// separator run -- the "$"-anchored match against the run's own start
// position is what pins the label directly against the value, so a
// generous lookback here doesn't reopen the distance-based false
// positives the label shape was built to close.
const SECRET_LABEL_LOOKBACK = 32;

function hasSecretLabelBefore(text: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - SECRET_LABEL_LOOKBACK);
  return SECRET_LABEL_RE.test(text.slice(start, matchIndex));
}

// "/" and "+" are base64 alphabet characters, but "/" is also a path
// separator and both join words in ordinary technical prose. Without this,
// a namespace list like "Domain/Application/Infrastructure/Api" -- 36
// characters, mixed case, no digits -- reads as base64 and fails HARD, which
// is what happened to the first real manifest anyone wrote: an architecture
// description is the field most likely to name layers or directories, and
// blocking `validate` on one is far worse than missing an exotic key shape.
//
// A first version of this exclusion (call it attempt 1) split a token on "/"
// and "+" and excluded it whenever every resulting piece was purely
// alphabetic, on the theory that a digit-free base64 segment is "vanishingly
// unlikely." That claim was never measured, and it is false: sampled against
// 200k-300k random base64-alphabet tokens (see the measurement test,
// free-text-guard.leak.test.ts), the digit-free clean-pass rate was 0.26% at
// 32 chars (about 1 in 390), 0.067% at 40, 0.037% at 44, and 0.002% at 64 --
// against 0% at every length before that exclusion existed. Worse, "every
// piece purely alphabetic" is a shape test with no length bound, so it also
// laundered a real secret sitting right after an ordinary-looking path
// prefix ("config/secrets/<32-char alphabetic key>" -- the whole run merges
// into one greedy LONG_TOKEN_RE match, and the exclusion was then applied to
// the merged token rather than to the key alone), and an empty leading or
// trailing segment (an absolute path, or a path with a trailing slash) broke
// the "every piece" test outright and defeated the exclusion the wrong way,
// reintroducing the original bug for those shapes.
//
// This version keeps the same starting move -- split on "/" and "+" -- but
// replaces "purely alphabetic" with narrower, individually-justified tests,
// and adds a label check that overrides the exclusion entirely:
//
//   1. A secret-ish label directly attached to the token (the same
//      hasSecretLabelBefore check the hex branch above already uses) wins
//      unconditionally, before any of the shape tests below run. Nobody
//      writes "SECRET_KEY=Domain/Application/Infrastructure/Api", so this
//      costs nothing in precision, and it closes the case a bare shape rule
//      structurally cannot: "SECRET_KEY=<key with a slash in it>".
//
//   2. Every empty leading/trailing segment is dropped before any further
//      test -- not just one. An absolute path ("/Users/...") or a
//      trailing-slash path ("foo/bar/") produces exactly one, but a
//      *doubled* separator -- an s3://, gs://, or rsync:// URL, or a
//      scheme-relative "//host/path" URL -- produces two in a row, and an
//      earlier version of this step dropped only the first, leaving the
//      second to defeat the exclusion the same way a single stray empty
//      segment did before this exclusion existed at all (an adversarial
//      review caught this; see free-text-guard.test.ts's "doubled
//      separators" fixtures). An *interior* empty segment (a doubled slash
//      in the middle of a path, not at either edge) is left alone and keeps
//      failing below -- only the edges carry no entropy of their own.
//
//   3. A segment that is *purely* digits (1-4 of them) is word-shaped on
//      its own -- a date-partition component, a numeric resource id, a
//      port. It has no letter case at all, so the letters-plus-optional-
//      trailing-digits test in step 5 below can never accept it, and
//      without this rule it disqualified the whole token even though it's
//      ordinary path/URL structure, not entropy (another adversarial-review
//      finding: "storage/renders/2026/08/22/previews" and an id-bearing
//      documentation URL both failed HARD without it).
//
//   4. Each remaining segment is capped at SEGMENT_LENGTH_CAP (24)
//      characters in the ordinary case -- "Infrastructure" is 14, so real
//      namespace/path segments clear it with room to spare, and a 32+
//      character key segment cannot hide behind an ordinary-looking prefix
//      by staying under this cap, which is what closes the path-prefix
//      laundering case below. But a hard cutoff at 24 with no escape also
//      catches real PascalCase type names -- ApplicationDbContextFactory
//      and ServiceCollectionExtensions are both 27 characters, ordinary in
//      exactly the .NET layout the original bug came from, and both failed
//      HARD before this fix. So a segment of 25 to EXTENDED_SEGMENT_LENGTH_
//      CAP (40) characters gets a second chance in step 5, at double the
//      ordinary word-start-ratio floor -- real multi-word identifiers of
//      that length sit at a ratio of 6.75-9, comfortably above the 6.0
//      floor, while the word-start *cap* (unchanged, still 6) still rejects
//      an actually-random segment of that length: the path-laundering
//      key's second segment below has 7 word starts and is rejected on that
//      alone, independent of the length band it falls into.
//
//   5. Each segment must be word-shaped: letters, optionally followed by a
//      short (<=3) trailing digit run -- "Api/V2", "/v1/", "MySQL8" and
//      "React19" are all ordinary, so digits are allowed, but only in that
//      bounded, trailing position; a digit appearing mid-segment
//      ("K7MDENG") fails this immediately, and this is the single most
//      load-bearing line in the whole predicate -- relaxing it to admit
//      one short internal digit run was measured to raise the general-
//      alphabet leak roughly 20x (0.17% -> 3.26% at 32 characters) and lets
//      the AWS-secret-shaped required fixture below start passing clean, so
//      it stays as-is. The cost is real and is paid, deliberately, by any
//      identifier with a genuinely mid-word digit inside a path --
//      "Oauth2Callback", "Utf8Encoder", "Sha256Hasher" all read as HARD,
//      and free-text-guard.test.ts pins these down as known, accepted false
//      positives rather than leaving them to be rediscovered. Where a
//      segment has two or more "word starts" (an uppercase letter not
//      preceded by an uppercase letter -- the camelCase/PascalCase
//      boundary), its length-to-word-start ratio must stay at or above the
//      floor from step 4 and its word starts at or below
//      SEGMENT_WORD_START_CAP: a random base64 chunk flips case every
//      couple of characters ("TwsqpDeM" is 8 characters with 3 word
//      starts, ratio 2.67), while real multi-word identifiers don't
//      ("ServiceGraphContainer" is 21 characters with 3 word starts, ratio
//      7). A segment with 0 or 1 word starts (an ordinary lowercase word,
//      or a single capitalized word) always passes this part -- there's no
//      meaningful "too dense" reading of a single word, at any length.
//
//      There is deliberately no separate cap on how many segments in one
//      token may carry a digit suffix. An earlier version capped this at
//      2, reasoning that chaining the bounded-digit-suffix allowance
//      across many segments could launder a token that's actually random
//      -- but each segment already has to pass this whole test
//      independently, and measurement showed the extra cap bought no
//      measurable recall while failing ordinary prose: a three-or-more-
//      version-suffixed technology list ("Postgres15+Redis7+Node24+
//      Kubernetes") failed HARD under the old cap for no security benefit.
//
// This predicate still leaks -- shape alone cannot perfectly separate a
// namespace list from a base64 key, and the point of this comment is to
// state the measured rate instead of asserting it away. Measured by
// free-text-guard.leak.test.ts (a seeded, deterministic PRNG generating
// random base64-alphabet tokens and running them through the real scanner,
// not a hand-wave) and cross-checked with a separate, uniform node:crypto
// sampler at N=200,000 per length per alphabet, clean-pass rate by length:
//
//   length          general (real-secret-shaped)   digit-free (worst case)
//   32 characters   0.21%                          28.79%
//   40 characters   0.04%                          20.51%
//   44 characters   0.02%                          16.14%
//   64 characters   0.00%                            5.21%
//
// (Measured after the fixes above -- steps 2-5's precision corrections
// move these numbers by less than a hundredth of a percentage point from
// what the design without them measured: 0.24/0.05/0.01/0.00 general and
// 28.54/20.14/15.34/4.50 digit-free. Widening the exclusion to admit more
// ordinary prose did not meaningfully widen the leak, because the new
// admissions -- doubled-separator edges, numeric path segments, a longer
// PascalCase band, more digit-bearing segments -- are all still gated by
// the same per-segment shape tests a random chunk fails.)
//
// The "general" column -- the full base64 alphabet, digits included, i.e.
// what an actual secret is shaped like -- is what matters for real-world
// risk. It is not, however, comparable to the pre-exclusion baseline: the
// classes>=2 check below leaked exactly 0% at every length before this
// exclusion existed (measured on the same samples), so the honest framing
// is that this exclusion trades that 0% for roughly 0.2% at 32 characters
// and 0.04% at 40, in exchange for not failing `validate` on ordinary
// namespace, path, and version-list prose -- not that the new rate is
// somehow the same shape as the old one. It is, at least, an improvement
// over attempt 1 above: attempt 1 measured 0.40% at 32 characters on this
// same general alphabet, so the current design leaks roughly half of what
// its predecessor did while also closing three regressions attempt 1
// reintroduced (the path-laundering case, the absolute-path case, and the
// trailing-slash case) and, per the second review, four more (doubled
// separators, numeric path segments, the long-PascalCase-name case, and
// the fixed digit-bearing-segment cap).
//
// The "digit-free" column is a deliberately adversarial population (every
// character drawn only from the 54 non-digit base64 characters) and it is
// structurally harder to catch: required-clean fixture "MySQL8" (see
// free-text-guard.test.ts) pins SEGMENT_WORD_START_RATIO_MIN at exactly
// 3.0, and a uniformly-random 50/50-case letter sequence has an *expected*
// length-to-word-start ratio of about 4 -- so against pure letters with no
// digit signal at all, this shape test has real but limited power. A
// genuine random secret is digit-free at 32+ characters only about 0.4% of
// the time to begin with (10 of the 64 alphabet characters are digits), so
// the two worst-case conditions here -- no digits anywhere, and a separator
// positioned so every resulting segment independently looks word-shaped --
// compound to a small real risk even though the isolated digit-free rate
// looks large on its own. See free-text-guard.leak.test.ts for the ceilings
// this is asserted against and the full rationale.
function countWordStarts(segment: string): number {
  let count = 0;
  let prevIsUpper = false;
  for (const char of segment) {
    const isUpper = char >= "A" && char <= "Z";
    if (isUpper && !prevIsUpper) count++;
    prevIsUpper = isUpper;
  }
  return count;
}

const SEGMENT_LENGTH_CAP = 24;
// A second, wider band for a segment that is unmistakably a multi-word
// identifier rather than a compact one. Real PascalCase type names
// routinely run past 24 characters in exactly the .NET layout the
// original bug came from -- ApplicationDbContextFactory (27 characters)
// and ServiceCollectionExtensions (27) are both ordinary. A segment this
// long is only word-shaped if its length-to-word-start ratio clears
// double the normal floor (see EXTENDED_SEGMENT_WORD_START_RATIO_MIN):
// real multi-word identifiers of this length sit at a ratio of 6.75-9,
// while it still has to clear SEGMENT_WORD_START_CAP, which is what
// keeps an actually-random chunk out (the 32-character key segment in
// the path-laundering fixture below has 7 word starts and is rejected on
// that alone, independent of length).
const EXTENDED_SEGMENT_LENGTH_CAP = 40;
const EXTENDED_SEGMENT_WORD_START_RATIO_MIN = 6;
const SEGMENT_WORD_START_RATIO_MIN = 3;
const SEGMENT_WORD_START_CAP = 6;
// Letters, then zero to three trailing digits, nothing else -- a digit
// anywhere but the very end of the segment fails this outright. This is
// the single most load-bearing line in the whole predicate: relaxing it
// to admit one internal digit run (so "K7MDENG" or "Oauth2Callback"
// would pass) was measured to raise the general-alphabet leak roughly
// 20x (0.17%->3.26% at 32 chars) and lets the AWS-secret-shaped required
// fixture below start passing clean. Do not relax it -- the cost is
// documented at its own fixture ("Api/V1/Oauth2Callback/...") in
// free-text-guard.test.ts rather than left to be rediscovered.
const WORD_SHAPED_SEGMENT_RE = /^[A-Za-z]+[0-9]{0,3}$/;
// A segment that is *purely* digits -- a date-partition component
// ("2026/08/22"), a numeric resource id, or a port -- carries no letter
// case at all, so WORD_SHAPED_SEGMENT_RE (which requires a letter) never
// accepts it, and it would otherwise disqualify the whole token even
// though it's ordinary path/URL structure, not entropy. Capped at 4
// digits so this stays "a path component" rather than an arbitrary digit
// run standing in for a shape test.
const NUMERIC_SEGMENT_RE = /^[0-9]{1,4}$/;

function segmentClearsWordStartRatio(segment: string, wordStarts: number, ratioMin: number): boolean {
  // A segment with 0 or 1 word starts (an ordinary lowercase word, or a
  // single capitalized word) always passes -- there's no meaningful "too
  // dense" reading of a single word, at any length.
  if (wordStarts <= 1) return true;
  if (wordStarts > SEGMENT_WORD_START_CAP) return false;
  return segment.length / wordStarts >= ratioMin;
}

function isWordShapedSegment(segment: string): boolean {
  if (segment.length === 0) return false;
  if (NUMERIC_SEGMENT_RE.test(segment)) return true;
  if (segment.length > EXTENDED_SEGMENT_LENGTH_CAP) return false;
  if (!WORD_SHAPED_SEGMENT_RE.test(segment)) return false;
  const wordStarts = countWordStarts(segment);
  const ratioMin = segment.length <= SEGMENT_LENGTH_CAP ? SEGMENT_WORD_START_RATIO_MIN : EXTENDED_SEGMENT_WORD_START_RATIO_MIN;
  return segmentClearsWordStartRatio(segment, wordStarts, ratioMin);
}

function looksLikeSeparatedWords(token: string): boolean {
  const rawSegments = token.split(/[+/]/);
  // Drop every empty leading/trailing segment, not just one. A doubled
  // separator -- s3://, gs://, rsync://, a scheme-relative "//host" URL --
  // produces two consecutive empty segments at the edge, and dropping
  // only one left the second to defeat this exclusion the same way a
  // single stray empty segment did before this fix (an absolute path or
  // a trailing slash, both single-empty-segment cases, are the ones the
  // one-sided version already handled). An *interior* empty segment (a
  // doubled slash in the middle of a path) is left alone and keeps
  // failing below via isWordShapedSegment("") -- only the edges carry no
  // entropy of their own.
  let start = 0;
  let end = rawSegments.length;
  while (start < end && rawSegments[start] === "") start++;
  while (end > start && rawSegments[end - 1] === "") end--;
  const segments = rawSegments.slice(start, end);
  // A token with no separator (or nothing left once the empty edges are
  // dropped) was never eligible for this exclusion -- it keeps whatever
  // behaviour the classes>=2 check below already gives it.
  if (segments.length < 2) return false;

  // No separate cap on how many segments may carry a digit suffix. An
  // earlier version capped this at 2, reasoning that chaining the
  // bounded-digit-suffix allowance across many segments could launder a
  // token that's actually random -- but each segment already has to pass
  // isWordShapedSegment independently (the trailing-digit-only rule, the
  // length caps, and the word-start-ratio/cap tests all still apply), and
  // measurement showed the extra cap bought no additional recall while
  // failing ordinary multi-component prose: a date-partitioned path
  // ("storage/renders/2026/08/22/previews") has three purely-numeric
  // segments, and a version-suffixed technology list with three or more
  // entries ("Postgres15+Redis7+Node24+Kubernetes") has three
  // digit-suffixed ones -- both unremarkable, both failed HARD under the
  // old cap. See free-text-guard.leak.test.ts for the measured before/
  // after leak rate with this cap removed.
  return segments.every(isWordShapedSegment);
}

function findHighEntropyTokens(
  text: string,
): Array<{ category: "api-key" | "high-entropy-token"; matched: string }> {
  const hits: Array<{ category: "api-key" | "high-entropy-token"; matched: string }> = [];
  for (const match of text.matchAll(LONG_TOKEN_RE)) {
    const token = match[0];
    const labeled = match.index !== undefined && hasSecretLabelBefore(text, match.index);
    if (/^[0-9a-fA-F]+$/.test(token)) {
      if (labeled) hits.push({ category: "high-entropy-token", matched: token });
      continue;
    }
    // Label wins outright, before the word-shape exclusion runs at all --
    // see point 1 in the comment above. A labeled token is a hit regardless
    // of what its "/"/"+" segments look like.
    if (labeled) {
      hits.push({ category: "api-key", matched: token });
      continue;
    }
    if (looksLikeSeparatedWords(token)) continue;
    const classes = [/[A-Z]/.test(token), /[a-z]/.test(token), /[0-9]/.test(token)].filter(Boolean).length;
    if (classes >= 2) hits.push({ category: "api-key", matched: token });
  }
  return hits;
}

// --- HARD: URLs carrying userinfo credentials -----------------------------
// Any URL scheme, not just http(s) -- a Postgres/Redis/Mongo/AMQP
// connection string carries a plaintext password in exactly the same
// scheme://user:pass@host shape, and those are at least as likely to show
// up in a services[] entry's notes as an http(s) link is. The userinfo
// *user* half is allowed to be empty (redis://:pw@host is the normal way
// to write a password-only Redis URL); the *password* half must be
// present, since that's what actually makes this a credential rather than
// an ordinary "user@host" mention.
const CREDENTIAL_URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]*:[^\s/:@]+@[^\s/]+/gi;

// --- SOFT: keyword hits ---------------------------------------------------
// Bare, case-insensitive, word-bounded matches on a fixed set of billing-
// adjacent words. Deliberately not a substring match (unlike
// private-key-pattern.ts's property-name deny list) -- these words show up
// in ordinary public prose often enough ("renewal is automated", "service
// accounts reviewed monthly") that a hit here is a warning to double-check,
// never an automatic hard failure.
const SOFT_KEYWORD_PATTERNS: ReadonlyArray<readonly [PrivateValueSoftCategory, RegExp]> = [
  ["billing", /\bbilling\b/i],
  ["invoice", /\binvoice\b/i],
  ["renewal", /\brenewal\b/i],
  ["subscription", /\bsubscription\b/i],
  ["seat", /\bseat\b/i],
  ["plan-tier", /\bplan[ _-]?tier\b/i],
  ["account", /\baccount\b/i],
  ["credentials", /\bcredentials?\b/i],
];

function hardHit(category: PrivateValueHardCategory, matched: string): PrivateValueMatch {
  return { tier: "hard", category, redacted: redactExcerpt(matched) };
}

function softHit(category: PrivateValueSoftCategory, matched: string): PrivateValueMatch {
  return { tier: "soft", category, redacted: redactExcerpt(matched) };
}

/** Every private-value match found in one free-text string, hard and soft alike. */
export function scanFreeTextForPrivateValues(text: string): PrivateValueMatch[] {
  const hits: PrivateValueMatch[] = [];

  for (const match of text.matchAll(EMAIL_RE)) hits.push(hardHit("email", match[0]));
  for (const match of text.matchAll(CURRENCY_AMOUNT_RE)) hits.push(hardHit("currency-amount", match[0]));
  for (const match of text.matchAll(CURRENCY_WORD_RE)) hits.push(softHit("currency-word", match[0]));
  for (const match of text.matchAll(BILLING_PERIOD_AMOUNT_RE)) hits.push(hardHit("billing-period-amount", match[0]));
  for (const run of findCardLikeDigitRuns(text)) hits.push(hardHit("card-number", run));
  for (const match of text.matchAll(API_KEY_RE)) hits.push(hardHit("api-key", match[0]));
  for (const token of findHighEntropyTokens(text)) hits.push(hardHit(token.category, token.matched));
  for (const match of text.matchAll(CREDENTIAL_URL_RE)) hits.push(hardHit("credential-url", match[0]));

  for (const [category, pattern] of SOFT_KEYWORD_PATTERNS) {
    const match = pattern.exec(text);
    if (match) hits.push(softHit(category, match[0]));
  }

  return hits;
}

/** True when a free-text string carries any private-value signal at all, hard or soft. Exported for any consumer that wants a single yes/no answer without caring which tier fired; the CLI's write-time guard (private-guard.ts) deliberately does *not* use this -- it only blocks on a hard hit, so it calls scanFreeTextForPrivateValues directly and filters by tier instead. */
export function hasPrivateFreeTextHit(text: string): boolean {
  return scanFreeTextForPrivateValues(text).length > 0;
}

// --- manifest-wide walk ----------------------------------------------------
function walkStrings(value: unknown, path: string, visit: (path: string, text: string) => void): void {
  if (typeof value === "string") {
    visit(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${path}/${index}`, visit));
    return;
  }
  if (value !== null && typeof value === "object") {
    // Object *keys* are already covered by private-key-pattern.ts's
    // patternProperties deny rule -- only values are walked here, on
    // purpose (see this file's top comment).
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walkStrings(child, `${path}/${key}`, visit);
    }
  }
}

/**
 * Walks every string value anywhere in a parsed manifest candidate --
 * nested objects and arrays included, dependency edges and coding_agents
 * entries among them -- and returns every private-value hit found, split
 * by tier so the caller (validateManifest) can turn hard hits into errors
 * and soft hits into warnings.
 */
export function scanManifestForPrivateValues(candidate: unknown): {
  hard: PrivateValueFinding[];
  soft: PrivateValueFinding[];
} {
  const hard: PrivateValueFinding[] = [];
  const soft: PrivateValueFinding[] = [];

  walkStrings(candidate, "", (path, text) => {
    for (const hit of scanFreeTextForPrivateValues(text)) {
      const finding: PrivateValueFinding = { ...hit, instancePath: path };
      (hit.tier === "hard" ? hard : soft).push(finding);
    }
  });

  return { hard, soft };
}

// --- messages ---------------------------------------------------------
const HARD_CATEGORY_LABELS: Record<PrivateValueHardCategory, string> = {
  email: "an email address",
  "currency-amount": "a currency amount",
  "billing-period-amount": "an amount tied to a billing period",
  "card-number": "a card-like number",
  "api-key": "an API-key-shaped string",
  "high-entropy-token": "a long high-entropy token that looks like a key or secret",
  "credential-url": "a URL carrying embedded credentials",
};

const SOFT_CATEGORY_LABELS: Record<PrivateValueSoftCategory, string> = {
  billing: '"billing"',
  invoice: '"invoice"',
  renewal: '"renewal"',
  subscription: '"subscription"',
  seat: '"seat"',
  "plan-tier": '"plan tier"',
  account: '"account"',
  credentials: '"credentials"',
  "currency-word": "a word-form currency amount",
};

/** Message for a HARD finding -- points at the private overlay, redacted excerpt only, never the raw match. */
export function formatPrivateValueErrorMessage(finding: PrivateValueFinding): string {
  const label = HARD_CATEGORY_LABELS[finding.category as PrivateValueHardCategory];
  return (
    `Value at "${finding.instancePath || "/"}" looks like ${label} ("${finding.redacted}"). ` +
    'That belongs in the private overlay, not dagstree.yaml -- run "dagstree push --private" to store it instead.'
  );
}

/** Message for a SOFT finding -- a lower-confidence nudge, not an accusation. */
export function formatPrivateValueWarningMessage(finding: PrivateValueFinding): string {
  const label = SOFT_CATEGORY_LABELS[finding.category as PrivateValueSoftCategory];
  return (
    `Value at "${finding.instancePath || "/"}" mentions ${label}, which can be a sign of Layer 3 (private) data. ` +
    "If this is actual cost, billing, or account information, it belongs in the private overlay, not dagstree.yaml -- " +
    'run "dagstree push --private" instead. Run with --strict to treat this as an error.'
  );
}
