import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";

// One switch that makes `rename` (the fs call) fail, for the test below
// that pins the framing of a move the filesystem refuses. A real refusal
// needs an ACL (the 2026-09-05 validator used `icacls`), which is not
// portable and not something a test should leave behind. Everything else
// in node:fs/promises passes through untouched.
const fsRename = vi.hoisted(() => ({ failWith: undefined as string | undefined }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (fsRename.failWith !== undefined) {
        throw Object.assign(new Error(fsRename.failWith), { code: "EPERM" });
      }
      return actual.rename(from, to);
    },
  };
});
import { runRename } from "./rename.js";
import { runValidate } from "./validate.js";

// The same both-edge-shapes fixture remove.test.ts uses, for the same
// reason: an edge is legally a [from, to] tuple or a {from, to, notes}
// object, and a rename that only handled the shape the fixtures happen to
// use would leave the other one dangling. `heroku-api` carries a
// replaced_by pointing at `fly-api`, which is the reference most easily
// forgotten -- it lives on a different entry than the one being renamed.
const MANIFEST = `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: fly-api
    service: fly-io
    role: hosting
    added: 2025-11-02
  - id: supabase-db
    service: supabase
    role: database
    added: 2025-11-02
  - id: supabase-auth
    service: supabase
    role: auth
    added: 2025-11-02
  - id: heroku-api
    service: heroku
    role: hosting
    added: 2024-01-10
    status: phasing_out
    replaced_by: fly-api
dependencies:
  - [fly-api, supabase-db]
  - from: supabase-auth
    to: supabase-db
    notes: "auth reads session state directly from the users table"
  - [fly-api, supabase-auth]
`;

describe("runRename", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", MANIFEST);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  async function manifestText(): Promise<string> {
    return readFile(join(dir, "catalogus.yaml"), "utf8");
  }

  it("renames the entry and every reference to it, leaving the manifest valid", async () => {
    const result = await runRename(dir, "fly-api", "fly-backend");
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("id: fly-backend");
    expect(text).not.toContain("fly-api");
    // Both endpoints of the tuple edges moved...
    expect(text).toContain("[fly-backend, supabase-db]");
    expect(text).toContain("[fly-backend, supabase-auth]");
    // ...and the replaced_by on a *different* entry moved with them.
    expect(text).toContain("replaced_by: fly-backend");

    expect((await runValidate(dir, {})).exitCode).toBe(0);
  });

  it("moves an object-form edge, not just the tuple form", async () => {
    const result = await runRename(dir, "supabase-db", "postgres-main");
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("to: postgres-main");
    expect(text).toContain("[fly-api, postgres-main]");
    expect(text).not.toContain("supabase-db");
    // The notes on that edge are not collateral damage.
    expect(text).toContain("auth reads session state directly from the users table");

    expect((await runValidate(dir, {})).exitCode).toBe(0);
  });

  it("reports every reference it moved", async () => {
    const result = await runRename(dir, "fly-api", "fly-backend");
    const out = result.stdout.join("\n");
    expect(out).toContain('Renamed service "fly-api" to "fly-backend"');
    expect(out).toContain("edge fly-api -> supabase-db is now fly-backend -> supabase-db");
    expect(out).toContain("edge fly-api -> supabase-auth is now fly-backend -> supabase-auth");
    expect(out).toContain('replaced_by on "heroku-api" now points at fly-backend');
  });

  it("says so rather than reporting nothing when the entry had no references", async () => {
    await writeFixtureFile(
      dir,
      "catalogus.yaml",
      `catalogus: 1
project:
  name: X
  slug: x
services:
  - id: lonely
    service: fly-io
    role: hosting
    added: 2025-01-01
dependencies: []
`
    );
    const result = await runRename(dir, "lonely", "solitary");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).toContain("no dependency edges or replaced_by references named it");
  });

  it("refuses an unknown id at exit 1, listing the ids that do exist", async () => {
    const before = await manifestText();
    const result = await runRename(dir, "nope", "whatever");
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join(" ")).toContain('no service with id "nope" exists');
    expect(result.stderr.join(" ")).toContain("fly-api, heroku-api, supabase-auth, supabase-db");
    expect(await manifestText()).toBe(before);
  });

  // A collision would be caught by the duplicate-id referential-integrity
  // check before the write either way -- but "would make ... invalid:
  // duplicate id" reads like a bug in the tool rather than an answer to
  // what was typed.
  it("refuses a new id that another entry already holds, at exit 1, writing nothing", async () => {
    const before = await manifestText();
    const result = await runRename(dir, "fly-api", "supabase-db");
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join(" ")).toContain('"supabase-db" is already the id of another service');
    expect(await manifestText()).toBe(before);
  });

  it("treats renaming an entry to its own id as a no-op at exit 0", async () => {
    const before = await manifestText();
    const result = await runRename(dir, "fly-api", "fly-api");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join(" ")).toContain("nothing to do");
    expect(await manifestText()).toBe(before);
  });

  it("rejects an argument that is not a legal local id, at exit 2, on either side", async () => {
    const before = await manifestText();
    expect((await runRename(dir, "../elsewhere", "fine")).exitCode).toBe(2);
    expect((await runRename(dir, "fly-api", "Not A Slug")).exitCode).toBe(2);
    expect(await manifestText()).toBe(before);
  });

  it("exits 2 when there is no manifest to edit", async () => {
    const empty = await createTempDir();
    try {
      const result = await runRename(empty, "a", "b");
      expect(result.exitCode).toBe(2);
    } finally {
      await removeTempDir(empty);
    }
  });

  // Nothing is spliced out of a sequence here, so unlike `remove` every
  // comment stays attached to a node that is still in the document. Easy to
  // get right and still worth pinning: `remove`'s comment behaviour was the
  // thing its audits found the original fixtures had backwards.
  it("preserves the $schema modeline, header comments and inline comments", async () => {
    await writeFixtureFile(
      dir,
      "catalogus.yaml",
      `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
# Hand-written header comment.
catalogus: 1
project:
  name: X
  slug: x
# Services this project runs.
services:
  - id: fly-api # the public API
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: db
    service: supabase
    role: database
    added: 2025-01-01
dependencies:
  - [fly-api, db]
`
    );

    const result = await runRename(dir, "fly-api", "fly-backend");
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json");
    expect(text).toContain("# Hand-written header comment.");
    expect(text).toContain("# Services this project runs.");
    // The inline comment rode along with the scalar it annotates, because
    // the scalar's value was overwritten rather than the node replaced.
    expect(text).toContain("id: fly-backend # the public API");
  });

  // The longer id is declared FIRST on purpose. A prefix-matching entry
  // lookup would find `api-worker` when asked for `api`, rename the wrong
  // service and report success -- the exact defect the `remove` audits
  // caught. Declared the other way round the bug hides, because the correct
  // entry happens to come first.
  it("renames an id that is a prefix of another id without touching the other", async () => {
    await writeFixtureFile(
      dir,
      "catalogus.yaml",
      `catalogus: 1
project:
  name: X
  slug: x
services:
  - id: api-worker
    service: fly-io
    role: worker
    added: 2025-01-01
  - id: api
    service: fly-io
    role: hosting
    added: 2025-01-01
dependencies:
  - [api-worker, api]
`
    );

    const result = await runRename(dir, "api", "gateway");
    expect(result.exitCode).toBe(0);

    const text = await manifestText();
    expect(text).toContain("id: gateway");
    expect(text).toContain("id: api-worker");
    expect(text).toContain("[api-worker, gateway]");
    expect((await runValidate(dir, {})).exitCode).toBe(0);
  });
});

// The vendored-icon half of `rename` (2026-09-05). A `set services.<id>.icon`
// leaves a file at `.catalogus/icons/<id>.svg` and a pointer to it in the
// entry; before this, a rename moved the pointer's owner and left both file
// and pointer under the old id's name -- valid, resolving, and quietly off
// the `<id>.svg` convention the skill and `catalogus icons` teach.
describe("runRename, with a vendored icon", () => {
  let dir: string;

  const CLEAN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h2v2h-2z" fill="#123456"/></svg>';

  const ICON_MANIFEST = `# yaml-language-server: $schema=https://catalogus.dev/schema/v1.json
catalogus: 1
project:
  name: Example App
  slug: example-app
services:
  - id: logs
    service: loki
    role: observability
    added: 2025-11-02
    icon: .catalogus/icons/logs.svg # fetched from https://example.test (loki.svg) on 2026-09-04
  - id: metrics
    service: loki
    role: observability
    added: 2025-11-02
    icon: .catalogus/icons/loki-mark.svg
dependencies: []
`;

  beforeEach(async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "catalogus.yaml", ICON_MANIFEST);
    await mkdir(join(dir, ".catalogus", "icons"), { recursive: true });
    await writeFixtureFile(dir, ".catalogus/icons/logs.svg", CLEAN_SVG);
    await writeFixtureFile(dir, ".catalogus/icons/loki-mark.svg", CLEAN_SVG);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  async function fileExists(relativePath: string): Promise<boolean> {
    try {
      await stat(join(dir, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  it("moves a file named after the old id to the new id's name, rewrites the pointer and keeps its comment", async () => {
    const result = await runRename(dir, "logs", "loki-logs");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("  icon .catalogus/icons/logs.svg moved to .catalogus/icons/loki-logs.svg");

    expect(await fileExists(".catalogus/icons/loki-logs.svg")).toBe(true);
    expect(await fileExists(".catalogus/icons/logs.svg")).toBe(false);

    const text = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(text).toContain("icon: .catalogus/icons/loki-logs.svg # fetched from https://example.test (loki.svg) on 2026-09-04");
    expect(text).not.toContain("icons/logs.svg");
    expect((await runValidate(dir, {})).exitCode).toBe(0);
  });

  it("leaves a pointer that was not named after the id alone, file and field both, and says so", async () => {
    const result = await runRename(dir, "metrics", "loki-metrics");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      '  icon .catalogus/icons/loki-mark.svg kept its name and its file (it was not named after "metrics")'
    );

    expect(await fileExists(".catalogus/icons/loki-mark.svg")).toBe(true);
    expect(await fileExists(".catalogus/icons/loki-metrics.svg")).toBe(false);
    const text = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(text).toContain("icon: .catalogus/icons/loki-mark.svg");
  });

  it("refuses at exit 1, touching nothing, when a file already sits at the new id's name", async () => {
    await writeFixtureFile(dir, ".catalogus/icons/loki-logs.svg", "<svg/>");
    const before = await readFile(join(dir, "catalogus.yaml"), "utf8");

    const result = await runRename(dir, "logs", "loki-logs");
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain("a file already sits there");

    expect(await readFile(join(dir, "catalogus.yaml"), "utf8")).toBe(before);
    expect(await readFile(join(dir, ".catalogus/icons/loki-logs.svg"), "utf8")).toBe("<svg/>");
    expect(await readFile(join(dir, ".catalogus/icons/logs.svg"), "utf8")).toBe(CLEAN_SVG);
  });

  it("moves a stale pointer with the id when no file is there, and reports that nothing moved on disk", async () => {
    await rm(join(dir, ".catalogus", "icons", "logs.svg"));

    const result = await runRename(dir, "logs", "loki-logs");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "  icon is now .catalogus/icons/loki-logs.svg (no file was at .catalogus/icons/logs.svg to move; the pointer was already stale)"
    );
    const text = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(text).toContain("icon: .catalogus/icons/loki-logs.svg");
    expect(await fileExists(".catalogus/icons/loki-logs.svg")).toBe(false);
  });

  // D1–D3, D7 (validator, 2026-09-05): the manifest is consulted before the
  // filesystem. Both states are hand-edited ones -- `set` always vendors to
  // <id>.svg -- but they are legal by the schema, and `remove` already
  // guards the shared case.
  it("keeps a file another entry still names, pointer and file both, and names that entry", async () => {
    await writeFixtureFile(dir, "catalogus.yaml", ICON_MANIFEST.replace("icon: .catalogus/icons/loki-mark.svg", "icon: .catalogus/icons/logs.svg"));

    const result = await runRename(dir, "logs", "loki-logs");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('  icon .catalogus/icons/logs.svg kept its name: "metrics" still names it');

    expect(await fileExists(".catalogus/icons/logs.svg")).toBe(true);
    expect(await fileExists(".catalogus/icons/loki-logs.svg")).toBe(false);
    const text = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(text).toContain("id: loki-logs\n");
    expect(text).not.toContain("icons/loki-logs.svg");
    expect((await runValidate(dir, {})).exitCode).toBe(0);
  });

  it("refuses at exit 1 when another entry already names the new id's path, whether or not a file is there", async () => {
    // metrics names the path logs would move to; no file sits there yet, so
    // a filesystem-only check would let the move bind metrics to logs's mark.
    await writeFixtureFile(dir, "catalogus.yaml", ICON_MANIFEST.replace("icon: .catalogus/icons/loki-mark.svg", "icon: .catalogus/icons/loki-logs.svg"));
    const before = await readFile(join(dir, "catalogus.yaml"), "utf8");

    const result = await runRename(dir, "logs", "loki-logs");
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain('which "metrics" already names.');
    expect(result.stderr[1]).toContain("catalogus set services.<id>.icon");

    expect(await readFile(join(dir, "catalogus.yaml"), "utf8")).toBe(before);
    expect(await fileExists(".catalogus/icons/logs.svg")).toBe(true);
    expect(await fileExists(".catalogus/icons/loki-logs.svg")).toBe(false);
  });

  it("calls a directory at the new id's path a directory, not a file", async () => {
    await mkdir(join(dir, ".catalogus", "icons", "loki-logs.svg"));

    const result = await runRename(dir, "logs", "loki-logs");
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain("but a directory already sits there.");
    expect(result.stderr[1]).toContain("no entry in");
  });

  it("frames a move the filesystem refuses like a manifest write that throws, touching nothing (D4)", async () => {
    fsRename.failWith = "EPERM: operation not permitted, rename";
    const before = await readFile(join(dir, "catalogus.yaml"), "utf8");
    try {
      const result = await runRename(dir, "logs", "loki-logs");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toEqual([
        "could not move .catalogus/icons/logs.svg to .catalogus/icons/loki-logs.svg: EPERM: operation not permitted, rename",
        "  nothing was written; the icon file was not moved.",
      ]);
    } finally {
      fsRename.failWith = undefined;
    }
    expect(await readFile(join(dir, "catalogus.yaml"), "utf8")).toBe(before);
    expect(await fileExists(".catalogus/icons/logs.svg")).toBe(true);
    expect(await fileExists(".catalogus/icons/loki-logs.svg")).toBe(false);
  });

  it("leaves a directory at the source where it is, and says so", async () => {
    await rm(join(dir, ".catalogus", "icons", "logs.svg"));
    await mkdir(join(dir, ".catalogus", "icons", "logs.svg"));

    const result = await runRename(dir, "logs", "loki-logs");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("  icon .catalogus/icons/logs.svg kept its name: a directory sits there, not a file, so nothing was moved");
    expect(await fileExists(".catalogus/icons/logs.svg")).toBe(true);
    expect(await fileExists(".catalogus/icons/loki-logs.svg")).toBe(false);
    expect(await readFile(join(dir, "catalogus.yaml"), "utf8")).toContain("icon: .catalogus/icons/logs.svg");
  });

  it("moves the file back when the manifest write is refused", async () => {
    // A manifest that already carries a cycle opens (see manifest-edit.ts)
    // but every edit that leaves the cycle standing is refused at commit --
    // the one refusal a valid-looking rename can reach after the file has
    // already moved.
    await writeFixtureFile(
      dir,
      "catalogus.yaml",
      ICON_MANIFEST.replace("dependencies: []", "dependencies:\n  - [logs, metrics]\n  - [metrics, logs]")
    );

    const result = await runRename(dir, "logs", "loki-logs");
    expect(result.exitCode).toBe(1);
    // Reported under this command's own prefix rather than the file's:
    // cycleKey is built from the ids, and renaming one of a cycle's nodes
    // changes the key, so the pre-existing cycle reads as a new one. A
    // pre-existing quirk of `rename`, recorded in docs/PLAN.md; not what
    // this test pins. What it pins is that the refusal put the file back.
    expect(result.stderr[0]).toContain("invalid:");

    expect(await fileExists(".catalogus/icons/logs.svg")).toBe(true);
    expect(await fileExists(".catalogus/icons/loki-logs.svg")).toBe(false);
    const text = await readFile(join(dir, "catalogus.yaml"), "utf8");
    expect(text).toContain("id: logs\n");
    expect(text).toContain("icon: .catalogus/icons/logs.svg");
  });
});
