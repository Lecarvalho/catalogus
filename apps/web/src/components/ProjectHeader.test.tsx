// ProjectHeader.tsx's own pure helper: the date part of an ISO timestamp,
// without a locale call (locale rendering would make two machines disagree
// about the same manifest -- see the function's own comment).
import { describe, expect, it } from "vitest";

import { readDate } from "./ProjectHeader.js";

describe("readDate", () => {
  it("slices an ISO timestamp at the 'T'", () => {
    expect(readDate("2026-08-24T00:00:00.000Z")).toBe("2026-08-24");
  });

  it("returns the input unchanged when it has no 'T' to slice at", () => {
    expect(readDate("not-a-timestamp")).toBe("not-a-timestamp");
    expect(readDate("2026-08-24")).toBe("2026-08-24");
  });
});
