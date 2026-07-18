import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { highlightTree } from "@lezer/highlight";
import { describe, expect, it } from "vitest";

import {
  anchoredMarkdownHighlightStyle,
  anchoredMarkdownLanguage,
} from "./editorLanguage";

describe("Anchored editor language", () => {
  it("parses YAML front matter separately from Markdown content", () => {
    const state = EditorState.create({
      doc: "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\ntags: [writing]\n---\n# Heading\n",
      extensions: [anchoredMarkdownLanguage],
    });
    const tree = ensureSyntaxTree(state, state.doc.length, 10000);
    expect(tree).not.toBeNull();
    const treeText = tree?.toString() ?? "";

    expect(treeText).toContain("Frontmatter");
    expect(treeText).toContain("BlockMapping");
    expect(treeText).toContain("Pair(Key(Literal)");
    expect(treeText).toContain("ATXHeading1");
  });

  it("highlights the supported inline Markdown syntax surface", () => {
    const source =
      "**bold** *italic* ~~strike~~ [link](https://example.com) https://example.com `code` H~2~O x^2^ :warning:";
    const state = EditorState.create({
      doc: source,
      extensions: [anchoredMarkdownLanguage],
    });
    const tree = ensureSyntaxTree(state, state.doc.length, 10000);
    expect(tree).not.toBeNull();

    const highlightedText: string[] = [];
    highlightTree(tree!, anchoredMarkdownHighlightStyle, (from, to) => {
      highlightedText.push(source.slice(from, to));
    });

    expect(highlightedText).toEqual(
      expect.arrayContaining([
        "bold",
        "italic",
        "strike",
        "link",
        "https://example.com",
        "code",
        "2",
        ":warning:",
      ]),
    );
  });

  it("highlights block Markdown and YAML front matter", () => {
    const source =
      "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\ntags: [writing]\n# metadata comment\n---\n# Heading\n> Quoted text\n- List item\n\n---\n\n```rust\nfn main() {}\n```\n";
    const state = EditorState.create({
      doc: source,
      extensions: [anchoredMarkdownLanguage],
    });
    const tree = ensureSyntaxTree(state, state.doc.length, 10000);
    expect(tree).not.toBeNull();
    const treeText = tree?.toString() ?? "";

    expect(treeText).toContain("Frontmatter");
    expect(treeText).toContain("ATXHeading1");
    expect(treeText).toContain("Blockquote");
    expect(treeText).toContain("BulletList");
    expect(treeText).toContain("HorizontalRule");
    expect(treeText).toContain("FencedCode");

    const highlightedText: string[] = [];
    highlightTree(tree!, anchoredMarkdownHighlightStyle, (from, to) => {
      highlightedText.push(source.slice(from, to));
    });

    expect(highlightedText).toEqual(
      expect.arrayContaining([
        "id",
        "tags",
        "#",
        " Heading",
        ">",
        "-",
        "fn main() {}",
      ]),
    );
  });
});
