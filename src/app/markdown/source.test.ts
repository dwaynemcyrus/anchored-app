import { describe, expect, it } from "vitest";

import {
  hasNonUnixLineEndings,
  markdownBodyStart,
  mergeCreatedMarkdownSource,
  normalizeMarkdownLineEndings,
} from "./source";

describe("Markdown source policies", () => {
  it("starts the body on the line after the required blank separator", () => {
    const source = [
      "---",
      "one: 1",
      "two: 2",
      "three: 3",
      "four: 4",
      "five: 5",
      "six: 6",
      "---",
      "",
      "",
    ].join("\n");

    expect(markdownBodyStart(source)).toBe(source.length);
    expect(
      source.slice(0, markdownBodyStart(source) ?? 0).split("\n"),
    ).toHaveLength(10);
  });

  it("normalizes CRLF and legacy CR endings to LF", () => {
    expect(normalizeMarkdownLineEndings("one\r\ntwo\rthree\nfour")).toBe(
      "one\ntwo\nthree\nfour",
    );
    expect(hasNonUnixLineEndings("one\r\ntwo")).toBe(true);
    expect(hasNonUnixLineEndings("one\ntwo")).toBe(false);
  });

  it("keeps local typing when a new note receives its identity", () => {
    const persisted = "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n";

    expect(mergeCreatedMarkdownSource("", persisted, "# Draft")).toBe(
      `${persisted}# Draft`,
    );
    expect(
      mergeCreatedMarkdownSource(
        "# Draft",
        `${persisted}# Draft`,
        "# Draft\nUpdated",
      ),
    ).toBe(`${persisted}# Draft\nUpdated`);
  });

  it("places new-note editing after front matter", () => {
    const source = "---\ncreated_at: now\n---\n# Heading";

    expect(markdownBodyStartOffset(source)).toBe(source.indexOf("# Heading"));
    expect(markdownBodyStartOffset("# Heading")).toBeNull();
  });
});
