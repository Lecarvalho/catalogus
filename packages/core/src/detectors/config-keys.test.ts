import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONFIG_KEY_CATALOG, detectConfigKeys } from "./config-keys.js";
import { fixturePath } from "../test-support/fixture-path.js";

/** The sentinel written into two fixtures as a config *value*. It must never appear in a result. */
const SENTINEL = "SENTINEL-VALUE-MUST-NOT-LEAK";

describe("detectConfigKeys", () => {
  // The measurement that justified this detector: against Clapline,
  // @specfy/stack-analyser found none of the ten services wired through
  // appsettings*.json -- not the database, not the payment processor. This
  // fixture mirrors that repo's shape (a .NET API three directories deep,
  // two environment-specific settings files) and pins all ten.
  it("finds every config-wired service in a .NET backend, the case the dependency scanner misses", async () => {
    const result = await detectConfigKeys(fixturePath("config-keys", "dotnet-backend"));

    expect(result.warnings).toEqual([]);
    // Ordered by category then slug, which detectConfigKeys promises and
    // this list therefore encodes: ai, db, messaging, monitoring, payments,
    // storage. Resend and OpenTelemetry moved out of `other`/`analytics`
    // when HANDOFF §4's enum was widened on 2026-08-23, which is why they
    // sit where they do rather than where they used to.
    expect(result.services.map((s) => s.slug)).toEqual([
      "anthropic",
      "elevenlabs",
      "google-vertex-ai",
      "openai",
      "xai",
      "supabase",
      "resend",
      "opentelemetry",
      "stripe",
      "aws-s3",
    ]);
  });

  it("names the file and the key that proved each detection", async () => {
    const result = await detectConfigKeys(fixturePath("config-keys", "dotnet-backend"));
    const supabase = result.services.find((s) => s.slug === "supabase");

    expect(supabase?.evidence).toEqual([
      {
        file: "src/backend/Api/appsettings.Development.json",
        detail: "config key: Supabase",
      },
    ]);
  });

  it("folds one service named by two settings files into a single entry with both files as evidence", async () => {
    const result = await detectConfigKeys(fixturePath("config-keys", "dotnet-backend"));
    const stripe = result.services.filter((s) => s.slug === "stripe");

    expect(stripe).toHaveLength(1);
    expect(stripe[0]?.evidence.map((e) => e.file)).toEqual([
      "src/backend/Api/appsettings.Development.json",
      "src/backend/Api/appsettings.json",
    ]);
  });

  // A .NET build copies appsettings*.json into bin/ and obj/. Reading those
  // back reports the same service two or three times over under paths that
  // are not source, which makes the evidence trail useless for answering
  // "where is this configured?".
  it("ignores build-output copies of a settings file", async () => {
    const result = await detectConfigKeys(fixturePath("config-keys", "dotnet-backend"));
    expect(result.services.map((s) => s.slug)).not.toContain("datadog");
  });

  it("reads a key group's own child key names to tell a general provider from the specific service", async () => {
    const result = await detectConfigKeys(fixturePath("config-keys", "dotnet-backend"));

    // `AWS` with a Bucket child is S3 (storage), not a bare "you use AWS".
    const s3 = result.services.find((s) => s.slug === "aws-s3");
    expect(s3).toMatchObject({ category: "storage", name: "Amazon S3" });
    expect(result.services.map((s) => s.slug)).not.toContain("aws");

    // `Gemini` with a GCP project id is Vertex AI -- a different account and
    // a different bill from the public Gemini API.
    const vertex = result.services.find((s) => s.slug === "google-vertex-ai");
    expect(vertex).toMatchObject({ category: "ai", name: "Vertex AI" });
    expect(result.services.map((s) => s.slug)).not.toContain("google-gemini");
  });

  it("reads variable names out of a .env template, and matches whole tokens only", async () => {
    const result = await detectConfigKeys(fixturePath("config-keys", "env-example"));

    // NOTIONAL_VALUE, AWSOME_FEATURE and LINEARIZE_OUTPUT each open with a
    // catalog alias as a *substring*. Matching on whole tokens is what keeps
    // them out, and their absence from this list is the assertion.
    expect(result.services.map((s) => s.slug)).toEqual(["elevenlabs", "openai", "clerk", "supabase"]);
  });

  it("reads docker-compose service names and the NAME=value form of an environment list", async () => {
    const result = await detectConfigKeys(fixturePath("config-keys", "compose"));

    expect(result.services.map((s) => s.slug).sort()).toEqual([
      "grafana-loki",
      "postgresql",
      "redis",
      "resend",
      "sentry",
    ]);
  });

  it("reads yaml under config/, where a bare filename says nothing on its own", async () => {
    const result = await detectConfigKeys(fixturePath("config-keys", "rails-config"));
    // messaging before other, per the category-then-slug ordering.
    expect(result.services.map((s) => s.slug)).toEqual(["mailgun", "algolia"]);
  });

  it("returns nothing for a repo with no configuration files worth reading", async () => {
    const result = await detectConfigKeys(fixturePath("config-keys", "none"));
    expect(result.services).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  // A .NET settings file with JSONC comments is ordinary and is not valid
  // JSON. Swallowing that would make "this project configures nothing" and
  // "the parser gave up" the same answer.
  it("warns rather than going silent when a settings file exists but does not parse", async () => {
    const result = await detectConfigKeys(fixturePath("config-keys", "unparseable"));
    expect(result.services).toEqual([]);
    expect(result.warnings).toEqual(["appsettings.json: present but could not be parsed as JSON"]);
  });

  describe("the no-values contract", () => {
    it("never carries a configuration value into the result, from a yaml or a .env template", async () => {
      for (const fixture of ["rails-config", "env-example"]) {
        const result = await detectConfigKeys(fixturePath("config-keys", fixture));
        expect(JSON.stringify(result), `${fixture} leaked a config value`).not.toContain(SENTINEL);
        expect(result.services.length, `${fixture} detected nothing, so this proves nothing`).toBeGreaterThan(0);
      }
    });

    // A real `.env` is the file most likely to hold live credentials. The
    // detector reads names only, so opening one would still be safe -- but
    // the cheapest way to never leak a secret is to never open the file, and
    // this pins that it doesn't.
    it("never opens a bare .env, only .env.example-style templates", async () => {
      const dir = await mkdtemp(join(tmpdir(), "dagstree-config-keys-"));
      try {
        await writeFile(join(dir, ".env"), `STRIPE_SECRET_KEY=${SENTINEL}\nSUPABASE_URL=\n`, "utf8");
        const result = await detectConfigKeys(dir);
        expect(result.services).toEqual([]);
        expect(result.warnings).toEqual([]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("the catalog", () => {
    it("has no alias claimed by two different entries", () => {
      const owner = new Map<string, string>();
      const collisions: string[] = [];
      for (const entry of CONFIG_KEY_CATALOG) {
        for (const alias of entry.aliases) {
          const previous = owner.get(alias);
          if (previous && previous !== entry.slug) {
            collisions.push(`"${alias}" is claimed by both ${previous} and ${entry.slug}`);
          }
          owner.set(alias, entry.slug);
        }
      }
      expect(collisions).toEqual([]);
    });

    // An alias is compared against a key name that has already been
    // lowercased and stripped to letters and digits. An alias carrying a
    // capital, a dash or a dot can therefore never match anything, and would
    // sit in the table looking like coverage it doesn't provide.
    it("holds every alias in the normalised form key names are compared in", () => {
      const malformed = CONFIG_KEY_CATALOG.flatMap((entry) =>
        entry.aliases.filter((alias) => !/^[a-z0-9]+$/.test(alias)).map((alias) => `${entry.slug}: "${alias}"`)
      );
      expect(malformed).toEqual([]);
    });

    // The manifest schema's slug pattern. A detection the CLI cannot write
    // into dagstree.yaml is a detection that dead-ends.
    it("emits only slugs the manifest schema accepts", () => {
      const pattern = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
      const bad = CONFIG_KEY_CATALOG.flatMap((entry) =>
        [entry.slug, ...(entry.refine ?? []).map((rule) => rule.slug)].filter((slug) => !pattern.test(slug))
      );
      expect(bad).toEqual([]);
    });
  });
});
