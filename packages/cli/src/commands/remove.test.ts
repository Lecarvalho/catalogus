import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import { runRemove } from "./remove.js";
import { runValidate } from "./validate.js";

// Dependencies mix both legal edge shapes on purpose -- the tuple form and
// the object form with a `notes` annotation -- so the cascade is exercised
// against both, not just the tuple form every other fixture in this file
// happens to use.
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

describe("runRemove", () => {
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

  it("deletes the entry and every edge naming it in either direction, reporting each by name", async () => {
    const result = await runRemove(dir, "supabase-auth");
    expect(result.exitCode).toBe(0);

    // supabase-auth appears as `from` on the object-form edge and as `to`
    // on a tuple-form edge -- both must be gone, and both must be named in
    // the report regardless of which side of the edge they were on or
    // which of the two legal shapes they were written in.
    const out = result.stdout.join("\n");
    expect(out).toContain("supabase-auth -> supabase-db");
    expect(out).toContain("fly-api -> supabase-auth");

    const text = await manifestText();
    expect(text).not.toContain("supabase-auth");
    expect(text).not.toContain("auth reads session state directly from the users table");
    expect(text).toContain("[fly-api, supabase-db]");
    expect(text).toContain("Hand-written header comment");
    expect(text).toContain("$schema=https://dagstree.dev/schema/v1.json");
  });

  it("leaves an entry with no edges to cascade with a clean report", async () => {
    const result = await runRemove(dir, "heroku-api");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.join("\n")).not.toContain("dropped edge");

    const text = await manifestText();
    expect(text).not.toContain("heroku-api");
  });

  it("leaves the manifest valid after a cascading remove -- dagstree validate actually passes", async () => {
    const removed = await runRemove(dir, "supabase-auth");
    expect(removed.exitCode).toBe(0);

    // The spec's stated worst case is a dangling edge failing referential
    // integrity on the next `dagstree validate` -- so this test has to
    // call the real validator, not just eyeball the written text.
    const validated = await runValidate(dir);
    expect(validated.exitCode).toBe(0);
    expect(validated.stderr).toEqual([]);
  });

  it("refuses to remove an entry another entry's replaced_by still names, and writes nothing", async () => {
    const before = await manifestText();
    const result = await runRemove(dir, "fly-api");

    expect(result.exitCode).toBe(1);
    const err = result.stderr.join("\n");
    expect(err).toContain('"heroku-api"');
    expect(err).toContain("replaced_by");
    expect(err).toContain("dagstree deprecate");
    expect(await manifestText()).toBe(before);
  });

  it("refuses when more than one entry's replaced_by names the target, listing every one of them", async () => {
    const dir2 = await createTempDir();
    try {
      const manifest = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: legacy-a
    service: heroku
    role: hosting
    added: 2024-01-01
    status: deprecated
    replaced_by: consolidated
  - id: legacy-b
    service: render
    role: hosting
    added: 2024-02-01
    status: deprecated
    replaced_by: consolidated
  - id: consolidated
    service: fly-io
    role: hosting
    added: 2025-01-01
dependencies: []
`;
      await writeFixtureFile(dir2, "dagstree.yaml", manifest);
      const before = await readFile(join(dir2, "dagstree.yaml"), "utf8");

      const result = await runRemove(dir2, "consolidated");
      expect(result.exitCode).toBe(1);
      const err = result.stderr.join("\n");
      expect(err).toContain('"legacy-a"');
      expect(err).toContain('"legacy-b"');
      // The plural branch reads differently from the single-dependent
      // case above -- "name"/"them" rather than "names"/"it" -- and
      // nothing exercised it until now.
      expect(err).toContain("name it");
      expect(err).toContain("them");
      expect(await readFile(join(dir2, "dagstree.yaml"), "utf8")).toBe(before);
    } finally {
      await removeTempDir(dir2);
    }
  });

  it("refuses an id that does not exist and lists the ones that do", async () => {
    const before = await manifestText();
    const result = await runRemove(dir, "stripe");

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("known ids");
    expect(await manifestText()).toBe(before);
  });

  it("matches ids exactly -- removing a short id does not also touch one that merely starts with it", async () => {
    const dir2 = await createTempDir();
    try {
      const manifest = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: api
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: api-worker
    service: fly-io
    role: worker
    added: 2025-01-02
  - id: queue
    service: sqs
    role: queue
    added: 2025-01-03
dependencies:
  - [api, queue]
  - [api-worker, queue]
`;
      await writeFixtureFile(dir2, "dagstree.yaml", manifest);

      const result = await runRemove(dir2, "api");
      expect(result.exitCode).toBe(0);
      const out = result.stdout.join("\n");
      expect(out).toContain("api -> queue");
      expect(out).not.toContain("api-worker -> queue");

      const text = await readFile(join(dir2, "dagstree.yaml"), "utf8");
      expect(text).not.toMatch(/- id: api$/m);
      expect(text).toMatch(/- id: api-worker$/m);
      expect(text).toContain("[api-worker, queue]");
    } finally {
      await removeTempDir(dir2);
    }
  });

  // The test above cannot fail if the entry lookup ever became a prefix
  // match, because it lists "api" before "api-worker" and a prefix match
  // would find the right entry first anyway. Listing the longer id first is
  // what makes the distinction observable: a prefix match would delete
  // "api-worker" here and report success, and the only evidence would be
  // the wrong service quietly missing from the file.
  it("matches ids exactly on the entry lookup too, even when the longer id is listed first", async () => {
    const dir2 = await createTempDir();
    try {
      const manifest = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: api-worker
    service: fly-io
    role: worker
    added: 2025-01-01
  - id: api
    service: fly-io
    role: hosting
    added: 2025-01-02
dependencies: []
`;
      await writeFixtureFile(dir2, "dagstree.yaml", manifest);

      const result = await runRemove(dir2, "api");
      expect(result.exitCode).toBe(0);

      const text = await readFile(join(dir2, "dagstree.yaml"), "utf8");
      expect(text).toMatch(/- id: api-worker$/m);
      expect(text).not.toMatch(/- id: api$/m);
    } finally {
      await removeTempDir(dir2);
    }
  });

  it("removes the only remaining service, leaving an empty services list", async () => {
    const dir2 = await createTempDir();
    try {
      const manifest = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: solo
    service: fly-io
    role: hosting
    added: 2025-01-01
dependencies: []
`;
      await writeFixtureFile(dir2, "dagstree.yaml", manifest);

      const result = await runRemove(dir2, "solo");
      expect(result.exitCode).toBe(0);

      const text = await readFile(join(dir2, "dagstree.yaml"), "utf8");
      expect(text).toContain("services: []");

      const validated = await runValidate(dir2);
      expect(validated.exitCode).toBe(0);
    } finally {
      await removeTempDir(dir2);
    }
  });

  it("cascades edges out of a flow-style dependencies list the same way as a block-style one", async () => {
    const dir2 = await createTempDir();
    try {
      const manifest = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-w
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: svc-x
    service: fly-io
    role: hosting
    added: 2025-01-02
  - id: svc-y
    service: fly-io
    role: hosting
    added: 2025-01-03
  - id: svc-z
    service: fly-io
    role: hosting
    added: 2025-01-04
dependencies: [[svc-w, svc-x], [svc-x, svc-y], [svc-y, svc-z]]
`;
      await writeFixtureFile(dir2, "dagstree.yaml", manifest);

      const result = await runRemove(dir2, "svc-y");
      expect(result.exitCode).toBe(0);
      const out = result.stdout.join("\n");
      expect(out).toContain("svc-x -> svc-y");
      expect(out).toContain("svc-y -> svc-z");

      const text = await readFile(join(dir2, "dagstree.yaml"), "utf8");
      expect(text).not.toContain("svc-y");
      expect(text).toMatch(/svc-w,\s*svc-x/);

      const validated = await runValidate(dir2);
      expect(validated.exitCode).toBe(0);
    } finally {
      await removeTempDir(dir2);
    }
  });

  // The pre-write check in commitManifestEdit is reachable, and not through
  // anything remove does wrong: loadValidManifest runs parseManifest (schema,
  // referential integrity, the private-value guard) while commitManifestEdit
  // additionally runs checkAcyclic, so a manifest carrying a cycle opens
  // cleanly and fails on write -- even when the entry being removed has
  // nothing to do with the cycle. What matters here is that it fails closed:
  // exit 1, and the file left exactly as it was.
  it("refuses to write when the manifest already carried a cycle the removal does not touch", async () => {
    const dir2 = await createTempDir();
    try {
      const manifest = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-a
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: svc-b
    service: supabase
    role: database
    added: 2025-01-02
  - id: svc-c
    service: stripe
    role: payments
    added: 2025-01-03
dependencies:
  - [svc-b, svc-c]
  - [svc-c, svc-b]
`;
      await writeFixtureFile(dir2, "dagstree.yaml", manifest);
      const before = await readFile(join(dir2, "dagstree.yaml"), "utf8");

      const result = await runRemove(dir2, "svc-a");
      expect(result.exitCode).toBe(1);
      expect(result.stderr.join(" ")).toContain("cyclic dependency");

      const after = await readFile(join(dir2, "dagstree.yaml"), "utf8");
      expect(after).toBe(before);
    } finally {
      await removeTempDir(dir2);
    }
  });

  it("rejects an argument that is not a legal local id, at exit 2", async () => {
    const result = await runRemove(dir, "../elsewhere");
    expect(result.exitCode).toBe(2);
    expect(result.stderr.join("\n")).toContain("not a valid local id");
  });

  it("fails with exit 2 when there is no manifest to edit", async () => {
    const empty = await createTempDir();
    try {
      const result = await runRemove(empty, "anything");
      expect(result.exitCode).toBe(2);
    } finally {
      await removeTempDir(empty);
    }
  });
});

// Deleting an item from a YAMLSeq is not like appending to one: a comment
// written near an entry can be attached, by the `yaml` package's own
// parser, to that entry's own node, to the *following* entry's node, to
// the *preceding* entry's node, or -- for the very first item in the
// sequence specifically -- to the sequence node itself. "Comments survive
// removal" is therefore not one behaviour to assert once; each position
// below is measured and pinned separately, on purpose.
describe("runRemove -- comment attachment", () => {
  let dir: string;

  afterEach(async () => {
    await removeTempDir(dir);
  });

  // Every comment line here sits at the sequence item's own indentation
  // (two spaces, matching the "-" marker) rather than deeper, matching an
  // entry's own keys. That is the well-behaved case for a NON-FIRST entry:
  // each comment unambiguously belongs to the entry immediately below it,
  // and is part of that entry's own node -- see the sibling describe
  // below for why the first entry is a different mechanism entirely.
  const CLEAN_MANIFEST = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-a
    service: fly-io
    role: hosting
    added: 2025-01-01
  # note about svc-b specifically
  - id: svc-b # inline comment on svc-b's id
    service: supabase
    role: database
    added: 2025-01-02
  # note sitting between svc-b and svc-c
  - id: svc-c
    service: stripe
    role: payments
    added: 2025-01-03
dependencies: []
`;

  it("(a)/(b) on a non-first entry: a comment line directly above it, and an inline comment on its id, both vanish with it", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "dagstree.yaml", CLEAN_MANIFEST);

    // svc-b is index 1, not index 0 -- deliberately, since a comment
    // directly above a non-first entry belongs to that entry's own node,
    // which is a different mechanism from a comment above the first
    // entry (see "the first entry" describe block below).
    const result = await runRemove(dir, "svc-b");
    expect(result.exitCode).toBe(0);

    const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
    expect(text).not.toContain("note about svc-b specifically");
    expect(text).not.toContain("inline comment on svc-b's id");
  });

  it("(c) a comment written between the removed entry and its successor stays exactly where it was, attached to the successor", async () => {
    dir = await createTempDir();
    await writeFixtureFile(dir, "dagstree.yaml", CLEAN_MANIFEST);

    const result = await runRemove(dir, "svc-b");
    expect(result.exitCode).toBe(0);

    const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
    const lines = text.split("\n");
    const commentLine = lines.findIndex((line) => line.includes("note sitting between svc-b and svc-c"));
    const idLine = lines.findIndex((line) => line.trim().startsWith("- id: svc-c"));
    expect(commentLine).toBeGreaterThan(-1);
    // The comment was never part of svc-b's own node -- it was already
    // commentBefore on svc-c before svc-b was ever touched -- so removing
    // svc-b changes nothing about it beyond svc-b no longer sitting above it.
    expect(idLine).toBe(commentLine + 1);
  });

  // The hazard docs/PLAN.md names by description, at the position where it
  // actually occurs: a comment written directly above the FIRST item in a
  // sequence is attached by the `yaml` package to the sequence node itself
  // (`seq.commentBefore`), never to that first item. Removing the first
  // entry cannot touch a comment that was never part of its own node, so
  // the comment survives and, once the entry is gone, renders directly
  // above whatever now leads the list -- at ordinary list-item
  // indentation, which is exactly what a genuine header for that entry
  // looks like. This is measured, not assumed, and `remove` reports it
  // rather than staying silent about it.
  describe("the first entry", () => {
    const FIRST_ITEM_MANIFEST = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  # header comment directly above the first entry
  - id: svc-a # inline comment on svc-a's id
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: svc-b
    service: supabase
    role: database
    added: 2025-01-02
  - id: svc-c
    service: stripe
    role: payments
    added: 2025-01-03
dependencies: []
`;

    it("a comment above the first entry survives its removal, ends up heading the entry that follows, and is reported", async () => {
      dir = await createTempDir();
      await writeFixtureFile(dir, "dagstree.yaml", FIRST_ITEM_MANIFEST);

      const result = await runRemove(dir, "svc-a");
      expect(result.exitCode).toBe(0);

      // The inline comment on svc-a's own id key IS part of svc-a's own
      // node (unlike the header comment above it), so it goes with svc-a
      // exactly like the non-first case.
      const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
      expect(text).not.toContain("inline comment on svc-a's id");
      expect(text).not.toMatch(/- id: svc-a\b/);

      const lines = text.split("\n");
      const commentLine = lines.findIndex((line) => line.includes("header comment directly above the first entry"));
      const idLine = lines.findIndex((line) => line.trim().startsWith("- id: svc-b"));
      expect(commentLine).toBeGreaterThan(-1);
      expect(idLine).toBe(commentLine + 1);

      // A destructive command has to say what it did -- this is the one
      // position where staying silent would leave the file carrying a
      // comment that now reads as being about the wrong service, with no
      // record anywhere that `remove` is the reason.
      const out = result.stdout.join("\n");
      expect(out).toContain('"svc-a"');
      expect(out).toContain("services list itself");
    });

    it("the same hazard applies to the first dependency edge, and is reported the same way", async () => {
      dir = await createTempDir();
      const manifest = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-a
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: svc-b
    service: supabase
    role: database
    added: 2025-01-02
  - id: svc-c
    service: stripe
    role: payments
    added: 2025-01-03
dependencies:
  # header comment directly above the first edge
  - [svc-a, svc-b]
  - [svc-b, svc-c]
`;
      await writeFixtureFile(dir, "dagstree.yaml", manifest);

      const result = await runRemove(dir, "svc-a");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join("\n")).toContain("svc-a -> svc-b");

      const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
      const lines = text.split("\n");
      const commentLine = lines.findIndex((line) => line.includes("header comment directly above the first edge"));
      const edgeLine = lines.findIndex((line) => line.includes("[svc-b, svc-c]"));
      expect(commentLine).toBeGreaterThan(-1);
      expect(edgeLine).toBe(commentLine + 1);

      const out = result.stdout.join("\n");
      expect(out).toContain("dependencies list itself");
    });

    // The tests below pin the *absent* side of the two conjunctions. Each
    // flag is `the position removed was first AND a header comment exists`,
    // and a report that fired whenever either half held would cry wolf on
    // ordinary removals -- sending someone to hand-check a comment that was
    // never stranded is its own kind of wrong, and no assertion on the
    // firing case can catch it.
    it("says nothing about the services list when the entry removed was not the first one", async () => {
      dir = await createTempDir();
      await writeFixtureFile(dir, "dagstree.yaml", FIRST_ITEM_MANIFEST);

      const result = await runRemove(dir, "svc-b");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join("\n")).not.toContain("services list itself");

      // ...and the header comment is still doing its original job, sitting
      // above the entry it was actually written above.
      const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
      const lines = text.split("\n");
      const commentLine = lines.findIndex((line) => line.includes("header comment directly above the first entry"));
      expect(lines[commentLine + 1]).toContain("- id: svc-a");
    });

    it("says nothing about the services list when the first entry carried no comment above it", async () => {
      dir = await createTempDir();
      await writeFixtureFile(
        dir,
        "dagstree.yaml",
        `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-a
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: svc-b
    service: supabase
    role: database
    added: 2025-01-02
dependencies: []
`
      );

      const result = await runRemove(dir, "svc-a");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join("\n")).not.toContain("services list itself");
    });

    it("says nothing about the dependencies list when the edges dropped did not include the first one", async () => {
      dir = await createTempDir();
      await writeFixtureFile(
        dir,
        "dagstree.yaml",
        `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-a
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: svc-b
    service: supabase
    role: database
    added: 2025-01-02
  - id: svc-c
    service: stripe
    role: payments
    added: 2025-01-03
dependencies:
  # header comment directly above the first edge
  - [svc-a, svc-b]
  - [svc-b, svc-c]
`
      );

      const result = await runRemove(dir, "svc-c");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join("\n")).toContain("svc-b -> svc-c");
      expect(result.stdout.join("\n")).not.toContain("dependencies list itself");

      // The first edge, and the comment heading it, are both untouched.
      const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
      const lines = text.split("\n");
      const commentLine = lines.findIndex((line) => line.includes("header comment directly above the first edge"));
      expect(lines[commentLine + 1]).toContain("[svc-a, svc-b]");
    });

    // The report names the entry the stranded text now sits above, which
    // only exists while something is left to sit above. Removing the last
    // service used to be told the comment was "now sitting above whichever
    // service comes first" -- sending someone to look for a line that is
    // not there.
    it("does not claim the stranded comment now heads something when the removal emptied the list", async () => {
      dir = await createTempDir();
      await writeFixtureFile(
        dir,
        "dagstree.yaml",
        `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  # the only service we run
  - id: solo
    service: fly-io
    role: hosting
    added: 2025-01-01
dependencies: []
`
      );

      const result = await runRemove(dir, "solo");
      expect(result.exitCode).toBe(0);

      const out = result.stdout.join("\n");
      expect(out).toContain("services list itself");
      expect(out).toContain("the list is now empty");
      expect(out).not.toContain("it now sits above");

      const validated = await runValidate(dir);
      expect(validated.exitCode).toBe(0);
    });
  });

  // The hazard docs/PLAN.md also names, at a different position: a comment
  // typed directly after an entry's own last property, indented to match
  // that entry's keys rather than the next sequence item's dash -- exactly
  // what most editors produce when Enter keeps the previous line's
  // indentation -- is attached by the `yaml` package to the *preceding*
  // entry's node as its own trailing `.comment`, not as commentBefore on
  // the entry that follows. Removing the entry the human meant the note to
  // describe (here, svc-b) does not touch it: it survives on svc-a and,
  // once svc-b is gone, becomes the line directly above svc-c. Unlike the
  // first-entry hazard above, it keeps svc-a's own key indentation rather
  // than moving to list-item indentation, so it still reads as a trailing
  // note on the entry above it rather than as a header for svc-c -- a real
  // but milder hazard than the first-entry case. There is no fix for this
  // in remove.ts: by the time the Document is parsed, this is
  // indistinguishable from a genuine trailing note that really is about
  // svc-a, and clearing it on a guess would destroy real information as
  // often as it corrected a misattributed note. This test pins the
  // measured behaviour rather than papering over it.
  it("pins the trailing-comment hazard: a deep-indented note meant for the removed entry survives on its predecessor", async () => {
    dir = await createTempDir();
    const HAZARD_MANIFEST = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-a
    service: fly-io
    role: hosting
    added: 2025-01-01
    # meant to introduce svc-b, but indented like a continuation of svc-a
  - id: svc-b
    service: supabase
    role: database
    added: 2025-01-02
  - id: svc-c
    service: stripe
    role: payments
    added: 2025-01-03
dependencies: []
`;
    await writeFixtureFile(dir, "dagstree.yaml", HAZARD_MANIFEST);

    const before = await readFile(join(dir, "dagstree.yaml"), "utf8");
    expect(before).toContain("meant to introduce svc-b, but indented like a continuation of svc-a");

    const result = await runRemove(dir, "svc-b");
    expect(result.exitCode).toBe(0);

    const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
    const lines = text.split("\n");
    const commentLine = lines.findIndex((line) => line.includes("meant to introduce svc-b"));
    const idLine = lines.findIndex((line) => line.trim().startsWith("- id: svc-c"));

    // Measured, not assumed: the note survives (it was never part of
    // svc-b's own node) and it is now the line directly above svc-c.
    expect(commentLine).toBeGreaterThan(-1);
    expect(idLine).toBe(commentLine + 1);
    expect(text).not.toContain("- id: svc-b");
  });

  // The mirror case: a deep-indented comment written after the *removed*
  // entry's own properties (before the next entry's dash) is attached to
  // the removed entry's own node as its trailing comment, not to the
  // entry that follows -- so it disappears together with the entry being
  // removed, even where a human might have meant it to introduce the one
  // that comes next.
  it("a deep-indented note written after the removed entry's own properties is part of its node and is deleted with it", async () => {
    dir = await createTempDir();
    const MIRROR_MANIFEST = `# yaml-language-server: $schema=https://dagstree.dev/schema/v1.json
dagstree: 1
project:
  name: Example App
  slug: example-app
services:
  - id: svc-a
    service: fly-io
    role: hosting
    added: 2025-01-01
  - id: svc-b
    service: supabase
    role: database
    added: 2025-01-02
    # meant to introduce svc-c, but indented like a continuation of svc-b
  - id: svc-c
    service: stripe
    role: payments
    added: 2025-01-03
dependencies: []
`;
    await writeFixtureFile(dir, "dagstree.yaml", MIRROR_MANIFEST);

    const result = await runRemove(dir, "svc-b");
    expect(result.exitCode).toBe(0);

    const text = await readFile(join(dir, "dagstree.yaml"), "utf8");
    expect(text).not.toContain("meant to introduce svc-c, but indented like a continuation of svc-b");
  });
});
