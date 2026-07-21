import { describe, expect, it } from "vitest";

import {
  findFrontMatterDecorationRanges,
  findMarkdownDecorationRanges,
} from "./editorDecorations";

describe("Markdown editor decorations", () => {
  it("finds source constructs without changing their ranges", () => {
    const source =
      "> [!NOTE]\n[[Leadership|the note]] [^1] ==important== :warning: H~2~O x^2^ {#intro} [x]\n```rust\n$E=mc^2$";
    const ranges = findMarkdownDecorationRanges(source);

    expect(ranges.map((range) => range.className)).toEqual(
      expect.arrayContaining([
        "cm-anchored-admonition",
        "cm-anchored-wikilink",
        "cm-anchored-footnote",
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

  it("highlights hard-break backslashes outside code", () => {
    const source =
      "normal\\\n`inline\\`\\n\n```md\nfenced\\\n```\n\n    indented\\";
    const ranges = findMarkdownDecorationRanges(source).filter(
      (range) => range.className === "cm-anchored-hard-break",
    );

    expect(ranges.map((range) => source.slice(range.from, range.to))).toEqual([
      "\\",
    ]);
  });

  it("styles YAML front matter keys, values, comments, and delimiters", () => {
    const source =
      "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\ntags:\n  - writing\n# metadata\n---\n# Heading";
    const ranges = findFrontMatterDecorationRanges(source);

    expect(ranges.map((range) => range.className)).toEqual(
      expect.arrayContaining([
        "cm-anchored-frontmatter-delimiter",
        "cm-anchored-frontmatter-key",
        "cm-anchored-frontmatter-value",
        "cm-anchored-frontmatter-list-marker",
        "cm-anchored-frontmatter-comment",
      ]),
    );
    expect(
      ranges.some(
        (range) =>
          range.className === "cm-anchored-frontmatter-value" &&
          source.slice(range.from, range.to).includes("01JZQ7K8P4"),
      ),
    ).toBe(true);
  });
});
