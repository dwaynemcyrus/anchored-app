import { describe, expect, it } from "vitest";

import { describeExternalDocumentChange } from "./editorSync";

describe("describeExternalDocumentChange", () => {
  it("describes an insertion and maps a cursor after it", () => {
    expect(
      describeExternalDocumentChange("hello world", "hello calm world", {
        anchor: 11,
        head: 11,
      }),
    ).toEqual({
      change: { from: 6, to: 6, insert: "calm " },
      selection: { anchor: 16, head: 16 },
    });
  });

  it("maps selections inside a replaced range to the replacement end", () => {
    expect(
      describeExternalDocumentChange("one two three", "one calm three", {
        anchor: 5,
        head: 7,
      }),
    ).toEqual({
      change: { from: 4, to: 7, insert: "calm" },
      selection: { anchor: 8, head: 8 },
    });
  });

  it("handles repeated content without using the first matching occurrence", () => {
    expect(
      describeExternalDocumentChange(
        "same\nbody\nsame",
        "same\nnew body\nsame",
        {
          anchor: 10,
          head: 10,
        },
      ),
    ).toEqual({
      change: { from: 5, to: 5, insert: "new " },
      selection: { anchor: 14, head: 14 },
    });
  });

  it("returns null for an already synchronized document", () => {
    expect(
      describeExternalDocumentChange("same", "same", { anchor: 2, head: 2 }),
    ).toBeNull();
  });
});
