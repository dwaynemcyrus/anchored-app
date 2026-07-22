import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("auto-closes wikilinks and accepts a keyboard-selected suggestion", async () => {
    const user = userEvent.setup();
    render(
      <MarkdownEditor
        documentId="source"
        editorFontSize={14}
        findRequest={0}
        label="Source Markdown editor"
        value=""
        wikilinkCandidates={[
          {
            activityAt: 2,
            detail: "Notes",
            documentId: "future",
            kind: "note",
            label: "Future idea",
            target: "Future idea",
          },
          {
            activityAt: 1,
            detail: "Archive",
            documentId: "past",
            kind: "note",
            label: "Past idea",
            target: "Past idea",
          },
        ]}
        onChange={vi.fn()}
        onCursorPosition={vi.fn()}
        onOpenWikilink={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
        onSaveAs={vi.fn()}
      />,
    );

    const editor = screen.getByRole("textbox", {
      name: "Source Markdown editor",
    });
    await user.click(editor);
    await user.keyboard("[[[[");

    expect(editor).toHaveTextContent("[[]]");
    const completions = await screen.findByRole("listbox", {
      name: "Completions",
    });
    const options = within(completions).getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveTextContent("Future idea");

    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("F");
    const filteredCompletions = await screen.findByRole("listbox", {
      name: "Completions",
    });
    expect(filteredCompletions).toHaveTextContent("Future idea");
    expect(filteredCompletions).not.toHaveTextContent("Past idea");

    await user.keyboard("{Enter}");
    expect(editor).toHaveTextContent("[[Future idea]]");
  });

  it("auto-closes formatting marks and removes an empty pair with Backspace", async () => {
    const user = userEvent.setup();
    render(
      <MarkdownEditor
        documentId="source"
        editorFontSize={14}
        findRequest={0}
        label="Source Markdown editor"
        value=""
        wikilinkCandidates={[]}
        onChange={vi.fn()}
        onCursorPosition={vi.fn()}
        onOpenWikilink={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
        onSaveAs={vi.fn()}
      />,
    );

    const editor = screen.getByRole("textbox", {
      name: "Source Markdown editor",
    });
    await user.click(editor);
    await user.type(editor, "**");
    expect(editor).toHaveTextContent("****");
    await user.keyboard("{Backspace}");
    expect(editor).not.toHaveTextContent("*");

    await user.keyboard("[[[[");
    await user.keyboard("Future");
    await user.keyboard("]");
    expect(editor).toHaveTextContent("[[Future]]");
  });

  it("closes the wikilink picker with Escape without removing its pair", async () => {
    const user = userEvent.setup();
    render(
      <MarkdownEditor
        documentId="source"
        editorFontSize={14}
        findRequest={0}
        label="Source Markdown editor"
        value=""
        wikilinkCandidates={[]}
        onChange={vi.fn()}
        onCursorPosition={vi.fn()}
        onOpenWikilink={vi.fn()}
        onPreview={vi.fn()}
        onSave={vi.fn()}
        onSaveAs={vi.fn()}
      />,
    );

    const editor = screen.getByRole("textbox", {
      name: "Source Markdown editor",
    });
    await user.click(editor);
    await user.keyboard("[[[[");
    await screen.findByRole("listbox", { name: "Completions" });
    await user.keyboard("{Escape}");

    expect(editor).toHaveTextContent("[[]]");
    expect(screen.queryByRole("listbox", { name: "Completions" })).toBeNull();
  });
});
