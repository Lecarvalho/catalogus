// The footer: what this page is a view *of*, and how stale it is.
//
// FIRST VIEWPORT names the contents exactly -- "a footer: the manifest path
// and read time, the service/dependency/rollup counts, the CLI version, a
// documentation link, the schema URL" -- and the approved mockup draws them in
// two groups, the file on the left and the facts about it on the right.
//
// Every one of these is a fact about the `catalogus view` invocation rather
// than about the project, which is the rule AppShell.tsx's header states and
// the reason the manifest path is down here and in the rail rather than in the
// document. The counts are the exception that proves it: they are facts about
// the manifest, and they are here because "how big is this thing" is the
// question a reader forms before reading a single name, and the board no
// longer has a masthead to answer it.
//
// **The documentation link is not rendered, and that is deliberate.** The
// mockup draws the word "Documentation" between the version and the schema
// URL; this repo has no documentation URL to point it at, and CLAUDE.md's
// standing rule is that a plausible default is worse than an absent one -- a
// link to a guessed address is a link that 404s in front of the first person
// who trusts it. The word is omitted along with its separator until the owner
// names a destination; the gap in the mockup is what a reader should see,
// because it is the honest state.
//
// Pure: props in, no fetch, no `window`, no clock. `now` is a parameter for
// the same reason `readAt` is one in the payload -- see relative-time.ts.
import type { ViewPayload, ViewService } from "@catalogus/cli";

import { relativeTime } from "../relative-time.js";
import styles from "./Footer.module.css";

export interface FooterProps {
  /** The served payload. Every line here reads off it; there is nothing else in this component. */
  payload: ViewPayload;
  /** Epoch milliseconds the page was rendered, for the "read <relative time>" phrase. */
  now: number;
}

/**
 * How many distinct rollups the manifest spends, which is a different number
 * from the count of bands on screen and from the count of roles in the file.
 *
 * The rollup is the segment of `role` before the first "-" (computed
 * server-side in @catalogus/cli's view-payload.ts and never re-derived here).
 * `bands.ts` maps up to twenty-six of them onto eight bands, so a project with
 * twenty-one rollups still shows eight headings -- this states the vocabulary
 * the manifest actually uses, where the band headings state the shape it makes.
 *
 * A Set over the payload's own `rollup` field, not a keyed object: these values
 * come out of a manifest and `role: constructor` is schema-valid. Same class of
 * bug as bands.ts's `BAND_OF`, and it has blanked this viewer once already.
 */
export function distinctRollupCount(services: readonly ViewService[]): number {
  return new Set(services.map((service) => service.rollup)).size;
}

/**
 * The schema URL as the mockup sets it: `catalogus.dev/schema/v1.json`, with
 * the scheme dropped.
 *
 * The scheme is dropped for display only -- the full string stays on the
 * element's `title`, because it is the exact value `catalogus init` writes into
 * every manifest's `$schema` modeline and a reader comparing the two needs to
 * see the whole thing. It is rendered as text and not as a link: whether
 * `catalogus.dev` serves anything today is not a fact this repo holds, and a
 * link is a claim that it does.
 */
export function withoutScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/**
 * The noun for a count. Both forms are spelled out rather than an "s" being
 * appended, because one of the three is `dependency`/`dependencies` and a rule
 * with one exception in a set of three is not a rule.
 *
 * The mockup can only ever show the plural -- it draws one fixture, with 35, 48
 * and 21 -- so this is not it being reinterpreted. A footer reading
 * "1 dependencies" on a two-service project is nobody's design.
 */
function counted(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/** The separator between groups of facts. Decorative -- it is a comma, drawn. */
function Dot() {
  return (
    <span className={styles.dot} aria-hidden="true">
      &middot;
    </span>
  );
}

export function Footer({ payload, now }: FooterProps) {
  const read = relativeTime(payload.readAt, now);
  const serviceCount = payload.services.length;
  const dependencyCount = payload.edges.length;
  const rollupCount = distinctRollupCount(payload.services);

  return (
    // `contentinfo` is implicit for a `<footer>` that is not inside a
    // sectioning element, and this one is a direct child of a plain `<div>`,
    // which is exactly the case where the implicit role still applies. Stated
    // anyway, for the same reason AppShell states `banner`: a future wrapper
    // must not be able to remove it silently.
    <footer className={styles.footer} role="contentinfo">
      <div className={styles.group}>
        <span className={styles.manifest}>{payload.manifestPath}</span>
        {/*
          Nothing at all when the timestamp does not parse, rather than "read
          Invalid Date" -- relative-time.ts returns null for that case and its
          header carries the reasoning. The separator goes with the phrase,
          since a dot leading to nothing is worse than no dot.
        */}
        {read !== null && (
          <>
            <Dot />
            <span>read {read}</span>
          </>
        )}
      </div>

      <div className={styles.group}>
        <span>
          <b>{serviceCount}</b> {counted(serviceCount, "service", "services")}
        </span>
        <span>
          <b>{dependencyCount}</b> {counted(dependencyCount, "dependency", "dependencies")}
        </span>
        <span>
          <b>{rollupCount}</b> {counted(rollupCount, "rollup", "rollups")}
        </span>
        <Dot />
        <span>
          catalogus <b>{payload.cliVersion}</b>
        </span>
        <Dot />
        <span className={styles.schema} title={payload.schemaUrl}>
          {withoutScheme(payload.schemaUrl)}
        </span>
      </div>
    </footer>
  );
}
