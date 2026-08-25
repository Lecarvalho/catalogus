// Pure: props in, nothing else. Renders the verified brand icon when one
// resolved server-side, or the rollup's generic fallback glyph when it
// didn't -- see ../fallback-icons.tsx for why the fallback keys off rollup
// rather than the catalog.
import { FallbackGlyph } from "../fallback-icons.js";
import styles from "./Icon.module.css";

export interface IconProps {
  /** simple-icons path data resolved server-side, or null when there is none. */
  iconPath: string | null;
  /** The brand's own colour as `#RRGGBB`, or null. Non-null exactly when `iconPath` is. */
  iconHex?: string | null;
  /** Used only when iconPath is null, to pick a generic glyph. */
  rollup: string;
  /** Display name, used as the accessible label either way. */
  label: string;
  /**
   * Render the mark in the brand's own colour instead of inheriting the
   * surrounding ink.
   *
   * Off by default, and the board leaves it off, which is the decision worth
   * recording. Colour is the fastest recognition cue there is, so the
   * temptation is to use it everywhere -- but 60 of 159 catalog slugs have no
   * verified icon and fall back to a category glyph. In monochrome a real
   * mark and a fallback sit at the same visual weight, so the fallback reads
   * as deliberate; in colour the board splits into brand logos and grey
   * holes, and two nodes in five look broken on a render that is entirely
   * correct. The fallback is the majority path, not an edge case
   * (docs/PLAN.md measured it before any of this was built).
   *
   * So colour is spent where a reader is looking at one thing and
   * recognition genuinely helps: the hover panel and the service page. The
   * fallback glyph is never coloured under any circumstances -- it conveys a
   * shape, never a brand, and tinting it would assert a brand identity the
   * catalog does not have.
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

export function Icon({ iconPath, iconHex = null, rollup, label, colour = false }: IconProps) {
  if (iconPath !== null) {
    // `currentColor` unless colour is asked for *and* a hex actually
    // resolved. Falling back to currentColor rather than to a default tint
    // keeps a missing hex looking like the monochrome mark it already is,
    // instead of like a wrong brand colour.
    const fill = colour && iconHex ? iconHex : "currentColor";
    return (
      <span className={styles.icon}>
        <svg viewBox="0 0 24 24" role="img" aria-label={label}>
          <path d={iconPath} fill={fill} />
        </svg>
      </span>
    );
  }

  return (
    <span className={`${styles.icon} ${styles.fallback}`} data-testid="icon-fallback">
      <FallbackGlyph rollup={rollup} />
    </span>
  );
}
