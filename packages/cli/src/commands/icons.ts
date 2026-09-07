// `catalogus icons [path]` -- read-only report of where every service
// entry's icon comes from (docs/custom-icon-brief.md, Part B): one line per
// entry, in manifest order, plus a summary. Exists so an agent (or a human)
// running the skill's "fill in missing icons" step (SKILL.md, "7b. Fill in
// missing icons") has something to read by eye or by regex instead of
// having to open `catalogus view` -- a server, not a command an agent can
// call and get an answer back from (see skill-commands-drift.test.ts's own
// comment on why `view` is never taught in a fenced block).
//
// Resolution goes through icon-resolution.ts's resolveServiceIcon -- the
// same function view-payload.ts calls to build the payload the browser
// draws -- so this report and the viewer's own rendering can never
// disagree about which tiles show initials. Everything below is
// presentation: turning that one shared answer into columns and counts.
import { resolveServiceIcon } from "../icon-resolution.js";
import { loadValidManifest } from "../load-manifest.js";
import { resolveTargetPath } from "../paths.js";
import type { CommandResult } from "../types.js";

/** Singular at exactly one, plural otherwise -- the same shape apps/web's Footer.tsx uses for its own counts (a viewer sentence, not shared code, since a CLI report and a React component have nothing else in common to share). */
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/**
 * One IconRenderRisk as the parenthetical word this report shows a reader:
 * "white fill #ffffff", "light stroke #eeeeee" -- see
 * @catalogus/core's findIconRenderRisks for what `attribute` and `value`
 * mean (`value` is always a normalised, lowercase 6-digit hex with no `#`).
 * "white" only for the exact value a plain white paint normalises to;
 * every other value that still clears the luminance floor (a pale grey, a
 * washed-out tint) is described as "light" rather than guessed at by name
 * -- the same "report the fact, not a guess" floor findIconRenderRisks
 * itself documents.
 */
function describeRisk(risk: { attribute: string; value: string }): string {
  const colour = risk.value === "ffffff" ? "white" : "light";
  return `${colour} ${risk.attribute} #${risk.value}`;
}

export async function runIcons(pathArg: string | undefined): Promise<CommandResult> {
  const targetDir = resolveTargetPath(pathArg);

  const loaded = await loadValidManifest(targetDir);
  if (!loaded.ok) {
    return loaded.error;
  }
  const { manifest, location } = loaded.value;

  const rows: string[] = [];
  // Counted separately from `resolution.source === "none"`: a "local"
  // entry whose file is stale and has no catalog fallback either also
  // ends up rendering initials (icon === null), and the summary below has
  // to agree with the viewer about every entry that does, not only the
  // ones whose source label happens to be "none" -- see
  // icon-resolution.ts's own comment on why `icon` and `source` can
  // diverge for a stale "local" entry.
  let missing = 0;
  // Ids of every entry whose vendored file carries at least one render
  // risk, in manifest order -- printed as one extra summary line below
  // (see the D5-adjacent comment there) so an agent following the skill's
  // 7b loop has a short list to hand the user rather than having to
  // re-scan every row for "(check: ...)".
  const idsToCheck: string[] = [];

  for (const entry of manifest.services) {
    const resolution = await resolveServiceIcon(location.dir, entry);
    if (resolution.icon === null) {
      missing += 1;
    }

    // Columns joined with exactly two spaces, and the detail column
    // dropped entirely (not printed as an empty trailing field) when there
    // is nothing to say -- "id  service  simple-icons" reads cleanly by
    // eye or by a `split(/\s{2,}/)` regex either way; a trailing "  " with
    // nothing after it would not.
    const columns = [entry.id, entry.service, resolution.source];
    if (resolution.source === "local") {
      if (resolution.stale) {
        // D3 (validator, 2026-09-04): "(missing file)" used to cover both
        // "nothing was ever fetched here" and "something was fetched and
        // the sanitiser refuses it" -- indistinguishable to a reader, even
        // though an agent following the skill's 7b loop needs to react
        // differently to each (fetch something, versus pick a different
        // source; see icon-resolution.ts's own
        // ServiceIconResolution.refusalReason comment for the full
        // defect). refusalReason being set is exactly the "something is
        // there" signal; its absence is exactly "missing".
        columns.push(
          `${resolution.localPath} (${
            resolution.refusalReason ? `refused: ${resolution.refusalReason}` : "missing file"
          })`
        );
      } else {
        // Added 2026-09-06 alongside @catalogus/core's findIconRenderRisks:
        // a stale entry never reaches here (the branch above already
        // returned), and `risks` is only ever set for a "local", non-stale
        // resolution -- see ServiceIconResolution.risks's own doc comment
        // -- so this is the one place that field is ever read.
        const risks = resolution.risks ?? [];
        if (risks.length > 0) {
          idsToCheck.push(entry.id);
          columns.push(`${resolution.localPath} (check: ${risks.map(describeRisk).join(", ")})`);
        } else {
          columns.push(resolution.localPath as string);
        }
      }
    } else if (resolution.source === "none") {
      columns.push(`catalogus set services.${entry.id}.icon <https-url|path>`);
    }
    // "simple-icons"/"thesvg": no fourth column at all -- both are catalog
    // sources with nothing further to point at, so the branch above simply
    // has nothing to push for them.

    rows.push(columns.join("  "));
  }

  const total = manifest.services.length;
  // D5 (validator, 2026-09-04): "0 of 1 service have no icon." reads wrong
  // -- "of 1 service" makes "service" the object of a prepositional phrase,
  // not the sentence's subject, so pluralizing the verb to agree with the
  // *total* ("1 service ... have") is the same mistake as "a herd of cattle
  // are grazing" read as agreeing with "cattle" instead of "a herd". The
  // missing count is the actual subject of "has/have no icon" -- rewritten
  // so both "service(s)" and "has/have" agree with `missing`, the word that
  // is actually doing the having (or not having): "1 service of 3 has no
  // icon.", "0 services of 1 have no icon.", "2 services of 2 have no
  // icon."
  rows.push(
    `${missing} ${pluralize(missing, "service", "services")} of ${total} ${pluralize(missing, "has", "have")} no icon.`
  );

  // Added 2026-09-06: only when at least one row above carried a "(check:
  // ...)" detail -- nothing printed otherwise, the same "say nothing rather
  // than an empty finding" convention the detail column itself already
  // follows (see the "no fourth column at all" comment above).
  if (idsToCheck.length > 0) {
    rows.push(
      `${idsToCheck.length} ${pluralize(idsToCheck.length, "icon", "icons")} to check in the viewer: ` +
        `${idsToCheck.join(", ")}. Ask the owner to confirm each in catalogus view; if a mark is unreadable, set a different file.`
    );
  }

  return { exitCode: 0, stdout: rows, stderr: [] };
}
