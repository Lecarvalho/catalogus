import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runRename } from "./rename.js";
import { runValidate } from "./validate.js";

// The same both-edge-shapes fixture remove.test.ts uses, for the same
// reason: an edge is legally a [from, to] tuple or a {from, to, notes}
// object, and a rename that only handled the shape the fixtures happen to
// use would leave the other one dangling. `heroku-api` carries a
// replaced_by pointing at `fly-api`, which is the reference most easily
// forgotten -- it lives on a different entry than the one being renamed.
const MANIFEST = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
# Hand-written header comment -- must survive every edit.
dagstree: 1
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
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  async function manifestText(): Promise<string> {
    return readFile(join(dir, "dagstree.yaml"), "utf8");
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
      "dagstree.yaml",
      `dagstree: 1
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
      "dagstree.yaml",
      `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
# Hand-written header comment.
dagstree: 1
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
    expect(text).toContain("# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json");
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
      "dagstree.yaml",
      `dagstree: 1
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
