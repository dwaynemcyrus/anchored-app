import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveVaultFile,
  createVault,
  createVaultConflictCopy,
  createVaultFolder,
  createVaultFile,
  deleteVaultFolder,
  forgetVault,
  listRememberedVaults,
  listVaultTrash,
  moveVaultFileToFolder,
  moveVaultFileToTrash,
  openRememberedVault,
  readVaultFile,
  renameVaultFolder,
  renameVaultFile,
  rescanVault,
  restoreVaultFileFromTrash,
  restoreArchivedVaultFile,
  saveVaultFile,
  searchVault,
  selectVault,
  stopVaultFileWatch,
  stopVaultTreeWatch,
  watchVaultFile,
  type SaveVaultFileRequest,
  watchVaultTree,
  type VaultDocument,
  type VaultSnapshot,
} from "./vault";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

const snapshot: VaultSnapshot = {
  files: [
    {
      name: "Leadership.md",
      parent: "Notes",
      relativePath: "Notes/Leadership.md",
    },
  ],
  name: "Personal",
  vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
  warnings: {
    skippedNonUtf8Paths: 0,
    skippedSymlinks: 0,
  },
};

const document: VaultDocument = {
  content: "# Leadership\n",
  relativePath: "Notes/Leadership.md",
  sizeBytes: 13,
};

const saveRequest: SaveVaultFileRequest = {
  content: "# Updated leadership\n",
  expectedContent: "# Leadership\n",
  relativePath: "Notes/Leadership.md",
};

const createRequest = {
  content: "# New note\n",
  suggestedName: "New note.md",
};
const createVaultRequest = {
  name: "Second Brain",
};

describe("vault bridge", () => {
  beforeEach(() => mockedInvoke.mockReset());

  it("selects a vault through the Rust-owned dialog command", async () => {
    mockedInvoke.mockResolvedValue(snapshot);

    await expect(selectVault()).resolves.toEqual(snapshot);
    expect(mockedInvoke).toHaveBeenCalledWith("select_vault");
  });

  it("creates a vault through the Rust-owned parent-folder dialog", async () => {
    mockedInvoke.mockResolvedValue(snapshot);

    await expect(createVault(createVaultRequest)).resolves.toEqual(snapshot);
    expect(mockedInvoke).toHaveBeenCalledWith(
      "create_vault",
      createVaultRequest,
    );
  });

  it("creates a folder through the retained Rust vault", async () => {
    mockedInvoke.mockResolvedValue(snapshot);

    await expect(
      createVaultFolder({ name: "Projects", parentPath: "Notes" }),
    ).resolves.toEqual(snapshot);
    expect(mockedInvoke).toHaveBeenCalledWith("create_vault_folder", {
      name: "Projects",
      parentPath: "Notes",
    });
  });

  it("renames and deletes folders through narrow native commands", async () => {
    mockedInvoke.mockResolvedValue(snapshot);

    await expect(
      renameVaultFolder({ folderPath: "Notes", name: "Archive" }),
    ).resolves.toEqual(snapshot);
    await expect(deleteVaultFolder("Archive/Empty")).resolves.toEqual(snapshot);
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "rename_vault_folder", {
      folderPath: "Notes",
      name: "Archive",
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "delete_vault_folder", {
      folderPath: "Archive/Empty",
    });
  });

  it("lists, opens, and forgets remembered vaults without frontend paths", async () => {
    const remembered = [
      {
        available: true,
        id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
        lastOpenedAt: 100,
        name: "Personal",
      },
    ];
    mockedInvoke
      .mockResolvedValueOnce(remembered)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce([]);

    await expect(listRememberedVaults()).resolves.toEqual(remembered);
    await expect(openRememberedVault(remembered[0].id)).resolves.toEqual(
      snapshot,
    );
    await expect(forgetVault(remembered[0].id)).resolves.toEqual([]);
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "list_remembered_vaults");
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "open_remembered_vault", {
      vaultId: remembered[0].id,
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(3, "forget_vault", {
      vaultId: remembered[0].id,
    });
  });

  it("rescans only the vault retained by Rust state", async () => {
    mockedInvoke.mockResolvedValue(snapshot);

    await expect(rescanVault()).resolves.toEqual(snapshot);
    expect(mockedInvoke).toHaveBeenCalledWith("rescan_vault");
  });

  it("starts and stops the native vault tree watcher", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await expect(watchVaultTree()).resolves.toBeUndefined();
    await expect(stopVaultTreeWatch()).resolves.toBeUndefined();
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "watch_vault_tree");
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "stop_vault_tree_watch");
  });

  it("lists, trashes, and restores notes through narrow native commands", async () => {
    const entry = {
      id: "01JZQ91T3AA6F2M9V3C5T7X1BZ",
      name: "Leadership.md",
      originalPath: "Notes/Leadership.md",
      trashedAt: 200,
    };
    const mutation = { entry, snapshot };
    mockedInvoke
      .mockResolvedValueOnce([entry])
      .mockResolvedValueOnce(mutation)
      .mockResolvedValueOnce(mutation);

    await expect(listVaultTrash()).resolves.toEqual([entry]);
    await expect(moveVaultFileToTrash("Notes/Leadership.md")).resolves.toEqual(
      mutation,
    );
    await expect(restoreVaultFileFromTrash(entry.id)).resolves.toEqual(
      mutation,
    );
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "list_vault_trash");
    expect(mockedInvoke).toHaveBeenNthCalledWith(
      2,
      "move_vault_file_to_trash",
      { relativePath: "Notes/Leadership.md" },
    );
    expect(mockedInvoke).toHaveBeenNthCalledWith(
      3,
      "restore_vault_file_from_trash",
      { trashId: entry.id },
    );
  });

  it("reads a relative file through the retained Rust vault", async () => {
    mockedInvoke.mockResolvedValue(document);

    await expect(readVaultFile("Notes/Leadership.md")).resolves.toEqual(
      document,
    );
    expect(mockedInvoke).toHaveBeenCalledWith("read_vault_file", {
      relativePath: "Notes/Leadership.md",
    });
  });

  it("starts and stops the active-file watcher", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await expect(
      watchVaultFile("Notes/Leadership.md"),
    ).resolves.toBeUndefined();
    await expect(stopVaultFileWatch()).resolves.toBeUndefined();
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "watch_vault_file", {
      relativePath: "Notes/Leadership.md",
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "stop_vault_file_watch");
  });

  it("creates a conflict copy through the narrow native bridge", async () => {
    mockedInvoke.mockResolvedValue(document);

    await expect(
      createVaultConflictCopy("Notes/Leadership.md", "# Local draft\n"),
    ).resolves.toEqual(document);
    expect(mockedInvoke).toHaveBeenCalledWith("create_vault_conflict_copy", {
      content: "# Local draft\n",
      relativePath: "Notes/Leadership.md",
    });
  });

  it("searches Markdown through the retained Rust vault", async () => {
    const result = {
      matches: [
        {
          line: 4,
          relativePath: "Notes/Leadership.md",
          snippet: "Calm leadership",
        },
      ],
      searchedFiles: 1,
      skippedFiles: 0,
      truncated: false,
    };
    mockedInvoke.mockResolvedValue(result);

    await expect(searchVault("leadership")).resolves.toEqual(result);
    expect(mockedInvoke).toHaveBeenCalledWith("search_vault", {
      query: "leadership",
    });
  });

  it("saves through the retained Rust vault with an expected revision", async () => {
    mockedInvoke.mockResolvedValue({
      ...document,
      content: saveRequest.content,
    });

    await expect(saveVaultFile(saveRequest)).resolves.toEqual({
      ...document,
      content: saveRequest.content,
    });
    expect(mockedInvoke).toHaveBeenCalledWith("save_vault_file", saveRequest);
  });

  it("archives and restores through expected-revision lifecycle commands", async () => {
    const request = {
      expectedContent: document.content,
      relativePath: document.relativePath,
    };
    mockedInvoke.mockResolvedValue(document);

    await expect(archiveVaultFile(request)).resolves.toEqual(document);
    await expect(
      restoreArchivedVaultFile({ ...request, destinationStatus: "inbox" }),
    ).resolves.toEqual(document);
    expect(mockedInvoke).toHaveBeenNthCalledWith(
      1,
      "archive_vault_file",
      request,
    );
    expect(mockedInvoke).toHaveBeenNthCalledWith(
      2,
      "restore_archived_vault_file",
      { ...request, destinationStatus: "inbox" },
    );
  });

  it("creates a Markdown file through the Rust-owned save dialog", async () => {
    mockedInvoke.mockResolvedValue({
      ...document,
      content: createRequest.content,
    });

    await expect(createVaultFile(createRequest)).resolves.toEqual({
      ...document,
      content: createRequest.content,
    });
    expect(mockedInvoke).toHaveBeenCalledWith(
      "create_vault_file",
      createRequest,
    );
  });

  it("renames a Markdown file through the Rust-owned dialog", async () => {
    const result = {
      relativePath: "Notes/Leading.md",
      updatedFiles: 2,
      updatedLinks: 3,
    };
    mockedInvoke.mockResolvedValue(result);

    await expect(renameVaultFile("Notes/Leadership.md")).resolves.toEqual(
      result,
    );
    expect(mockedInvoke).toHaveBeenCalledWith("rename_vault_file", {
      relativePath: "Notes/Leadership.md",
    });
  });

  it("moves a Markdown file into another retained Rust folder", async () => {
    const result = {
      relativePath: "Archive/Leadership.md",
      updatedFiles: 1,
      updatedLinks: 2,
    };
    mockedInvoke.mockResolvedValue(result);

    await expect(
      moveVaultFileToFolder("Notes/Leadership.md", "Archive"),
    ).resolves.toEqual(result);
    expect(mockedInvoke).toHaveBeenCalledWith("move_vault_file_to_folder", {
      destinationFolder: "Archive",
      relativePath: "Notes/Leadership.md",
    });
  });
});
