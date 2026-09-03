// The left rail: who this project is, and the way into its bands.
//
// FIRST VIEWPORT (apps/web/docs/DIRECTION.md) puts exactly this here -- "left
// rail (240px, collapses below 900px): project identity and its architecture
// sentence, the manifest path, then the band index with counts, no search
// field" -- and the approved mockup draws it. Both halves of that sentence are
// load-bearing. The identity moved here out of the masthead the board used to
// carry, and the band index is what replaces the search field the owner ruled
// out ("No search. Bands and the left rail carry finding.").
//
// Pure: props in, no fetch, no `window`, no module-level state, like every
// component below App.tsx.
//
// **Absent fields are omitted, never filled.** The visibility chip renders
// only when the manifest declares `project.vcs.visibility` and the
// architecture sentence only when someone wrote one. That is CLAUDE.md's
// ask-never-guess rule at the render layer, and it is the same rule the
// retired `ProjectHeader` followed for the same two fields: a chip reading
// "private" on a project nobody answered for is a wrong answer that looks
// like a right one, where a missing chip is visibly a missing chip.
//
// **No scroll-spy and no current-band highlight.** The mockup has neither, and
// a rail that tracks the scroll position is a different component with a
// different failure mode (an observer that fires during a momentum scroll, on
// a page whose whole argument is that it is scrolled). These are plain anchor
// jumps; the browser does the work.
import type { ViewPayload } from "@catalogus/cli";

import type { BandGroup, BandId } from "../bands.js";
import styles from "./Rail.module.css";

export interface RailProps {
  project: ViewPayload["project"];
  /** Absolute path of the manifest being served. Wraps rather than truncates here -- see the stylesheet. */
  manifestPath: string;
  /**
   * The bands to index, already grouped by `groupIntoBands` so this list is
   * the board's own -- same order, same membership, same counts.
   *
   * Empty means "render no index", which is what the graph and the migrations
   * views pass: their anchors would have no target on the page. Empty rather
   * than a `showIndex` flag beside a populated list, because there is exactly
   * one condition under which the index is correct -- the sections it links to
   * are mounted -- and two arguments can disagree about it.
   */
  bands: readonly BandGroup[];
}

/**
 * The DOM id of one band's section on the board.
 *
 * `BandModule.tsx` builds the same string for the `id` it puts on its
 * `<section>`, and that file is not this brief's to edit, so the scheme is
 * written twice. What keeps the two from drifting is not this comment: it is
 * `Rail.test.tsx`, which renders a real `BandModule` and asserts that the
 * href this produces finds it. A duplicated id scheme with no executable link
 * between its two halves is the shape of defect this repo has shipped twice --
 * a focus restore that silently finds nothing, on the migration board and then
 * in `App.tsx` -- and it fails the same way here: an anchor that jumps nowhere
 * looks like a page that did not scroll.
 */
export function bandSectionDomId(band: BandId): string {
  return `band-${band}`;
}

export function Rail({ project, manifestPath, bands }: RailProps) {
  const visibility = project.vcs?.visibility;

  return (
    // A plain `<div>`, not the mockup's `<nav class="rail">`. The rail's
    // identity block is not navigation, and on the graph and migrations views
    // it is the *only* thing in here -- a navigation landmark holding a project
    // name and nothing to navigate to announces a promise the element does not
    // keep. The `<nav>` below wraps the part that genuinely is one, and only
    // when it exists. Nothing about the render changes; the semantics stop
    // being a claim.
    <div className={styles.rail}>
      {/*
        Not an `<h1>`. The project name is chrome here, and the document's own
        heading belongs to whatever the board is showing -- on a service page
        that is the service, and App.tsx's masthead comment records what two
        `<h1>`s on one document cost. Rendering this as a heading would put the
        project's name above the service's on the service's own page.
      */}
      <div className={styles.name}>{project.name}</div>

      {visibility && <span className={styles.visibility}>{visibility}</span>}

      {/*
        The architecture sentence: the one piece of prose a human wrote about
        this project on purpose, and until Layer 3 pages exist the only prose
        the viewer has at all. Below 900px the rail is hidden and this sentence
        is shown nowhere -- see AppShell.module.css's breakpoint comment, which
        records that as the mockup's choice rather than an oversight.
      */}
      {project.architecture && <p className={styles.sentence}>{project.architecture}</p>}

      <div className={styles.manifest}>{manifestPath}</div>

      {bands.length > 0 && (
        <>
          <div className={styles.divider} />
          <nav aria-label="Bands">
            <div className={styles.heading}>Bands</div>
            {bands.map((group) => (
              <a key={group.band.id} className={styles.band} href={`#${bandSectionDomId(group.band.id)}`}>
                <span>{group.band.label}</span>
                {/*
                  The count is read out, unlike the band module's own copy of
                  it, which is `aria-hidden` because the heading beside it
                  already names the band. Here it is the row's second half and
                  the only thing distinguishing "Holds data 7" from "Holds data
                  1" to a reader who cannot see the column.
                */}
                <span className={styles.count}>{group.services.length}</span>
              </a>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
