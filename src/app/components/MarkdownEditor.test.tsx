import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MarkdownEditor from "./MarkdownEditor";

describe("MarkdownEditor wikilink navigation", () => {
  it("opens a wikilink under a Command-click", () => {
    const onOpenWikilink = vi.fn();

    render(
      <MarkdownEditor
        documentId="source"
        editorFontSize={14}
        findRequest={0}
        label="Source Markdown editor"
        value="[[Future idea]]"
        wikilinkCandidates={[]}
        onChange={vi.fn()}
        onCursorPosition={vi.fn()}
        onOpenWikilink={onOpenWikilink}
        onPreview={vi.fn()}
        onSave={vi.fn()}
        onSaveAs={vi.fn()}
      />,
    );

    fireEvent.mouseDown(
      screen.getByRole("textbox", { name: "Source Markdown editor" }),
      { button: 0, clientX: 1, clientY: 1, metaKey: true },
    );

    expect(onOpenWikilink).toHaveBeenCalledWith("Future idea");
  });
});
