import { describe, expect, it } from "vitest";

import { hasNonUnixLineEndings, normalizeMarkdownLineEndings } from "./source";

describe("Markdown source policies", () => {
  it("normalizes CRLF and legacy CR endings to LF", () => {
    expect(normalizeMarkdownLineEndings("one\r\ntwo\rthree\nfour")).toBe(
      "one\ntwo\nthree\nfour",
    );
    expect(hasNonUnixLineEndings("one\r\ntwo")).toBe(true);
    expect(hasNonUnixLineEndings("one\ntwo")).toBe(false);
  });
});
