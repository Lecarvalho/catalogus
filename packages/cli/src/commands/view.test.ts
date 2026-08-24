import { readFile, rename, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir, writeFixtureFile } from "../test-support/temp-dir.js";
import type { ViewServerHandle } from "./view.js";
import { createViewServer, parsePortOption } from "./view.js";

const MANIFEST = `dagstree: 1
project:
  name: Example App
  slug: example-app
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
dependencies:
  - [host-api, ingress]
`;

/**
 * Sends a raw HTTP GET with `rawPath` exactly as given -- no URL
 * normalization, unlike the global `fetch()`, which (per the WHATWG URL
 * spec) collapses a literal ".." segment before the request is ever sent.
 * That collapsing is real and correct client-side behaviour, but it means
 * `fetch()` cannot be used to prove the *server's* traversal guard does
 * anything at all -- a passing test built on it would be proving nothing.
 * node:http's own request() has no such normalization: `path` reaches the
 * wire exactly as given, which is what the traversal tests below need.
 */
function rawGet(
  port: number,
  rawPath: string
): Promise<{ status: number; body: string; contentType?: string; nosniff?: string | string[] }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path: rawPath, method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body,
          contentType: res.headers["content-type"],
          nosniff: res.headers["x-content-type-options"],
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Sends a raw GET with a caller-chosen `Host` header and/or method,
 * overriding whatever node:http would otherwise derive from `host`/`port`
 * -- an explicit `headers.Host` wins over the automatic one, which is what
 * the G1 (Host allow-list) and D4 (method) tests below both need.
 */
function rawRequest(
  port: number,
  options: { path?: string; method?: string; host?: string }
): Promise<{ status: number; body: string; allow?: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: options.path ?? "/",
        method: options.method ?? "GET",
        headers: options.host === undefined ? {} : { Host: options.host },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body, allow: res.headers["allow"] });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * Writes a request as the exact literal lines given, over a bare
 * net.Socket, with no help from node:http's own header serialization.
 * Needed for the duplicate-Host test below: node:http's client API has no
 * way to put the same header name on the wire twice for `Host`
 * specifically (Node's own client, like its server, collapses duplicates
 * for a handful of header names before a request is ever sent) -- writing
 * the request line and headers directly is the only way to prove what the
 * server does when a client actually sends two separate Host lines, which
 * is the literal scenario RFC 7230 §5.4 requires rejecting.
 *
 * Resolves as soon as a full header block (up to the blank line) has
 * arrived, rather than waiting for the socket to end -- this server's
 * responses are HTTP/1.1 keep-alive by default, so waiting for "end"
 * would hang for exactly the reason the close()-bounding test below
 * exists to fix.
 */
function rawSocketRequest(port: number, requestLines: string[]): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(requestLines.join("\r\n") + "\r\n\r\n");
    });
    let data = "";
    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
      const headerEnd = data.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }
      const statusLine = data.slice(0, headerEnd).split("\r\n")[0] ?? "";
      const status = Number(statusLine.split(" ")[1] ?? "0");
      const body = data.slice(headerEnd + 4);
      socket.destroy();
      resolve({ status, body });
    });
    socket.on("error", reject);
  });
}

/**
 * Real path to this package's own dist/web/index.html -- packages/cli/dist
 * is always a sibling of packages/cli/src regardless of vitest vs. the
 * tsup-bundled binary (see view.ts's own findPackageRoot comment for the
 * same reasoning), so a fixed two-levels-up offset from this test file
 * (packages/cli/src/commands/) is exactly as stable as that assumption.
 * Used only by the D2 test below, which needs a *real* partial build to
 * prove createViewServer's guard actually stats the right thing --
 * createViewServer always resolves webRoot from the real package layout,
 * so there is no way to hand it a fake one.
 */
function realWebIndexHtmlPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist", "web", "index.html");
}

describe("createViewServer", () => {
  let dir: string;
  let servers: ViewServerHandle[];

  beforeEach(async () => {
    dir = await createTempDir();
    servers = [];
  });

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    await removeTempDir(dir);
  });

  // port: 0 everywhere below -- an OS-assigned ephemeral port, so these
  // tests never collide with each other or with a real `dagstree view`
  // that might already be running on the default 4180. See view.ts's own
  // comment on createViewServer's `port` option for why this is not the
  // same thing as the CLI silently working around a busy user-chosen port.

  it("serves the view payload at GET /api/project", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const response = await fetch(`${outcome.value.url}/api/project`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const payload = (await response.json()) as { project: { name: string }; services: { id: string; kind: string }[] };
    expect(payload.project.name).toBe("Example App");
    expect(payload.services.map((s) => s.id).sort()).toEqual(["host-api", "ingress"]);
    expect(payload.services.find((s) => s.id === "ingress")?.kind).toBe("component");
  });

  it("serves the built index.html at GET /", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const response = await fetch(outcome.value.url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('<div id="root">');
  });

  it("falls back to the SPA shell for a client-side route with no file of its own", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const [root, deepLink] = await Promise.all([
      fetch(outcome.value.url).then((r) => r.text()),
      fetch(`${outcome.value.url}/projects/anything`).then(async (r) => ({ status: r.status, body: await r.text() })),
    ]);
    expect(deepLink.status).toBe(200);
    expect(deepLink.body).toBe(root);
  });

  // D3, Phase 3.7 hardening pass: a path that *looks* like a specific
  // file (it carries an extension) but matches nothing on disk is a 404,
  // not the SPA shell -- unlike the extensionless client-side route above,
  // which still falls back to index.html.
  it("404s a request for a missing file that carries an extension, rather than serving the SPA shell for it", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const missingAsset = await fetch(`${outcome.value.url}/assets/does-not-exist.js`);
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.headers.get("content-type")).not.toContain("text/html");

    const favicon = await fetch(`${outcome.value.url}/favicon.ico`);
    expect(favicon.status).toBe(404);
    expect(favicon.headers.get("content-type")).not.toContain("text/html");
  });

  it("404s an unknown /api/* route rather than falling through to the SPA shell", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const response = await fetch(`${outcome.value.url}/api/does-not-exist`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('<div id="root">');
  });

  // G4, Phase 3.7 hardening pass: the /api guard used to be exact-prefix
  // and case-sensitive, so a doubled leading slash or a differently-cased
  // path missed it entirely and fell through to the static handler, which
  // served index.html -- HTML where JSON was expected, with no 404 to
  // flag the typo.
  it("matches the /api namespace after collapsing a doubled leading slash and normalizing case", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const doubled = await rawGet(outcome.value.port, "//api/project");
    expect(doubled.status).toBe(200);
    expect(doubled.contentType).toContain("application/json");

    const upperCased = await rawGet(outcome.value.port, "/API/project");
    expect(upperCased.status).toBe(200);
    expect(upperCased.contentType).toContain("application/json");

    const typo = await rawGet(outcome.value.port, "/api/nope");
    expect(typo.status).toBe(404);
    expect(typo.contentType).not.toContain("text/html");
  });

  it("refuses a literal path-traversal attempt without leaking file content", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const result = await rawGet(outcome.value.port, "/../../package.json");
    expect(result.status).toBe(403);
    expect(result.body).not.toContain('"name": "dagstree-monorepo"');
  });

  it("refuses a percent-encoded path-traversal attempt the same way", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const result = await rawGet(outcome.value.port, "/%2e%2e%2f%2e%2e%2fpackage.json");
    expect(result.status).toBe(403);
    expect(result.body).not.toContain('"name": "dagstree-monorepo"');
  });

  it("fails cleanly, with no server, when the target directory has no manifest", async () => {
    // dir is a real, empty directory -- no dagstree.yaml or stack.yaml.
    const outcome = await createViewServer(dir, { port: 0 });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.error.exitCode).toBe(2);
    expect(outcome.error.stderr.join("\n")).toContain("dagstree init");
  });

  it("fails cleanly, with no server, when the manifest fails validation", async () => {
    // Missing project.slug -- schema-invalid.
    await writeFixtureFile(
      dir,
      "dagstree.yaml",
      `dagstree: 1
project:
  name: Missing Slug
services: []
dependencies: []
`
    );
    const outcome = await createViewServer(dir, { port: 0 });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.error.exitCode).toBe(2);
  });

  it("fails with a message naming --port when the requested port is already in use", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const first = await createViewServer(dir, { port: 0 });
    if (!first.ok) throw new Error(`expected success, got: ${first.error.stderr.join("\n")}`);
    servers.push(first.value);

    const second = await createViewServer(dir, { port: first.value.port });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.error.exitCode).toBe(1);
    expect(second.error.stderr.join("\n")).toContain("--port");
  });

  // D2, Phase 3.7 hardening pass: an isolated `pnpm --filter dagstree
  // build` (tsup's own `clean: true`) can leave dist/web/ behind with an
  // empty assets/ subdirectory but no index.html. This test reproduces
  // exactly that half-built state against this package's *real* dist/web
  // (createViewServer always resolves it from the real package layout, so
  // there's no injecting a fake one) by temporarily moving index.html
  // aside, and restores it in `finally` regardless of pass or fail so the
  // rest of the suite -- and a human running `pnpm build` again -- never
  // sees the moved-aside file.
  it("fails cleanly, with no server, when dist/web exists but its own index.html is missing", async () => {
    const indexHtmlPath = realWebIndexHtmlPath();
    const backupPath = `${indexHtmlPath}.d2-test-backup`;
    await rename(indexHtmlPath, backupPath);
    try {
      await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
      const outcome = await createViewServer(dir, { port: 0 });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error("unreachable");
      expect(outcome.error.exitCode).toBe(1);
      expect(outcome.error.stderr.join("\n")).toContain("Built web assets not found");
    } finally {
      await rename(backupPath, indexHtmlPath);
    }
  });

  // D4, Phase 3.7 hardening pass: nothing behind this server writes, so
  // GET and HEAD are the only methods that mean anything -- everything
  // else is a 405 naming its Allow list, never a silent 200.
  it("answers a non-GET/HEAD method with 405 and an Allow header, while GET and HEAD keep working", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const post = await rawRequest(outcome.value.port, { path: "/api/project", method: "POST" });
    expect(post.status).toBe(405);
    expect(post.allow).toBe("GET, HEAD");
    expect(post.body).not.toContain('"project"');

    const put = await rawRequest(outcome.value.port, { path: "/", method: "PUT" });
    expect(put.status).toBe(405);
    expect(put.allow).toBe("GET, HEAD");

    const del = await rawRequest(outcome.value.port, { path: "/", method: "DELETE" });
    expect(del.status).toBe(405);

    const optionsResult = await rawRequest(outcome.value.port, { path: "/", method: "OPTIONS" });
    expect(optionsResult.status).toBe(405);

    const get = await fetch(`${outcome.value.url}/api/project`);
    expect(get.status).toBe(200);

    const head = await fetch(`${outcome.value.url}/api/project`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  // G1, Phase 3.7 hardening pass: binding to 127.0.0.1 only stops a remote
  // page from connecting directly, but does nothing against DNS
  // rebinding, where a page's own hostname is made to resolve to
  // 127.0.0.1 -- the browser still calls that same-origin and sends its
  // real Host header. Requests are only honoured when Host names this
  // loopback address (or "localhost") at the port actually bound.
  it("rejects a request whose Host header doesn't name 127.0.0.1 or localhost at the bound port", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);
    const port = outcome.value.port;

    const byIp = await rawRequest(port, { path: "/api/project", host: `127.0.0.1:${port}` });
    expect(byIp.status).toBe(200);
    expect(byIp.body).toContain('"project"');

    const byLocalhost = await rawRequest(port, { path: "/api/project", host: `localhost:${port}` });
    expect(byLocalhost.status).toBe(200);
    expect(byLocalhost.body).toContain('"project"');

    const evilHost = await rawRequest(port, { path: "/api/project", host: "evil.example.com" });
    expect(evilHost.status).toBe(400);
    expect(evilHost.body).not.toContain('"project"');

    const attackerWithPort = await rawRequest(port, { path: "/api/project", host: `attacker.test:${port}` });
    expect(attackerWithPort.status).toBe(400);
    expect(attackerWithPort.body).not.toContain('"project"');
  });

  // D5, Phase 3.7 hardening pass: the request handler (and the payload's
  // one JSON.stringify) is built exactly once per server, at startup --
  // not rebuilt on every request. Proven the same way the validation pass
  // that found this measured it: count actual JSON.stringify calls across
  // several concurrent requests after the server is already up.
  it("builds the request handler and serializes the payload once per server, not once per request", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const originalStringify = JSON.stringify;
    let calls = 0;
    JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
      calls++;
      return originalStringify(...args);
    }) as typeof JSON.stringify;
    try {
      const outcome = await createViewServer(dir, { port: 0 });
      if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
      servers.push(outcome.value);

      calls = 0; // reset: only requests made from here on count.
      // rawGet (node:http's request()), not the global fetch() -- undici's
      // fetch() lazily builds its default connection pool on its own first
      // call per process, and that one-time setup calls JSON.stringify
      // internally (confirmed by stack trace: node:internal/deps/undici's
      // own Object.deepClone). That's a client-side artifact of fetch()
      // itself, unrelated to this server, and counting it here would make
      // this assertion fail (or pass) depending on whether some earlier,
      // unrelated test in the same process happened to call fetch() first.
      await Promise.all(Array.from({ length: 5 }, () => rawGet(outcome.value.port, "/api/project")));
      expect(calls).toBe(0);
    } finally {
      JSON.stringify = originalStringify;
    }
  });

  // G5, Phase 3.7 hardening pass. Corrected (Defect 4, second round): the
  // real rule isn't "writers differ from readers" -- `detect` is a reader
  // too and rejects a file path outright (`detect(): invalid repoPath
  // "...\dagstree.yaml"`, exit 2), so citing "add differs because it
  // writes" as the dividing line cites its own counterexample as support.
  // The actual rule, confirmed directly against the built CLI: a command
  // built on loadValidManifest's upward walk -- validate, graph, diff, and
  // view itself -- tolerates a file path by walking up past it to the
  // manifest in its containing directory (`dagstree validate
  // <path>\dagstree.yaml` exits 0). A command that instead takes a repo
  // root and hands it straight to something that requires a real
  // directory does not: `detect` passes its target straight through to
  // the stack analyser as a repoPath (exit 2, "is not a directory" in
  // substance); `add` passes it to manifest-edit.ts, which needs a real
  // directory to write *into* (exit 2, "is not a directory" verbatim).
  // Both reject a file path, for the same underlying reason -- neither is
  // built on the upward walk -- not for the different reasons ("write
  // access") the old comment claimed. Matching view's real sibling group
  // (validate/graph/diff) means a file path here should keep working.
  it("accepts a path to the manifest file itself, matching validate/graph's convention rather than add's", async () => {
    const manifestPath = await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(manifestPath, { port: 0 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    servers.push(outcome.value);

    const response = await fetch(`${outcome.value.url}/api/project`);
    expect(response.status).toBe(200);
  });

  // Defect 1, Phase 3.7 hardening pass, second round: a browser omits the
  // port from Host when it's the scheme default (80 for http), so
  // http://127.0.0.1/ arrived as `Host: 127.0.0.1` with no colon at all --
  // rejected outright by the old exact-`host:port` check, making the
  // viewer entirely unusable on port 80 (confirmed in a real browser: the
  // page body was the literal text "Bad Request"). This is the one test
  // in this file that needs a fixed, privileged port rather than an
  // OS-assigned one (see this describe block's own comment on why `port:
  // 0` is used everywhere else) -- the bug is keyed specifically off the
  // literal value 80, so there's no way to exercise it through an
  // ephemeral port. Some environments can't bind port 80 at all (no
  // elevated privileges) or already have something else bound there (IIS,
  // Skype, ...) -- skip rather than fail when that's the case, since it
  // says nothing about whether the fix itself is correct.
  it("accepts a bare-authority Host header (no :port) when bound to port 80, and still rejects an unrelated host", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 80 });
    if (!outcome.ok) {
      console.warn(`skipping port-80 test -- could not bind port 80 in this environment: ${outcome.error.stderr.join(" ")}`);
      return;
    }
    servers.push(outcome.value);
    expect(outcome.value.port).toBe(80);

    const bareIp = await rawRequest(80, { path: "/api/project", host: "127.0.0.1" });
    expect(bareIp.status).toBe(200);
    expect(bareIp.body).toContain('"project"');

    const bareLocalhost = await rawRequest(80, { path: "/api/project", host: "localhost" });
    expect(bareLocalhost.status).toBe(200);
    expect(bareLocalhost.body).toContain('"project"');

    const explicitPort = await rawRequest(80, { path: "/api/project", host: "127.0.0.1:80" });
    expect(explicitPort.status).toBe(200);
    expect(explicitPort.body).toContain('"project"');

    const evil = await rawRequest(80, { path: "/api/project", host: "evil.example.com" });
    expect(evil.status).toBe(400);
    expect(evil.body).not.toContain('"project"');
  });

  // Defect 2, Phase 3.7 hardening pass, second round: RFC 7230 §5.3.2
  // requires servers to accept an absolute-form request target
  // (`GET http://host/path HTTP/1.1`), which req.url carries verbatim --
  // it never starts with "/", so the old exact-string /api check missed
  // it and fell through to static serving, which answered with the SPA
  // shell instead of the JSON payload.
  it("routes an absolute-form request target to /api/project instead of falling through to the SPA shell", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);
    const port = outcome.value.port;

    const absoluteApi = await rawGet(port, `http://127.0.0.1:${port}/api/project`);
    expect(absoluteApi.status).toBe(200);
    expect(absoluteApi.contentType).toContain("application/json");
    expect(absoluteApi.body).toContain('"project"');

    const absoluteStatic = await rawGet(port, `http://127.0.0.1:${port}/`);
    expect(absoluteStatic.status).toBe(200);
    expect(absoluteStatic.contentType).toContain("text/html");

    // A hostile authority embedded in the request target itself (as
    // opposed to the Host header, checked separately by isAllowedHost)
    // must not influence routing -- only the scheme://authority prefix is
    // stripped, the rest of the path is used exactly as it would be for
    // an origin-form request against this same, legitimately-bound port.
    const hostileAuthority = await rawGet(port, "http://evil.example.com/api/project");
    expect(hostileAuthority.status).toBe(200);
    expect(hostileAuthority.contentType).toContain("application/json");
  });

  it("resolves a leading ./ segment so /./api/project reaches the API route", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const result = await rawGet(outcome.value.port, "/./api/project");
    expect(result.status).toBe(200);
    expect(result.contentType).toContain("application/json");
  });

  // Deliberately unchanged (see toOriginFormPath's own comment): ".." is
  // never resolved outside the traversal guard, so this keeps 404ing
  // after the D2 fix exactly as it did before it.
  it("still 404s /api/../api/project -- '..' segments are left for the traversal guard alone, not resolved here", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const result = await rawGet(outcome.value.port, "/api/../api/project");
    expect(result.status).toBe(404);
  });

  it("still refuses absolute-form path traversal without leaking file content", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const result = await rawGet(outcome.value.port, "http://evil.example.com/../../package.json");
    expect(result.status).toBe(403);
    expect(result.body).not.toContain('"name": "dagstree-monorepo"');
  });

  // Defect 3, Phase 3.7 hardening pass, second round: a present-but-empty
  // index.html used to serve a silent 200 with an empty body -- indistinguishable
  // from success. createViewServer now reads index.html into memory at startup
  // and refuses to start (same message, same exit code, as a missing build) when
  // that read comes back empty. The ACL-denied case (a file that stat()s fine
  // but can't actually be opened) is covered by manual verification against a
  // real ACL-denied file instead of an automated test here: reliably creating a
  // file this process's own user cannot read, portably, from within a test that
  // also needs to restore it afterward, isn't something Windows ACLs and POSIX
  // permissions have enough in common to do the same way in both places.
  it("fails cleanly, with no server, when dist/web's index.html is present but empty", async () => {
    const indexHtmlPath = realWebIndexHtmlPath();
    const originalContent = await readFile(indexHtmlPath);
    await writeFile(indexHtmlPath, "");
    try {
      await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
      const outcome = await createViewServer(dir, { port: 0 });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error("unreachable");
      expect(outcome.error.exitCode).toBe(1);
      expect(outcome.error.stderr.join("\n")).toContain("Built web assets not found");
    } finally {
      await writeFile(indexHtmlPath, originalContent);
    }
  });

  // Gap, Phase 3.7 hardening pass, second round: server.close() alone
  // waits for every open connection to end on its own, and a bare TCP
  // socket that never sends a request never does -- measured hanging
  // past 90 seconds before this fix. closeIdleConnections() bounds it.
  it("resolves close() promptly even while a bare, request-less TCP socket is still open", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    const { port, close } = outcome.value;

    const bareSocket = connect(port, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      bareSocket.once("connect", () => resolve());
      bareSocket.once("error", reject);
    });
    // Deliberately never send anything on this socket -- it stays open,
    // idle, with no request ever started.

    const started = Date.now();
    await close();
    const elapsedMs = Date.now() - started;
    expect(elapsedMs).toBeLessThan(5000);

    bareSocket.destroy();
  });

  // Gap, Phase 3.7 hardening pass, second round: RFC 7230 §5.4 requires
  // 400 when a request names Host more than once. Node's http parser
  // silently keeps only the first Host value and discards the rest, so
  // `Host: 127.0.0.1:<port>` followed by `Host: evil.com` used to come
  // back 200 with the real payload -- the second, attacker-controlled
  // Host line was never rejected, just quietly ignored.
  it("rejects a request with a duplicate Host header, in both orders", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);
    const port = outcome.value.port;

    const legitimateFirst = await rawSocketRequest(port, [
      "GET /api/project HTTP/1.1",
      `Host: 127.0.0.1:${port}`,
      "Host: evil.example.com",
      "Connection: close",
    ]);
    expect(legitimateFirst.status).toBe(400);
    expect(legitimateFirst.body).not.toContain('"project"');

    const evilFirst = await rawSocketRequest(port, [
      "GET /api/project HTTP/1.1",
      "Host: evil.example.com",
      `Host: 127.0.0.1:${port}`,
      "Connection: close",
    ]);
    expect(evilFirst.status).toBe(400);
    expect(evilFirst.body).not.toContain('"project"');
  });

  // Gap, Phase 3.7 hardening pass, second round: this server hands a
  // browser both JSON and HTML from the same origin -- nosniff is cheap
  // insurance against either being interpreted as the other.
  it("sends X-Content-Type-Options: nosniff on both a JSON and an HTML response", async () => {
    await writeFixtureFile(dir, "dagstree.yaml", MANIFEST);
    const outcome = await createViewServer(dir, { port: 0 });
    if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error.stderr.join("\n")}`);
    servers.push(outcome.value);

    const json = await rawGet(outcome.value.port, "/api/project");
    expect(json.nosniff).toBe("nosniff");

    const html = await rawGet(outcome.value.port, "/");
    expect(html.nosniff).toBe("nosniff");
  });
});

describe("parsePortOption", () => {
  // G3, Phase 3.7 hardening pass: Number()/parseInt() both accept shapes
  // the --port help text ("a whole number between 1 and 65535") doesn't
  // promise -- hex, exponential notation, decimals -- which is how `--port
  // 0x1000` used to start a server on 4096 and `--port 1e3` on 1000.

  it("accepts a plain decimal integer in range", () => {
    expect(parsePortOption("4180")).toEqual({ ok: true, value: 4180 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parsePortOption(" 4180 ")).toEqual({ ok: true, value: 4180 });
  });

  it("rejects hex notation even though Number() would accept it", () => {
    expect(parsePortOption("0x1000").ok).toBe(false);
  });

  it("rejects exponential notation even though Number() would accept it", () => {
    expect(parsePortOption("1e3").ok).toBe(false);
  });

  it("rejects 0 -- the OS-assigned-port option is test-only and must stay unreachable from the CLI", () => {
    expect(parsePortOption("0").ok).toBe(false);
  });

  it("rejects a value above 65535", () => {
    expect(parsePortOption("65536").ok).toBe(false);
  });

  it("rejects a negative value", () => {
    expect(parsePortOption("-1").ok).toBe(false);
  });

  it("names the offending value in its message", () => {
    const result = parsePortOption("1e3");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.message).toContain('"1e3"');
    expect(result.message).toContain("between 1 and 65535");
  });
});
