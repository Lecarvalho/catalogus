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
    ["credential URL (postgres, dotless host)", "connect with postgres://dsnk:Hunter2Swordfish@localhost:5432/clapline", "credential-url"],
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

  it("flags a commit SHA and a sha256 digest as a SOFT credentials hit, not a hard api-key failure", () => {
    // A pure-hex run this long is exactly as likely to be a commit hash or
    // image digest as a secret -- see the entropy detector's own comment.
    const sha1 = scanFreeTextForPrivateValues("pinned to commit 9c1e5f3a2b7d4e6f8a0c1b2d3e4f5a6b7c8d9e0f");
    expect(sha1.some((h) => h.tier === "hard")).toBe(false);
    expect(sha1.some((h) => h.tier === "soft" && h.category === "credentials")).toBe(true);

    const sha256 = scanFreeTextForPrivateValues(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256.some((h) => h.tier === "hard")).toBe(false);
    expect(sha256.some((h) => h.tier === "soft" && h.category === "credentials")).toBe(true);
  });

  it("still flags a mixed-case/digit high-entropy token as hard api-key (unaffected by the hex downgrade)", () => {
    expect(hardCategoriesFound("seen hash a3f5c9d8e1b2a3f5c9d8e1b2a3f5c9d8Xy in logs")).toContain("api-key");
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
