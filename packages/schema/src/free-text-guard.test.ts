import { describe, expect, it } from "vitest";

import {
  formatPrivateValueErrorMessage,
  formatPrivateValueWarningMessage,
  hasPrivateFreeTextHit,
  PRIVATE_VALUE_HARD_CATEGORIES,
  PRIVATE_VALUE_SOFT_CATEGORIES,
  redactExcerpt,
  scanFreeTextForPrivateValues,
  scanManifestForPrivateValues,
} from "./free-text-guard.js";
import type { PrivateValueCategory, PrivateValueHardCategory, PrivateValueSoftCategory } from "./free-text-guard.js";

function hardCategoriesFound(text: string): PrivateValueHardCategory[] {
  return scanFreeTextForPrivateValues(text)
    .filter((hit) => hit.tier === "hard")
    .map((hit) => hit.category as PrivateValueHardCategory);
}

function softCategoriesFound(text: string): PrivateValueSoftCategory[] {
  return scanFreeTextForPrivateValues(text)
    .filter((hit) => hit.tier === "soft")
    .map((hit) => hit.category as PrivateValueSoftCategory);
}

describe("HARD categories -- each is a high-precision shape match", () => {
  it.each([
    ["email address", "reach the owner at dsnk@example.com for access", "email"],
    ["$-symbol amount", "costs $25 for the base tier", "currency-amount"],
    ["€-symbol amount", "priced at €12 flat", "currency-amount"],
    ["£-symbol amount", "billed at £9 a pop", "currency-amount"],
    ["¥-symbol amount", "roughly ¥100 per unit", "currency-amount"],
    ["R$-symbol amount", "listed as R$50 locally", "currency-amount"],
    ["amount before ISO code", "runs 25 USD for the tier", "currency-amount"],
    ["ISO code before amount", "priced at USD 25 flat", "currency-amount"],
    ["amount before CAD", "about 25 CAD monthly", "currency-amount"],
    ["amount before EUR", "roughly 19 EUR each", "currency-amount"],
    ["slash-month amount", "runs 25/mo for the base tier", "billing-period-amount"],
    ["slash-month(long) amount", "runs 25/month for the base tier", "billing-period-amount"],
    ["per-month amount", "billed 12 per month per seat", "billing-period-amount"],
    ["slash-year amount", "renews at 199/yr", "billing-period-amount"],
    ["per-year amount", "renews at 199 per year", "billing-period-amount"],
    // Card-number fixtures must be Luhn-valid -- see the card-number
    // detector's own comment for why shape alone (13-19 digits) is no
    // longer enough. 4444444444448 / 4444444444444444442 are synthetic
    // Visa-shaped numbers constructed to pass the Luhn check; 4111...1111
    // (16 digits) is the well-known Stripe/industry test Visa number, also
    // Luhn-valid.
    ["13-digit run", "card on file: 4444444444448", "card-number"],
    ["16-digit run, space separated", "card on file: 4111 1111 1111 1111", "card-number"],
    ["16-digit run, hyphen separated", "card on file: 4111-1111-1111-1111", "card-number"],
    ["19-digit run", "card on file: 4444444444444444442", "card-number"],
    ["sk- prefixed key", "the key is sk-abcdefghijklmnopqrstuvwxyz123456", "api-key"],
    ["ghp_ token", "auth token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "api-key"],
    ["gho_ token", "auth token gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "api-key"],
    ["ghs_ token", "auth token ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "api-key"],
    // Split the synthetic token so GitHub push protection does not treat the
    // source fixture itself as a live Slack credential.
    ["xoxb- slack token", "bot token xoxb-" + "1234567890-1234567890123-abcdefghijklmnopqrstuvwx", "api-key"],
    ["xoxp- slack token", "user token xoxp-1234567890-1234567890123-abcdefghijklmnopqrstuvwx", "api-key"],
    ["AKIA aws id", "access key AKIAIOSFODNN7EXAMPLE in use", "api-key"],
    ["base64-shaped run 32+", "token dGhpc0lzQVRlc3RUb2tlblZhbHVlMTIzNA== embedded", "api-key"],
    ["credential URL (https)", "clone via https://svc-user:p4ssw0rd@git.example.com/repo.git", "credential-url"],
    ["credential URL (postgres, dotless host)", "connect with postgres://dsnk:Hunter2Swordfish@localhost:5432/example-app", "credential-url"],
    ["credential URL (redis, empty user)", "redis://:s3cr3tpassw0rd@cache:6379 is the queue", "credential-url"],
    ["credential URL (mongodb+srv)", "mongodb+srv://root:letmein@mongo.example.net/db", "credential-url"],
    ["credential URL (amqp)", "broker at amqp://worker:hunter2@queue:5672", "credential-url"],
    ["$ with 2+ digits", "costs $99 for the base tier", "currency-amount"],
    ["postfix symbol amount", "listed as 25€ locally", "currency-amount"],
  ])("flags a %s", (_label, text, expectedCategory) => {
    expect(hardCategoriesFound(text)).toContain(expectedCategory as PrivateValueCategory);
    expect(hasPrivateFreeTextHit(text)).toBe(true);
  });

  it("covers every declared hard category with at least one regression case above", () => {
    const covered = new Set(
      [
        "reach the owner at dsnk@example.com for access",
        "costs $25 for the base tier",
        "runs 25/mo for the base tier",
        "card on file: 4111 1111 1111 1111",
        "the key is sk-abcdefghijklmnopqrstuvwxyz123456",
        "SECRET_KEY=d741333901cecbb75ce4afc7e9f1853eadb3bab3f2f7c469fed115963b0f457a",
        "clone via https://svc-user:p4ssw0rd@git.example.com/repo.git",
      ].flatMap((text) => hardCategoriesFound(text)),
    );
    for (const category of PRIVATE_VALUE_HARD_CATEGORIES) {
      expect(covered.has(category), `expected "${category}" to be exercised`).toBe(true);
    }
  });

  it("does not flag a digit run just outside the card-number range", () => {
    expect(hardCategoriesFound("issue 123456789012")).not.toContain("card-number"); // 12 digits
    expect(hardCategoriesFound("id 12345678901234567890")).not.toContain("card-number"); // 20 digits
  });

  it("does not flag a card-shaped digit run that fails the Luhn check", () => {
    // Same length and grouping as the real fixtures above, but the check
    // digit is wrong -- this is what an arbitrary (non-card) 16-digit
    // number looks like, and it must not read as a card number just
    // because the shape matches.
    expect(hardCategoriesFound("card on file: 1234 5678 9012 3456")).not.toContain("card-number");
  });

  it("does not bridge unrelated numbers across a separator into a fake card number", () => {
    // These would all falsely match under a shape-only (no Luhn) digit-run
    // scanner: a UUID's numeric-only segment bridged across its hyphen, a
    // space-separated port list, and two adjacent ISO dates.
    expect(hardCategoriesFound("Sentry project 550e8400-e29b-41d4-a716-446655440000")).not.toContain("card-number");
    expect(hardCategoriesFound("exposes ports 8080 9090 3000 5432 in the internal network")).not.toContain(
      "card-number",
    );
    expect(hardCategoriesFound("migration ran 2026-06-01 2026-07-01 in two passes")).not.toContain("card-number");
  });

  it("does not read $1/$3 shell positional parameters or regex backreferences as a currency amount", () => {
    expect(hardCategoriesFound("run deploy.sh with $1 as the app name")).not.toContain("currency-amount");
    expect(hardCategoriesFound("regex replaces $1 with the slug")).not.toContain("currency-amount");
    expect(hardCategoriesFound("uses awk {print $3}")).not.toContain("currency-amount");
    expect(hasPrivateFreeTextHit("run deploy.sh with $1 as the app name")).toBe(false);
  });

  it("still flags a genuine single-digit non-dollar price ($ is the only symbol with a scripting-metacharacter collision)", () => {
    expect(hardCategoriesFound("billed at £9 a pop")).toContain("currency-amount");
  });

  it("does not flag a bare git SHA or content digest at all -- no secret-ish word nearby", () => {
    // A pure-hex run this long is exactly as likely to be a commit hash or
    // image digest as a secret -- see the entropy detector's own comment.
    // With nothing secret-ish in the string, it must produce no hit at all,
    // not even a soft one.
    const sha1 = scanFreeTextForPrivateValues("pinned to commit 9c1e5f3a2b7d4e6f8a0c1b2d3e4f5a6b7c8d9e0f");
    expect(sha1).toEqual([]);

    const sha256 = scanFreeTextForPrivateValues(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256).toEqual([]);
  });

  // The separated-words exclusion must not become a way to smuggle a real key
  // past the guard. Genuine base64 carries digits in its segments; a namespace
  // list does not, which is the whole discriminator.
  it.each([
    ["an AWS-style secret containing slashes", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEYAAAA"],
    ["a base64 blob with an embedded slash", "aGVsbG8vd29ybGQxMjM0NTY3ODkwYWJjZGVmZ2hpamts"],
    ["a base64 blob with no separators at all", "dGhpc2lzYVZlcnlMb25nQmFzZTY0U3RyaW5nMTIzNDU2Nzg5"],
    // The fixture above is *labeled* "embedded slash" but its base64 text
    // does not actually contain a literal "/" character (the slash only
    // shows up once the string is decoded) -- this one genuinely does, so
    // it actually exercises the split-on-"/" path the exclusion runs.
    ["a base64 blob with a genuinely embedded slash", "X+zrZv/IbzjZUnhsbWlsecLbwjndTpG0ZynXOif7V+k"],
  ])("still flags %s as a hard api-key despite containing base64 separators", (_label, text) => {
    expect(hardCategoriesFound(text)).toContain("api-key");
  });

  it("still flags a mixed-case/digit high-entropy token as hard api-key (unaffected by the hex context gate)", () => {
    expect(hardCategoriesFound("seen hash a3f5c9d8e1b2a3f5c9d8e1b2a3f5c9d8Xy in logs")).toContain("api-key");
  });

  // Attempt 1's word-shape exclusion (the predecessor to the current one)
  // shipped three confirmed regressions, each closed by a distinct part of
  // the current design -- see the module comment above
  // looksLikeSeparatedWords in free-text-guard.ts for the full mechanism.
  // These fixtures pin each one down individually so a future change can't
  // reopen any of them without a test noticing.
  describe("mixed-class branch: label wins outright, before the word-shape exclusion runs", () => {
    it.each([
      [
        "SECRET_KEY= label directly before a slash-bearing token",
        "SECRET_KEY=TwsqpDeM/fFZogpqlUeOjCRcxsdQoAke rotate quarterly",
      ],
      ["'api token:' label directly before a slash-bearing token", "api token: TwsqpDeM/fFZogpqlUeOjCRcxsdQoAke"],
      [
        "a well-formed AWS secret access key with no digits, labeled",
        "AWS_SECRET_ACCESS_KEY=RizNQqYPoSAmiM/tmvEAeJNuQusRVLqdXDrTmYOa",
      ],
    ])("flags %s as HARD -- the label overrides the exclusion even though the token's segments are digit-free", (_label, text) => {
      expect(hardCategoriesFound(text)).toContain("api-key");
      const soft = softCategoriesFound(text);
      expect(soft, `expected no soft hits, got ${JSON.stringify(soft)}`).toEqual([]);
    });

    it("the label check does not depend on the token's own case mix -- a bare labeled slash-bearing token has no digits at all", () => {
      // "TwsqpDeM/fFZogpqlUeOjCRcxsdQoAke" has zero digits and would pass
      // the word-shape exclusion (both segments are single words) if the
      // label weren't consulted first -- this is exactly what let the
      // original manifest-carried secret through undetected.
      const hits = scanFreeTextForPrivateValues("SECRET_KEY=TwsqpDeM/fFZogpqlUeOjCRcxsdQoAke");
      expect(hits.some((h) => h.tier === "hard")).toBe(true);
    });
  });

  it("does not let a path prefix launder an adjacent key by merging into one greedy token (the segment-length cap)", () => {
    // "config/secrets/" reads as an ordinary path; nothing labels the key
    // that follows it. LONG_TOKEN_RE is greedy across "/", so the whole
    // run -- path prefix and key together -- is one match, and the key
    // segment on its own (32+ chars) exceeds SEGMENT_LENGTH_CAP, which
    // disqualifies the word-shape exclusion for the entire token and lets
    // the classes>=2 check underneath catch it.
    const hits = scanFreeTextForPrivateValues(
      "signing key file at config/secrets/TwsqpDeMfFZogpqlUeOjCRcxsdQoAkeX",
    );
    expect(hits.some((h) => h.tier === "hard" && h.category === "api-key")).toBe(true);
  });

  // A second adversarial review of the design above (the one just verified
  // by the fixtures above this point) found four precision defects: the
  // predicate correctly caught every required secret, but it also failed
  // HARD on several classes of ordinary Layer 2 prose that were never
  // exercised by the first round of fixtures. Each block below pins the
  // failing case from that review down as a regression test, alongside the
  // fix. See the module comment above looksLikeSeparatedWords in
  // free-text-guard.ts for the mechanism each of these relies on.
  describe("round 2: doubled separators must not defeat the empty-segment trim", () => {
    it.each([
      ["an s3:// URL", "media stored in s3://dsprintworks/renders/Previews/originals/large"],
      ["a gs:// URL", "media stored in gs://dsprintworks/renders/Previews/originals/large"],
      ["an rsync:// URL", "mirror at rsync://buildbox/artifacts/nightly/linux/Release/latest"],
      // A scheme-relative URL ("//host/path", no scheme prefix) produces the
      // exact same doubled-empty-segment shape as a scheme URL's "://" does.
      ["a scheme-relative //host URL", "share is //buildserver/artifacts/nightly/windows/Release/latest"],
    ])("produces no hit for %s -- dropping only one empty edge segment left the second to defeat the exclusion", (_label, text) => {
      const hits = scanFreeTextForPrivateValues(text);
      expect(hits, `expected no hits for "${text}", got ${JSON.stringify(hits)}`).toEqual([]);
    });
  });

  describe("round 2: a purely numeric path segment is ordinary structure, not entropy", () => {
    it.each([
      ["a date-partitioned path", "artifacts under storage/renders/2026/08/22/previews/originals"],
      ["a numeric organization id in a documentation URL", "see https://api.example.com/v1/organizations/4821/projects/services"],
      ["a numeric resource id mid-path", "endpoint is api/organizations/4821/projects/Services/summary"],
      ["a port number in a path", "proxied through gateway/upstream/8080/internal/healthchecks"],
    ])("produces no hit for %s -- WORD_SHAPED_SEGMENT_RE requires a letter, so a bare digit run needs its own rule", (_label, text) => {
      const hits = scanFreeTextForPrivateValues(text);
      expect(hits, `expected no hits for "${text}", got ${JSON.stringify(hits)}`).toEqual([]);
    });
  });

  describe("round 2: a PascalCase type name past the ordinary segment-length cap is still a word, not a key", () => {
    it.each([
      ["ApplicationDbContextFactory (27 chars, the .NET layout the original bug came from)", "EF config lives at Infrastructure/Persistence/ApplicationDbContextFactory"],
      ["ServiceCollectionExtensions (27 chars)", "registered in Api/Extensions/ServiceCollectionExtensions/Authentication"],
      ["InternationalizationSupport (28 chars)", "see Domain/Application/Infrastructure/InternationalizationSupport"],
    ])("produces no hit for %s -- the 25-40 char band at double the ordinary ratio floor admits it, while the path-laundering key above (whose word-start count is 7) still fails it", (_label, text) => {
      const hits = scanFreeTextForPrivateValues(text);
      expect(hits, `expected no hits for "${text}", got ${JSON.stringify(hits)}`).toEqual([]);
    });
  });

  it("round 2: three or more version-suffixed entries in a plus-joined stack list produce no hit -- removing the fixed digit-bearing-segment cap", () => {
    // The predecessor to this predicate capped how many segments in one
    // token could carry a digit suffix at 2, on the theory that chaining
    // the bounded-digit-suffix allowance across many segments could
    // launder a random token. Measurement showed the cap bought no
    // measurable recall (each segment already has to pass
    // isWordShapedSegment on its own) while failing this ordinary case.
    const hits = scanFreeTextForPrivateValues("stack is Postgres15+Redis7+Node24+Kubernetes");
    expect(hits, `expected no hits, got ${JSON.stringify(hits)}`).toEqual([]);
  });

  // Not a bug -- a documented trade-off. WORD_SHAPED_SEGMENT_RE rejects any
  // digit that isn't in a trailing run, which is what stops a real secret
  // segment like "K7MDENG" (see the AWS-style fixture earlier in this file)
  // from reading as an ordinary word. The adversarial review measured the
  // cost of relaxing that rule to allow one short internal digit run: the
  // general-alphabet leak jumped roughly 20x (0.17% -> 3.26% at 32 chars,
  // 0.045% -> 1.22% at 40), and the AWS-secret-shaped required fixture
  // above starts passing clean. So the rule stays, and an identifier with a
  // mid-word digit inside a path -- genuinely ordinary prose ("Oauth2",
  // "Utf8", "Sha256", "Base64" all have this shape) -- pays for it by
  // reading as HARD. This is pinned here, deliberately, so the trade-off is
  // visible rather than rediscovered as a surprise bug report.
  it.each([
    ["Oauth2Callback (digit mid-word, not trailing)", "handlers in Api/V1/Oauth2Callback/Controllers/Internal"],
    ["Utf8Encoder and Sha256Hasher (same shape)", "assets under src/lib/Utf8Encoder/Sha256Hasher/Base64Codec"],
  ])(
    "round 2 (known, accepted false positive): %s still reads as HARD api-key -- relaxing the mid-segment-digit rule was measured to cost ~20x recall",
    (_label, text) => {
      expect(hardCategoriesFound(text)).toContain("api-key");
    },
  );

  it("flags a pure-hex run as HARD high-entropy-token when a secret-ish word sits right next to it", () => {
    // A hex-encoded 256-bit key is 64 hex characters -- exactly the shape a
    // bare commit SHA has -- so this only differs from the SHA case above
    // by the label sitting next to the run.
    const secretKey = scanFreeTextForPrivateValues(
      "SECRET_KEY=d741333901cecbb75ce4afc7e9f1853eadb3bab3f2f7c469fed115963b0f457a",
    );
    expect(secretKey.some((h) => h.tier === "hard" && h.category === "high-entropy-token")).toBe(true);
    expect(secretKey.some((h) => h.tier === "soft")).toBe(false);

    const apiToken = scanFreeTextForPrivateValues(
      "api token: b0fc7a8eec525556b6f38e3b84ac94e3e0145c93dc03e4e515673b22adbb4caa",
    );
    expect(apiToken.some((h) => h.tier === "hard" && h.category === "high-entropy-token")).toBe(true);
    expect(apiToken.some((h) => h.tier === "soft")).toBe(false);
  });

  it("flags a pure-hex run as HARD for other label-immediately-before shapes too", () => {
    // Covers the compound-word ("apikey"/"api_key") and non-"key" ("bearer")
    // context words specifically, since the tests above only exercise "key"
    // and "token".
    const camelLabel = scanFreeTextForPrivateValues(
      "apiKey d741333901cecbb75ce4afc7e9f1853eadb3bab3f2f7c469fed115963b0f457a",
    );
    expect(camelLabel.some((h) => h.tier === "hard" && h.category === "high-entropy-token")).toBe(true);

    const snakeLabel = scanFreeTextForPrivateValues(
      "api_key=d741333901cecbb75ce4afc7e9f1853eadb3bab3f2f7c469fed115963b0f457a",
    );
    expect(snakeLabel.some((h) => h.tier === "hard" && h.category === "high-entropy-token")).toBe(true);

    const bearerLabel = scanFreeTextForPrivateValues(
      "Bearer d741333901cecbb75ce4afc7e9f1853eadb3bab3f2f7c469fed115963b0f457a",
    );
    expect(bearerLabel.some((h) => h.tier === "hard" && h.category === "high-entropy-token")).toBe(true);
  });

  it("does not gate a pure-hex run on a context word that only follows it -- the gate is leading-only", () => {
    // "<hash> is the secret" reads like a label to a human, but it has the
    // same shape as "<hash>; key rotation is manual" (an unrelated word
    // starting the next clause) -- see the entropy detector's own comment
    // for why the gate deliberately doesn't look after the run.
    const hits = scanFreeTextForPrivateValues(
      "a94b1c8e2f6d3e0b7c5a9f1d4e8b2c6a0f3d7e91 is the secret we rotate quarterly",
    );
    expect(hits).toEqual([]);
  });

  it("never renders a high-entropy-token hit as mentioning \"credentials\" -- it has its own category and message", () => {
    const [finding] = scanManifestForPrivateValues({
      services: [{ notes: "SECRET_KEY=d741333901cecbb75ce4afc7e9f1853eadb3bab3f2f7c469fed115963b0f457a" }],
    }).hard.filter((f) => f.category === "high-entropy-token");
    expect(finding).toBeDefined();
    if (!finding) return;
    const message = formatPrivateValueErrorMessage(finding);
    expect(message).not.toContain('mentions "credentials"');
    expect(message).toContain("high-entropy token");
  });

  it("recognizes an email address folded across a YAML `>` block-scalar line break", () => {
    // YAML folding rejoins wrapped lines with a single space -- this is
    // exactly what a folded `owner is dsnk@\nexample.com` parses to.
    const hits = scanFreeTextForPrivateValues("owner is dsnk@ example.com");
    expect(hits.some((h) => h.tier === "hard" && h.category === "email")).toBe(true);
  });
});

describe("SOFT categories -- lower-precision keyword hits", () => {
  it.each([
    ["billing", "see the billing docs for details", "billing"],
    ["invoice", "an invoice arrives every month", "invoice"],
    ["renewal", "renewal happens automatically", "renewal"],
    ["subscription", "the subscription covers three seats", "subscription"],
    ["seat", "each seat is provisioned by IT", "seat"],
    ["plan tier (spaced)", "moved to a higher plan tier", "plan-tier"],
    ["plan tier (hyphenated)", "moved to a higher plan-tier", "plan-tier"],
    ["account", "the account was created last year", "account"],
    ["credentials", "credentials are rotated quarterly", "credentials"],
    ["currency word", "about 25 dollars a month on the hobby plan", "currency-word"],
  ])("flags %s as soft, not hard", (_label, text, expectedCategory) => {
    const hits = scanFreeTextForPrivateValues(text);
    expect(hits.some((h) => h.tier === "soft" && h.category === expectedCategory)).toBe(true);
    expect(hits.some((h) => h.tier === "hard")).toBe(false);
  });

  it("covers every declared soft category with at least one regression case above", () => {
    const covered = new Set(
      [
        "see the billing docs for details",
        "an invoice arrives every month",
        "renewal happens automatically",
        "the subscription covers three seats",
        "each seat is provisioned by IT",
        "moved to a higher plan tier",
        "the account was created last year",
        "credentials are rotated quarterly",
        "about 25 dollars a month on the hobby plan",
      ].flatMap((text) => softCategoriesFound(text)),
    );
    for (const category of PRIVATE_VALUE_SOFT_CATEGORIES) {
      expect(covered.has(category), `expected "${category}" to be exercised`).toBe(true);
    }
  });

  it("recognizes word-form currency mentions (dollars/euros/pounds/yen), including a postfix symbol and a bare euro word", () => {
    expect(softCategoriesFound("about 25 dollars a month on the hobby plan")).toContain("currency-word");
    expect(softCategoriesFound("roughly 25 EURO per seat")).toContain("currency-word");
  });
});

describe("false positives -- ordinary technical prose must stay completely clean", () => {
  it.each([
    ["architecture style with a version number", "modular monolith (.NET 10, vertical slices)"],
    ["architecture style, no version", "vertical slices + MediatR"],
    ["pm methodology mentioning an agent name", "Trello kanban (PAUTA agent sync)"],
    ["a changelog-style note", "upgraded to Next.js 15.4 in March"],
    ["a note that says the word cost, but not privately", "costs are tracked in the private overlay, not here"],
    ["a note with a bare ISO date", "migrated off Vertex on 2026-06-01"],
    ["a note with short digit runs", "see RFC 7519 and issue 12345"],
    ["a hyphenated slug with digits", "s3-bucket-2"],
    [
      "a 40-char git SHA referenced in prose",
      "pinned at a94b1c8e2f6d3e0b7c5a9f1d4e8b2c6a0f3d7e91 until the drizzle bump lands",
    ],
    [
      "a 64-char sha256 digest in a notes field",
      "image digest sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ],
    ["a 32-char md5 digest in a notes field", "checksum d41d8cd98f00b204e9800998ecf8427e for the empty file"],
    ["a 7-char SHA prefix, below the length threshold", "reverted in a94b1c8 earlier today"],
    // The first real manifest anyone wrote failed HARD on this exact string:
    // "/" is a base64 alphabet character, so a slash-separated namespace list
    // of 32+ mixed-case characters read as a key. An architecture description
    // is the field most likely to name layers or directories.
    [
      "a slash-separated namespace list in an architecture description",
      "two-tier: .NET 10 Web API backend (Domain/Application/Infrastructure/Api) + React 19 + Vite SPA",
    ],
    ["a long source path", "entrypoint at src/components/dashboard/ServiceGraphContainer"],
    // Attempt 1's exclusion required *every* split segment to be purely
    // alphabetic, so an empty segment (produced by a leading or trailing
    // "/") failed that "every" test outright and defeated the exclusion --
    // reintroducing the original bug for exactly the path shapes it was
    // supposed to fix. The current exclusion drops one empty leading and
    // one empty trailing segment before testing anything.
    ["a long source path with a trailing slash", "entrypoint at src/components/dashboard/ServiceGraphContainer/"],
    ["an absolute path (leading slash produces an empty first segment)", "source lives at /Users/Leandro/Repos/dagstree/packages"],
    // A single digit-bearing segment ("V2") must not disqualify the whole
    // token -- attempt 1's "every piece purely alphabetic" test failed the
    // instant any segment carried a digit, which is exactly backwards from
    // how ordinary versioned namespaces read ("Api/V2" is common, not
    // suspicious).
    ["a namespace list with a trailing versioned segment", "layers are Domain/Application/Infrastructure/Api/V2"],
    ["a namespace list with a versioned segment in the middle", "handlers under Api/V1/Controllers/Internal/HealthChecks"],
    // LONG_TOKEN_RE stops at "." (not a base64-alphabet character), so this
    // URL's host is never part of the matched token -- but the path tail
    // after the last "." is, and it's 38 characters, well past the 32-char
    // threshold: "com/v1/organizations/projects/services".
    ["a plain documentation URL", "docs at https://api.example.com/v1/organizations/projects/services"],
    ["a plus-joined technology list", "stack is Postgres+Redis+Elasticsearch+RabbitMQ+Kubernetes"],
    ["a plus-joined technology list with a versioned entry", "stack is Postgres+Redis+Elasticsearch+RabbitMQ+Kubernetes+MySQL8"],
    ["a 12-char SHA prefix, below the length threshold", "see a94b1c8e2f6d for the fix"],
    // A secret-ish word that merely occurs somewhere in the same sentence
    // as a hash, without being a label directly attached to it, must not
    // gate the hex-run rule -- see the entropy detector's own comment for
    // why the gate is anchored on adjacency, not co-occurrence.
    ["'key' several words before an unrelated SHA", "the key fix landed in a94b1c8e2f6d3e0b7c5a9f1d4e8b2c6a0f3d7e91"],
    [
      "'auth' as a commit-message prefix, unrelated to the SHA that follows it",
      "auth: fix session refresh (a94b1c8e2f6d3e0b7c5a9f1d4e8b2c6a0f3d7e91)",
    ],
    [
      "'token' several words before an unrelated SHA",
      "token bucket rewrite shipped in a94b1c8e2f6d3e0b7c5a9f1d4e8b2c6a0f3d7e91",
    ],
    [
      "'password' several words before an unrelated SHA",
      "password reset flow fixed in a94b1c8e2f6d3e0b7c5a9f1d4e8b2c6a0f3d7e91",
    ],
    [
      "'key' several words before an unrelated SHA (different sense of the word)",
      "primary key index rebuilt at a94b1c8e2f6d3e0b7c5a9f1d4e8b2c6a0f3d7e91",
    ],
    [
      "'secret' far from the SHA it has nothing to do with",
      "webhook secret is in 1Password; deploy a94b1c8e2f6d3e0b7c5a9f1d4e8b2c6a0f3d7e91",
    ],
    [
      "'key' immediately after a digest, separated only by punctuation -- not a label",
      "bundle integrity e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855; key rotation is manual",
    ],
    [
      "'key' far before a digest with unrelated words in between",
      "key rotation doc; image sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ],
    ["'monkey' ends in the letters 'key' but is not the word 'key'", "monkey a94b1c8e2f6d3e0b7c5a9f1d4e8b2c6a0f3d7e91"],
    [
      "'keychain' starts with the letters 'key' but is not the word 'key'",
      "keychain a94b1c8e2f6d3e0b7c5a9f1d4e8b2c6a0f3d7e91",
    ],
  ])("produces neither a hard nor a soft hit for: %s", (_label, text) => {
    const hits = scanFreeTextForPrivateValues(text);
    expect(hits, `expected no hits for "${text}", got ${JSON.stringify(hits)}`).toEqual([]);
    expect(hasPrivateFreeTextHit(text)).toBe(false);
  });

  it("never reads a version number as a currency amount", () => {
    expect(hardCategoriesFound("Next.js 15.4")).not.toContain("currency-amount");
  });

  it("never reads a bare date as billing-period or renewal data on its own", () => {
    const hits = scanFreeTextForPrivateValues("migrated off Vertex on 2026-06-01");
    expect(hits).toEqual([]);
  });
});

describe("redactExcerpt", () => {
  it("never returns the input verbatim for anything long enough to matter", () => {
    const redacted = redactExcerpt("someone@example.com");
    expect(redacted).not.toBe("someone@example.com");
    expect(redacted).not.toContain("someone");
    expect(redacted.length).toBeLessThan("someone@example.com".length);
  });

  it("keeps only the first two and last two characters, joined by an ellipsis", () => {
    expect(redactExcerpt("4111111111111111")).toBe("41…11");
    expect(redactExcerpt("sk-abcdefghijklmnopqrstuvwxyz")).toBe("sk…yz");
  });

  it("fully masks anything too short for a partial reveal to hide", () => {
    expect(redactExcerpt("$25")).toBe("***");
    expect(redactExcerpt("ab")).toBe("**");
  });
});

describe("hard-hit messages redirect to the private overlay without echoing the match", () => {
  it("names the category and instance path, redacts the value, and points at push --private", () => {
    const [finding] = scanManifestForPrivateValues({
      services: [{ notes: "contact dsnk@example.com for billing questions" }],
    }).hard.filter((f) => f.category === "email");
    expect(finding).toBeDefined();
    if (!finding) return;
    const message = formatPrivateValueErrorMessage(finding);
    expect(message).toContain(finding.instancePath);
    expect(message).toContain("push --private");
    expect(message).not.toContain("dsnk@example.com");
    expect(message).toContain(finding.redacted);
  });
});

describe("soft-hit messages are a nudge, not an accusation, and mention --strict", () => {
  it("stays informative without over-claiming a violation", () => {
    const [finding] = scanManifestForPrivateValues({
      project: { pm: "renewal is handled by GitHub Actions" },
    }).soft;
    expect(finding).toBeDefined();
    if (!finding) return;
    const message = formatPrivateValueWarningMessage(finding);
    expect(message).toContain(finding.instancePath);
    expect(message).toMatch(/--strict/);
  });
});

describe("scanManifestForPrivateValues -- generic recursive walk", () => {
  it("catches a hard hit buried inside a dependency-edge object, not only at the top level", () => {
    const { hard } = scanManifestForPrivateValues({
      dagstree: 1,
      project: { name: "x", slug: "x" },
      services: [
        { id: "a", service: "b", role: "c", added: "2025-01-01" },
        { id: "b", service: "b", role: "c", added: "2025-01-01" },
      ],
      dependencies: [{ from: "a", to: "b", notes: "billing contact dsnk@example.com" }],
    });
    expect(hard.some((f) => f.instancePath === "/dependencies/0/notes" && f.category === "email")).toBe(true);
  });

  it("catches a hit buried inside a coding_agents array entry", () => {
    const { hard } = scanManifestForPrivateValues({
      dagstree: 1,
      project: {
        name: "x",
        slug: "x",
        coding_agents: ["claude-code", "contact dsnk@example.com for the license"],
      },
      services: [],
      dependencies: [],
    });
    expect(hard.some((f) => f.instancePath === "/project/coding_agents/1" && f.category === "email")).toBe(true);
  });

  it("catches a soft hit buried inside a services[] entry", () => {
    const { soft } = scanManifestForPrivateValues({
      dagstree: 1,
      project: { name: "x", slug: "x" },
      services: [{ id: "a", service: "b", role: "c", added: "2025-01-01", notes: "billing is handled elsewhere" }],
      dependencies: [],
    });
    expect(soft.some((f) => f.instancePath === "/services/0/notes" && f.category === "billing")).toBe(true);
  });

  it("does not walk into property names, only values", () => {
    // "account" as a *key* is already rejected by the schema's own
    // patternProperties deny rule (private-key-pattern.ts) -- this module
    // only ever looks at values, so a key named this way produces no hit
    // here (it would never even reach here in practice; validateManifest
    // rejects it at the schema stage first).
    const { hard, soft } = scanManifestForPrivateValues({ account: "ordinary-value" });
    expect(hard).toEqual([]);
    expect(soft).toEqual([]);
  });

  it("returns no findings for a document with no string values at all", () => {
    expect(scanManifestForPrivateValues({ dagstree: 1, count: 3, nested: { flag: true, list: [1, 2, 3] } })).toEqual({
      hard: [],
      soft: [],
    });
  });
});
