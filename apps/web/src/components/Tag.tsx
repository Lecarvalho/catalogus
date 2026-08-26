// Pure. Renders one mark from service-tags.ts's vocabulary; decides nothing.
//
// Four tones and no more, taken from the world this viewer is built in:
// solid signal, outline signal, solid ink, solid grey, plus one quiet
// outline for the `kind` marks that are information rather than warning.
// Adding a fifth tone is how a tag system stops being readable, so the type
// is closed and lives in service-tags.ts.
//
// ---
//
// **The keyed-lookup defect, recorded here because this is where the repo
// points.** This account lived in `StatusPill.tsx`, which several files still
// cite by name; the pill was deleted on 2026-08-26 when this component became
// the only status vocabulary, and moving the account is cheaper than losing
// it.
//
// A plain object literal read with a manifest-derived key resolves through
// `Object.prototype`: a key like `constructor` comes back as the `Object`
// function -- truthy, so every `??` fallback is skipped, and React is handed
// a function to render. It has landed five times in this repo
// (`getCatalogEntry`; then `GLYPHS`, which blanked the whole viewer with no
// error UI; then `ROLLUP_LABELS`, caught just before shipping; and twice
// more), and **every existing test passed each time**, because the tests
// named keys that were *absent* rather than *inherited* -- different things,
// and only one of them is a bug. The standing rule after the third instance:
// every keyed lookup gets `Object.create(null)` or a `Map`, plus a test that
// names `"constructor"`, without relitigating whether that particular caller
// happens to be safe.
//
// **And a second one, about the guard rather than the defect.** Under this
// repo's vitest CSS-modules handling, `styles` is not a plain object: a bare
// `styles[key]` fabricates a string for *any* key, so a pollution guard
// asserted against the real `styles` object asserts nothing -- mock the
// stylesheet to a real `{}` to test one. `ServiceNode.tsx` hit the mirror
// image of the same thing on 2026-08-26: `hasOwnProperty` disagrees with that
// fabricating `get`, so the own-property test below returns false for keys
// that do resolve, and a component guarded that way can silently paint
// nothing. `ServiceNode.tsx` uses a `Map` built from known keys instead,
// which is immune in both environments. This component had the own-property
// form too, and measuring it on 2026-08-26 settled the question rather than
// arguing it: under this harness `styles["ink-solid"]` returns a real class
// string, `styles["not-a-real-class"]` returns one just as happily,
// `hasOwnProperty` answers false for both, and `Object.keys` reports zero. So
// every `Tag` rendered in every test carried **no tone class at all**, and no
// test could have noticed, because none of them asserted one. It uses the
// same `Map` as `ServiceNode.tsx` now, and `Tag.test.tsx` pins a real tone's
// class so the map cannot quietly stop resolving.
import type { Tag as TagData } from "../service-tags.js";
import styles from "./Tag.module.css";

export interface TagProps {
  tag: TagData;
}

// The tone -> class lookup, as a `Map` built once from the five tone names
// the closed union admits. A `Map` has no prototype chain for a key to
// resolve through and no separate presence check to disagree with its own
// lookup, so it is right under both the bundler's real stylesheet object and
// the fabricating one the test harness substitutes -- which the own-property
// form it replaces was not. See the header for the measurement.
const TONE_CLASSES: ReadonlyMap<string, string | undefined> = new Map([
  ["signal-solid", styles["signal-solid"]],
  ["signal-outline", styles["signal-outline"]],
  ["ink-solid", styles["ink-solid"]],
  ["grey-solid", styles["grey-solid"]],
  ["quiet-outline", styles["quiet-outline"]],
]);

export function Tag({ tag }: TagProps) {
  const toneClass = TONE_CLASSES.get(tag.tone) ?? "";

  return (
    <span className={`${styles.tag} ${toneClass}`} title={tag.title}>
      {tag.label}
    </span>
  );
}
