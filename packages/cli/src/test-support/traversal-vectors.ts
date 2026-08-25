// The path-traversal corpus for `catalogus view`'s static server.
//
// Why it is a committed fixture rather than a list inside a test: these
// vectors had been written and re-run three separate times, each time by an
// agent inside a session that no longer exists, and each time thrown away
// with the session. docs/PLAN.md recorded the property as proven and the
// repo held nothing that could re-prove it. "Verified by an agent that no
// longer exists" is not verification — it is a claim with no artifact behind
// it, and the containment of this server is the strongest security property
// in the project. Every future change to resolveStaticPath now re-earns it
// automatically or goes red.
//
// Test-only. Not exported from index.ts, so tsup never ships it.
//
// ## What a vector is
//
// The literal bytes of an HTTP request target, written straight onto a
// socket. Not a URL object, not a `fetch()` argument: both WHATWG URL and
// `fetch()` collapse `..` segments client-side before anything reaches the
// wire, so a traversal test built on either proves nothing about the
// server. See view-traversal.test.ts's `rawTraversalGet`.
//
// ## What is being proven
//
// Not "the server returns 403". A vector can be legitimately contained and
// still answer 200 — `/a/../index.html` resolves back inside the root, and
// serving it is correct. The property is about *content*: nothing outside
// `dist/web` is ever readable through this server. The test proves it two
// ways at once — a canary file planted one directory above the served root
// whose text must never appear in any response, and the rule that any 200
// must be byte-identical to the SPA shell.
//
// ## Coverage, by family
//
// Each family is a different way a path can mean something other than what
// a naive containment check reads it as. Vectors are grouped by family
// below and every group says what it is testing for, because a corpus whose
// entries look like line noise is a corpus nobody can extend correctly.
//
// ## What the families were measured to catch
//
// Established by mutating resolveStaticPath and re-running, not by
// reasoning about it — a corpus nobody has watched fail is a corpus nobody
// has tested:
//
//   - Deleting the containment check outright: **32 of 65 vectors go red**,
//     across literal, strip-bypass, encoded, backslash, windows-trailing,
//     ntfs-ads, absolute-form and api-prefixed.
//   - Replacing it with the classic naive guard (`pathname.includes("..")`
//     on the *raw*, undecoded target, then join and serve): **9 go red, and
//     not one of them is from the literal family** — six encoded, two
//     backslash, one absolute-form. That mutation is the argument for
//     keeping the encoded and backslash families: a corpus of literal
//     `../` vectors alone would have passed it green.
//
// One family is deliberately load-bearing in the other direction: see
// double-encoding below, where the expectation is containment *without* a
// second decode pass, and where an earlier comment here asserted something
// that executing it disproved.

export interface TraversalVector {
  /** The literal request target, as it goes on the wire after `GET `. */
  target: string;
  /** Which family this belongs to — grouped in the test output so a failure names the class, not just the string. */
  family: string;
}

/**
 * The canary's filename. Planted by the test one directory above the served
 * root (`packages/cli/dist/`, the parent of `dist/web`), so a vector that
 * escapes by even a single level reaches it. Deliberately carries a `.txt`
 * extension: `pickStaticFile` only falls back to the SPA shell for an
 * extensionless path, so a contained request for this name can only ever be
 * a 403 or a 404, never an ambiguous 200 that has to be argued about.
 */
export const CANARY_FILENAME = "catalogus-traversal-canary.txt";

/**
 * The canary's contents. A single short line so it cannot be split across
 * TCP segments, and a string that appears nowhere else in the repository so
 * a match in a response body is unambiguous.
 */
export const CANARY_CONTENT = "CATALOGUS-TRAVERSAL-CANARY-8f3d2b1a-ESCAPED-THE-WEB-ROOT";

/**
 * Markers of real files that sit above the served root, used alongside the
 * canary. The canary proves escape at depth 1; these prove it at depth 2
 * and depth 4, without planting anything of their own — a vector that
 * reaches them returns bytes carrying these strings.
 */
export const OUT_OF_ROOT_MARKERS = [
  CANARY_CONTENT,
  // packages/cli/package.json — two levels above dist/web.
  '"@catalogus/cli"',
  // The monorepo's own package.json — four levels above.
  "catalogus-monorepo",
];

export const TRAVERSAL_VECTORS: TraversalVector[] = [
  // --- Literal dot-dot -----------------------------------------------------
  // The baseline. If any of these leak, nothing else in this file matters.
  { family: "literal", target: `/../${CANARY_FILENAME}` },
  { family: "literal", target: `/./../${CANARY_FILENAME}` },
  { family: "literal", target: `//../${CANARY_FILENAME}` },
  { family: "literal", target: `/./././../${CANARY_FILENAME}` },
  { family: "literal", target: `/assets/../../${CANARY_FILENAME}` },
  { family: "literal", target: `/a/b/c/../../../../${CANARY_FILENAME}` },
  { family: "literal", target: `/index.html/../../${CANARY_FILENAME}` },
  { family: "literal", target: "/../../package.json" },
  { family: "literal", target: "/../../../../package.json" },
  { family: "literal", target: "/../../../../pnpm-workspace.yaml" },

  // --- Naive-strip bypasses ------------------------------------------------
  // Aimed at a guard that deletes "../" once, or that treats "..." and
  // "...." as ordinary names while the OS does not. `....//` becomes `../`
  // under a single non-repeating strip pass.
  { family: "strip-bypass", target: `/....//${CANARY_FILENAME}` },
  { family: "strip-bypass", target: `/..../${CANARY_FILENAME}` },
  { family: "strip-bypass", target: `/....\\${CANARY_FILENAME}` },
  { family: "strip-bypass", target: `/..;/${CANARY_FILENAME}` },
  { family: "strip-bypass", target: `/.././.././${CANARY_FILENAME}` },

  // --- Percent-encoded separators and dots ---------------------------------
  // The reason resolveStaticPath decodes before checking containment rather
  // than after: a guard that compares the raw pathname sees no ".." here at
  // all, and then hands the decoded form to the filesystem.
  { family: "encoded", target: `/..%2f${CANARY_FILENAME}` },
  { family: "encoded", target: `/%2e%2e/${CANARY_FILENAME}` },
  { family: "encoded", target: `/%2e%2e%2f${CANARY_FILENAME}` },
  { family: "encoded", target: `/%2E%2E%2F${CANARY_FILENAME}` },
  { family: "encoded", target: `/.%2e/${CANARY_FILENAME}` },
  { family: "encoded", target: `/%2e./${CANARY_FILENAME}` },
  { family: "encoded", target: `/%2e%2e%2f%2e%2e%2fpackage.json` },
  { family: "encoded", target: `/..%2f..%2f..%2f..%2fpackage.json` },

  // --- Backslash separators ------------------------------------------------
  // Windows treats "\" as a separator and POSIX does not, so a guard written
  // against "/" alone is a guard that holds on the developer's CI and not on
  // the owner's machine. This server runs on Windows by default.
  { family: "backslash", target: `/..\\${CANARY_FILENAME}` },
  { family: "backslash", target: `/..%5c${CANARY_FILENAME}` },
  { family: "backslash", target: `/..%5C${CANARY_FILENAME}` },
  { family: "backslash", target: `/%2e%2e%5c${CANARY_FILENAME}` },
  { family: "backslash", target: `/%2e%2e\\${CANARY_FILENAME}` },
  { family: "backslash", target: "/..%5c..%5cpackage.json" },
  { family: "backslash", target: "/..\\..\\package.json" },

  // --- Double encoding -----------------------------------------------------
  // These are contained today because resolveStaticPath decodes exactly
  // once, so "%252e" arrives as the literal text "%2e", which forms no ".."
  // segment and 404s as an ordinary (absent) filename.
  //
  // An earlier draft of this comment claimed a second decode pass "is what
  // would turn these into live traversals". That was written from reasoning
  // rather than from execution, and executing it disproved it: wrapping the
  // decode in a second decodeURIComponent and re-running this corpus left
  // all 65 vectors green, because the containment check runs *after*
  // decoding and catches the "../" a second pass produces just as it
  // catches a literal one. Recorded rather than deleted, because the
  // corrected version is the useful fact: containment does not depend on
  // decode depth, and these vectors pin that — whichever depth a future
  // change picks, nothing escapes.
  { family: "double-encoded", target: `/%252e%252e%252f${CANARY_FILENAME}` },
  { family: "double-encoded", target: `/%25%32%65%25%32%65/${CANARY_FILENAME}` },
  { family: "double-encoded", target: `/..%252f${CANARY_FILENAME}` },
  { family: "double-encoded", target: "/%252e%252e%252f%252e%252e%252fpackage.json" },

  // --- Overlong / malformed UTF-8 ------------------------------------------
  // The classic IIS bug: "%c0%af" is an illegal two-byte encoding of "/"
  // that some decoders accept. decodeURIComponent rejects it outright, which
  // is why resolveStaticPath returns null on a throw rather than falling
  // back to the raw text.
  { family: "overlong-utf8", target: `/%c0%ae%c0%ae%c0%af${CANARY_FILENAME}` },
  { family: "overlong-utf8", target: `/%c0%af${CANARY_FILENAME}` },
  { family: "overlong-utf8", target: `/..%c0%af${CANARY_FILENAME}` },
  { family: "overlong-utf8", target: `/%e0%80%ae%e0%80%ae/${CANARY_FILENAME}` },
  { family: "overlong-utf8", target: `/%uff0e%uff0e/${CANARY_FILENAME}` },
  { family: "overlong-utf8", target: `/%ff${CANARY_FILENAME}` },

  // --- Null bytes ----------------------------------------------------------
  // Truncation attacks against a check that reads the string in JS and then
  // hands it to a C API that stops at NUL.
  { family: "null-byte", target: `/..%00/${CANARY_FILENAME}` },
  { family: "null-byte", target: `/%00../${CANARY_FILENAME}` },
  { family: "null-byte", target: `/../${CANARY_FILENAME}%00.html` },
  { family: "null-byte", target: "/index.html%00.txt" },

  // --- Drive-absolute and UNC (Windows) ------------------------------------
  // path.join(root, "C:/Windows/win.ini") does not produce an absolute path,
  // but a guard that resolves instead of joining, or that strips the leading
  // slash and then trusts the remainder, can be walked off the volume
  // entirely.
  { family: "windows-absolute", target: "/C:/Windows/win.ini" },
  { family: "windows-absolute", target: "/C:\\Windows\\win.ini" },
  { family: "windows-absolute", target: "C:/Windows/win.ini" },
  { family: "windows-absolute", target: "/%43%3a/Windows/win.ini" },
  { family: "windows-unc", target: "//localhost/c$/Windows/win.ini" },
  { family: "windows-unc", target: "/\\\\localhost\\c$\\Windows\\win.ini" },
  { family: "windows-unc", target: "/%5c%5clocalhost%5cc$%5cWindows%5cwin.ini" },

  // --- NTFS alternate data streams -----------------------------------------
  // "file::$DATA" names the same bytes as "file" on NTFS, which is how a
  // source-disclosure bug survives an extension allowlist. Here it is aimed
  // at the canary rather than at a file inside the root: reading dist/web's
  // own index.html through an ADS name is not a containment failure.
  { family: "ntfs-ads", target: `/../${CANARY_FILENAME}::$DATA` },
  { family: "ntfs-ads", target: "/../../package.json::$DATA" },
  { family: "ntfs-ads", target: "/..\\..\\package.json::$DATA" },

  // --- Windows trailing dot / space ----------------------------------------
  // Win32 strips a trailing "." or " " from a path component, so "x.txt." and
  // "x.txt" name the same file while comparing unequal as strings.
  { family: "windows-trailing", target: `/../${CANARY_FILENAME}.` },
  { family: "windows-trailing", target: `/../${CANARY_FILENAME}%20` },
  { family: "windows-trailing", target: "/../../package.json." },

  // --- Absolute-form request targets ---------------------------------------
  // RFC 7230 §5.3.2: a client may send the whole URL on the request line. The
  // server's own routing has to reach the same guard on this path as on an
  // origin-form target, which is a real defect this project already fixed
  // once (an absolute-form target bypassed /api routing).
  { family: "absolute-form", target: `http://127.0.0.1/../${CANARY_FILENAME}` },
  { family: "absolute-form", target: "http://evil.example.com/../../package.json" },
  { family: "absolute-form", target: `http://127.0.0.1/%2e%2e%2f${CANARY_FILENAME}` },
  { family: "absolute-form", target: `http://127.0.0.1/..\\${CANARY_FILENAME}` },

  // --- Through the /api namespace ------------------------------------------
  // `/api/...` is routed away from the static handler entirely, so a
  // traversal wearing an /api prefix must not find a second, unguarded way
  // back into the filesystem.
  { family: "api-prefixed", target: `/api/../${CANARY_FILENAME}` },
  { family: "api-prefixed", target: `/api/../../${CANARY_FILENAME}` },
  { family: "api-prefixed", target: `/api/project/../../../${CANARY_FILENAME}` },
  { family: "api-prefixed", target: `/api%2f..%2f${CANARY_FILENAME}` },
];
