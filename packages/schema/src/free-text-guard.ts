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
// A pure-hex run is deliberately treated as a *weaker* signal than a
// mixed-class one: a git commit SHA (40 hex chars) and a sha256 digest (64
// hex chars) are exactly this shape and are two of the most ordinary things
// anyone writes in a `notes` field, so a pure-hex match is only ever a SOFT
// hit ("credentials"), never a hard failure -- real key formats that happen
// to render as hex (a Django-style secret, a session token) still get
// flagged, just as a warning rather than something that blocks validate/
// add/graph/diff outright. A mixed-class run (upper+lower+digit, the shape
// base64 output actually has) is a much higher-precision signal -- nothing
// as mundane as a commit hash or digest produces one -- so that stays HARD.
const LONG_TOKEN_RE = /[A-Za-z0-9+/]{32,}={0,2}/g;
function tokenEntropyTier(token: string): "hard" | "soft" | null {
  if (/^[0-9a-fA-F]+$/.test(token)) return "soft";
  const classes = [/[A-Z]/.test(token), /[a-z]/.test(token), /[0-9]/.test(token)].filter(Boolean).length;
  return classes >= 2 ? "hard" : null;
}
function findHighEntropyTokens(text: string): Array<{ tier: "hard" | "soft"; matched: string }> {
  const hits: Array<{ tier: "hard" | "soft"; matched: string }> = [];
  for (const match of text.matchAll(LONG_TOKEN_RE)) {
    const tier = tokenEntropyTier(match[0]);
    if (tier) hits.push({ tier, matched: match[0] });
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
  for (const token of findHighEntropyTokens(text)) {
    hits.push(token.tier === "hard" ? hardHit("api-key", token.matched) : softHit("credentials", token.matched));
  }
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
