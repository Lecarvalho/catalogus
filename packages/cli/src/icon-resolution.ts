// Added 2026-09-04 (docs/custom-icon-brief.md, Part B): the one place that
// answers "which icon source does this service entry resolve to, and what
// actually renders". `commands/view.ts` (through view-payload.ts) and
// `commands/icons.ts` both need this exact answer -- view.ts to build the
// payload the browser draws and to warn about a stale pointer, icons.ts to
// print the same classification as a human-readable report -- and the
// contract in docs/custom-icon-brief.md is explicit that the two must never
// disagree about which tiles end up showing initials. Writing the
// resolution logic twice is exactly how that kind of disagreement happens
// (a fix landing in one call site and not the other), so it lives here
// once and both call sites import it.
//
// Two questions live in one function because they share the same two I/O
// reads (the entry's own local file, then the catalog fallback) and
// answering them separately would mean either two functions repeating that
// I/O, or a caller stitching the answers back together itself -- the same
// stitching this module exists to do once.
import { join, sep } from "node:path";

import { describeLocalIconRefusal, getCatalogEntry, resolveIcon, resolveLocalIcon } from "@catalogus/core";
import type { ResolvedIcon } from "@catalogus/core";
import type { ServiceEntry } from "@catalogus/schema";

/** Every thesvg ref @catalogus/core resolves is prefixed with this -- mirrors icons.ts's own THESVG_PREFIX, which is not exported (it is that module's own naming detail, not a fact this file needs a second copy of beyond the one prefix string). */
const THESVG_PREFIX = "thesvg:";

/**
 * The four sources a service entry's rendered icon can come from, as a
 * runtime array rather than only a type -- see IconSource below. Added
 * 2026-09-04 alongside skill-commands-drift.test.ts's own assertion tying
 * `skills/catalogus/SKILL.md`'s prose description of these four words
 * ("`local` ... `simple-icons` or `thesvg` ... or `none`", in its "7b. Fill
 * in missing icons" section) to this list: a type alone has no runtime
 * representation a test can iterate, and a hand-typed copy of the same four
 * strings in that test is exactly the kind of second copy this repo's own
 * history (this file's own top comment, on why resolution logic lives in
 * one place) keeps finding drifts. Renaming a source here now means editing
 * this one array, and both consumers -- the type below and the drift test
 * -- follow without a second edit.
 */
export const ICON_SOURCES = ["local", "simple-icons", "thesvg", "none"] as const;

/**
 * Which of ICON_SOURCES a service entry's rendered icon actually came from,
 * or would come from if it resolved -- see `source` on
 * ServiceIconResolution for what each value means to a reader of
 * `catalogus icons`.
 */
export type IconSource = (typeof ICON_SOURCES)[number];

export interface ServiceIconResolution {
  /**
   * "local" whenever the entry names its own `icon` field, regardless of
   * whether that file actually resolved -- see `stale` for that half of the
   * answer. Otherwise "simple-icons" or "thesvg" when the catalog entry for
   * `entry.service` has a verified icon ref that resolves, "none" when
   * nothing does.
   */
  source: IconSource;
  /** The entry's own `icon` field, verbatim, only when `source` is "local". */
  localPath?: string;
  /**
   * True only when `source` is "local" and the named file failed to
   * resolve -- missing, refused by the sanitiser, over MAX_ICON_BYTES, or
   * (the schema-bypass floor below) outside `.catalogus/icons/`. Always
   * false for every other source; a catalog ref that fails to resolve is
   * indistinguishable from one that was never there; `source` degrades to
   * "none" for it instead of reporting a catalog-side staleness this
   * package has no fix command for.
   */
  stale: boolean;
  /**
   * Set only when `stale` is true and the named file exists but was refused
   * -- over MAX_ICON_BYTES, or a markup shape @catalogus/core's sanitiser
   * refuses -- as opposed to simply absent. Undefined whenever `stale` is
   * false, and undefined (not, say, an empty string) for the "absent"
   * half of a stale entry too -- commands/icons.ts's "(missing file)" vs
   * "(refused: <reason>)" label branches on exactly this field being set,
   * not on its contents.
   *
   * D3 (validator, 2026-09-04): before this field existed, `stale: true`
   * was the entire answer, and "the file was never fetched" and "the file
   * was fetched and the sanitiser will refuse it again" were reported
   * identically -- both "(missing file)" -- even though an agent following
   * the skill's 7b loop needs to make a different decision for each: fetch
   * something for the first, pick a different source entirely for the
   * second, because re-fetching the same URL into the same refusal helps
   * nobody.
   */
  refusalReason?: string;
  /**
   * What actually renders: the entry's own icon when it resolved, else the
   * catalog fallback, else null. This is the field view-payload.ts's
   * ViewService.icon is built from, and the field commands/icons.ts's
   * summary line counts against -- not `source`, so the two commands agree
   * on which tiles show initials even for a "local" entry whose file is
   * stale but whose catalog fallback still renders.
   */
  icon: ResolvedIcon | null;
}

/**
 * The defensive floor under `entry.icon`, proven by a test that builds the
 * manifest object directly rather than going through the schema (see
 * icon-resolution.test.ts): the schema's own pattern
 * (`^\.catalogus/icons/(?!.*\.\.)...`) already refuses `..` and an absolute
 * path on write, so this can never trip for a manifest this CLI itself
 * wrote. It exists for the same reason @catalogus/core's SAFE_ICON_REF
 * exists beside a fixed, package-controlled table that also never needs
 * it: a floor under an assumption, not the mechanism enforcing it, in case
 * a manifest reaches this function some other way (hand-edited, or a
 * schema that changes shape under this code later).
 */
function isWithinIconsDir(manifestDir: string, absolutePath: string): boolean {
  const iconsDir = join(manifestDir, ".catalogus", "icons");
  const iconsDirWithSep = iconsDir.endsWith(sep) ? iconsDir : iconsDir + sep;
  // `absolutePath === iconsDir` (naming the directory itself, with no file
  // segment after it) is deliberately excluded -- entry.icon's schema
  // pattern always ends in `<name>.svg`, so a legitimate value can never
  // equal the bare directory; a value that does is already unusual enough
  // that treating it as "not contained" rather than "trivially contained"
  // is the safer read of an already-defensive floor.
  return absolutePath !== iconsDir && absolutePath.startsWith(iconsDirWithSep);
}

/**
 * Resolves one service entry's icon: the entry's own `icon` field first
 * (join()'d onto `manifestDir` and checked against the containment floor
 * above *before* ever reaching resolveLocalIcon -- see isWithinIconsDir's
 * own comment), falling back to the catalog ref @catalogus/core already
 * knew about (`getCatalogEntry(entry.service)?.icon`) when the local file
 * doesn't resolve or the entry never named one. Never throws: every path
 * below bottoms out in a resolver (resolveLocalIcon, resolveIcon) that is
 * itself never-throws, matching the contract every icon resolver in this
 * codebase keeps -- a broken icon degrades the tile, it never fails the
 * request that carries it.
 */
export async function resolveServiceIcon(manifestDir: string, entry: ServiceEntry): Promise<ServiceIconResolution> {
  const catalogEntry = getCatalogEntry(entry.service);

  if (entry.icon) {
    const absolute = join(manifestDir, entry.icon);
    const contained = isWithinIconsDir(manifestDir, absolute);
    const localIcon = contained ? await resolveLocalIcon(absolute) : null;
    if (localIcon) {
      return { source: "local", localPath: entry.icon, stale: false, icon: localIcon };
    }

    // Stale: named but unresolvable. Still falls back to the catalog icon
    // for `icon` (what the viewer actually draws), but `source` stays
    // "local" -- the entry named its own mark, and that is the fact
    // `catalogus icons` reports, with a "(missing file)" or "(refused:
    // <reason>)" suffix appended by its own caller depending on
    // `refusalReason` (see icon-resolution.test.ts and commands/icons.ts).
    //
    // D3: a path outside .catalogus/icons/ is reported as refused, not
    // missing, whether or not a file actually sits there -- the
    // containment floor above is what refused it, which is a fact worth
    // reporting on its own rather than folding into "nothing here yet".
    // Every other case asks @catalogus/core's own diagnostic function,
    // which re-runs the same stat/read/parse resolveLocalIcon above just
    // ran (see describeLocalIconRefusal's own comment on why that is an
    // accepted, reporting-only cost).
    const refusal = contained
      ? await describeLocalIconRefusal(absolute)
      : ({ kind: "refused", reason: "outside .catalogus/icons/" } as const);
    const refusalReason = refusal?.kind === "refused" ? refusal.reason : undefined;

    const fallback = await resolveIcon(catalogEntry?.icon);
    return { source: "local", localPath: entry.icon, stale: true, refusalReason, icon: fallback };
  }

  const catalogIcon = await resolveIcon(catalogEntry?.icon);
  if (catalogIcon === null) {
    return { source: "none", stale: false, icon: null };
  }
  const source: IconSource = catalogEntry?.icon?.startsWith(THESVG_PREFIX) ? "thesvg" : "simple-icons";
  return { source, stale: false, icon: catalogIcon };
}
