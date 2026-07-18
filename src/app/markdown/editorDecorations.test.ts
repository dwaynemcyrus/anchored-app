import { describe, expect, it } from "vitest";

import { findMarkdownDecorationRanges } from "./editorDecorations";

describe("Markdown editor decorations", () => {
  it("finds source constructs without changing their ranges", () => {
    const source =
      "> [!NOTE]\n[[Leadership|the note]] ==important== :warning: H~2~O x^2^ {#intro} [x]\n```rust\n$E=mc^2$";
    const ranges = findMarkdownDecorationRanges(source);

    expect(ranges.map((range) => range.className)).toEqual(
      expect.arrayContaining([
        "cm-anchored-admonition",
        "cm-anchored-wikilink",
        "cm-anchored-mark",
        "cm-anchored-emoji",
        "cm-anchored-heading-id",
        "cm-anchored-task",
        "cm-anchored-fence",
        "cm-anchored-math",
      ]),
    );
    for (const range of ranges) {
      expect(source.slice(range.from, range.to)).not.toBe("");
    }
  });

  it("keeps viewport scans bounded", () => {
    const source = "[[One]]\n".repeat(100);
    const ranges = findMarkdownDecorationRanges(source, 0, 8);
    expect(ranges).toHaveLength(1);
    expect(source.slice(ranges[0].from, ranges[0].to)).toBe("[[One]]");
  });
});
