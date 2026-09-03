import { createRequire } from "node:module";

import { catalogusSchemaV1, parseManifest } from "@catalogus/schema";
import { describe, expect, it } from "vitest";

import { buildViewPayload } from "./view-payload.js";

const MANIFEST = `catalogus: 1
project:
  name: Example App
  slug: example-app
  architecture: "two-tier"
  vcs:
    visibility: private
services:
  - id: host-api
    service: fly-io
    role: hosting-api
    added: 2025-11-02
  - id: ingress
    service: nginx
    kind: component
    role: ingress-proxy
    added: 2025-11-02
  - id: dotnet
    service: dotnet
    kind: stack
    version: "10"
    role: runtime-backend
    added: 2025-11-02
  - id: legacy-mailer
    service: mailgun
    role: email
    added: 2025-03-14
    status: phasing_out
    replaced_by: mailer
  - id: mailer
    service: resend
    role: email
    added: 2026-01-15
  - id: mystery
    service: some-slug-nobody-has-catalogued
    role: widget-thing
    added: 2026-01-01
  - id: llm
    service: openai
    role: ai-completion
    added: 2026-01-01
  - id: uptime
    service: healthchecks-io
    role: monitoring
    added: 2026-01-01
dependencies:
  - [host-api, ingress]
  - { from: host-api, to: dotnet, notes: "runs on .NET 10" }
`;

// Fixed rather than `new Date().toISOString()` -- buildViewPayload takes
// readAt as a plain parameter (see its own comment on why) precisely so
// tests like these can assert against a known value instead of a moving
// target.
const READ_AT = "2026-01-01T00:00:00.000Z";

async function parsedManifest() {
  const result = parseManifest(MANIFEST);
  if (!result.valid) {
    throw new Error(`fixture manifest failed to parse: ${result.errors.map((e) => e.message).join("; ")}`);
  }
  return result.manifest;
}

function findService(payload: Awaited<ReturnType<typeof buildViewPayload>>, id: string) {
  const service = payload.services.find((s) => s.id === id);
  if (!service) {
    throw new Error(`no service ${id} in payload`);
  }
  return service;
}

describe("buildViewPayload", () => {
  it("carries the manifest path and project fields through unchanged", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    expect(payload.manifestPath).toBe("/repo/catalogus.yaml");
    expect(payload.readAt).toBe(READ_AT);
    expect(payload.project).toEqual({
      name: "Example App",
      slug: "example-app",
      architecture: "two-tier",
      vcs: { visibility: "private" },
    });
  });

  // Asserted against package.json read here rather than against the literal
  // "0.0.1", because a literal in a test is the second hardcoded copy of the
  // version -- the exact thing cli.ts's `packageVersion()` exists to prevent,
  // and the exact way a version test goes on passing after the package is
  // bumped and the payload is not. The equality is what is under test; the
  // number is not this file's to know.
  it("states the version of the CLI that built it, read from the package rather than repeated", async () => {
    const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    expect(payload.cliVersion).toBe(pkg.version);
    expect(payload.cliVersion).not.toBe("");
  });

  // The same shape of check for the schema URL: `catalogusSchemaV1.$id` is the
  // one source, and it is also the string `catalogus init` writes into every
  // manifest's `$schema` modeline. Comparing the payload to that constant
  // fails if either side is retyped; comparing it to a literal here would only
  // prove that two literals match.
  it("states the schema URL as @catalogus/schema's own $id, not as a second copy of it", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    expect(payload.schemaUrl).toBe(catalogusSchemaV1.$id);
  });

  it("omits project fields the manifest never set, rather than inventing a placeholder", async () => {
    const minimal = parseManifest(`catalogus: 1
project:
  name: Minimal
  slug: minimal
services: []
dependencies: []
`);
    if (!minimal.valid) throw new Error("fixture should parse");
    const payload = await buildViewPayload("/repo/catalogus.yaml", minimal.manifest, READ_AT);
    expect(payload.project.architecture).toBeUndefined();
    expect(payload.project.vcs).toBeUndefined();
    expect(Object.keys(JSON.parse(JSON.stringify(payload.project))).sort()).toEqual(["name", "slug"]);
  });

  it("defaults kind to 'service' and status to 'active' when the entry omits them", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    const hostApi = findService(payload, "host-api");
    expect(hostApi.kind).toBe("service");
    expect(hostApi.status).toBe("active");
  });

  it("carries an explicit kind and version through for a stack entry", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    const dotnet = findService(payload, "dotnet");
    expect(dotnet.kind).toBe("stack");
    expect(dotnet.version).toBe("10");
  });

  it("carries kind: component through for a non-vendor infrastructure entry", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    const ingress = findService(payload, "ingress");
    expect(ingress.kind).toBe("component");
  });

  it("carries phasing_out status and replaced_by through together", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    const legacy = findService(payload, "legacy-mailer");
    expect(legacy.status).toBe("phasing_out");
    expect(legacy.replaced_by).toBe("mailer");
  });

  it("derives rollup as the segment of role before the first '-'", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    expect(findService(payload, "host-api").rollup).toBe("hosting");
    expect(findService(payload, "ingress").rollup).toBe("ingress");
    expect(findService(payload, "dotnet").rollup).toBe("runtime");
  });

  it("rolls up a role with no '-' at all to itself", async () => {
    const noHyphen = parseManifest(`catalogus: 1
project:
  name: X
  slug: x
services:
  - id: svc
    service: fly-io
    role: hosting
    added: 2025-01-01
dependencies: []
`);
    if (!noHyphen.valid) throw new Error("fixture should parse");
    const payload = await buildViewPayload("/repo/catalogus.yaml", noHyphen.manifest, READ_AT);
    expect(findService(payload, "svc").rollup).toBe("hosting");
  });

  it("marks a catalogued slug known, with its display name and a resolved simple-icons ResolvedIcon", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    const ingress = findService(payload, "ingress");
    expect(ingress.known).toBe(true);
    expect(ingress.name).toBe("Nginx");
    expect(ingress.icon).not.toBeNull();
    expect(ingress.icon!.viewBox).toBe("0 0 24 24");
    expect(ingress.icon!.body).toMatch(/^<path d="M/);
    expect(ingress.icon!.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("marks an uncatalogued slug unknown and renders the raw slug rather than a fabricated name", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    const mystery = findService(payload, "mystery");
    expect(mystery.known).toBe(false);
    expect(mystery.name).toBe("some-slug-nobody-has-catalogued");
    expect(mystery.icon).toBeNull();
  });

  // Until 2026-09-03 this entry was "openai": a catalog row with no verified
  // icon at all (simple-icons has no OpenAI mark, only an unrelated retired
  // "OpenAI Gym" one), and docs/PLAN.md's measured ~38% real catalog-icon
  // coverage made that the majority path worth a dedicated test. openai now
  // resolves through a vendored thesvg.org file instead (see
  // @catalogus/core's catalog.ts, THESVG_ICON_OVERLAY) -- the two tests below
  // split what that one test used to cover: this one for the icon llm now
  // has, the next for the majority-path case a different, still genuinely
  // iconless slug (healthchecks-io, absent from both simple-icons and
  // thesvg.org -- catalog.test.ts's own icon-resolution suite verifies
  // that directly) takes over.
  it("marks openai known, with its display name and a resolved thesvg ResolvedIcon (ink policy: currentColor, manifest hex)", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    const llm = findService(payload, "llm");
    expect(llm.known).toBe(true);
    expect(llm.name).toBe("OpenAI");
    expect(llm.icon).not.toBeNull();
    expect(llm.icon!.hex).toBe("#000000");
    expect(llm.icon!.body).toContain('fill="currentColor"');
  });

  it("marks a catalogued slug with no verified icon known, with its display name and a null icon -- the majority real-world path", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    const uptime = findService(payload, "uptime");
    expect(uptime.known).toBe(true);
    expect(uptime.name).toBe("Healthchecks.io");
    expect(uptime.icon).toBeNull();
  });

  it("normalizes both edge forms (tuple and object) to plain {from, to}", async () => {
    const payload = await buildViewPayload("/repo/catalogus.yaml", await parsedManifest(), READ_AT);
    expect(payload.edges).toEqual([
      { from: "host-api", to: "ingress" },
      { from: "host-api", to: "dotnet" },
    ]);
  });
});
