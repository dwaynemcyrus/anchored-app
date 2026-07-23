import { describe, expect, it } from "vitest";

import { mergeThreeWay } from "./threeWayMerge";

describe("mergeThreeWay", () => {
  it("keeps a clean external change when local stayed at base", () => {
    expect(mergeThreeWay("one\ntwo", "one\ntwo", "one\nTWO")).toEqual({
      content: "one\nTWO",
      status: "clean",
    });
  });

  it("combines disjoint line edits", () => {
    expect(
      mergeThreeWay("one\ntwo\nthree", "ONE\ntwo\nthree", "one\ntwo\nTHREE"),
    ).toEqual({
      content: "ONE\ntwo\nTHREE",
      status: "clean",
    });
  });

  it("rejects overlapping edits", () => {
    expect(mergeThreeWay("one\ntwo", "one\nLOCAL", "one\nEXTERNAL")).toEqual({
      reason: "overlap",
      status: "conflict",
    });
  });
});
