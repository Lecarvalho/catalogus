// How long ago a timestamp was, in the one phrase the footer needs: "read
// {relativeTime(...)}". Kept out of the footer component for the same
// reason service-tags.ts is kept out of its row -- a pure function of its
// inputs is testable without a clock or a render tree, and this app's
// purity rule (App.tsx's top comment) means components below App.tsx do not
// call Date.now() themselves.
//
// `nowMs` is a parameter rather than read internally for the same reason
// view-payload.ts's `readAt` is threaded through instead of stamped with
// `new Date()`: a test needs a fixed instant to assert against, not a
// moving one, and threading it through is what keeps this a pure function
// of its inputs.

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

/**
 * Renders how long ago `isoTimestamp` was, measured against `nowMs`.
 *
 * No `Intl.RelativeTimeFormat` and no locale call. The finding is the retired
 * `ProjectHeader`'s, which rendered the same `readAt` as a bare date and
 * avoided `toLocaleDateString()` for it: a locale call renders differently
 * depending on the host's ICU data, so it makes two machines disagree about the
 * same manifest and makes the output untestable at the same time. That
 * component is gone -- the shell's footer states the read time now -- and the
 * reasoning is restated here rather than left in a deleted file's history.
 * English, one form, deterministic.
 *
 * A negative elapsed time -- `isoTimestamp` ahead of `nowMs` -- reads as
 * "just now" rather than as a phrase about the future. Ordinary clock skew
 * between the machine that stamped the manifest and the machine rendering
 * it is enough to produce this, and the footer is stating how stale a
 * snapshot is, not making a claim about when it will be read.
 *
 * Returns null, rather than a string built from an invalid date, when
 * `isoTimestamp` does not parse. This is the ask-never-guess rule applied
 * to a render: an absent line reads as "no answer"; a rendered "read
 * Invalid Date" reads as an answer, and the caller has no way to tell the
 * two apart once it has a string in hand. The caller renders nothing for
 * null.
 */
export function relativeTime(isoTimestamp: string, nowMs: number): string | null {
  const thenMs = Date.parse(isoTimestamp);
  if (Number.isNaN(thenMs)) return null;

  const elapsedMs = nowMs - thenMs;
  if (elapsedMs < MS_PER_MINUTE) return "just now";

  if (elapsedMs < MS_PER_HOUR) return plural(Math.floor(elapsedMs / MS_PER_MINUTE), "minute");
  if (elapsedMs < MS_PER_DAY) return plural(Math.floor(elapsedMs / MS_PER_HOUR), "hour");

  // The largest unit is the day -- no weeks, months or years. Days keep
  // counting instead, so a stale manifest reads as "40 days ago" rather
  // than rolling into an ambiguous "a month ago".
  return plural(Math.floor(elapsedMs / MS_PER_DAY), "day");
}
