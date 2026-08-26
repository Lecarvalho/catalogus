// The product's identity in the app chrome, and **it deliberately has no
// glyph.** The wordmark is the whole mark for now.
//
// `docs/HANDOFF.md` §2 records the logo as genuinely open: the previous mark
// was a pun on a name that was dropped, so it does not carry over. A long
// exploration on 2026-08-25 produced candidates in three separate directions
// and the owner chose none of them, deferring the decision explicitly -- "the
// logo is something I need to think on my time". `docs/PLAN.md`'s handoff for
// that session carries what was tried and what each attempt taught, so the
// thinking is not lost; what is *not* carried is a leftover candidate sitting
// in the codebase looking finished.
//
// That deletion is the point. One candidate had already been drawn, tested,
// wired in and given a favicon before the deferral, and keeping it "for now"
// is precisely how a mark nobody chose becomes the mark. `PRODUCT.md`
// principle 3: a missing fact is shown as missing, never as a confident
// default. The empty slot is the honest render.
//
// When a glyph is chosen it comes in through `glyph`, sized to the cap height
// of the wordmark, and this comment is what should be deleted.
import type { ReactNode } from "react";

import styles from "./BrandMark.module.css";

export interface BrandMarkProps {
  /**
   * The chosen mark, once one exists. Absent today on purpose -- see the file
   * comment. Rendered before the wordmark so the lockup reads as one object
   * rather than as an icon with a label beside it.
   */
  glyph?: ReactNode;
}

export function BrandMark({ glyph }: BrandMarkProps) {
  return (
    <span
      className={styles.brand}
      // Greppable, and it is the honest state of this element. When a glyph is
      // passed the attribute goes with it, which makes "is the mark still
      // undecided?" answerable from the rendered DOM rather than only from
      // this file.
      {...(glyph ? {} : { "data-mark": "placeholder" })}
    >
      {glyph}
      <span className={styles.wordmark}>Catalogus</span>
    </span>
  );
}
