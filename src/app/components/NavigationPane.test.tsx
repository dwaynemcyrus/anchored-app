import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AnchoredDocument } from "../documents";
import { NavigationPane } from "./NavigationPane";

function note(overrides: Partial<AnchoredDocument>): AnchoredDocument {
  return {
    aliases: [],
    body: "",
    folder: "inbox",
    folderPath: "inbox",
    id: overrides.name ?? "note",
    name: "Note.md",
    outgoingLinks: [],
    relativePath: `inbox/${overrides.name ?? "Note.md"}`,
    tags: [],
    title: "Note",
    ...overrides,
  };
}

function setup(overrides: Partial<Parameters<typeof NavigationPane>[0]> = {}) {
  const onScopeChange = vi.fn();
  const onToggleFolder = vi.fn();
  const onModeChange = vi.fn();
  const onDeleteFolder = vi.fn();

  render(
    <NavigationPane
      documents={[
        note({ name: "One.md", status: "inbox" }),
        note({ name: "Two.md", status: "active", folderPath: "workbench" }),
      ]}
      expandedFolders={new Set<string>()}
      folders={["inbox", "workbench", "workbench/deep"]}
      mode="collections"
      query=""
      scope={{ kind: "collection", id: "inbox" }}
      searchInputRef={createRef<HTMLInputElement>()}
      trashCount={0}
      vaultName="Personal"
      onCreateFolder={vi.fn()}
      onDropDocument={vi.fn()}
      onCreateNote={vi.fn()}
      onCreateNoteInFolder={vi.fn()}
      onDeleteFolder={onDeleteFolder}
      onModeChange={onModeChange}
      onMoveFolderRequest={vi.fn()}
      onOpenTrash={vi.fn()}
      onQueryChange={vi.fn()}
      onRenameFolder={vi.fn()}
      onScopeChange={onScopeChange}
      onSearchInFolder={vi.fn()}
      onToggleFolder={onToggleFolder}
      {...overrides}
    />,
  );

  return { onDeleteFolder, onModeChange, onScopeChange, onToggleFolder };
}

describe("NavigationPane", () => {
  it("lists the five collections with their counts", () => {
    setup();

    for (const label of [
      "Inbox",
      "Scratchpad",
      "Workbench",
      "Archive",
      "Assets",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    }
  });

  it("holds no note rows — notes belong to the list pane", () => {
    setup();

    expect(
      screen.queryByRole("button", { name: /One/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Two/ }),
    ).not.toBeInTheDocument();
  });

  it("marks the selected collection", () => {
    setup({ scope: { kind: "collection", id: "archive" } });

    expect(screen.getByRole("button", { name: /Archive/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: /Inbox/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("changes scope when a collection is chosen", async () => {
    const user = userEvent.setup();
    const { onScopeChange } = setup();

    await user.click(screen.getByRole("button", { name: /Workbench/ }));

    expect(onScopeChange).toHaveBeenCalledWith({
      kind: "collection",
      id: "workbench",
    });
  });

  it("switches between Collections and Files", async () => {
    const user = userEvent.setup();
    const { onModeChange } = setup();

    await user.click(screen.getByRole("button", { name: "Files" }));

    expect(onModeChange).toHaveBeenCalledWith("files");
  });

  it("shows only top-level folders until one is expanded", () => {
    setup({ mode: "files" });

    expect(
      screen.getByRole("button", { name: "workbench" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "deep" }),
    ).not.toBeInTheDocument();
  });

  it("reveals a nested folder once its parent is expanded", () => {
    setup({ mode: "files", expandedFolders: new Set(["workbench"]) });

    expect(screen.getByRole("button", { name: "deep" })).toBeInTheDocument();
  });

  it("selects a folder scope when a folder is clicked", async () => {
    const user = userEvent.setup();
    const { onScopeChange } = setup({ mode: "files" });

    await user.click(screen.getByRole("button", { name: "workbench" }));

    expect(onScopeChange).toHaveBeenCalledWith({
      kind: "folder",
      path: "workbench",
    });
  });

  it("expands a folder without changing what the list pane shows", async () => {
    const user = userEvent.setup();
    const { onScopeChange, onToggleFolder } = setup({ mode: "files" });

    await user.click(screen.getByRole("button", { name: "Expand workbench" }));

    expect(onToggleFolder).toHaveBeenCalledWith("workbench");
    expect(onScopeChange).not.toHaveBeenCalled();
  });

  it("labels the disclosure by what it will do", () => {
    setup({ mode: "files", expandedFolders: new Set(["workbench"]) });

    expect(
      screen.getByRole("button", { name: "Collapse workbench" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("gives a childless folder no disclosure control", () => {
    setup({ mode: "files" });

    expect(
      screen.queryByRole("button", { name: /Expand inbox/ }),
    ).not.toBeInTheDocument();
  });

  it("offers folder actions on right click", async () => {
    const user = userEvent.setup();
    const { onDeleteFolder } = setup({ mode: "files" });

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: "workbench" }),
    });

    const menu = screen.getByRole("menu", { name: "Folder actions" });
    await user.click(
      within(menu).getByRole("menuitem", { name: "Delete folder" }),
    );

    expect(onDeleteFolder).toHaveBeenCalledWith("workbench");
  });

  it("shows the vault name and the trash count", () => {
    setup({ trashCount: 3 });

    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Trash \(3\)/ }),
    ).toBeInTheDocument();
  });
});
