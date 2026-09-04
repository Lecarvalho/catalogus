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
      // D3 (validator, 2026-09-04): "(missing file)" used to cover both
      // "nothing was ever fetched here" and "something was fetched and the
      // sanitiser refuses it" -- indistinguishable to a reader, even though
      // an agent following the skill's 7b loop needs to react differently
      // to each (fetch something, versus pick a different source; see
      // icon-resolution.ts's own ServiceIconResolution.refusalReason
      // comment for the full defect). refusalReason being set is exactly
      // the "something is there" signal; its absence is exactly "missing".
      const detail = resolution.stale
        ? `${resolution.localPath} (${
            resolution.refusalReason ? `refused: ${resolution.refusalReason}` : "missing file"
          })`
        : (resolution.localPath as string);
      columns.push(detail);
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

  return { exitCode: 0, stdout: rows, stderr: [] };
}
