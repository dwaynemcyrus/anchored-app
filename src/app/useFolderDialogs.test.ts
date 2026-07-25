import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVaultFolder,
  deleteVaultFolder,
  moveVaultFolderToTrash,
  renameVaultFolder,
} from "../lib/tauri/vault";
import { useFolderDialogs } from "./useFolderDialogs";

vi.mock("../lib/tauri/vault", () => ({
  createVaultFolder: vi.fn(),
  deleteVaultFolder: vi.fn(),
  moveVaultFolderToTrash: vi.fn(),
  renameVaultFolder: vi.fn(),
}));

function setup(
  documents: { folderPath?: string }[] = [],
  folderPaths: string[] = [],
  vaultSelected = true,
) {
  const addTrashEntry = vi.fn();
  const addVaultNotice = vi.fn();
  const adoptVaultSnapshot = vi.fn();
  const hasUnfinishedEdits = vi.fn(() => false);
  const setExpandedFolders = vi.fn();
  const rendered = renderHook(() =>
    useFolderDialogs({
      addTrashEntry,
      addVaultNotice,
      adoptVaultSnapshot,
      documents: documents as never,
      folderPaths,
      hasUnfinishedEdits,
      setExpandedFolders,
      vaultSelected,
    }),
  );
  return {
    addTrashEntry,
    addVaultNotice,
    adoptVaultSnapshot,
    hasUnfinishedEdits,
    rendered,
    setExpandedFolders,
  };
}

describe("useFolderDialogs", () => {
  beforeEach(() => {
    vi.mocked(createVaultFolder).mockReset();
    vi.mocked(deleteVaultFolder).mockReset();
    vi.mocked(moveVaultFolderToTrash).mockReset();
    vi.mocked(renameVaultFolder).mockReset();
  });

  it("starts with all three dialogs closed", () => {
    const { rendered } = setup();
    expect(rendered.result.current.createFolderVisible).toBe(false);
    expect(rendered.result.current.renameFolderVisible).toBe(false);
    expect(rendered.result.current.deleteFolderVisible).toBe(false);
  });

  it("counts the files and folders under the folder pending deletion", () => {
    const { rendered } = setup(
      [{ folderPath: "Notes/Archive" }, { folderPath: "Notes" }],
      ["Notes/Archive", "Notes/Archive/Old"],
    );
    act(() => rendered.result.current.setDeletingFolderPath("Notes"));

    expect(rendered.result.current.deletingFolderContents).toEqual({
      fileCount: 1,
      folderCount: 2,
    });
  });

  it("creates a folder, adopts the snapshot, and closes the dialog", async () => {
    vi.mocked(createVaultFolder).mockResolvedValue({
      files: [],
      vaultId: "v1",
    } as never);
    const { adoptVaultSnapshot, addVaultNotice, rendered } = setup();

    act(() => rendered.result.current.setCreateFolderVisible(true));
    await act(async () => {
      await rendered.result.current.createNewFolder("Ideas");
    });

    expect(createVaultFolder).toHaveBeenCalledWith({
      name: "Ideas",
      parentPath: undefined,
    });
    expect(adoptVaultSnapshot).toHaveBeenCalledWith({
      files: [],
      vaultId: "v1",
    });
    expect(addVaultNotice).toHaveBeenCalledWith("Ideas created.", {
      history: { kind: "rename" },
    });
    expect(rendered.result.current.createFolderVisible).toBe(false);
  });

  it("reports an error without closing the create-folder dialog", async () => {
    vi.mocked(createVaultFolder).mockRejectedValue(new Error("name taken"));
    const { rendered } = setup();

    act(() => rendered.result.current.setCreateFolderVisible(true));
    await act(async () => {
      await rendered.result.current.createNewFolder("Ideas");
    });

    expect(rendered.result.current.createFolderError).toContain("name taken");
    expect(rendered.result.current.creatingFolder).toBe(false);
  });

  it("blocks renaming when there are unfinished edits", async () => {
    const { addVaultNotice, hasUnfinishedEdits, rendered } = setup();
    hasUnfinishedEdits.mockReturnValue(true);
    act(() => rendered.result.current.setRenamingFolderPath("Notes"));

    await act(async () => {
      await rendered.result.current.renameExistingFolder("Archive");
    });

    expect(addVaultNotice).toHaveBeenCalledWith(
      "Save all open note changes before renaming a folder.",
    );
    expect(renameVaultFolder).not.toHaveBeenCalled();
  });

  it("renames a folder and remaps expanded nested paths", async () => {
    vi.mocked(renameVaultFolder).mockResolvedValue({
      files: [],
      vaultId: "v1",
    } as never);
    const { rendered, setExpandedFolders } = setup();
    act(() => rendered.result.current.setRenamingFolderPath("Notes/Old"));

    await act(async () => {
      await rendered.result.current.renameExistingFolder("New");
    });

    expect(renameVaultFolder).toHaveBeenCalledWith({
      folderPath: "Notes/Old",
      name: "New",
    });
    const updater = setExpandedFolders.mock.calls[0][0] as (
      current: Set<string>,
    ) => Set<string>;
    expect(
      Array.from(updater(new Set(["Notes/Old", "Notes/Old/Nested"]))),
    ).toEqual(["Notes/New", "Notes/New/Nested"]);
    expect(rendered.result.current.renameFolderVisible).toBe(false);
  });

  it("deletes an empty folder outright", async () => {
    vi.mocked(deleteVaultFolder).mockResolvedValue({
      files: [],
      vaultId: "v1",
    } as never);
    const { addVaultNotice, rendered } = setup();
    act(() => rendered.result.current.setDeletingFolderPath("Empty"));

    await act(async () => {
      await rendered.result.current.deleteExistingFolder();
    });

    expect(deleteVaultFolder).toHaveBeenCalledWith("Empty");
    expect(moveVaultFolderToTrash).not.toHaveBeenCalled();
    expect(addVaultNotice).toHaveBeenCalledWith("Empty deleted.", {
      history: { kind: "rename" },
    });
  });

  it("moves a non-empty folder to trash with a confirmation", async () => {
    vi.mocked(moveVaultFolderToTrash).mockResolvedValue({
      entry: { id: "t1", name: "Notes", originalPath: "Notes", trashedAt: 1 },
      snapshot: { files: [], vaultId: "v1" },
    } as never);
    const { addTrashEntry, addVaultNotice, rendered } = setup(
      [{ folderPath: "Notes/Sub" }],
      [],
    );
    act(() => rendered.result.current.setDeletingFolderPath("Notes"));

    await act(async () => {
      await rendered.result.current.deleteExistingFolder("Notes");
    });

    expect(moveVaultFolderToTrash).toHaveBeenCalledWith("Notes", "Notes");
    expect(addTrashEntry).toHaveBeenCalled();
    expect(addVaultNotice).toHaveBeenCalledWith("Notes moved to Trash.", {
      history: { kind: "trash" },
    });
  });

  it("reset closes all three dialogs and clears their state", () => {
    const { rendered } = setup();
    act(() => {
      rendered.result.current.setCreateFolderVisible(true);
      rendered.result.current.setRenameFolderVisible(true);
      rendered.result.current.setDeleteFolderVisible(true);
    });

    act(() => rendered.result.current.reset());

    expect(rendered.result.current.createFolderVisible).toBe(false);
    expect(rendered.result.current.renameFolderVisible).toBe(false);
    expect(rendered.result.current.deleteFolderVisible).toBe(false);
  });
});
