import { describe, expect, it } from "vitest";

import {
  hasNonUnixLineEndings,
  mergeCreatedMarkdownSource,
  normalizeMarkdownLineEndings,
} from "./source";

describe("Markdown source policies", () => {
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
});
