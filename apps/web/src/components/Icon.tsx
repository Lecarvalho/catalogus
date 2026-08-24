// Pure: props in, nothing else. Renders the verified brand icon when one
// resolved server-side, or the rollup's generic fallback glyph when it
// didn't -- see ../fallback-icons.tsx for why the fallback keys off rollup
// rather than the catalog.
import { FallbackGlyph } from "../fallback-icons.js";
import styles from "./Icon.module.css";

export interface IconProps {
  /** simple-icons path data resolved server-side, or null when there is none. */
  iconPath: string | null;
  /** Used only when iconPath is null, to pick a generic glyph. */
  rollup: string;
  /** Display name, used as the accessible label either way. */
  label: string;
}

// No `title` on either span, deliberately. The button that wraps this icon
// already carries title="{name} — {role}", and HTML resolves a tooltip
// against the *nearest* ancestor carrying one -- so a title here won
// wherever the pointer happened to be over the icon, which is roughly half
// the node's clickable area. That made hover inconsistent (name+role over
// the text, name alone over the icon) and, on an uncatalogued entry, leaked
// "— no catalog icon", an implementation detail nobody asked about. The
// svg keeps aria-label for assistive tech, which is a different channel.

export function Icon({ iconPath, rollup, label }: IconProps) {
  if (iconPath !== null) {
    return (
      <span className={styles.icon}>
        <svg viewBox="0 0 24 24" role="img" aria-label={label}>
          <path d={iconPath} fill="currentColor" />
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
