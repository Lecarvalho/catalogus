// Single source of truth for "this property name looks like Layer 3 (private
// overlay) data" — cost, billing, account references, anything credential-
// shaped. Both the JSON Schema's patternProperties deny rule and the friendly
// redirect-message classifier in validate.ts compile a regex from this exact
// word list, so the two can never independently drift apart. A test
// (schema-sync.test.ts) checks the regex source embedded in
// schema/dagstree.v1.json against the string built here.
//
// JSON Schema `pattern` regexes have no inline case-insensitive flag that
// every implementation honors, so instead of relying on one, each letter is
// expanded into an explicit [aA] character class. Matching is deliberately a
// substring search (not anchored, not word-bounded): a false negative here
// means real billing data lands in a public repo, a false positive just means
// a property name has to be renamed, so we err toward over-catching.
export const DENIED_KEY_WORDS = [
  "cost",
  "price",
  "pricing",
  "amount",
  "account",
  "account_id",
  "username",
  "user",
  "email",
  "token",
  "api_key",
  "key",
  "secret",
  "password",
  "passwd",
  "credential",
  "credentials",
  "billing",
  "invoice",
  "renewal",
  "subscription_id",
  "payment",
  "card",
  "plan_tier",
  "seat",
  "spend",
] as const;

function caseClass(letter: string): string {
  const lower = letter.toLowerCase();
  const upper = letter.toUpperCase();
  return lower === upper ? letter : `[${lower}${upper}]`;
}

// "account_id" -> matches "account_id", "account-id", and "accountId" alike:
// the underscore becomes an optional separator, and per-letter case classes
// already make the join itself work for camelCase (the "I" in "Id" matches
// [iI] regardless of what precedes it).
function wordFragment(word: string): string {
  return word
    .split("_")
    .map((part) => part.split("").map(caseClass).join(""))
    .join("[_-]?");
}

export function buildPrivateKeyPattern(words: readonly string[]): string {
  return `(?:${words.map(wordFragment).join("|")})`;
}

export const PRIVATE_KEY_PATTERN = buildPrivateKeyPattern(DENIED_KEY_WORDS);

export const PRIVATE_KEY_REGEX = new RegExp(PRIVATE_KEY_PATTERN);

export function looksLikePrivateKey(propertyName: string): boolean {
  return PRIVATE_KEY_REGEX.test(propertyName);
}
