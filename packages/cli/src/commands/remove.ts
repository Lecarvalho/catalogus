// `catalogus remove <id> [path]` -- deletes one service entry from
// `services[]`, along with every dependency edge that names it.
//
// Every other writer in this package is additive: `add` appends, `link`
// appends, `deprecate` only ever sets fields on an entry that stays put.
// Nothing takes anything out, so a wrong `add` -- a typo'd role, a service
// that turns out not to be used, an entry created before a contradiction
// with the user was resolved -- could not be undone by the CLI at all; the
// only move left was deleting catalogus.yaml and starting over, which is
// exactly the loop the first dogfooding run fell into (see docs/PLAN.md,
// Phase 3.6). This command exists to close that gap, and it is deliberately
// narrow: it deletes one entry and the edges that would otherwise dangle
// from deleting it, nothing more.
import { edgePairs } from "@catalogus/schema";
import type { YAMLSeq } from "yaml";

import { commitManifestEdit, openManifestForEdit } from "../manifest-edit.js";
import { isValidSlug } from "../slug.js";
import type { CommandResult } from "../types.js";

export async function runRemove(pathArg: string | undefined, id: string): Promise<CommandResult> {
  if (!isValidSlug(id)) {
    return {
      exitCode: 2,
      stdout: [],
      stderr: [`<id> "${id}" is not a valid local id (lowercase letters, digits, single - or _ separators).`],
    };
  }

  const opened = await openManifestForEdit(pathArg);
  if (!opened.ok) {
    return opened.error;
  }
  const { location, manifest, doc } = opened.value;

  const index = manifest.services.findIndex((service) => service.id === id);
  if (index === -1) {
    const known = manifest.services.map((service) => service.id).sort().join(", ") || "(none yet)";
    return {
      exitCode: 1,
      stdout: [],
      stderr: [`no service with id "${id}" exists in ${location.filePath}.`, `  known ids: ${known}`],
    };
  }

  // replaced_by is a claim someone made deliberately -- "this is what
  // replaces it" -- and it is what the Phase 7 migration dashboard is
  // entirely made of. Clearing it silently out from under the entry that
  // carries it, just because the thing it points at is being deleted,
  // would erase that claim without anyone deciding to; refusing and
  // naming who points here leaves that decision with the person running
  // the command instead. A --cascade flag was considered for this and
  // deliberately deferred -- see docs/PLAN.md -- on the theory that a
  // remove landing here is rare enough not to need one yet.
  const dependents = manifest.services.filter((service) => service.replaced_by === id).map((service) => service.id);
  if (dependents.length > 0) {
    const isSingle = dependents.length === 1;
    const list = dependents.map((d) => `"${d}"`).join(", ");
    const verb = isSingle ? "names" : "name";
    const pronoun = isSingle ? "it" : "them";
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        `"${id}" cannot be removed: replaced_by on ${list} still ${verb} it.`,
        `  replaced_by records a deliberate migration claim, not a detail to clear silently -- re-point ` +
          `${pronoun} to another id, or clear ${pronoun}, with "catalogus deprecate", then remove "${id}".`,
      ],
    };
  }

  // Cascade the edges before touching services[]: once the entry is gone,
  // any edge still naming it on either end is a dangling reference, and a
  // dangling edge fails the referential-integrity check the very next
  // `catalogus validate` runs -- so a remove that left one behind would
  // trade one unrecoverable state for another. edgePairs() normalizes both
  // legal edge shapes (a [from, to] tuple or a {from, to, notes} object) to
  // {from, to}, in the same order as manifest.dependencies -- which is the
  // same order commitManifestEdit's own document came from, so index i
  // here and index i in the dependencies YAMLSeq name the same edge. The
  // report is built in file order (the order edgePairs and forEach walk
  // it), but the splices themselves have to run highest-index-first --
  // splicing in ascending order would shift every later index out from
  // under the next lookup.
  //
  // depsHeaderComment is captured before any splice runs -- see the
  // services-sequence comment below for why: a comment written directly
  // above the *first* item in a YAMLSeq belongs to the sequence node
  // itself, not to that item, and splicing item 0 out does not touch it.
  const depsSeq = doc.get("dependencies", true) as YAMLSeq;
  const depsHeaderComment = depsSeq.commentBefore;
  const matchingIndexes: number[] = [];
  const droppedEdges: string[] = [];
  edgePairs(manifest).forEach(({ from, to }, i) => {
    if (from === id || to === id) {
      matchingIndexes.push(i);
      droppedEdges.push(`${from} -> ${to}`);
    }
  });
  for (const i of [...matchingIndexes].reverse()) {
    depsSeq.items.splice(i, 1);
  }
  const strandedEdgeHeaderComment = depsHeaderComment !== undefined && matchingIndexes.includes(0);

  // Splicing the services YAMLSeq -- rather than doc.deleteIn(["services",
  // index]), which does the same thing through a different entry point --
  // removes the entry's whole subtree for every position except the
  // first: for index > 0, whatever is attached to the entry itself -- its
  // commentBefore (a comment line written directly above it), any inline
  // comment on its own keys, and its own trailing comment if it carries
  // one -- is a property of the node being spliced out, and goes with it.
  //
  // The first entry is a genuinely different mechanism, not a smaller
  // version of the same one: the `yaml` package attaches a comment
  // written directly above the *first* item in a sequence to the
  // sequence node itself (`seq.commentBefore`), never to that item.
  // Removing item 0 therefore leaves the comment sitting on the sequence,
  // where it renders above whatever entry now comes first -- and because
  // it sits at ordinary list-item indentation rather than the deeper
  // indentation the trailing-comment hazard further down depends on, it
  // reads unambiguously as that entry's own header. This is the shape
  // docs/PLAN.md names precisely: "now sitting above, and appearing to
  // describe, the wrong service."
  //
  // It cannot be cleared on removal either, and for the same reason
  // nothing else here gets rewritten on a guess: multiple comment lines
  // directly above the first item are joined by the parser into one
  // `seq.commentBefore` string, so a genuine list header ("services this
  // project runs") and a note meant specifically for the first entry are
  // not separable once parsed -- the same ambiguity class as the
  // trailing-comment hazard below, just reached from the opposite
  // direction. So it is left exactly where it is and reported instead,
  // in successLines below, rather than silently handed to whichever entry
  // now leads the list. The dependencies sequence carries the identical
  // hazard for its first edge, via depsHeaderComment above, handled the
  // same way.
  const remainingServiceIds = manifest.services.filter((service) => service.id !== id).map((s) => s.id);
  const servicesSeq = doc.get("services", true) as YAMLSeq;
  const serviceHeaderComment = servicesSeq.commentBefore;
  const strandedServiceHeaderComment = index === 0 && serviceHeaderComment !== undefined;
  servicesSeq.items.splice(index, 1);

  // What splicing still cannot do anything about, at any position, is a
  // trailing comment already sitting on the *previous* surviving entry.
  // The `yaml` package attaches a comment line written directly after an
  // entry's own properties -- indented to match that entry's keys, rather
  // than the next sequence item's dash -- to that PRECEDING entry's node
  // as its own `.comment`, not as `commentBefore` on whatever entry
  // follows. That is an easy thing to type by accident: most editors keep
  // the previous line's indentation on Enter, so a note jotted right
  // after finishing one entry and meaning to describe the next lands
  // exactly where a genuine trailing note about the entry just finished
  // would. By the time the Document is parsed, the two are
  // indistinguishable from the `.comment` string alone -- two signals
  // were considered and rejected as disambiguators here: the node's
  // source `range` recovers the original text, but both intents produce
  // byte-identical source, so it adds nothing; a blank line does leave a
  // trace (a trailing "\n" inside the `.comment` string when it comes
  // after the comment, a gap visible in the range slice when it comes
  // before), but a blank line records a typing habit, not a declared
  // intent, and acting on it would still be a guess wearing a signal's
  // clothes. So guessing which entry a trailing comment was really about,
  // and clearing it on that guess, would delete real information as
  // often as it fixed a misattributed note.
  //
  // Left alone, it stays exactly where it was -- still indented to match
  // the predecessor's own keys, so it keeps reading as that entry's
  // trailing note rather than as a header for whatever follows. It is
  // simply now the line sitting directly above the next entry rather than
  // two entries above it; unlike the first-item hazard above, it does not
  // read as that next entry's own comment. It is a property of the
  // `yaml` package's comment model, not a bug this command introduces,
  // and there is no fix for it that does not risk deleting a legitimate
  // comment on the neighbor it actually belongs to. See remove.test.ts's
  // "comment attachment" suite for both hazards, measured and pinned
  // rather than assumed.

  return commitManifestEdit(opened.value, {
    // Nothing this command does to a valid manifest reaches this branch:
    // replaced_by conflicts are refused above before the document is
    // touched, cascading the edges first means removal cannot leave a
    // dangling reference, and removing entries and edges can neither create
    // a cycle nor introduce a private-value hit.
    //
    // A manifest carrying a pre-existing cycle still fails the pre-write
    // check when this removal does not break the cycle -- exit 1, nothing
    // written -- but it no longer fails under this prefix: commitManifestEdit
    // compares the cycles against the ones the file already had and reports
    // that case in the file's name rather than this command's. What is left
    // here is the genuinely-caused case, which removal cannot reach.
    failurePrefix: `Removing "${id}" would make`,
    successLines: (filePath) => {
      const lines = [`Removed service "${id}" from ${filePath}`];
      for (const edge of droppedEdges) {
        lines.push(`  dropped edge: ${edge}`);
      }
      // "comment text" rather than "a comment" throughout: several lines
      // written above the first item are joined into one commentBefore
      // string, so the count is not known here and pluralising would be a
      // guess. Naming the entry the text now sits above beats "whichever
      // comes first", and when the removal emptied the list there is no
      // such entry to name -- saying there is would send someone looking
      // for a line that is not there.
      if (strandedServiceHeaderComment) {
        const nowFirst = remainingServiceIds[0];
        lines.push(
          `  comment text above "${id}" was attached to the services list itself rather than to the ` +
            "entry, so it stayed behind: " +
            (nowFirst === undefined
              ? "the list is now empty, so it sits above nothing."
              : `it now sits above "${nowFirst}".`) +
            ` Move it by hand if it described "${id}" rather than the list as a whole.`
        );
      }
      if (strandedEdgeHeaderComment) {
        lines.push(
          "  comment text above the first dependency edge was attached to the dependencies list itself " +
            "rather than to the edge, so it stayed behind" +
            (depsSeq.items.length === 0 ? "; the list is now empty, so it sits above nothing." : ".")
        );
      }
      return lines;
    },
  });
}
