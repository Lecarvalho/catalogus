import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { MAX_ICON_BYTES } from "@catalogus/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runSet, SETTABLE_FIELDS } from "./set.js";

const CLEAN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' + '<path d="M1 1h2v2h-2z" fill="#123456"/></svg>';

const HOSTILE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0"/></svg>';

/** A `typeof fetch`-shaped stub keyed by URL string -- see icon-fetch.test.ts's own copy of this helper for why the fetcher is injected rather than opening a real socket. */
function stubFetch(byUrl: Record<string, Response>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const response = byUrl[url];
    if (!response) {
      throw new Error(`stubFetch: no canned response for "${url}"`);
    }
    return response;
  }) as typeof fetch;
}

async function iconsDirEntries(dir: string): Promise<string[]> {
  try {
    return await readdir(join(dir, ".catalogus", "icons"));
  } catch {
    return [];
  }
}

// Deliberately minimal: `project` carries only what init scaffolds, so
// setting vcs has to build the block rather than edit one that exists.
const SCAFFOLD = `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
catalogus: 1
project:
  name: Example App
  slug: example-app
services: []
dependencies: []
`;

// A second fixture, carrying real service entries, for services.<id>.role
// -- the empty-services SCAFFOLD above can't exercise id resolution at all.
const SCAFFOLD_WITH_SERVICES = `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: heroku-api
    service: heroku
    role: hosting
    added: 2024-01-10
  - id: fly-api
    service: fly-io
    role: hosting
    added: 2025-11-02
dependencies: []
`;

describe("runSet", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  async function manifestText(): Promise<string> {
    return readFile(join(dir, "catalogus.yaml"), "utf8");
  }

  it("sets a free-text field and leaves comments and the modeline intact", async () => {
    const result = await runSet(dir, ["project.architecture", "two-tier: .NET API + React SPA"]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("yaml-language-server");
    expect(text).toContain("Hand-written header comment");
    expect(text).toContain("two-tier: .NET API + React SPA");
  });

  // project.vcs carries only visibility as of the 2026-08-24 amendment (the
  // provider is a service entry now, added with `catalogus add <provider>
  // --role vcs`) -- so setting visibility alone is enough; there is no
  // second half to write together, and no half-built state to refuse.
  it("writes project.vcs.visibility on its own", async () => {
    const result = await runSet(dir, ["project.vcs.visibility", "private"]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("visibility: private");
    expect(text).not.toContain("provider:");
  });

  it("rejects project.pm, project.vcs.provider and project.coding_agents, naming the `catalogus add` command that replaced each", async () => {
    const expectations: Array<[string, string]> = [
      ["project.pm", "catalogus add trello --role pm"],
      ["project.vcs.provider", "catalogus add github --role vcs"],
      ["project.coding_agents", "catalogus add claude-code --role coding-agent"],
    ];
    for (const [field, hint] of expectations) {
      const result = await runSet(dir, [field, "github"]);
      expect(result.exitCode).toBe(2);
      const stderr = result.stderr.join("\n");
      expect(stderr).toContain("no longer a settable field");
      expect(stderr).toContain(hint);
    }
  });

  it("rejects an unknown field and names the ones that exist", async () => {
    const result = await runSet(dir, ["project.budget", "1000"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("Unknown field");
    for (const field of SETTABLE_FIELDS) {
      expect(result.stderr.join("\n")).toContain(field);
    }
  });

  it("rejects an odd number of positional tokens", async () => {
    const result = await runSet(dir, ["project.architecture", "two-tier", "project.vcs.visibility"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("<field> <value> pairs");
  });

  it("rejects the same field given twice in one call", async () => {
    const result = await runSet(dir, ["project.architecture", "two-tier", "project.architecture", "monolith"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("twice");
  });

  it("rejects a non-slug value for a slug field", async () => {
    const result = await runSet(dir, ["project.vcs.visibility", "Not A Slug"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("not a valid slug");
  });

  it("rejects a value the schema's own enum does not allow, and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.vcs.visibility", "secret"]);
    expect(result.exitCode).toBe(1);
    expect(await manifestText()).toBe(before);
  });

  // Layer 3 data must never reach a file that gets committed. The
  // full-document guard would catch this at write time too; refusing here
  // names the value the user typed.
  it("refuses a value carrying private data and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.architecture", "Trello, billed to finance@example.com"]);

    expect(result.exitCode).toBe(2);
    expect(await manifestText()).toBe(before);
  });

  it("validates every pair before touching the file, so a bad second pair leaves the first unwritten", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.name", "Real Name", "project.architecture", ""]);

    expect(result.exitCode).toBe(2);
    expect(await manifestText()).toBe(before);
  });

  it("fails with exit 2 when there is no manifest to edit", async () => {
    const empty = await createTempDir();
    try {
      const result = await runSet(empty, ["project.architecture", "two-tier"]);
      expect(result.exitCode).toBe(2);
    } finally {
      await removeTempDir(empty);
    }
  });

  // The field init used to own exclusively: a wrong project.name guessed
  // from a directory name by `init --yes` had no command that could fix it
  // before this. See this file's module comment.
  it("sets project.name and leaves comments and the modeline intact", async () => {
    const result = await runSet(dir, ["project.name", "Real Project Name"]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("yaml-language-server");
    expect(text).toContain("Hand-written header comment");
    expect(text).toContain("name: Real Project Name");
  });

  it("rejects an empty project.name and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.name", "   "]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("empty");
    expect(await manifestText()).toBe(before);
  });

  it("sets project.slug to a valid slug", async () => {
    const result = await runSet(dir, ["project.slug", "real-project-name"]);
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("slug: real-project-name");
  });

  it("rejects a project.slug that does not match the slug pattern and writes nothing", async () => {
    const before = await manifestText();
    const result = await runSet(dir, ["project.slug", "Not A Slug"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("not a valid slug");
    expect(await manifestText()).toBe(before);
  });

  describe("services.<id>.role", () => {
    beforeEach(async () => {
      await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD_WITH_SERVICES);
    });

    it("changes the role on the named entry only", async () => {
      const result = await runSet(dir, ["services.fly-api.role", "database"]);
      expect(result.exitCode).toBe(0);

      const text = await manifestText();
      expect(text).toContain("id: heroku-api");
      expect(text).toMatch(/id: heroku-api[\s\S]*?role: hosting/);
      expect(text).toMatch(/id: fly-api[\s\S]*?role: database/);
    });

    it("sets kind and version, the two per-entry fields added on 2026-08-23", async () => {
      const result = await runSet(dir, ["services.fly-api.kind", "component", "services.fly-api.version", "15.4"]);
      expect(result.exitCode).toBe(0);

      const text = await manifestText();
      expect(text).toMatch(/id: fly-api[\s\S]*?kind: component/);
      expect(text).toMatch(/id: fly-api[\s\S]*?version: "?15\.4"?/);
    });

    it("refuses a kind outside the schema enum, naming the three legal values", async () => {
      const before = await manifestText();
      const result = await runSet(dir, ["services.fly-api.kind", "vendor"]);
      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("!!")).toContain("service, component, stack");
      expect(await manifestText()).toBe(before);
    });

    // version is text, not a slug: "13.1.3" has dots in it, and the slug
    // check every other per-entry field uses would reject the most ordinary
    // version string there is.
    it("accepts a dotted version string", async () => {
      const result = await runSet(dir, ["services.fly-api.version", "13.1.3"]);
      expect(result.exitCode).toBe(0);
      expect(await manifestText()).toMatch(/version: "?13\.1\.3"?/);
    });

    it("rejects an unknown id, exit 1, with known ids listed, and writes nothing", async () => {
      const before = await manifestText();
      const result = await runSet(dir, ["services.nonexistent.role", "database"]);

      expect(result.exitCode).toBe(1);
      const stderr = result.stderr.join("\n");
      expect(stderr).toContain("no service with id");
      expect(stderr).toContain("known ids");
      expect(stderr).toContain("heroku-api");
      expect(stderr).toContain("fly-api");
      expect(await manifestText()).toBe(before);
    });

    it("rejects a malformed role value the same way a malformed slug fails elsewhere", async () => {
      const before = await manifestText();
      const result = await runSet(dir, ["services.fly-api.role", "Not A Role"]);

      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("\n")).toContain("not a valid slug");
      expect(await manifestText()).toBe(before);
    });

    it("rejects a malformed id inside the field name before the manifest is opened", async () => {
      const before = await manifestText();
      const result = await runSet(dir, ["services.Not Valid.role", "database"]);

      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("\n")).toContain("not a valid local id");
      expect(await manifestText()).toBe(before);
    });

    it("leaves the first pair of a two-pair call unwritten when the second names an unknown id", async () => {
      const before = await manifestText();
      const result = await runSet(dir, [
        "services.heroku-api.role",
        "hosting-api",
        "services.nonexistent.role",
        "database",
      ]);

      expect(result.exitCode).toBe(1);
      expect(await manifestText()).toBe(before);
    });

    it("can be combined with a project-level field in one call", async () => {
      const result = await runSet(dir, ["project.architecture", "two-tier", "services.fly-api.role", "database"]);
      expect(result.exitCode).toBe(0);

      const text = await manifestText();
      expect(text).toContain("architecture: two-tier");
      expect(text).toMatch(/id: fly-api[\s\S]*?role: database/);
    });
  });

  describe("services.<id>.icon", () => {
    beforeEach(async () => {
      await writeFixtureFile(dir, "catalogus.yaml", SCAFFOLD_WITH_SERVICES);
    });

    it("fetches an https:// URL (injected fetcher), vendors it, writes the field, and comments only the origin and filename", async () => {
      const url = "https://example.test/marks/fly-api.svg?sig=deadbeef&x=1";
      const fetchImpl = stubFetch({ [url]: new Response(CLEAN_SVG, { status: 200 }) });

      const result = await runSet(dir, ["services.fly-api.icon", url], fetchImpl);
      expect(result.exitCode).toBe(0);

      const text = await manifestText();
      expect(text).toContain("icon: .catalogus/icons/fly-api.svg");
      // No-secrets (validator, 2026-09-04): the "marks" path segment
      // between the origin and the filename is dropped along with the
      // query string -- only origin + final filename ever land in a
      // comment this repo commits. See icon-fetch.test.ts's own path-token
      // cases for the shapes this closes that a query-string-only strip
      // missed entirely.
      expect(text).toContain("# fetched from https://example.test (fly-api.svg) on");
      expect(text).not.toContain("marks");
      expect(text).not.toContain("sig=deadbeef");

      expect(await readFile(join(dir, ".catalogus", "icons", "fly-api.svg"), "utf8")).toBe(CLEAN_SVG);
    });

    // No-secrets (validator, 2026-09-04): a presigned URL's token can sit in
    // the path itself, with no query string at all -- run end to end
    // through `set` (not just icon-fetch.ts's own unit test) so the fix is
    // proven at the same layer the validator reproduced the leak against.
    it("drops a path-embedded token from the comment -- a matrix parameter with no query string involved", async () => {
      const url = "https://cdn.example.test/clean.svg;sig=deadbeefdeadbeefdeadbeefdeadbeef";
      const fetchImpl = stubFetch({ [url]: new Response(CLEAN_SVG, { status: 200 }) });

      const result = await runSet(dir, ["services.fly-api.icon", url], fetchImpl);
      expect(result.exitCode).toBe(0);

      const text = await manifestText();
      expect(text).toContain("# fetched from https://cdn.example.test (clean.svg) on");
      expect(text).not.toContain("deadbeef");
    });

    it("copies a local path, vendors it, and writes the field with no comment", async () => {
      const sourceDir = await createTempDir();
      try {
        const sourcePath = await writeFixtureFile(sourceDir, "source.svg", CLEAN_SVG);
        const result = await runSet(dir, ["services.fly-api.icon", sourcePath]);
        expect(result.exitCode).toBe(0);

        const text = await manifestText();
        expect(text).toContain("icon: .catalogus/icons/fly-api.svg");
        expect(text).not.toContain("# fetched");
        expect(await readFile(join(dir, ".catalogus", "icons", "fly-api.svg"), "utf8")).toBe(CLEAN_SVG);
      } finally {
        await removeTempDir(sourceDir);
      }
    });

    it("accepts the already-vendored file's own path a second time -- no self-copy, no error", async () => {
      const sourceDir = await createTempDir();
      try {
        const sourcePath = await writeFixtureFile(sourceDir, "source.svg", CLEAN_SVG);
        const first = await runSet(dir, ["services.fly-api.icon", sourcePath]);
        expect(first.exitCode).toBe(0);

        const vendoredPath = join(dir, ".catalogus", "icons", "fly-api.svg");
        const second = await runSet(dir, ["services.fly-api.icon", vendoredPath]);
        expect(second.exitCode).toBe(0);

        expect(await readFile(vendoredPath, "utf8")).toBe(CLEAN_SVG);
        expect(await iconsDirEntries(dir)).toEqual(["fly-api.svg"]);
      } finally {
        await removeTempDir(sourceDir);
      }
    });

    it("refuses an http:// URL, exit 2, naming the two accepted shapes, with nothing written", async () => {
      const before = await manifestText();
      const result = await runSet(dir, ["services.fly-api.icon", "http://example.com/mark.svg"]);

      expect(result.exitCode).toBe(2);
      const stderr = result.stderr.join("\n");
      expect(stderr).toContain("https://");
      expect(stderr).toContain("local SVG file");
      expect(await manifestText()).toBe(before);
      expect(await iconsDirEntries(dir)).toEqual([]);
    });

    it("refuses ftp:, a bare thesvg: ref, and a bare slug the same way -- all exit 2, nothing written", async () => {
      const before = await manifestText();
      for (const value of ["ftp://example.com/mark.svg", "thesvg:aws", "loki"]) {
        const result = await runSet(dir, ["services.fly-api.icon", value]);
        expect(result.exitCode, `value "${value}"`).toBe(2);
      }
      expect(await manifestText()).toBe(before);
    });

    it("accepts a Windows drive-letter local path without mistaking it for a URL scheme", async () => {
      const sourceDir = await createTempDir();
      try {
        const sourcePath = await writeFixtureFile(sourceDir, "source.svg", CLEAN_SVG);
        // sourcePath is already an absolute Windows path on this dev
        // machine (e.g. "C:\Users\...\source.svg") -- classifyIconValue
        // must read the leading "C:" as a drive letter, not a rejected URL
        // scheme.
        const result = await runSet(dir, ["services.fly-api.icon", sourcePath]);
        expect(result.exitCode).toBe(0);
      } finally {
        await removeTempDir(sourceDir);
      }
    });

    it("refuses a hostile SVG (a <script> tag): the temp file is gone and the manifest is untouched", async () => {
      const before = await manifestText();
      const url = "https://example.test/hostile.svg";
      const fetchImpl = stubFetch({ [url]: new Response(HOSTILE_SVG, { status: 200 }) });

      const result = await runSet(dir, ["services.fly-api.icon", url], fetchImpl);

      expect(result.exitCode).toBe(1);
      expect(await manifestText()).toBe(before);
      expect(await iconsDirEntries(dir)).toEqual([]);
    });

    it("refuses a body over the size cap", async () => {
      const before = await manifestText();
      const url = "https://example.test/huge.svg";
      const fetchImpl = stubFetch({ [url]: new Response("a".repeat(MAX_ICON_BYTES + 1000), { status: 200 }) });

      const result = await runSet(dir, ["services.fly-api.icon", url], fetchImpl);

      expect(result.exitCode).toBe(1);
      expect(await manifestText()).toBe(before);
      expect(await iconsDirEntries(dir)).toEqual([]);
    });

    it("refuses an unknown id before any fetch happens -- the fetcher is never called", async () => {
      const before = await manifestText();
      let fetchWasCalled = false;
      const fetchImpl = (async () => {
        fetchWasCalled = true;
        throw new Error("must not be called");
      }) as typeof fetch;

      const result = await runSet(dir, ["services.nonexistent.icon", "https://example.test/mark.svg"], fetchImpl);

      expect(result.exitCode).toBe(1);
      expect(fetchWasCalled).toBe(false);
      expect(await manifestText()).toBe(before);
      expect(await iconsDirEntries(dir)).toEqual([]);
    });

    it("refuses a local file over the size cap without reading it in full", async () => {
      const sourceDir = await createTempDir();
      try {
        const sourcePath = join(sourceDir, "huge.svg");
        await writeFile(sourcePath, "a".repeat(MAX_ICON_BYTES + 1));

        const before = await manifestText();
        const result = await runSet(dir, ["services.fly-api.icon", sourcePath]);

        expect(result.exitCode).toBe(1);
        expect(await manifestText()).toBe(before);
        expect(await iconsDirEntries(dir)).toEqual([]);
      } finally {
        await removeTempDir(sourceDir);
      }
    });

    // D1 (validator, 2026-09-04): reproduced against the built binary with
    // `attrib +R catalogus.yaml`, then `set services.loki.icon <url>` --
    // exit 1 with the raw EPERM message, and the staged temp file left
    // under `.catalogus/icons/`. Reproduced here by making the manifest
    // itself unwritable so commitManifestEdit's own writeManifestText call
    // throws (chmod 0o444, cross-platform: Node maps this to Windows'
    // read-only attribute too -- confirmed directly before writing this
    // test). The old code only discarded a staged icon on a *returned*
    // `{ exitCode: 1 }` from commitManifestEdit -- a throw skipped past
    // that branch entirely.
    it("D1: discards a staged icon when commitManifestEdit throws, rather than leaving its temp file behind", async () => {
      const manifestPath = join(dir, "catalogus.yaml");
      await chmod(manifestPath, 0o444);
      const sourceDir = await createTempDir();
      try {
        const sourcePath = await writeFixtureFile(sourceDir, "source.svg", CLEAN_SVG);
        const result = await runSet(dir, ["services.fly-api.icon", sourcePath]);
        expect(result.exitCode).toBe(1);
        expect(result.stderr[0]).toMatch(/^could not update .*catalogus\.yaml: /);
        expect(await iconsDirEntries(dir)).toEqual([]);
      } finally {
        await chmod(manifestPath, 0o666).catch(() => {});
        await removeTempDir(sourceDir);
      }
    });

    // D2 (validator, 2026-09-04): reproduced against the built binary with
    // `set services.loki.icon <local-path> services.healthchecks.icon
    // <url-that-stalls-mid-body>` -- after 15s, exit 1 with the bare "The
    // operation was aborted due to timeout" (no framing) on stderr, and
    // loki's already-staged temp file left on disk. The fix has two halves
    // -- icon-fetch.ts frames the stalled-body rejection into a normal
    // `{ ok: false }` result (proven directly in icon-fetch.test.ts), and
    // this test proves the *consequence* at the layer the validator
    // actually exercised: a second edit's ordinary, framed failure still
    // discards a sibling edit that already staged cleanly in the same call.
    it("D2: an aborted mid-body fetch for one icon discards a sibling icon already staged in the same call, with a framed error", async () => {
      const before = await manifestText();
      const sourceDir = await createTempDir();
      try {
        const localSourcePath = await writeFixtureFile(sourceDir, "source.svg", CLEAN_SVG);
        const stallingUrl = "https://example.test/stalls-mid-body.svg";
        const fetchImpl = (async (input: string | URL | Request) => {
          if (String(input) !== stallingUrl) throw new Error(`unexpected url ${String(input)}`);
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("<svg"));
            },
            pull() {
              return Promise.reject(new Error("The operation was aborted due to timeout"));
            },
          });
          return new Response(stream, { status: 200 });
        }) as typeof fetch;

        const result = await runSet(
          dir,
          ["services.fly-api.icon", localSourcePath, "services.heroku-api.icon", stallingUrl],
          fetchImpl
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr.join("\n")).toContain(`could not fetch "${stallingUrl}"`);
        expect(await manifestText()).toBe(before);
        // Both the failed edit's own temp file and fly-api's already-staged
        // one are gone -- the whole point of D2's discard half.
        expect(await iconsDirEntries(dir)).toEqual([]);
      } finally {
        await removeTempDir(sourceDir);
      }
    });

    // D7 (validator, 2026-09-04): reproduced against the built binary with
    // an absolute local path passing through a hashed scratch directory --
    // `set services.loki.icon <.../18ef9735785e/.../clean.svg>` was refused
    // at exit 2, "looks like private data", even though a path source is
    // never written anywhere (see icon-fetch.ts's own PreparedIconVendor.
    // comment doc). These two cases pin the fix: a path value that would
    // trip the guard's HARD email pattern is accepted (the guard never
    // runs for a path at all), while the identical content used as a URL's
    // userinfo -- a real credential, which *does* get written into a
    // comment on success -- is still refused, before any fetch happens.
    it("accepts a local path even when it contains text that would trip the private-data guard (an email-shaped directory segment)", async () => {
      const sourceDir = await createTempDir();
      try {
        const emailLikeDir = join(sourceDir, "finance@example.com");
        await mkdir(emailLikeDir, { recursive: true });
        const sourcePath = await writeFixtureFile(emailLikeDir, "clean.svg", CLEAN_SVG);

        const result = await runSet(dir, ["services.fly-api.icon", sourcePath]);
        expect(result.exitCode).toBe(0);
        expect(await readFile(join(dir, ".catalogus", "icons", "fly-api.svg"), "utf8")).toBe(CLEAN_SVG);
      } finally {
        await removeTempDir(sourceDir);
      }
    });

    it("still refuses a userinfo URL (a real embedded credential) at exit 2, before any fetch happens", async () => {
      const before = await manifestText();
      let fetchWasCalled = false;
      const fetchImpl = (async () => {
        fetchWasCalled = true;
        throw new Error("must not be called");
      }) as typeof fetch;

      const result = await runSet(
        dir,
        ["services.fly-api.icon", "https://user:hunter2secretpass@cdn.example.com/mark.svg"],
        fetchImpl
      );

      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("\n")).toContain("private data");
      expect(fetchWasCalled).toBe(false);
      expect(await manifestText()).toBe(before);
      expect(await iconsDirEntries(dir)).toEqual([]);
    });
  });

  it("names services.<id>.role in the unknown-field message as the shape to fill in", async () => {
    const result = await runSet(dir, ["project.budget", "1000"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("services.<id>.role");
  });

  // The prototype-inheritance case. `field` comes straight off the command
  // line and is looked up in two plain tables (FIELDS, then
  // MOVED_FIELD_HINTS), so before those were built on Object.create(null)
  // this took the *known-field* branch: `FIELDS["constructor"]` resolved
  // through Object.prototype to the `Object` function, which is truthy, so
  // the command built an edit with an undefined path and got as far as the
  // pre-write validation -- reporting `[schema] / must be object` at exit 1,
  // pointing the caller at their manifest, which was the one thing that was
  // fine. Confirmed against the built binary, not just the source, and
  // confirmed non-destructive: manifest-edit.ts refuses to write anything
  // that would fail validate, and that guard held throughout.
  //
  // Every name here is a real Object.prototype member and every one of them
  // is a legal thing to type. The assertion is on the exit code as much as
  // the message: 2 is `usage error`, which is what a bad field name is; 1 is
  // "your manifest is invalid", which was the lie.
  it.each(["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"])(
    "reports %s as an unknown field, rather than inheriting it from Object.prototype",
    async (field) => {
      const before = await manifestText();
      const result = await runSet(dir, [field, "boom"]);

      expect(result.exitCode).toBe(2);
      expect(result.stderr.join("\n")).toContain(`Unknown field "${field}"`);
      expect(result.stderr.join("\n")).not.toContain("must be object");
      expect(await manifestText()).toBe(before);
    },
  );
});
