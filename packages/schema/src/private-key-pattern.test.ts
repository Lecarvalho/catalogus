import { describe, expect, it } from "vitest";
import {
  DENIED_KEY_WORDS,
  PRIVATE_KEY_REGEX,
  looksLikePrivateKey,
} from "./private-key-pattern.js";

describe("looksLikePrivateKey", () => {
  it("matches every denied word verbatim", () => {
    for (const word of DENIED_KEY_WORDS) {
      expect(looksLikePrivateKey(word), `expected "${word}" to match`).toBe(true);
    }
  });

  // JSON Schema `pattern` has no inline case-insensitive flag every
  // implementation honors, so the pattern is built from explicit [aA]
  // character classes instead. These are exactly the variants HANDOFF.md's
  // guardrail section calls out by name.
  it("matches regardless of case and common separators", () => {
    const variants = [
      "Cost",
      "COST",
      "cost_amount",
      "costAmount",
      "monthly-cost",
      "billing_cycle",
      "Billing",
      "ACCOUNT_ID",
      "accountId",
      "api-key",
      "apiKey",
      "API_KEY",
      "PlanTier",
      "plan-tier",
    ];
    for (const variant of variants) {
      expect(looksLikePrivateKey(variant), `expected "${variant}" to match`).toBe(true);
    }
  });

  it("matches a private-shaped word embedded in a longer property name", () => {
    for (const name of ["monthly_cost_usd", "stripe_account_ref", "vendor_invoice_number"]) {
      expect(looksLikePrivateKey(name), `expected "${name}" to match`).toBe(true);
    }
  });

  it("does not flag every real dagstree.yaml property name", () => {
    const legitimateNames = [
      "dagstree",
      "project",
      "name",
      "slug",
      "architecture",
      "pm",
      "vcs",
      "provider",
      "visibility",
      "coding_agents",
      "services",
      "id",
      "service",
      "role",
      "added",
      "status",
      "replaced_by",
      "notes",
      "dependencies",
      "from",
      "to",
    ];
    for (const name of legitimateNames) {
      expect(looksLikePrivateKey(name), `expected "${name}" NOT to match`).toBe(false);
    }
  });

  // looksLikePrivateKey has no idea whether the string it's given is a
  // property name or a free-text value — it would happily flag a sentence
  // that mentions "cost". That's fine: the deny rule is meant to target
  // property *names*, and it's validate.ts's/the schema's job to only ever
  // run this check against object keys, never against string values (see
  // schema.test.ts's "free text values are not the target" case for proof
  // a notes string containing "cost" passes real validation).
  it("would flag ordinary prose too, which is why it's only ever applied to property names", () => {
    expect(PRIVATE_KEY_REGEX.test("this service costs a lot but is worth it")).toBe(true);
  });
});
