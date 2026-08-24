// `catalogus view [path] [--port <port>] [--no-open]` -- the viewer's one
// entry point (docs/PLAN.md, Phase 3.7). Serves the built web app plus this
// repo's manifest, as one JSON endpoint (GET /api/project) and static
// files, then opens a browser onto it.
//
// Split in two on purpose. createViewServer() does everything up to and
// including a listening socket -- dist/web presence, manifest validation,
// static file serving, the API route -- and never touches a browser, so it
// is fully testable with a plain HTTP client and no display. runView() is
// the thin CLI-facing layer on top: it adds the browser-open side effect
// and turns the result into the CommandResult shape every other command
// returns. Tests exercise createViewServer directly.
//
// Binds 127.0.0.1 only, never 0.0.0.0. This serves one repo's manifest data
// over plain HTTP with no auth; it must not be reachable from anything but
// the machine it runs on. That is necessary but not sufficient: DNS
// rebinding lets a remote page make a hostname resolve to 127.0.0.1, and
// the browser then treats a request to that hostname as same-origin --
// loopback-only binding does nothing to stop that. isAllowedHost() below is
// what actually closes the gap; see its own comment.
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadValidManifest } from "../load-manifest.js";
import { resolveTargetPath } from "../paths.js";
import type { CommandResult } from "../types.js";
import { buildViewPayload } from "../view-payload.js";
import type { ViewPayload } from "../view-payload.js";

/** Chosen once, never hunted for. A busy port is a hard failure naming --port, not something to work around silently -- see runView's own comment on why. */
export const DEFAULT_VIEW_PORT = 4180;

export interface ViewCommandOptions {
  /** Raw --port value, still a string here; runView validates and parses it. */
  port?: string;
  /** commander's --no-open sets this to false; absent (the flag wasn't passed) means "open". */
  open?: boolean;
}

export interface ViewServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export type CreateViewServerOutcome = { ok: true; value: ViewServerHandle } | { ok: false; error: CommandResult };

/**
 * Finds @catalogus/cli's own package.json by walking upward from `startDir`,
 * the same upward-walk shape manifest-io.ts's findManifest() uses for
 * catalogus.yaml -- for an analogous reason. This module's compiled location
 * differs between a vitest run (packages/cli/src/commands/view.ts) and the
 * tsup-bundled binary (a file sitting directly under packages/cli/dist/),
 * so no single hardcoded relative offset from import.meta.url is correct in
 * both. package.json and dist/ are always siblings inside packages/cli/
 * regardless of which layout is running, so walking up to the nearest
 * package.json and appending dist/web from there resolves correctly either
 * way.
 */
async function findPackageRoot(startDir: string): Promise<string> {
  let dir = startDir;
  for (;;) {
    if (await isFile(join(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`could not find @catalogus/cli's package.json above ${startDir}`);
    }
    dir = parent;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** scripts/bundle-web.mjs (the root build's last step) copies apps/web/dist here. */
async function webDistDir(): Promise<string> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = await findPackageRoot(moduleDir);
  return join(packageRoot, "dist", "web");
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

// Gap (Phase 3.7 hardening pass, second round): this server hands a
// browser both JSON (the payload) and HTML (the SPA shell) from the same
// origin. Nosniff costs nothing and closes off a browser guessing a
// different content type than the one declared -- a general hardening
// addition, not a fix for one specific exploit found against this server.
const NOSNIFF_HEADERS = { "x-content-type-options": "nosniff" } as const;

function writeText(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...NOSNIFF_HEADERS, ...headers });
  res.end(text);
}

/**
 * Resolves a request pathname to an absolute path inside `root`, or null
 * when it does not stay inside -- a traversal attempt, encoded or not.
 * decodeURIComponent runs first, so an encoded attempt (`%2e%2e%2f`) is
 * reduced to the same literal text a plain `../` attempt already is before
 * the containment check runs; both are then caught by the identical
 * comparison rather than by two separate rules that could drift apart.
 * Decoded exactly once -- a doubly-encoded payload (`%252e`) comes out as
 * the literal text "%2e", which does not form a ".." segment and is
 * therefore harmless, rather than being walked into ".." by a second pass.
 */
function resolveStaticPath(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  // Strip leading separators so join() treats the rest as relative to
  // root, not as an OS-absolute path that would discard root entirely.
  const relative = decoded.replace(/^[/\\]+/, "");
  const resolved = normalize(join(root, relative));
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return resolved;
}

/**
 * Picks the file that actually answers a static GET: the resolved path
 * itself when it's a real file, that path's own index.html when it names a
 * directory, the SPA shell at `root`'s own index.html when the request
 * looks like a client-side route -- or null when none of those apply,
 * which serveStatic turns into a 404.
 *
 * "Looks like a client-side route" is decided by whether the *requested*
 * pathname carries a file extension (path.extname looks only at the final
 * path segment, so an earlier dot -- "/v1.2/thing" -- doesn't count). An
 * extensionless path ("/projects/anything") is exactly what a client-side
 * router produces, so it still falls back to the SPA shell. A path with an
 * extension that matched nothing on disk ("/assets/does-not-exist.js",
 * "/favicon.ico") is a stale or wrong reference, not a route -- answering
 * it with the SPA shell used to mean a `<script type="module">` failing
 * with a strict-MIME console error instead of a clean, diagnosable 404
 * (D3, Phase 3.7 hardening pass).
 */
async function pickStaticFile(resolved: string, root: string, pathname: string): Promise<string | null> {
  for (const candidate of [resolved, join(resolved, "index.html")]) {
    if (await isFile(candidate)) {
      return candidate;
    }
  }
  if (extname(pathname) !== "") {
    return null;
  }
  return join(root, "index.html");
}

/**
 * `indexHtml` is the SPA shell's bytes, read exactly once at startup by
 * createViewServer -- never re-read from disk per request. Whenever
 * pickStaticFile resolves to `root`'s own index.html (a direct request for
 * "/" or "/index.html", or the client-side-route fallback), this serves
 * the cached copy directly instead of calling readFile again.
 *
 * That closes Defect 3 (Phase 3.7 hardening pass, second round): the old
 * per-request `readFile` here could fail after createViewServer's own
 * startup check already reported success, because that check only ever
 * asked `stat().isFile()` -- true for a file the process cannot actually
 * open (ACL-denied) -- and every such request then 500'd, including GET /
 * itself. Since createViewServer now reads this buffer at startup and
 * refuses to start at all when that read fails or returns zero bytes (see
 * its own comment), reaching this function with a non-empty `indexHtml`
 * means the shell is already known-good; no request can hit a failure
 * mode here that startup didn't already rule out.
 *
 * The tradeoff: a build that runs while `catalogus view` is still serving
 * requests replaces dist/web/index.html on disk, but this server keeps
 * answering with the copy it cached at startup until the process is
 * restarted -- a stale shell, not a transient 500. That is consistent
 * with the view payload itself already being a startup-time snapshot (see
 * this module's top comment: no file watching, no hot reload), not a
 * regression this change introduces.
 *
 * Left alone on purpose: an index.html that references built assets
 * which have since been deleted (an empty assets/ directory) still
 * serves this cached 200 shell, whose own <script> tag then 404s in the
 * browser -- a blank page, not a server error. Catching that would mean
 * this module parsing and following the shell's own asset references,
 * which nobody has asked for.
 */
async function serveStatic(root: string, pathname: string, res: ServerResponse, indexHtml: Buffer): Promise<void> {
  const resolved = resolveStaticPath(root, pathname);
  if (resolved === null) {
    writeText(res, 403, "Forbidden");
    return;
  }

  const filePath = await pickStaticFile(resolved, root, pathname);
  if (filePath === null) {
    writeText(res, 404, "Not found");
    return;
  }

  if (filePath === join(root, "index.html")) {
    res.writeHead(200, { "content-type": mimeTypeFor(filePath), ...NOSNIFF_HEADERS });
    res.end(indexHtml);
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypeFor(filePath), ...NOSNIFF_HEADERS });
    res.end(body);
  } catch {
    // dist/web exists (createViewServer already checked) but this
    // particular static asset is missing or unreadable -- an incomplete
    // build, not a request error. Honest 500 rather than a silently blank
    // 200. The SPA shell itself can no longer land here (see above), so
    // this is now reachable only for some other file under dist/web.
    writeText(res, 500, "Internal Server Error");
  }
}

/**
 * Guards against DNS rebinding (see this module's top comment): binding to
 * 127.0.0.1 only stops a remote page from opening a connection here
 * directly, but a page whose hostname has been made to resolve to
 * 127.0.0.1 is still same-origin as far as the browser is concerned, and
 * sends its Host header along unchanged. Answering that request would hand
 * back Layer 2 (safe in a public repo by design, see CLAUDE.md) plus
 * `manifestPath` -- an absolute host path that names the user's own home
 * directory (G1, Phase 3.7 hardening pass). Requiring Host to name this
 * loopback address, or "localhost", at exactly the port this server
 * actually bound closes that hole.
 *
 * Do not loosen this to a substring or suffix match -- "localhost.evil.
 * example.com" and "127.0.0.1.evil.example.com" would pass one of those.
 * Missing Host is already a 400 from Node on HTTP/1.1 before this handler
 * ever runs; the undefined check below is a fail-closed floor under that,
 * not the primary defense.
 *
 * Defect 1 (Phase 3.7 hardening pass, second round): when the bound port
 * is 80 -- the scheme default for plain http -- a browser omits the port
 * from the Host header entirely (RFC 7230 §5.4: "if the port is the
 * default ... may be omitted"). `http://127.0.0.1/` therefore arrives as
 * `Host: 127.0.0.1`, with no colon at all, and the exact-match check above
 * rejected it outright: every request on port 80, including the HTML
 * shell itself, came back 400. Confirmed against a real browser -- the
 * page body was the literal word "Bad Request". The bare-authority form
 * (no port) is accepted below, but *only* when this server actually bound
 * port 80; any other port keeps demanding the explicit `:port` form
 * exactly as before, so this does not loosen the check for the common
 * case -- it only recognizes the one shape a compliant browser produces
 * for the one port where that shape is correct. Do not generalize this
 * into "port is optional" for every port; that would let a request naming
 * neither this server's real port nor any port at all slip through when
 * the server isn't even listening on 80.
 */
function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (hostHeader === undefined) {
    return false;
  }
  const host = hostHeader.trim().toLowerCase();
  if (host === `127.0.0.1:${port}` || host === `localhost:${port}`) {
    return true;
  }
  return port === 80 && (host === "127.0.0.1" || host === "localhost");
}

/**
 * Defect 2 (Phase 3.7 hardening pass, second round): canonicalises a raw
 * request-target to origin-form -- a path starting with "/" -- before
 * anything downstream looks at it.
 *
 * RFC 7230 §5.3.2 requires a server to accept the absolute-form request
 * target (`GET http://host/path HTTP/1.1`), which is exactly what a
 * request line written directly against a raw socket produces, and what a
 * forward proxy sends. `req.url` carries the request-target exactly as
 * the client sent it (see createRequestHandler's own comment on why that
 * matters for the traversal guard); an absolute-form target therefore
 * never starts with "/", so the `/api` prefix check below missed it
 * entirely and let it fall through to static file serving, which answered
 * with the SPA shell instead of routing it to JSON -- confirmed against
 * the built binary: `GET http://127.0.0.1:<port>/api/project HTTP/1.1`
 * came back 200 with the HTML shell, not the payload.
 *
 * Also collapses a literal "/./" segment (and a leading "./" or a
 * trailing "/."), the same collapse a conforming URL parser performs as
 * part of full normalisation. This is deliberately *not* extended to
 * "..": resolving ".." correctly requires exactly the containment logic
 * resolveStaticPath already implements, and re-implementing that
 * differently here is how the two would eventually disagree. A literal
 * ".." segment -- encoded or not -- reaches resolveStaticPath completely
 * untouched by this function and is caught there exactly as it always
 * was; the guard's containment property is proven by 42 raw-socket
 * traversal vectors, none of which contain a literal "/./" sequence for
 * this function to touch, and this function does not decode percent
 * escapes, so an encoded traversal attempt (e.g. "%2e%2e%2f") is
 * untouched by it either. `/api/../api/project` therefore still 404s
 * after this change, exactly as it did before it -- unchanged on purpose,
 * not an oversight.
 */
function toOriginFormPath(rawPathname: string): string {
  const absoluteFormMatch = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*(\/.*)?$/.exec(rawPathname);
  const target = absoluteFormMatch ? (absoluteFormMatch[1] ?? "/") : rawPathname;

  // Repeat until stable: collapsing one "/./" can expose another
  // ("/././" -> "/./" -> "/"). Each successful pass strictly shortens the
  // string, so this always terminates.
  let collapsed = target;
  for (;;) {
    const next = collapsed.replace(/\/\.(\/|$)/g, "/").replace(/^\.\//, "");
    if (next === collapsed) {
      return collapsed;
    }
    collapsed = next;
  }
}

/**
 * Gap (Phase 3.7 hardening pass, second round): RFC 7230 §5.4 requires a
 * server to respond 400 to any request that names the Host header more
 * than once. Node's http parser doesn't do this itself -- for a small set
 * of headers, including Host, it silently keeps only the first value and
 * discards the rest, so `req.headers.host` can never reveal that a second,
 * different Host line was ever sent (confirmed: `Host: 127.0.0.1:<port>`
 * followed by `Host: evil.com` came back 200 with the real payload,
 * having silently ignored the second line rather than rejecting the
 * request). `req.rawHeaders` is the one place the duplicate is still
 * visible -- it holds every header line Node received, in order, before
 * that collapsing happens.
 */
function hasDuplicateHostHeader(rawHeaders: string[]): boolean {
  let count = 0;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i]?.toLowerCase() === "host") {
      count++;
    }
  }
  return count > 1;
}

/**
 * Builds the request handler exactly once per server (see
 * createViewServer, which calls this after the socket is already listening
 * and never again), closing over the payload -- built once at startup --
 * the SPA shell's bytes -- also read once at startup, see serveStatic's
 * own comment -- and the bound port, so every request is served from the
 * identical precomputed bytes and identical allow-list without re-reading
 * or re-validating anything per request. The read-once payload is
 * deliberate: the viewer is a snapshot of the manifest at the moment
 * `catalogus view` started, not a live tail of the file (see PLAN.md's
 * non-goals -- no file watching, no hot reload; see also createViewServer's
 * own comment on this).
 */
function createRequestHandler(webRoot: string, payload: ViewPayload, port: number, indexHtml: Buffer) {
  const payloadJson = JSON.stringify(payload);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (hasDuplicateHostHeader(req.rawHeaders)) {
      writeText(res, 400, "Bad Request");
      return;
    }

    if (!isAllowedHost(req.headers.host, port)) {
      writeText(res, 400, "Bad Request");
      return;
    }

    // Nothing behind this server ever writes -- GET and HEAD are the only
    // methods that mean anything here. Answering POST/PUT/DELETE/... with
    // the same 200 a GET would get isn't a data-integrity risk (there is
    // nothing to mutate), but it's a wrong signal to a caller that
    // expected a write to be possible, and it hides a caller's own bug
    // behind a false success (D4, Phase 3.7 hardening pass). HEAD needs no
    // special handling below: Node's own http server already omits the
    // response body for a HEAD request regardless of what a handler writes.
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      writeText(res, 405, "Method Not Allowed", { allow: "GET, HEAD" });
      return;
    }

    // Split on "?" ourselves rather than routing through the WHATWG URL
    // parser -- that parser silently collapses literal ".." segments
    // during its own path-parsing step, which would make the traversal
    // guard below look like it caught something it never actually saw.
    // req.url is used exactly as the client sent it up to this point, so
    // resolveStaticPath's own containment check is still the only thing
    // standing between a request and the filesystem outside webRoot.
    // toOriginFormPath (see its own comment) only strips a leading
    // scheme://authority and collapses "/./" segments -- it never touches
    // "..", so it changes nothing about what the guard below sees for any
    // traversal attempt.
    const rawUrl = req.url ?? "/";
    const pathname = toOriginFormPath(rawUrl.split("?")[0] || "/");

    // Case-insensitive, single-leading-slash form of pathname, used only
    // to decide whether a request belongs to the /api namespace at all --
    // never for static file resolution below, where the real (original-
    // case, still only query-stripped and origin-form) pathname keeps
    // deciding what's on disk. Without this normalization, a doubled
    // leading slash ("//api/project") or a differently-cased path
    // ("/API/project") missed the /api check entirely and fell through to
    // the static handler, which served index.html for it -- HTML where a
    // caller expected JSON, with no 404 to say the route doesn't exist as
    // typed (G4, Phase 3.7 hardening pass).
    const apiPath = pathname.replace(/^\/+/, "/").toLowerCase();

    if (apiPath === "/api/project") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", ...NOSNIFF_HEADERS });
      res.end(payloadJson);
      return;
    }
    if (apiPath === "/api" || apiPath.startsWith("/api/")) {
      // Never falls through to the SPA -- an unrecognized API route is a
      // 404, not the app shell, so a typo'd endpoint fails loudly instead
      // of silently rendering a blank page.
      writeText(res, 404, "Not found");
      return;
    }

    try {
      await serveStatic(webRoot, pathname, res, indexHtml);
    } catch (error) {
      writeText(res, 500, `Internal Server Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: unknown) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    // 127.0.0.1 only -- see this module's top comment.
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Starts the view server: checks the built web assets exist, loads and
 * validates the manifest, builds the payload once, and listens. Never opens
 * a browser -- see this module's top comment for why that split exists.
 *
 * `options.port` may be 0, which asks the OS for any free ephemeral port --
 * real Node http server behaviour, not a fallback this module invented. It
 * exists for tests that need an isolated server without guessing at a free
 * port or colliding with a `catalogus view` a developer already has running;
 * it is never what the CLI passes on a user's behalf (runView always passes
 * DEFAULT_VIEW_PORT or the user's own explicit --port, so "the port you
 * asked for is busy" still fails hard rather than silently picking another
 * one -- see runView).
 */
export async function createViewServer(targetDir: string, options: { port: number }): Promise<CreateViewServerOutcome> {
  const webRoot = await webDistDir();
  // Reads index.html into memory here, rather than merely checking that
  // webRoot exists as a directory or that index.html stat()s as a file.
  //
  // The directory-only version of this check let an isolated `pnpm
  // --filter @catalogus/cli build` (tsup's own `clean: true` -- see
  // tsup.config.ts), which can leave dist/web behind with an empty
  // assets/ subdirectory but no index.html, pass straight through to a
  // listening server that then 500'd on every request, GET / included
  // (D2, Phase 3.7 hardening pass). Checking `stat().isFile()` instead of
  // just directory existence closed that, but stat() only proves the
  // directory entry exists -- it says nothing about whether the process
  // can actually open the file. An index.html present but ACL-denied
  // still passed that check and still started a server that 500'd on
  // every request, which is verbatim the symptom the D2 fix claimed to
  // have closed (Defect 3, Phase 3.7 hardening pass, second round).
  // Attempting the real read here, before the server ever listens, closes
  // both that case and the zero-byte one in the same move: a present but
  // empty index.html used to serve a silent 200 with an empty body,
  // which is arguably worse than a clear startup failure since it looks
  // like success. Both now fail exactly like the missing-entirely case --
  // same exit code, same message, nothing ever listens -- because from
  // the caller's side "no usable build here" is the same fact regardless
  // of which of these three ways it's true.
  //
  // The bytes read here are also what gets served for the rest of this
  // process's life (see serveStatic's own comment) -- this is the one
  // read of index.html from disk, matching the payload's own "read once
  // at startup" discipline.
  let indexHtml: Buffer;
  try {
    indexHtml = await readFile(join(webRoot, "index.html"));
  } catch {
    indexHtml = Buffer.alloc(0);
  }
  if (indexHtml.length === 0) {
    return {
      ok: false,
      error: {
        exitCode: 1,
        stdout: [],
        stderr: [
          `Built web assets not found at ${webRoot}.`,
          '  run "pnpm build" from the repo root, then "catalogus view" again.',
        ],
      },
    };
  }

  const loaded = await loadValidManifest(targetDir);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }

  // "Read once" is the deliberate choice (see createRequestHandler's own
  // comment): the manifest is read here, at server start, and never again
  // for the life of this process. That's also the safe choice -- an edit
  // that makes catalogus.yaml malformed or empty mid-session can't crash a
  // server that never looks at it again. `readAt` records the one moment
  // this snapshot was taken so a viewer can tell it's a snapshot at all
  // (G2, Phase 3.7 hardening pass); rendering that value is the web UI's
  // job, not this module's.
  const readAt = new Date().toISOString();
  const payload = await buildViewPayload(loaded.value.location.filePath, loaded.value.manifest, readAt);

  const server = createServer();

  try {
    await listen(server, options.port);
  } catch (error) {
    const message =
      (error as NodeJS.ErrnoException).code === "EADDRINUSE"
        ? `Port ${options.port} is already in use. Pick another with --port <port>.`
        : `Could not start the view server on port ${options.port}: ${error instanceof Error ? error.message : String(error)}`;
    return { ok: false, error: { exitCode: 1, stdout: [], stderr: [message] } };
  }

  const address = server.address();
  const boundPort = typeof address === "object" && address !== null ? address.port : options.port;

  // The request handler is attached only now, after the real bound port is
  // known -- it needs that port for the Host-header check above (a
  // `port: 0` test server doesn't know its own port until listen()
  // resolves) -- and it is attached exactly once, matching the "built
  // once" claim createRequestHandler's own comment makes (D5, Phase 3.7
  // hardening pass: an earlier version rebuilt the handler, and
  // re-serialized the payload, on every single request). Nothing between
  // listen() resolving and this call yields to the event loop, so no
  // request can arrive before the listener below is in place.
  const handleRequest = createRequestHandler(webRoot, payload, boundPort, indexHtml);
  server.on("request", (req, res) => {
    void handleRequest(req, res);
  });

  return {
    ok: true,
    value: {
      url: `http://127.0.0.1:${boundPort}`,
      port: boundPort,
      // Gap (Phase 3.7 hardening pass, second round): `server.close()`
      // alone stops accepting new connections but its callback doesn't
      // fire until every currently-open connection ends on its own --
      // fine for a socket mid-request (the payload here is always written
      // in one synchronous res.end() call, so a real request completes
      // near-instantly), but a bare TCP connection that never sent a
      // request at all never ends by itself. Measured: such a socket left
      // close() unresolved for over 90 seconds, unbounded by anything
      // (not headersTimeout -- that only ever applies to a connection
      // that has started sending request headers).
      //
      // closeIdleConnections() (Node 18.2+) was the first thing tried
      // here, since it sounds like exactly this case -- it isn't: measured
      // directly, it only reaches sockets that have already completed at
      // least one request and are parked in the keep-alive pool between
      // requests. A socket that connects and then sends nothing is never
      // added to that tracked set at all, so closeIdleConnections() alone
      // left the exact case this is meant to fix completely unbounded
      // (reproduced: still open past 8 seconds in a standalone repro with
      // nothing else changed). It's kept below anyway -- it's free, and
      // does close the keep-alive-between-requests case instantly, which
      // is worth doing without waiting out the grace period below.
      //
      // closeAllConnections() does reach a request-less socket (measured:
      // resolves promptly), but it is unconditional -- it would sever a
      // response still being written just as readily as a socket that
      // never asked for anything. Calling it immediately would mean
      // "close" and "drop whatever's in flight" are the same operation;
      // giving it a short grace period first means a real in-flight
      // request (which finishes in low single-digit milliseconds here,
      // see above) already has time to complete normally, and only a
      // connection still open after that grace period -- which by
      // construction isn't finishing on its own -- gets force-closed.
      // 250ms is generous relative to the sub-millisecond completion time
      // observed for a real request; it is not tied to any protocol
      // timeout and can move if a slower caller ever needs it to.
      close: () =>
        new Promise<void>((resolve) => {
          const forceCloseTimer = setTimeout(() => {
            server.closeAllConnections();
          }, 250);
          server.close(() => {
            clearTimeout(forceCloseTimer);
            resolve();
          });
          server.closeIdleConnections();
        }),
    },
  };
}

/**
 * Best-effort browser launch: detached and stdio "ignore" so the spawned
 * process (and any window it owns) is fully independent of this one --
 * closing the terminal, or this process exiting, must not kill the
 * browser. A launch failure (headless CI, no GUI, an unrecognized
 * platform) must never crash the server: the URL is already in stdout,
 * which is the fallback every environment has regardless.
 */
function openBrowser(url: string): void {
  try {
    const [command, args]: [string, string[]] =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", '""', url]]
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {
      // Nothing to do beyond this -- the URL is already printed to stdout.
    });
    child.unref();
  } catch {
    // Same reasoning as above.
  }
}

export type ParsedPort = { ok: true; value: number } | { ok: false; message: string };

/**
 * Strict decimal parse for --port. `Number()`/`parseInt()` both accept
 * shapes the help text for this option doesn't promise: hex ("0x1000"),
 * exponential notation ("1e3"), decimals ("80.5"), a leading "+", Infinity,
 * and so on -- so validating with either of them lets the parser and the
 * message describing it drift apart (G3, Phase 3.7 hardening pass: `--port
 * 0x1000` used to start a server on 4096, and `--port 1e3` on 1000, neither
 * of which is "a whole number" by any reading a user typing that message
 * would expect). A regex anchors the accepted shape to exactly that.
 * Surrounding whitespace is still tolerated -- a shell-quoted `--port "
 * 4180 "` is a reasonable thing to type and isn't the ambiguity this guards
 * against.
 */
export function parsePortOption(raw: string): ParsedPort {
  const message = `--port must be a whole number between 1 and 65535, got "${raw}".`;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, message };
  }
  const value = Number(trimmed);
  if (value <= 0 || value > 65535) {
    return { ok: false, message };
  }
  return { ok: true, value };
}

export async function runView(pathArg: string | undefined, options: ViewCommandOptions = {}): Promise<CommandResult> {
  const targetDir = resolveTargetPath(pathArg);

  let port = DEFAULT_VIEW_PORT;
  if (options.port !== undefined) {
    const parsed = parsePortOption(options.port);
    if (!parsed.ok) {
      return { exitCode: 2, stdout: [], stderr: [parsed.message] };
    }
    port = parsed.value;
  }

  const started = await createViewServer(targetDir, { port });
  if (!started.ok) {
    return started.error;
  }
  const { url } = started.value;

  if (options.open !== false) {
    openBrowser(url);
  }

  return {
    exitCode: 0,
    stdout: [`Serving ${targetDir} at ${url}`, "  press Ctrl+C to stop"],
    stderr: [],
  };
}
