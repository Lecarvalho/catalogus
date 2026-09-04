import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { join } from "node:path";

import { MAX_ICON_BYTES } from "@catalogus/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { commitIconVendor, discardIconVendor, prepareIconVendor } from "./icon-fetch.js";
import { createTempDir, removeTempDir, writeFixtureFile } from "./test-support/temp-dir.js";

const CLEAN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' + '<path d="M1 1h2v2h-2z" fill="#123456"/></svg>';

const HOSTILE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0"/></svg>';

async function iconsDirEntries(dir: string): Promise<string[]> {
  try {
    return await readdir(join(dir, ".catalogus", "icons"));
  } catch {
    return [];
  }
}

/** A `typeof fetch`-shaped stub keyed by URL string -- vendors never need a real socket for the happy-path/refusal cases below (see icon-fetch.ts's own module comment on why the fetcher is injected). */
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

describe("prepareIconVendor / commitIconVendor", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  describe("url source", () => {
    it("fetches, sanitises and stages the bytes, with the comment reduced to the URL's origin and filename", async () => {
      const url = "https://example.test/marks/loki.svg?sig=deadbeef&x=1#frag";
      const fetchImpl = stubFetch({ [url]: new Response(CLEAN_SVG, { status: 200 }) });

      const outcome = await prepareIconVendor(dir, "loki", { kind: "url", url }, fetchImpl);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      expect(outcome.value.relativePath).toBe(".catalogus/icons/loki.svg");
      expect(outcome.value.comment).toBeDefined();
      // No-secrets (validator, 2026-09-04): only the origin and the final
      // path segment survive into the committed comment -- "marks", the
      // path segment between the origin and the filename, is dropped along
      // with the query string and fragment, exactly as it would be for a
      // real token-bearing path segment (see icon-resolution.test.ts and
      // set.test.ts's own path-token cases for that).
      expect(outcome.value.comment).toContain("https://example.test (loki.svg)");
      expect(outcome.value.comment).not.toContain("marks");
      expect(outcome.value.comment).not.toContain("sig=deadbeef");
      expect(outcome.value.comment).not.toContain("frag");
      expect(outcome.value.comment).toMatch(/on \d{4}-\d{2}-\d{2}$/);

      // Staged, not yet at the real destination.
      expect(await readFile(outcome.value.tempPath, "utf8")).toBe(CLEAN_SVG);
      await expect(stat(outcome.value.destPath)).rejects.toThrow();

      await commitIconVendor(outcome.value);
      expect(await readFile(outcome.value.destPath, "utf8")).toBe(CLEAN_SVG);
      expect(await iconsDirEntries(dir)).toEqual(["loki.svg"]);
    });

    // No-secrets (validator, 2026-09-04): a presigned URL's token can live
    // in the *path* rather than the query string -- a matrix parameter
    // with no "?" at all, or a bearer-token directory segment -- and both
    // used to land verbatim in the comment because only search/hash were
    // ever stripped.
    it("drops a matrix-parameter token on the final path segment (no query string involved at all)", async () => {
      const url = "https://cdn.example.test/clean.svg;sig=deadbeefdeadbeefdeadbeefdeadbeef";
      const fetchImpl = stubFetch({ [url]: new Response(CLEAN_SVG, { status: 200 }) });

      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url }, fetchImpl);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.comment).toContain("https://cdn.example.test (clean.svg)");
      expect(outcome.value.comment).not.toContain("deadbeef");
    });

    it("drops a bearer-token directory segment, keeping only the origin and the real filename", async () => {
      const url = "https://cdn.example.test/dl/9f8e7d6c5b4a3210deadbeefcafebabe/logo.svg";
      const fetchImpl = stubFetch({ [url]: new Response(CLEAN_SVG, { status: 200 }) });

      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url }, fetchImpl);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.comment).toContain("https://cdn.example.test (logo.svg)");
      expect(outcome.value.comment).not.toContain("dl");
      expect(outcome.value.comment).not.toContain("9f8e7d6c5b4a3210deadbeefcafebabe");
    });

    it("follows a redirect to an https target and vendors the final body", async () => {
      const startUrl = "https://example.test/redirect-me.svg";
      const finalUrl = "https://cdn.example.test/final.svg";
      const fetchImpl = stubFetch({
        [startUrl]: new Response(null, { status: 302, headers: { location: finalUrl } }),
        [finalUrl]: new Response(CLEAN_SVG, { status: 200 }),
      });

      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url: startUrl }, fetchImpl);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(await readFile(outcome.value.tempPath, "utf8")).toBe(CLEAN_SVG);
      // The comment names the URL the caller actually gave `set` -- the
      // one they would type again to re-fetch -- not whichever internal
      // redirect target the bytes happened to come from on this run.
      expect(outcome.value.comment).toContain("https://example.test (redirect-me.svg)");
    });

    it("refuses a redirect that leaves https, and never fetches the insecure target", async () => {
      const startUrl = "https://example.test/redirect-me.svg";
      const insecureTarget = "http://evil.example.test/x.svg";
      let insecureWasFetched = false;
      const fetchImpl = (async (input: string | URL | Request) => {
        const url = String(input);
        if (url === startUrl) {
          return new Response(null, { status: 302, headers: { location: insecureTarget } });
        }
        insecureWasFetched = true;
        throw new Error("should never be called");
      }) as typeof fetch;

      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url: startUrl }, fetchImpl);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.message).toContain("off https");
      expect(insecureWasFetched).toBe(false);
      expect(await iconsDirEntries(dir)).toEqual([]);
    });

    // Proven against a real HTTP round trip, not the stub above -- this is
    // the security-critical half of the redirect contract, and a hand-built
    // Response double could accidentally model `redirect: "manual""
    // differently than a real server does.
    it("refuses a redirect off https, proven against a real local HTTP server", async () => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === "/start") {
          const port = (server.address() as { port: number }).port;
          res.writeHead(302, { location: `http://127.0.0.1:${port}/elsewhere` });
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "image/svg+xml" });
        res.end(CLEAN_SVG);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const port = (server.address() as { port: number }).port;
        const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url: `http://127.0.0.1:${port}/start` });
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.message).toContain("off https");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("refuses a non-200 response", async () => {
      const url = "https://example.test/missing.svg";
      const fetchImpl = stubFetch({ [url]: new Response("not found", { status: 404 }) });

      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url }, fetchImpl);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.message).toContain("404");
    });

    // Refuses by counting the stream rather than trusting `content-length`
    // -- the header here deliberately understates the real body, which a
    // content-length-trusting implementation would accept.
    it("refuses a body over MAX_ICON_BYTES by counting the stream rather than trusting a lying content-length header", async () => {
      const url = "https://example.test/huge.svg";
      const hugeBody = "a".repeat(MAX_ICON_BYTES + 1000);
      const fetchImpl = stubFetch({
        [url]: new Response(hugeBody, { status: 200, headers: { "content-length": "10" } }),
      });

      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url }, fetchImpl);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.message).toContain(`${MAX_ICON_BYTES}`);
      expect(await iconsDirEntries(dir)).toEqual([]);
    });

    it("refuses a hostile SVG (a <script> tag), leaving no temp file behind and the destination untouched", async () => {
      const url = "https://example.test/hostile.svg";
      const fetchImpl = stubFetch({ [url]: new Response(HOSTILE_SVG, { status: 200 }) });

      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url }, fetchImpl);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.message).toMatch(/sanitiser/i);
      expect(await iconsDirEntries(dir)).toEqual([]);
    });

    // D2 (validator, 2026-09-04): a response whose headers arrive (this
    // Response is constructed with status 200 -- followToOk200 already
    // succeeded) but whose *body* then stalls used to throw an unframed
    // rejection straight out of this function -- readBodyCapped's
    // reader.read() was not itself wrapped, so the abort's own message
    // ("The operation was aborted due to timeout") reached the caller with
    // none of the "could not fetch ..." context a fetch-step failure
    // already gets. This fetcher models that: one chunk arrives, then the
    // next read() call rejects, exactly the shape a real
    // AbortSignal.timeout firing mid-body produces (proven directly against
    // Node's ReadableStream before writing this test).
    it("frames a body-stream rejection the same way a fetch failure is framed, instead of letting it propagate unframed", async () => {
      const url = "https://example.test/stalls-mid-body.svg";
      const fetchImpl = (async (input: string | URL | Request) => {
        if (String(input) !== url) throw new Error(`stubFetch: no canned response for "${String(input)}"`);
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

      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url }, fetchImpl);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.message).toContain(`could not fetch "${url}"`);
      expect(outcome.message).toContain("aborted due to timeout");
      expect(await iconsDirEntries(dir)).toEqual([]);
    });

    // D4 (validator, 2026-09-04): mkdir has to run before the sanitiser
    // check can even happen, so a refusal on the very first `set
    // services.<id>.icon` call against a repo with no `.catalogus/icons/`
    // yet used to leave that directory standing, empty, after a call that
    // wrote nothing at all.
    it("removes .catalogus/icons/ again when a sanitiser refusal leaves it empty (not just its one temp file)", async () => {
      const url = "https://example.test/hostile.svg";
      const fetchImpl = stubFetch({ [url]: new Response(HOSTILE_SVG, { status: 200 }) });

      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url }, fetchImpl);
      expect(outcome.ok).toBe(false);
      await expect(stat(join(dir, ".catalogus", "icons"))).rejects.toThrow();
      // The refusal happened on a repo with no .catalogus/ at all yet, so
      // mkdir({ recursive: true }) created both levels at once -- removing
      // only the inner one would leave a bare, empty .catalogus/ behind.
      await expect(stat(join(dir, ".catalogus"))).rejects.toThrow();
    });

    it("leaves .catalogus/icons/ standing when a refusal follows a call that already vendored a different icon into it", async () => {
      const sourceDir = await createTempDir();
      try {
        const sourcePath = await writeFixtureFile(sourceDir, "source.svg", CLEAN_SVG);
        const first = await prepareIconVendor(dir, "already-vendored", { kind: "path", path: sourcePath });
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        await commitIconVendor(first.value);
      } finally {
        await removeTempDir(sourceDir);
      }

      const url = "https://example.test/hostile.svg";
      const fetchImpl = stubFetch({ [url]: new Response(HOSTILE_SVG, { status: 200 }) });
      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url }, fetchImpl);
      expect(outcome.ok).toBe(false);

      // The directory is not empty -- it still holds the file the first
      // call vendored -- so removeIconsDirIfEmpty must not touch it.
      expect(await iconsDirEntries(dir)).toEqual(["already-vendored.svg"]);
    });

    it("leaves the parent .catalogus/ standing when it holds something besides icons/", async () => {
      await mkdir(join(dir, ".catalogus"), { recursive: true });
      await writeFixtureFile(dir, ".catalogus/unrelated-file.txt", "not this module's business");

      const url = "https://example.test/hostile.svg";
      const fetchImpl = stubFetch({ [url]: new Response(HOSTILE_SVG, { status: 200 }) });
      const outcome = await prepareIconVendor(dir, "svc", { kind: "url", url }, fetchImpl);
      expect(outcome.ok).toBe(false);

      // .catalogus/icons/ itself is still removed (empty)...
      await expect(stat(join(dir, ".catalogus", "icons"))).rejects.toThrow();
      // ...but .catalogus/ is not, because it holds something else.
      expect(await readdir(join(dir, ".catalogus"))).toEqual(["unrelated-file.txt"]);
    });
  });

  describe("path source", () => {
    it("copies, sanitises and stages a local file, producing no comment", async () => {
      const sourceDir = await createTempDir();
      try {
        const sourcePath = await writeFixtureFile(sourceDir, "source.svg", CLEAN_SVG);

        const outcome = await prepareIconVendor(dir, "svc", { kind: "path", path: sourcePath });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.value.comment).toBeUndefined();
        expect(await readFile(outcome.value.tempPath, "utf8")).toBe(CLEAN_SVG);

        await commitIconVendor(outcome.value);
        expect(await readFile(outcome.value.destPath, "utf8")).toBe(CLEAN_SVG);
      } finally {
        await removeTempDir(sourceDir);
      }
    });

    it("copying the vendored file's own path onto itself succeeds without corrupting it (no self-copy, no error)", async () => {
      // First vendor a real file normally.
      const sourceDir = await createTempDir();
      let firstDest: string;
      try {
        const sourcePath = await writeFixtureFile(sourceDir, "source.svg", CLEAN_SVG);
        const first = await prepareIconVendor(dir, "svc", { kind: "path", path: sourcePath });
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        await commitIconVendor(first.value);
        firstDest = first.value.destPath;
      } finally {
        await removeTempDir(sourceDir);
      }

      // Now re-point the entry at the exact file that is already vendored.
      const second = await prepareIconVendor(dir, "svc", { kind: "path", path: firstDest });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      await commitIconVendor(second.value);
      expect(await readFile(second.value.destPath, "utf8")).toBe(CLEAN_SVG);
    });

    it("refuses a local file over MAX_ICON_BYTES without reading it in full, and stages nothing", async () => {
      const sourceDir = await createTempDir();
      try {
        const sourcePath = join(sourceDir, "huge.svg");
        await writeFile(sourcePath, "a".repeat(MAX_ICON_BYTES + 1));

        const outcome = await prepareIconVendor(dir, "svc", { kind: "path", path: sourcePath });
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.message).toContain(`${MAX_ICON_BYTES}`);
        expect(await iconsDirEntries(dir)).toEqual([]);
      } finally {
        await removeTempDir(sourceDir);
      }
    });

    it("refuses a missing local path", async () => {
      const outcome = await prepareIconVendor(dir, "svc", { kind: "path", path: join(dir, "does-not-exist.svg") });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.message).toContain("does-not-exist.svg");
    });
  });

  // D4's multi-pair sibling (validator, 2026-09-04): set.ts calls
  // discardIconVendor to roll back an *already-staged* icon after a later
  // pair in the same `set` call fails -- see set.ts's own D1/D2 comment.
  // That rollback path has to close the same empty-directory gap
  // prepareIconVendor's own refusal branch does, or a two-icon `set` call
  // whose second pair fails would still leave `.catalogus/icons/` standing
  // empty after discarding the first.
  describe("discardIconVendor", () => {
    it("removes .catalogus/icons/ when discarding the one temp file staged in it leaves it empty", async () => {
      const sourceDir = await createTempDir();
      try {
        const sourcePath = await writeFixtureFile(sourceDir, "source.svg", CLEAN_SVG);
        const prepared = await prepareIconVendor(dir, "svc", { kind: "path", path: sourcePath });
        expect(prepared.ok).toBe(true);
        if (!prepared.ok) return;

        // Never committed -- exactly the state a sibling pair's failure
        // leaves an earlier, successfully-staged icon in.
        await discardIconVendor(prepared.value);

        expect(await iconsDirEntries(dir)).toEqual([]);
        await expect(stat(join(dir, ".catalogus", "icons"))).rejects.toThrow();
      } finally {
        await removeTempDir(sourceDir);
      }
    });

    it("leaves .catalogus/icons/ standing when discarding one staged file leaves another, already-committed one behind", async () => {
      const sourceDir = await createTempDir();
      try {
        const sourcePath = await writeFixtureFile(sourceDir, "source.svg", CLEAN_SVG);

        const committed = await prepareIconVendor(dir, "already-committed", { kind: "path", path: sourcePath });
        expect(committed.ok).toBe(true);
        if (!committed.ok) return;
        await commitIconVendor(committed.value);

        const rolledBack = await prepareIconVendor(dir, "rolled-back", { kind: "path", path: sourcePath });
        expect(rolledBack.ok).toBe(true);
        if (!rolledBack.ok) return;
        await discardIconVendor(rolledBack.value);

        expect(await iconsDirEntries(dir)).toEqual(["already-committed.svg"]);
      } finally {
        await removeTempDir(sourceDir);
      }
    });
  });
});
