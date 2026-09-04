import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runIcons } from "./icons.js";

const CLEAN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' + '<path d="M1 1h2v2h-2z" fill="#123456"/></svg>';

const HOSTILE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0"/></svg>';

// One entry of each source `catalogus icons` reports: nginx (simple-icons),
// openai (thesvg -- see @catalogus/core's catalog.ts THESVG_ICON_OVERLAY),
// loki with a vendored local file, and healthchecks-io, a real catalogued
// slug with genuinely no verified icon in either catalog (the majority
// real-world case -- see view-payload.test.ts's own "uptime" fixture).
const MANIFEST = `catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: ingress
    service: nginx
    role: ingress-proxy
    added: 2025-11-02
  - id: llm
    service: openai
    role: ai-completion
    added: 2026-01-01
  - id: loki
    service: loki
    role: logging
    added: 2026-01-01
    icon: .catalogus/icons/loki.svg
  - id: uptime
    service: healthchecks-io
    role: monitoring
    added: 2026-01-01
dependencies: []
`;

describe("runIcons", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it("fails with the same not-found message every other read command gives when there is no manifest", async () => {
    const result = await runIcons(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("catalogus init");
  });

  it("prints one row per service, in manifest order, with the right source and detail for each, and a correct summary", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", MANIFEST);
    await mkdir(join(dir, ".catalogus", "icons"), { recursive: true });
    await writeFixtureFile(dir, ".catalogus/icons/loki.svg", CLEAN_SVG);

    const result = await runIcons(dir);
    expect(result.exitCode).toBe(0);

    const rows = result.stdout.slice(0, -1);
    expect(rows).toEqual([
      "ingress  nginx  simple-icons",
      "llm  openai  thesvg",
      "loki  loki  local  .catalogus/icons/loki.svg",
      "uptime  healthchecks-io  none  catalogus set services.uptime.icon <https-url|path>",
    ]);

    // D5 (validator, 2026-09-04): the missing count is the sentence's
    // subject, so both "service(s)" and "has/have" agree with it, not with
    // the total -- "1 service of 4 has no icon" reads the way "1 of 5
    // apples is red" would if it put the count-word first instead of
    // burying it after "of".
    expect(result.stdout.at(-1)).toBe("1 service of 4 has no icon.");
  });

  it("suffixes the local detail with ' (missing file)' when the vendored file is genuinely absent, and still counts it in the summary", async () => {
    // No .catalogus/icons/loki.svg written this time -- the pointer is
    // stale because nothing was ever fetched.
    await writeFixtureFile(dir, "catalogus.yaml", MANIFEST);

    const result = await runIcons(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("loki  loki  local  .catalogus/icons/loki.svg (missing file)");
    // loki has no catalog fallback (it isn't a catalogued slug) -- so this
    // stale entry also renders no icon at all, and the summary must say so,
    // matching the "which tiles show initials" agreement view.ts keeps.
    expect(result.stdout.at(-1)).toBe("2 services of 4 have no icon.");
  });

  // D3 (validator, 2026-09-04): before this fix, a file that exists but the
  // sanitiser refuses was labelled exactly the same as one that was never
  // fetched at all -- both "(missing file)" -- which sends an agent
  // following the skill's 7b loop back to re-fetch the same URL into the
  // same refusal. The label now has to say which case this is.
  it("suffixes the local detail with '(refused: <reason>)' -- not '(missing file)' -- when the vendored file exists but the sanitiser refuses it", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", MANIFEST);
    await mkdir(join(dir, ".catalogus", "icons"), { recursive: true });
    await writeFixtureFile(dir, ".catalogus/icons/loki.svg", HOSTILE_SVG);

    const result = await runIcons(dir);
    expect(result.exitCode).toBe(0);
    const lokiRow = result.stdout.find((row) => row.startsWith("loki  "));
    expect(lokiRow).toBeDefined();
    expect(lokiRow).not.toContain("(missing file)");
    expect(lokiRow).toMatch(/\(refused: .*sanitiser/i);
  });

  it("uses singular forms at exactly one, on both sides of the summary sentence", async () => {
    const oneService = `catalogus: 1
project:
  name: Solo
  slug: solo
services:
  - id: svc
    service: some-slug-nobody-has-catalogued
    role: widget-thing
    added: 2026-01-01
dependencies: []
`;
    await writeFixtureFile(dir, "catalogus.yaml", oneService);

    const result = await runIcons(dir);
    expect(result.stdout.at(-1)).toBe("1 service of 1 has no icon.");
  });

  it("reports N services of N have no icon in the plural when every entry resolves, and the count is zero", async () => {
    const allResolved = `catalogus: 1
project:
  name: Resolved
  slug: resolved
services:
  - id: ingress
    service: nginx
    role: ingress-proxy
    added: 2025-11-02
dependencies: []
`;
    await writeFixtureFile(dir, "catalogus.yaml", allResolved);

    const result = await runIcons(dir);
    expect(result.stdout.at(-1)).toBe("0 services of 1 have no icon.");
  });
});
