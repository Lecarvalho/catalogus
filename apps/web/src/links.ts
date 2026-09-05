// Every external URL this app renders, named once so the Help panel, the
// profile menu and the footer can never point at three different addresses
// for the same thing -- and so a new one can be checked in one place rather
// than wherever it happened to be typed.
//
// Both URLs below are the owner's own choice, 2026-09-05 (docs/menus-brief.md,
// owner answer 3), made because this repo holds no documentation site of its
// own yet: "the owner's choice until a docs site exists". Neither is a guess
// this app made on the owner's behalf -- CLAUDE.md's standing rule is that an
// absent field is the honest render until an owner names the fact, and here
// the owner named it.
//
// The manifest format reference points into `docs/user/`, which a parallel
// agent is writing under a separate brief at the same time as this one; the
// URL is fixed by this brief regardless of when that page lands, so it is
// linked now rather than withheld until the other agent's commit lands.

/** The repo this app and its documentation live in. Every other URL below is built from it, so a single correction here corrects every link at once. */
export const REPO_URL = "https://github.com/Lecarvalho/catalogus";

/** The Help panel's and the profile menu's "Documentation" link, and the footer's. */
export const DOCUMENTATION_URL = `${REPO_URL}#readme`;

/** The Help panel's "Manifest format reference" link -- the page docs/user/manifest-format.md renders as, on GitHub's own blob viewer. */
export const MANIFEST_FORMAT_REFERENCE_URL = `${REPO_URL}/blob/main/docs/user/manifest-format.md`;

/**
 * Every URL above, keyed for iteration -- what links.test.ts walks so a URL
 * added later is checked by construction rather than by remembering to add
 * a matching assertion.
 */
export const EXTERNAL_LINKS: Readonly<Record<string, string>> = {
  repo: REPO_URL,
  documentation: DOCUMENTATION_URL,
  manifestFormatReference: MANIFEST_FORMAT_REFERENCE_URL,
};
