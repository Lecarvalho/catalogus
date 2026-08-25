// Pure. Renders one mark from service-tags.ts's vocabulary; decides nothing.
//
// Four tones and no more, taken from the world this viewer is built in:
// solid signal, outline signal, solid ink, solid grey, plus one quiet
// outline for the `kind` marks that are information rather than warning.
// Adding a fifth tone is how a tag system stops being readable, so the type
// is closed and lives in service-tags.ts.
import type { Tag as TagData } from "../service-tags.js";
import styles from "./Tag.module.css";

export interface TagProps {
  tag: TagData;
}

// The tone -> class lookup uses an own-property test rather than a bare
// index, for the reason StatusPill.tsx's header records at length: `styles`
// is a bundler-produced object this file does not own, so it cannot be
// rebuilt on a null prototype, and a bare `styles[tone]` would inherit from
// Object.prototype. `tone` is a closed union rather than manifest data, so
// this is a belt on top of braces -- but the rule after the fifth instance
// was that every keyed lookup gets one, without relitigating whether this
// particular caller is safe.
export function Tag({ tag }: TagProps) {
  const toneClass = Object.prototype.hasOwnProperty.call(styles, tag.tone) ? styles[tag.tone] : "";

  return (
    <span className={`${styles.tag} ${toneClass}`} title={tag.title}>
      {tag.label}
    </span>
  );
}
