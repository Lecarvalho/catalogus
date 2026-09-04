// Pure: props in, nothing else. Renders the verified brand icon when one
// resolved server-side, or the rollup's generic fallback glyph when it
// didn't -- see ../fallback-icons.tsx for why the fallback keys off rollup
// rather than the catalog.
//
// A resolved icon now carries markup, not a bare `d` string: `icon.body` is
// arbitrary inner-SVG content (`<path>`, `<g>`, more than one element) built
// server-side by @catalogus/core's icons.ts from either the installed
// simple-icons package or a vendored thesvg.org file (docs/icons-brief.md).
// That is why this component reaches for `dangerouslySetInnerHTML` below
// instead of a `<path d={...}>` the way it used to -- see the render's own
// comment for why that is safe here specifically.
import type { ViewService } from "@catalogus/cli";

import { FallbackGlyph } from "../fallback-icons.js";
import styles from "./Icon.module.css";

export interface IconProps {
  /**
   * The icon @catalogus/cli's view payload resolved server-side, or null
   * when there is none -- @catalogus/core's resolveIcon never throws, so a
   * missing catalog row, an unmapped slug, or a vendored file that fails its
   * own sanitiser (icons.ts's parseIconMarkup) all degrade to null here
   * rather than reaching this component as an error.
   *
   * Typed as `ViewService["icon"]` rather than importing `ResolvedIcon` by
   * name: `@catalogus/cli`'s index.ts re-exports `ViewPayload`/`ViewService`
   * but not the `ResolvedIcon` type they carry, and widening that public
   * surface is outside this file's own scope (docs/icons-brief.md, Part B --
   * "Do not touch packages/"). Indexing the field off the type every call
   * site already imports names the exact same type, with nothing added to
   * @catalogus/cli's exports.
   */
  icon: ViewService["icon"];
  /** Used only when icon is null, to pick a generic glyph. */
  rollup: string;
  /** Display name, used as the accessible label either way. */
  label: string;
  /**
   * Render the mark in the brand's own colour instead of inheriting the
   * surrounding ink.
   *
   * Off by default, and every surface turns it on today -- the board too,
   * since candidate E (approved 2026-08-26; see ServiceTile.tsx's header).
   * The case this comment used to make for a monochrome board is worth
   * keeping because it is still true: 60 of 159 catalog slugs have no
   * verified icon and fall back to a generic mark, and in colour a board
   * splits into brand logos and grey holes, so two nodes in five look
   * broken on a render that is entirely correct. Candidate E's answer was
   * not to keep the board monochrome but to make the fallback a dashed
   * monogram tile that reads as deliberate beside a coloured mark. The
   * monochrome rule in Icon.module.css therefore has no live caller; it
   * stays because the approved shell's settings panel names a
   * brand-icon-colour toggle (docs/PLAN.md, the shell's open questions),
   * and a toggle needs an off state that already works.
   *
   * The fallback glyph is never coloured under any circumstances -- it
   * conveys a shape, never a brand, and tinting it would assert a brand
   * identity the catalog does not have.
   */
  colour?: boolean;
}

// No `title` on either span, deliberately. The button that wraps this icon
// already carries title="{name} — {role}", and HTML resolves a tooltip
// against the *nearest* ancestor carrying one -- so a title here won
// wherever the pointer happened to be over the icon, which is roughly half
// the node's clickable area. That made hover inconsistent (name+role over
// the text, name alone over the icon) and, on an uncatalogued entry, leaked
// "— no catalog icon", an implementation detail nobody asked about. The
// svg keeps aria-label for assistive tech, which is a different channel.

export function Icon({ icon, rollup, label, colour = false }: IconProps) {
  if (icon !== null) {
    return (
      // `styles.colour` is the entire JS-side half of the colour mechanism:
      // it flips a CSS rule off (Icon.module.css's own comment on why the
      // rest of this lives there, not here). It never touches `.fallback`,
      // whose branch is the early return below and never sees this class.
      <span className={`${styles.icon}${colour ? ` ${styles.colour}` : ""}`}>
        <svg
          viewBox={icon.viewBox}
          role="img"
          aria-label={label}
          // The one JS-side colour *value*. A single-ink mark (`hex !==
          // null`) is painted its own brand colour by setting the `color`
          // its `currentColor` fills resolve against -- never by rewriting
          // a fill, which would mean parsing `body` back apart after just
          // having trusted it whole. A multi-colour mark (`hex === null`)
          // has no single colour to hand back here and keeps its own fills
          // regardless of this attribute, the same "no such thing as one
          // colour" contract a multi-colour simple-icons mark never had a
          // way to express either.
          style={colour && icon.hex ? { color: icon.hex } : undefined}
          // Safe: `body` is produced server-side by @catalogus/core, from
          // either the installed simple-icons package (one <path> this
          // project's own resolver builds, unchanged from before) or a
          // vendored thesvg.org file whose sha256 is recorded in
          // packages/core/icons/thesvg/LICENSES.md and checked by a drift
          // test -- and every vendored file passes icons.ts's own sanitiser
          // (parseIconMarkup / hasForbiddenMarkup: no <script>, no
          // <foreignObject>, no event-handler attribute, no href, no
          // <style>) before it ever becomes this string, exercised in
          // icons.test.ts against a synthetic file carrying each of those.
          // The view payload this component receives never carries anything
          // manifest-authored -- it is plain data end to end -- so nothing
          // reaching this dangerouslySetInnerHTML came from a catalogus.yaml
          // a project owner wrote.
          dangerouslySetInnerHTML={{ __html: icon.body }}
        />
      </span>
    );
  }

  return (
    <span className={`${styles.icon} ${styles.fallback}`} data-testid="icon-fallback">
      <FallbackGlyph rollup={rollup} />
    </span>
  );
}
