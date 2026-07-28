import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AnchoredDocument } from "../documents";
import { noteRowHeights } from "../noteListLayout";
import type { NotePreviewsApi } from "../useNotePreviews";
import { NoteListPane } from "./NoteListPane";

const hour = 60 * 60 * 1000;
const day = 24 * hour;

function note(overrides: Partial<AnchoredDocument>): AnchoredDocument {
  return {
    aliases: [],
    body: "",
    folder: "inbox",
    folderPath: "inbox",
    id: overrides.name ?? "note",
    modifiedMillis: Date.now() - 3 * day,
    name: "Note.md",
    outgoingLinks: [],
    relativePath: `inbox/${overrides.name ?? "Note.md"}`,
    tags: [],
    title: "Note",
    ...overrides,
  };
}

function previewsApi(previews: Record<string, string> = {}): NotePreviewsApi {
  return {
    read: (source) => previews[source.relativePath],
    subscribe: () => () => {},
  };
}

function setup(overrides: Partial<Parameters<typeof NoteListPane>[0]> = {}) {
  const onSelectDocument = vi.fn();
  const onSortChange = vi.fn();
  const onTrashDocument = vi.fn();
  const onArchiveDocument = vi.fn();

  render(
    <NoteListPane
      activeDocumentId=""
      documents={[
        note({ name: "Alpha.md", modifiedMillis: Date.now() - 2 * hour }),
        note({ name: "Beta.md", modifiedMillis: Date.now() - 5 * day }),
      ]}
      excerptLines="two"
      openDocumentIds={new Set()}
      previews={previewsApi()}
      scopeLabel="Inbox"
      showFileExtensions={false}
      sort="modified-desc"
      onArchiveDocument={onArchiveDocument}
      onDragDocument={vi.fn()}
      onDragEnd={vi.fn()}
      onMoveDocumentRequest={vi.fn()}
      onMoveDocumentToWorkbench={vi.fn()}
      onOpen={vi.fn()}
      onPreviewDocument={vi.fn()}
      onRenameDocument={vi.fn()}
      onRestoreDocument={vi.fn()}
      onSearchDocument={vi.fn()}
      onSelectDocument={onSelectDocument}
      onSortChange={onSortChange}
      onTrashDocument={onTrashDocument}
      {...overrides}
    />,
  );

  return { onArchiveDocument, onSelectDocument, onSortChange, onTrashDocument };
}

function renderWithSort(sort: Parameters<typeof NoteListPane>[0]["sort"]) {
  const { unmount } = render(
    <NoteListPane
      activeDocumentId=""
      documents={[
        note({ name: "Alpha.md", modifiedMillis: Date.now() - 2 * hour }),
        note({ name: "Beta.md", modifiedMillis: Date.now() - 5 * day }),
      ]}
      excerptLines="two"
      openDocumentIds={new Set()}
      previews={previewsApi()}
      scopeLabel="Inbox"
      showFileExtensions={false}
      sort={sort}
      onArchiveDocument={vi.fn()}
      onDragDocument={vi.fn()}
      onDragEnd={vi.fn()}
      onMoveDocumentRequest={vi.fn()}
      onMoveDocumentToWorkbench={vi.fn()}
      onOpen={vi.fn()}
      onPreviewDocument={vi.fn()}
      onRenameDocument={vi.fn()}
      onRestoreDocument={vi.fn()}
      onSearchDocument={vi.fn()}
      onSelectDocument={vi.fn()}
      onSortChange={vi.fn()}
      onTrashDocument={vi.fn()}
    />,
  );
  return { unmount };
}

describe("NoteListPane", () => {
  it("shows the scope, its count, and a row per note", () => {
    setup();

    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByLabelText("2 notes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Beta/ })).toBeInTheDocument();
  });

  it("hides the extension when the setting asks it to", () => {
    setup();
    expect(screen.getByRole("button", { name: /^Alpha/ })).toBeInTheDocument();
    expect(screen.queryByText("Alpha.md")).not.toBeInTheDocument();
  });

  it("orders rows by the chosen sort", () => {
    // Alpha is both the newer note and the alphabetically first one, so the
    // two orders below only disagree if the sort is genuinely applied.
    const { unmount } = renderWithSort("modified-desc");
    expect(
      screen.getAllByRole("button", { name: /Alpha|Beta/ })[0],
    ).toHaveTextContent("Alpha");
    unmount();

    renderWithSort("name-desc");
    expect(
      screen.getAllByRole("button", { name: /Alpha|Beta/ })[0],
    ).toHaveTextContent("Beta");
  });

  it("selects a note when its row is clicked", async () => {
    const user = userEvent.setup();
    const { onSelectDocument } = setup();

    await user.click(screen.getByRole("button", { name: /Alpha/ }));

    expect(onSelectDocument).toHaveBeenCalledWith("Alpha.md", {
      newTab: false,
    });
  });

  it("opens beside the current note when the row is Command-clicked", async () => {
    const user = userEvent.setup();
    const { onSelectDocument } = setup();

    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    await user.keyboard("{/Meta}");

    expect(onSelectDocument).toHaveBeenCalledWith("Alpha.md", { newTab: true });
  });

  it("replaces the current note on a plain click", async () => {
    const user = userEvent.setup();
    const { onSelectDocument } = setup();

    await user.click(screen.getByRole("button", { name: /Alpha/ }));

    expect(onSelectDocument).toHaveBeenCalledWith("Alpha.md", {
      newTab: false,
    });
  });

  it("marks a note that is already open somewhere", () => {
    setup({ openDocumentIds: new Set(["Beta.md"]) });

    const rows = screen.getAllByRole("button", { name: /Alpha|Beta/ });
    expect(rows[1].querySelector(".note-row__open")).toBeInTheDocument();
    expect(rows[0].querySelector(".note-row__open")).not.toBeInTheDocument();
  });

  it("marks the active note", () => {
    setup({ activeDocumentId: "Beta.md" });

    expect(screen.getByRole("button", { name: /Beta/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: /Alpha/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders an excerpt only once a preview has been read", () => {
    setup({
      previews: previewsApi({ "inbox/Alpha.md": "A calm system." }),
    });

    expect(screen.getByText("A calm system.")).toBeInTheDocument();
  });

  it("carries the excerpt-line setting onto each row", () => {
    setup({ excerptLines: "one" });

    expect(screen.getByRole("button", { name: /Alpha/ })).toHaveAttribute(
      "data-excerpt-lines",
      "one",
    );
  });

  it("describes recent and older notes in relative terms", () => {
    setup();

    expect(screen.getByRole("button", { name: /Alpha/ })).toHaveTextContent(
      "2h ago",
    );
    expect(screen.getByRole("button", { name: /Beta/ })).toHaveTextContent(
      "5d ago",
    );
  });

  it("offers an empty state naming the scope", () => {
    setup({ documents: [], scopeLabel: "Archive" });

    expect(screen.getByText("No notes in Archive")).toBeInTheDocument();
  });

  it("changes the sort from the sort menu", async () => {
    const user = userEvent.setup();
    const { onSortChange } = setup();

    await user.click(screen.getByRole("button", { name: /Recent/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Name A–Z" }));

    expect(onSortChange).toHaveBeenCalledWith("name-asc");
  });

  it("opens a note's actions on right click", async () => {
    const user = userEvent.setup();
    const { onTrashDocument } = setup();

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /Alpha/ }),
    });

    const menu = screen.getByRole("menu", { name: "Note actions" });
    await user.click(within(menu).getByRole("menuitem", { name: /Trash/ }));

    expect(onTrashDocument).toHaveBeenCalledWith("Alpha.md");
  });

  it("offers restore actions for an archived note instead of archive", async () => {
    const user = userEvent.setup();
    setup({
      documents: [note({ name: "Old.md", status: "archived" })],
    });

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /Old/ }),
    });

    const menu = screen.getByRole("menu", { name: "Note actions" });
    expect(
      within(menu).getByRole("menuitem", { name: "Restore to Inbox" }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Archive" }),
    ).not.toBeInTheDocument();
  });

  it("renders a window onto a long list rather than all of it", () => {
    const many = Array.from({ length: 4000 }, (_, index) =>
      note({ name: `Note ${index}.md` }),
    );
    setup({ documents: many, sort: "name-asc" });

    expect(screen.getByLabelText("4000 notes")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows.length).toBeLessThan(40);
    // The rows that are not rendered are still described, so the scrollbar and
    // assistive technology both see the whole list.
    expect(rows[0]).toHaveAttribute("aria-setsize", "4000");
    expect(rows[0]).toHaveAttribute("aria-posinset", "1");
    expect(screen.getByRole("list")).toHaveStyle({
      paddingBottom: `${(4000 - rows.length) * noteRowHeights.two}px`,
    });
  });

  it("moves between rows with the arrow keys", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("button", { name: /Beta/ })).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: /Alpha/ })).toHaveFocus();
  });

  it("stops at each end of the list", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    await user.keyboard("{ArrowUp}");

    expect(screen.getByRole("button", { name: /Alpha/ })).toHaveFocus();
  });

  it("disables editing actions for a non-Markdown asset", async () => {
    const user = userEvent.setup();
    setup({
      documents: [note({ name: "diagram.svg", isMarkdown: false })],
    });

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /diagram/ }),
    });

    const menu = screen.getByRole("menu", { name: "Note actions" });
    expect(
      within(menu).getByRole("menuitem", { name: "Rename" }),
    ).toBeDisabled();
    expect(
      within(menu).queryByRole("menuitem", { name: "Preview" }),
    ).not.toBeInTheDocument();
  });
});
