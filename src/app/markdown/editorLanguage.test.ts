import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { anchoredMarkdownLanguage } from "./editorLanguage";

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
});
