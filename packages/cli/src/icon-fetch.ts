// The fetch/copy/sanitise/write pipeline behind `catalogus set
// services.<id>.icon <https-url|path>` (docs/custom-icon-brief.md, Part B).
// Split out of commands/set.ts so that file stays the argument parser it
// is -- everything here is I/O (network or filesystem) and untrusted-bytes
// handling, not command-line shape checking; set.ts still owns classifying
// the raw value into an https:// URL or a local path (SETTABLE_FIELDS and
// the two-shapes usage error are its business, not this module's) before
// ever calling into here.
//
// Two-phase on purpose: prepareIconVendor fetches or reads the bytes,
// writes them to a *temporary* file under `.catalogus/icons/`, and runs
// them through @catalogus/core's resolveLocalIcon -- the exact sanitiser
// the vendored file will be read through at view time, so a file this
// module accepts is a file the viewer can always draw. Nothing at the real
// destination path is touched yet. commitIconVendor only renames that temp
// file onto the destination. Splitting it this way is what lets
// commands/set.ts vendor several `services.<id>.icon` edits in one call
// (`set` accepts trailing pairs -- see set.ts's own module comment) without
// leaving a dangling vendored file for an edit whose sibling in the same
// call later fails: every edit is prepared first, and only committed once
// every edit in the call has prepared cleanly. discardIconVendor unlinks a
// prepared-but-not-committed temp file for exactly that rollback path.
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { MAX_ICON_BYTES, resolveLocalIcon } from "@catalogus/core";

import { errorMessage } from "./types.js";

/** The two value shapes `catalogus set services.<id>.icon` accepts -- classified by commands/set.ts before this module ever sees a value. */
export type IconSourceShape = { kind: "url"; url: string } | { kind: "path"; path: string };

export interface PreparedIconVendor {
  /** Where the sanitised bytes currently sit -- inside `.catalogus/icons/`, but not yet at their final name. */
  tempPath: string;
  /** The real destination: `.catalogus/icons/<id>.svg`, absolute. */
  destPath: string;
  /** Repo-relative form of destPath -- what gets written into the manifest's `icon` field. */
  relativePath: string;
  /**
   * Set only when the source was a URL: the fetched URL reduced to its
   * origin and final path segment's filename (a credential can live in a
   * URL's query string, fragment, *or* path -- see originAndFilename's own
   * doc, and this module's own fetch step, for why only those two pieces
   * are ever kept, and why 2026-09-04's validator run found that stripping
   * only the query and fragment was not enough), plus the date it was
   * fetched. commands/set.ts attaches this as a YAML comment on the `icon`
   * node. Left unset for a local-path source: nothing about a caller's own
   * filesystem layout belongs in a file this repo commits.
   */
  comment?: string;
}

export type PrepareIconOutcome = { ok: true; value: PreparedIconVendor } | { ok: false; message: string };

/** How long a fetch (including every redirect hop) may take before this module gives up. */
const FETCH_TIMEOUT_MS = 15_000;

/** Generous headroom against a redirect loop; no real icon host needs anywhere near this many hops. */
const MAX_REDIRECTS = 5;

type ByteResult = { ok: true; bytes: Buffer } | { ok: false; message: string };

/**
 * Follows redirects itself (`redirect: "manual"`) rather than letting
 * `fetch` follow them transparently, because the contract requires
 * inspecting *every* hop's target and refusing the first one that isn't
 * `https:` -- transparent following gives no way to see an intermediate
 * Location header at all. One AbortSignal.timeout covers the whole chain,
 * not each hop individually, so a host that redirects slowly several times
 * in a row can't outlast the 15s budget by resetting the clock on each hop.
 */
async function followToOk200(
  startUrl: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<{ ok: true; response: Response } | { ok: false; message: string }> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetchImpl(url, { redirect: "manual", signal });
    } catch (error) {
      return { ok: false, message: `could not fetch "${url}": ${errorMessage(error)}` };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return { ok: false, message: `"${url}" redirected (${response.status}) with no Location header.` };
      }
      let nextUrl: string;
      try {
        nextUrl = new URL(location, url).toString();
      } catch {
        return { ok: false, message: `"${url}" redirected to an unparseable location "${location}".` };
      }
      if (!/^https:\/\//i.test(nextUrl)) {
        return { ok: false, message: `"${url}" redirected off https to "${nextUrl}" -- refused.` };
      }
      url = nextUrl;
      continue;
    }

    if (response.status !== 200) {
      return { ok: false, message: `"${url}" responded ${response.status}, expected 200.` };
    }
    return { ok: true, response };
  }
  return { ok: false, message: `"${startUrl}" redirected more than ${MAX_REDIRECTS} times -- refused.` };
}

/**
 * Reads a Response body while counting bytes as they arrive, refusing as
 * soon as the running total passes the cap -- deliberately not a check
 * against the `content-length` header, which a host can misstate (or omit,
 * for a chunked response). Falls back to `arrayBuffer()` for a Response
 * whose `body` isn't a stream (a hand-built test double, e.g.), checking
 * the same cap against the fully-read length in that case.
 */
async function readBodyCapped(response: Response, capBytes: number): Promise<ByteResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > capBytes) {
      return { ok: false, message: `response body is over ${capBytes} bytes -- refused.` };
    }
    return { ok: true, bytes: buffer };
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > capBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, message: `response body is over ${capBytes} bytes -- refused.` };
    }
    chunks.push(Buffer.from(value));
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}

async function fetchIconBytes(url: string, fetchImpl: typeof fetch): Promise<ByteResult> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const followed = await followToOk200(url, fetchImpl, signal);
  if (!followed.ok) {
    return followed;
  }
  try {
    return await readBodyCapped(followed.response, MAX_ICON_BYTES);
  } catch (error) {
    // D2 (validator, 2026-09-04): readBodyCapped's reader.read() call
    // above was not itself wrapped -- a response whose headers arrive
    // (followToOk200 above already succeeded) but whose *body* then stalls
    // rejects that read() call once the same FETCH_TIMEOUT_MS
    // AbortSignal.timeout fires, and that rejection used to propagate
    // straight out of this function unframed: "The operation was aborted
    // due to timeout", with none of the "could not fetch "<url>": ..."
    // context followToOk200's own fetchImpl() failure a few lines up
    // already gets. Framed identically here, so a caller sees the same
    // shape regardless of which half of the request -- headers or body --
    // actually failed. This also closes the leak half of D2: a throw here
    // used to skip past prepareIconVendor's and runSet's normal
    // `{ ok: false }` handling entirely (see set.ts's own D1/D2 comment for
    // the other, complementary half of that fix), so a sibling edit's
    // already-staged temp file in the same `set` call was left on disk.
    // Returning a proper ByteResult failure here means prepareIconVendor
    // never throws for this case at all -- the ordinary discard path below
    // handles it exactly like a 404 or an oversized body already did.
    return { ok: false, message: `could not fetch "${url}": ${errorMessage(error)}` };
  }
}

/**
 * Stats before reading, the same cheap-check-before-full-read shape
 * @catalogus/core's resolveLocalIcon itself uses -- a local path naming a
 * file far over the cap is refused by one stat() call, not by reading the
 * whole thing into memory first. Unlike the fetch path, a filesystem
 * stat's `size` is not something a remote party can misstate, so there is
 * no separate streaming-and-counting step needed here.
 */
async function readLocalIconBytes(sourcePath: string): Promise<ByteResult> {
  let info;
  try {
    info = await stat(sourcePath);
  } catch (error) {
    return { ok: false, message: `could not read "${sourcePath}": ${errorMessage(error)}` };
  }
  if (!info.isFile()) {
    return { ok: false, message: `"${sourcePath}" is not a file.` };
  }
  if (info.size > MAX_ICON_BYTES) {
    return { ok: false, message: `"${sourcePath}" is ${info.size} bytes, over the ${MAX_ICON_BYTES}-byte cap -- refused.` };
  }
  try {
    return { ok: true, bytes: await readFile(sourcePath) };
  } catch (error) {
    return { ok: false, message: `could not read "${sourcePath}": ${errorMessage(error)}` };
  }
}

/**
 * Reduces a fetched URL to its origin and final path segment's filename,
 * for the YAML comment -- see PreparedIconVendor.comment's own doc.
 *
 * No-secrets (validator, 2026-09-04): this used to strip only the query
 * string and fragment, on the theory that a signed URL's *query* is where a
 * credential lives. The validator found the gap -- a presigned URL's token
 * can live in the *path* instead: a matrix parameter with no "?" at all
 * (`/clean.svg;sig=<32 hex>`), or a bearer-token directory segment
 * (`/dl/<token>/logo.svg`) -- and both landed verbatim in a comment this
 * repo commits. There is no way to tell a path segment that is a filename
 * from one that is a token by inspecting it alone: "clean.svg" and a
 * 32-character hex string are both just path segments. So the fix keeps
 * only what is never a credential on any URL shape -- the origin (scheme +
 * host + port) and the *final* path segment, read as a filename for a
 * reader's benefit, never trusted as proof of anything -- and drops every
 * other segment outright, whether or not it happens to carry a secret.
 * `;`-delimited matrix parameters on that final segment are stripped too
 * (RFC 3986 allows an unescaped `;` inside a path segment, and some hosts
 * use it exactly this way for a signature -- "clean.svg;sig=<hex>" is one
 * segment, not two, so taking "the last /-separated piece" alone would not
 * have caught it).
 */
function originAndFilename(rawUrl: string): string {
  const url = new URL(rawUrl);
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const lastSegment = segments.at(-1);
  const filename = lastSegment?.split(";")[0];
  return filename ? `${url.origin} (${filename})` : url.origin;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetches or copies one service entry's icon, sanitises it, and stages it
 * under `.catalogus/icons/` -- but does not yet touch the real destination
 * path; see this module's own top comment on why that is deliberate and
 * commitIconVendor/discardIconVendor for the two ways a caller resolves a
 * staged vendor.
 *
 * `fetchImpl` defaults to `globalThis.fetch` and exists so tests never open
 * a real socket -- pass a stub that returns canned Response objects, or (to
 * prove redirect handling for real) stand up a local `node:http` server the
 * way commands/view.test.ts does.
 */
/**
 * D4 (validator, 2026-09-04): mkdir has to run before the sanitiser check
 * can even happen -- resolveLocalIcon reads its argument off disk, so there
 * is no way to sanitise the bytes before *something* is written somewhere
 * for it to read. That leaves a real gap on a refusal: the very first
 * `set services.<id>.icon` call against a repo with no `.catalogus/icons/`
 * yet creates the directory, then immediately empties it again (the one
 * temp file it held gets unlinked), leaving an empty `.catalogus/icons/`
 * sitting in the repo after a call that wrote nothing -- state `catalogus
 * validate` has no opinion about and a human poking around the repo would
 * not expect a refused command to have left behind. Removing it again here
 * closes that gap, called from both prepareIconVendor's own refusal branch
 * and discardIconVendor (the rollback path a sibling edit's failure takes,
 * in set.ts) -- the same "is this now empty" check applies whichever route
 * left the directory holding nothing.
 *
 * Only removes it when it is *still* genuinely empty: a concurrent
 * successful `set` call for a different id, or a file this project already
 * vendored before this call ran, must never be swept away by a sibling
 * call's failure. Best-effort throughout -- a failed readdir/rmdir here (an
 * already-gone directory, a permissions error, a race) is not itself a
 * reason to change the outcome of whichever vendor call is already
 * refusing or rolling back for its own reason.
 *
 * Also removes the *parent* `.catalogus/` directory when removing
 * `.catalogus/icons/` leaves that empty too -- `mkdir(iconsDir, {
 * recursive: true })` in prepareIconVendor creates both levels at once on a
 * repo that has neither yet, so a refusal that undoes the inner one and
 * stops there still leaves a bare, empty `.catalogus/` behind. `.catalogus/`
 * holds nothing this codebase manages besides `icons/` today, so "empty
 * after icons/ is gone" is the correct signal here, the same way "empty"
 * is the signal for icons/ itself above.
 */
async function removeIconsDirIfEmpty(iconsDir: string): Promise<void> {
  try {
    const entries = await readdir(iconsDir);
    if (entries.length === 0) {
      await rmdir(iconsDir);
      const parent = dirname(iconsDir);
      const parentEntries = await readdir(parent);
      if (parentEntries.length === 0) {
        await rmdir(parent);
      }
    }
  } catch {
    // See this function's own doc comment: best-effort.
  }
}

export async function prepareIconVendor(
  manifestDir: string,
  serviceId: string,
  shape: IconSourceShape,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<PrepareIconOutcome> {
  const bytes = shape.kind === "url" ? await fetchIconBytes(shape.url, fetchImpl) : await readLocalIconBytes(shape.path);
  if (!bytes.ok) {
    return bytes;
  }

  const iconsDir = join(manifestDir, ".catalogus", "icons");
  await mkdir(iconsDir, { recursive: true });

  // A random suffix, not just `.tmp`: `set` can vendor more than one icon
  // in a single call (trailing <field> <value> pairs), and two concurrent
  // prepareIconVendor calls for different ids must never collide on the
  // same temp filename.
  const tempPath = join(iconsDir, `.${serviceId}.svg.${randomUUID()}.tmp`);
  await writeFile(tempPath, bytes.bytes);

  // The same sanitiser a vendored file is read back through at view time
  // (resolveLocalIcon), run here before the bytes ever reach the real
  // destination -- see @catalogus/core's icons.ts for exactly what it
  // refuses (<script>, <foreignObject>, on*=, href, <style>, a nested
  // <svg>, no viewBox) and MAX_ICON_BYTES for the size half, already
  // enforced above but re-checked here for free since resolveLocalIcon
  // stats before it reads.
  const resolved = await resolveLocalIcon(tempPath);
  if (!resolved) {
    await unlink(tempPath).catch(() => {});
    // D4: this call created iconsDir above (or found it already there);
    // now that the one file it just staged is gone again, remove the
    // directory too if that leaves it empty -- see removeIconsDirIfEmpty's
    // own comment.
    await removeIconsDirIfEmpty(iconsDir);
    return {
      ok: false,
      message:
        "the SVG did not pass the sanitiser (a <script>, <foreignObject>, on*= handler, <a href>/<use " +
        "xlink:href>, <style> block, a url(...) reference that isn't a same-document #fragment, nested <svg>, " +
        "missing viewBox, or a file over the size cap all refuse here) -- pick a different source rather than " +
        "retrying this one.",
    };
  }

  const destPath = join(iconsDir, `${serviceId}.svg`);
  const relativePath = `.catalogus/icons/${serviceId}.svg`;
  const comment = shape.kind === "url" ? `fetched from ${originAndFilename(shape.url)} on ${today()}` : undefined;

  return { ok: true, value: { tempPath, destPath, relativePath, comment } };
}

/** Commits a staged vendor: renames the temp file onto the real destination, replacing whatever was already there (re-running `set` on an entry that already has a vendored icon replaces it, same as every other field). */
export async function commitIconVendor(prepared: PreparedIconVendor): Promise<void> {
  await rename(prepared.tempPath, prepared.destPath);
}

/**
 * Discards a staged vendor that will never be committed -- used to roll
 * back an earlier icon edit in the same `set` call after a later one in
 * that call fails to prepare or the manifest write itself fails or throws
 * (see set.ts's own D1/D2 comment). Best-effort: the temp file is already
 * inert (nothing references it), so a failed unlink here is not itself a
 * reason to fail the command.
 *
 * Also removes `.catalogus/icons/` if discarding this temp file leaves it
 * empty (D4, validator, 2026-09-04) -- the multi-pair sibling of the same
 * gap prepareIconVendor's own refusal branch closes: `set
 * services.a.icon <local-path> services.b.icon <url-that-fails>` stages
 * `a`'s file successfully before `b` fails, and rolling `a` back through
 * this function is exactly the path that would otherwise leave the
 * directory mkdir created standing empty. dirname(prepared.tempPath) is
 * always `.catalogus/icons/` itself -- see prepareIconVendor's own
 * `tempPath` construction -- so no caller needs to pass it separately.
 */
export async function discardIconVendor(prepared: PreparedIconVendor): Promise<void> {
  await unlink(prepared.tempPath).catch(() => {});
  await removeIconsDirIfEmpty(dirname(prepared.tempPath));
}
