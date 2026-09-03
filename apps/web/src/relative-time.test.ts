// relative-time.ts renders the footer's "read {relativeTime(...)}" phrase.
// It is a pure function of (isoTimestamp, nowMs), so every case here fixes
// both rather than reading the clock.
import { describe, expect, it } from "vitest";

import { relativeTime } from "./relative-time.js";

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

const EPOCH = "2026-09-03T12:00:00.000Z";
const epochMs = Date.parse(EPOCH);

function ago(ms: number): number {
  return epochMs + ms;
}

describe("relativeTime", () => {
  it("is 'just now' at zero elapsed time", () => {
    expect(relativeTime(EPOCH, ago(0))).toBe("just now");
  });

  it("is 'just now' at 59 seconds, one short of a minute", () => {
    expect(relativeTime(EPOCH, ago(59 * 1000))).toBe("just now");
  });

  it("is 'just now' at 59.999 seconds, the instant before rounding would reach a minute", () => {
    expect(relativeTime(EPOCH, ago(59_999))).toBe("just now");
  });

  it("is '1 minute ago' at exactly 60 seconds", () => {
    expect(relativeTime(EPOCH, ago(60 * 1000))).toBe("1 minute ago");
  });

  it("floors instead of rounding: 89 seconds is '1 minute ago', not two", () => {
    expect(relativeTime(EPOCH, ago(89 * 1000))).toBe("1 minute ago");
  });

  it("is '2 minutes ago' at 120 seconds, plural once the count leaves one", () => {
    expect(relativeTime(EPOCH, ago(120 * 1000))).toBe("2 minutes ago");
  });

  it("is '59 minutes ago' the instant before the hour boundary", () => {
    expect(relativeTime(EPOCH, ago(59 * MS_PER_MINUTE))).toBe("59 minutes ago");
  });

  it("is '1 hour ago' at exactly one hour", () => {
    expect(relativeTime(EPOCH, ago(60 * MS_PER_MINUTE))).toBe("1 hour ago");
  });

  it("floors instead of rounding: 90 minutes is '1 hour ago', not two", () => {
    expect(relativeTime(EPOCH, ago(90 * MS_PER_MINUTE))).toBe("1 hour ago");
  });

  it("is '2 hours ago' at two hours", () => {
    expect(relativeTime(EPOCH, ago(2 * MS_PER_HOUR))).toBe("2 hours ago");
  });

  it("is '23 hours ago' at 23h59m, the instant before the day boundary", () => {
    expect(relativeTime(EPOCH, ago(23 * MS_PER_HOUR + 59 * MS_PER_MINUTE))).toBe("23 hours ago");
  });

  it("is '1 day ago' at exactly one day", () => {
    expect(relativeTime(EPOCH, ago(24 * MS_PER_HOUR))).toBe("1 day ago");
  });

  it("floors instead of rounding: 47 hours is '1 day ago', not two", () => {
    expect(relativeTime(EPOCH, ago(47 * MS_PER_HOUR))).toBe("1 day ago");
  });

  it("is '2 days ago' at two days", () => {
    expect(relativeTime(EPOCH, ago(2 * 24 * MS_PER_HOUR))).toBe("2 days ago");
  });

  it("keeps counting days instead of rolling into weeks or months at 40 days", () => {
    expect(relativeTime(EPOCH, ago(40 * 24 * MS_PER_HOUR))).toBe("40 days ago");
  });

  it("keeps counting days at a year-scale gap, the largest unit stays the day", () => {
    expect(relativeTime(EPOCH, ago(400 * 24 * MS_PER_HOUR))).toBe("400 days ago");
  });

  // A stamp ahead of nowMs is ordinary clock skew between the machine that
  // wrote the manifest and the machine rendering it, not a claim the
  // manifest will be read in the future.
  it("is 'just now' for a timestamp ahead of nowMs, from ordinary clock skew", () => {
    expect(relativeTime(EPOCH, ago(-5000))).toBe("just now");
  });

  it("is 'just now' for a timestamp far ahead of nowMs", () => {
    expect(relativeTime(EPOCH, ago(-1000 * MS_PER_HOUR))).toBe("just now");
  });

  // An unparseable timestamp returns null so the caller renders nothing --
  // a missing line reads as "no answer"; a rendered "read Invalid Date"
  // would read as one.
  it("is null for an empty string", () => {
    expect(relativeTime("", epochMs)).toBeNull();
  });

  it("is null for text that isn't a timestamp at all", () => {
    expect(relativeTime("not-a-timestamp", epochMs)).toBeNull();
  });

  it("is null for a date with an out-of-range month and day", () => {
    expect(relativeTime("2026-13-45", epochMs)).toBeNull();
  });
});
