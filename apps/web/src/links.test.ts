// Every external URL this app renders, checked against the one rule that
// matters for a link nobody has fetched: it is `https://` (never a bare
// domain that would resolve relative to whatever page rendered it, never
// `http://`) and it names this repo, not some other address that happened to
// look plausible.
import { describe, expect, it } from "vitest";

import { DOCUMENTATION_URL, EXTERNAL_LINKS, MANIFEST_FORMAT_REFERENCE_URL, REPO_URL } from "./links.js";

const REPO_PATH = "github.com/Lecarvalho/catalogus";

describe("links", () => {
  it("actually discovers more than one link, so an empty registry cannot pass as a clean one", () => {
    expect(Object.keys(EXTERNAL_LINKS).length).toBeGreaterThanOrEqual(2);
  });

  it.each(Object.entries(EXTERNAL_LINKS))("%s is https and points at this repo", (_name, url) => {
    expect(url.startsWith("https://")).toBe(true);
    expect(url).toContain(REPO_PATH);
  });

  it("documents the exact README anchor the owner named", () => {
    expect(DOCUMENTATION_URL).toBe("https://github.com/Lecarvalho/catalogus#readme");
  });

  it("points the manifest format reference at docs/user/manifest-format.md on main", () => {
    expect(MANIFEST_FORMAT_REFERENCE_URL).toBe("https://github.com/Lecarvalho/catalogus/blob/main/docs/user/manifest-format.md");
  });

  it("builds every other URL from the one repo URL, rather than repeating it", () => {
    expect(DOCUMENTATION_URL.startsWith(REPO_URL)).toBe(true);
    expect(MANIFEST_FORMAT_REFERENCE_URL.startsWith(REPO_URL)).toBe(true);
  });
});
