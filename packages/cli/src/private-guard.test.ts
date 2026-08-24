import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { hasBlockingPrivateFreeText, looksLikePrivateFlagName, privateFlagRefusalMessage } from "./private-guard.js";

describe("looksLikePrivateFlagName", () => {
  it("flags an unknown flag that names Layer 3 data", () => {
    expect(looksLikePrivateFlagName("cost")).toBe(true);
    expect(looksLikePrivateFlagName("account")).toBe(true);
    expect(looksLikePrivateFlagName("billing-cycle")).toBe(true);
  });

  it("does not flag catalogus's own fixed flag names", () => {
    expect(looksLikePrivateFlagName("role")).toBe(false);
    expect(looksLikePrivateFlagName("id")).toBe(false);
    expect(looksLikePrivateFlagName("service")).toBe(false);
    expect(looksLikePrivateFlagName("depends-on")).toBe(false);
    expect(looksLikePrivateFlagName("notes")).toBe(false);
    expect(looksLikePrivateFlagName("added")).toBe(false);
  });
});

describe("privateFlagRefusalMessage", () => {
  it("names the flag and points at the private overlay", () => {
    const message = privateFlagRefusalMessage("--cost");
    expect(message).toContain("--cost");
    expect(message).toContain("push --private");
  });
});

describe("hasBlockingPrivateFreeText", () => {
  // add/init's write-time gate only refuses on a HARD hit now -- a merely
  // SOFT hit (a bare billing-adjacent keyword) is not blocked here; it
  // surfaces as a warning on the successful CommandResult instead (see
  // add.test.ts / init.test.ts), the same way `catalogus validate` treats
  // it. See this module's header comment for why that changed.

  it("flags an email address (hard)", () => {
    expect(hasBlockingPrivateFreeText("contact dsnk@example.com for access")).toBe(true);
  });

  it("flags a currency amount, symbol or code (hard)", () => {
    expect(hasBlockingPrivateFreeText("cost 42 USD/month")).toBe(true);
    expect(hasBlockingPrivateFreeText("$42/month")).toBe(true);
    expect(hasBlockingPrivateFreeText("about 15 EUR per seat")).toBe(true);
  });

  it("flags a card-like digit run (hard)", () => {
    expect(hasBlockingPrivateFreeText("card ending in 4111 1111 1111 1111")).toBe(true);
  });

  it("flags an API-key-shaped string (hard)", () => {
    expect(hasBlockingPrivateFreeText("rotate sk-abcdefghijklmnopqrstuvwxyz123456 soon")).toBe(true);
  });

  it("does not block on a bare billing-adjacent keyword alone (soft only)", () => {
    expect(hasBlockingPrivateFreeText("billing: net-30")).toBe(false);
    expect(hasBlockingPrivateFreeText("billing account for this project")).toBe(false);
    expect(hasBlockingPrivateFreeText("plan tier pro")).toBe(false);
    // Bare "renewal" alone, no email/currency/date nearby -- exactly what
    // `catalogus init`'s pm-answer test exercises (init.test.ts).
    expect(hasBlockingPrivateFreeText("renewal is automated via GitHub Actions")).toBe(false);
  });

  it("does not block a soft keyword sitting next to a bare date (still no hard shape present)", () => {
    expect(hasBlockingPrivateFreeText("renewal 2027-01-01")).toBe(false);
  });

  it("still blocks when a soft keyword is combined with a genuine hard hit", () => {
    expect(
      hasBlockingPrivateFreeText("billing account dsnk@example.com, cost 42 USD/month, plan tier pro, renewal 2027-01-01"),
    ).toBe(true);
  });

  it("does not flag ordinary public prose that happens to share vocabulary", () => {
    expect(hasBlockingPrivateFreeText("migrated user auth from cognito to supabase")).toBe(false);
    expect(hasBlockingPrivateFreeText("primary datastore for the checkout flow")).toBe(false);
    expect(hasBlockingPrivateFreeText("keyed by workspace id in the cache layer")).toBe(false);
    expect(hasBlockingPrivateFreeText("modular monolith (.NET 10, vertical slices)")).toBe(false);
    expect(hasBlockingPrivateFreeText("upgraded to Next.js 15.4 in March")).toBe(false);
    expect(hasBlockingPrivateFreeText("costs are tracked in the private overlay, not here")).toBe(false);
    expect(hasBlockingPrivateFreeText("migrated off Vertex on 2026-06-01")).toBe(false);
  });
});

describe("no duplicate pattern list", () => {
  // The whole point of FIX 1 is that there is exactly one implementation of
  // these patterns, in @catalogus/schema -- a second copy here is precisely
  // how the two silently drift apart. This reads the module's own source
  // and fails if any of the distinctive regex fragments the old, pre-fix
  // local implementation used ever reappear, or if the module stops
  // importing the shared guard from @catalogus/schema.
  const sourcePath = fileURLToPath(new URL("./private-guard.ts", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");

  it("imports the free-text guard from @catalogus/schema rather than defining its own", () => {
    expect(source).toMatch(/from ["']@catalogus\/schema["']/);
    expect(source).toMatch(/scanFreeTextForPrivateValues/);
  });

  it("does not construct its own free-text regexes", () => {
    // Fingerprints of the patterns that belong solely in
    // free-text-guard.ts: an email-address character class, an explicit
    // currency-code list, and a hand-rolled RegExp construction. None of
    // these should ever appear in this file again.
    expect(source).not.toMatch(/\[a-z0-9._%+-]/i);
    expect(source).not.toMatch(/USD.*EUR.*GBP/s);
    expect(source).not.toMatch(/new RegExp\(/);
    expect(source).not.toContain("DENIED_KEY_WORDS.join");
  });
});
