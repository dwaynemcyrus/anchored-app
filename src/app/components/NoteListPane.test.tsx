import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AnchoredDocument } from "../documents";
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
    observeRow: () => () => {},
    previewFor: (source) =>
      source ? previews[source.relativePath] : undefined,
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
      previews={previewsApi()}
      scopeLabel="Inbox"
      showFileExtensions={false}
      sort="modified-desc"
      onArchiveDocument={onArchiveDocument}
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
      previews={previewsApi()}
      scopeLabel="Inbox"
      showFileExtensions={false}
      sort={sort}
      onArchiveDocument={vi.fn()}
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

    expect(onSelectDocument).toHaveBeenCalledWith("Alpha.md");
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
