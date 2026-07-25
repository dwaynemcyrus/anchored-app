import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { readErrorMessage } from "./errors";
import { folderName } from "./documents";
import type { AnchoredDocument } from "./documents";
import type { NewNotificationHistoryEntry } from "./notificationHistory";
import {
  createVaultFolder,
  deleteVaultFolder,
  moveVaultFolderToTrash,
  renameVaultFolder,
  type TrashEntry,
  type VaultSnapshot,
} from "../lib/tauri/vault";

type VaultNoticeOptions = {
  history?: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">;
  persistent?: boolean;
};

type FolderDialogsDependencies = {
  addTrashEntry: (entry: TrashEntry) => void;
  addVaultNotice: (text: string, options?: VaultNoticeOptions) => void;
  adoptVaultSnapshot: (snapshot: VaultSnapshot) => void;
  documents: AnchoredDocument[];
  folderPaths: string[];
  hasUnfinishedEdits: () => boolean;
  setExpandedFolders: Dispatch<SetStateAction<Set<string>>>;
  vaultSelected: boolean;
};

export type FolderDialogsApi = {
  createFolderError: string | undefined;
  createFolderParentPath: string | undefined;
  createFolderVisible: boolean;
  createNewFolder: (name: string) => Promise<void>;
  creatingFolder: boolean;
  deleteExistingFolder: (confirmation?: string) => Promise<void>;
  deleteFolderError: string | undefined;
  deleteFolderPending: boolean;
  deleteFolderVisible: boolean;
  deletingFolderContents: { fileCount: number; folderCount: number };
  deletingFolderPath: string | undefined;
  renameExistingFolder: (name: string) => Promise<void>;
  renameFolderError: string | undefined;
  renameFolderPending: boolean;
  renameFolderVisible: boolean;
  renamingFolderPath: string | undefined;
  reset: () => void;
  setCreateFolderError: (error: string | undefined) => void;
  setCreateFolderParentPath: (parentPath: string | undefined) => void;
  setCreateFolderVisible: (visible: boolean) => void;
  setDeleteFolderError: (error: string | undefined) => void;
  setDeleteFolderVisible: (visible: boolean) => void;
  setDeletingFolderPath: (folderPath: string | undefined) => void;
  setRenameFolderError: (error: string | undefined) => void;
  setRenameFolderVisible: (visible: boolean) => void;
  setRenamingFolderPath: (folderPath: string | undefined) => void;
};

/// Owns the create/rename/delete folder dialogs: their visibility, pending/
/// error state, and the mutations themselves. Extracted from App.tsx
/// following the useTrashPanel pattern. `documents`/`folderPaths` are
/// passed in fresh each render (needed live for `deletingFolderContents`),
/// unlike the other injected dependencies. The returned object is memoized
/// so callers that list it as a dependency do not recreate on every render.
export function useFolderDialogs({
  addTrashEntry,
  addVaultNotice,
  adoptVaultSnapshot,
  documents,
  folderPaths,
  hasUnfinishedEdits,
  setExpandedFolders,
  vaultSelected,
}: FolderDialogsDependencies): FolderDialogsApi {
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createFolderParentPath, setCreateFolderParentPath] = useState<
    string | undefined
  >();
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<
    string | undefined
  >();
  const [renamingFolderPath, setRenamingFolderPath] = useState<
    string | undefined
  >();
  const [renameFolderVisible, setRenameFolderVisible] = useState(false);
  const [renameFolderError, setRenameFolderError] = useState<
    string | undefined
  >();
  const [renameFolderPending, setRenameFolderPending] = useState(false);
  const [deletingFolderPath, setDeletingFolderPath] = useState<
    string | undefined
  >();
  const [deleteFolderVisible, setDeleteFolderVisible] = useState(false);
  const [deleteFolderError, setDeleteFolderError] = useState<
    string | undefined
  >();
  const [deleteFolderPending, setDeleteFolderPending] = useState(false);

  const deletingFolderContents = useMemo(() => {
    if (!deletingFolderPath) return { fileCount: 0, folderCount: 0 };
    const prefix = `${deletingFolderPath}/`;
    return {
      fileCount: documents.filter((document) =>
        (document.folderPath ?? "").startsWith(prefix),
      ).length,
      folderCount: folderPaths.filter((folder) => folder.startsWith(prefix))
        .length,
    };
  }, [deletingFolderPath, documents, folderPaths]);

  const createNewFolder = useCallback(
    async (name: string) => {
      if (!vaultSelected) {
        addVaultNotice("Open a vault before creating a folder.");
        return;
      }
      setCreatingFolder(true);
      setCreateFolderError(undefined);

      try {
        const snapshot = await createVaultFolder({
          name,
          parentPath: createFolderParentPath,
        });
        adoptVaultSnapshot(snapshot);
        setCreateFolderVisible(false);
        setCreateFolderParentPath(undefined);
        addVaultNotice(`${name.trim()} created.`, {
          history: { kind: "rename" },
        });
      } catch (error) {
        setCreateFolderError(readErrorMessage(error));
      } finally {
        setCreatingFolder(false);
      }
    },
    [addVaultNotice, adoptVaultSnapshot, createFolderParentPath, vaultSelected],
  );

  const renameExistingFolder = useCallback(
    async (name: string) => {
      if (!vaultSelected || !renamingFolderPath) {
        addVaultNotice("Open a vault before renaming a folder.");
        return;
      }
      if (hasUnfinishedEdits()) {
        addVaultNotice("Save all open note changes before renaming a folder.");
        return;
      }

      const originalFolderPath = renamingFolderPath;
      setRenameFolderPending(true);
      setRenameFolderError(undefined);
      try {
        const snapshot = await renameVaultFolder({
          folderPath: originalFolderPath,
          name,
        });
        const nextName = name.trim();
        const parentPath = originalFolderPath.split("/").slice(0, -1).join("/");
        const renamedFolderPath = parentPath
          ? `${parentPath}/${nextName}`
          : nextName;
        adoptVaultSnapshot(snapshot);
        setExpandedFolders((currentFolders) => {
          const nextFolders = new Set(currentFolders);
          return new Set(
            Array.from(nextFolders, (folderPath) =>
              folderPath === originalFolderPath
                ? renamedFolderPath
                : folderPath.startsWith(`${originalFolderPath}/`)
                  ? `${renamedFolderPath}${folderPath.slice(
                      originalFolderPath.length,
                    )}`
                  : folderPath,
            ),
          );
        });
        setRenameFolderVisible(false);
        setRenamingFolderPath(undefined);
        addVaultNotice(`${folderName(originalFolderPath)} renamed.`, {
          history: { kind: "rename" },
        });
      } catch (error) {
        setRenameFolderError(readErrorMessage(error));
      } finally {
        setRenameFolderPending(false);
      }
    },
    [
      addVaultNotice,
      adoptVaultSnapshot,
      hasUnfinishedEdits,
      renamingFolderPath,
      setExpandedFolders,
      vaultSelected,
    ],
  );

  const deleteExistingFolder = useCallback(
    async (confirmation = "") => {
      if (!vaultSelected || !deletingFolderPath) {
        addVaultNotice("Open a vault before deleting a folder.");
        return;
      }

      const targetFolderPath = deletingFolderPath;
      setDeleteFolderPending(true);
      setDeleteFolderError(undefined);
      try {
        if (
          deletingFolderContents.fileCount > 0 ||
          deletingFolderContents.folderCount > 0
        ) {
          const result = await moveVaultFolderToTrash(
            targetFolderPath,
            confirmation,
          );
          adoptVaultSnapshot(result.snapshot);
          addTrashEntry(result.entry);
        } else {
          const snapshot = await deleteVaultFolder(targetFolderPath);
          adoptVaultSnapshot(snapshot);
        }
        setExpandedFolders((currentFolders) => {
          const nextFolders = new Set(currentFolders);
          Array.from(nextFolders).forEach((folderPath) => {
            if (
              folderPath === targetFolderPath ||
              folderPath.startsWith(`${targetFolderPath}/`)
            ) {
              nextFolders.delete(folderPath);
            }
          });
          return nextFolders;
        });
        setDeleteFolderVisible(false);
        setDeletingFolderPath(undefined);
        addVaultNotice(
          `${folderName(targetFolderPath)} ${confirmation ? "moved to Trash" : "deleted"}.`,
          {
            history: { kind: confirmation ? "trash" : "rename" },
          },
        );
      } catch (error) {
        setDeleteFolderError(readErrorMessage(error));
      } finally {
        setDeleteFolderPending(false);
      }
    },
    [
      addTrashEntry,
      addVaultNotice,
      adoptVaultSnapshot,
      deletingFolderContents,
      deletingFolderPath,
      setExpandedFolders,
      vaultSelected,
    ],
  );

  const reset = useCallback(() => {
    setCreateFolderVisible(false);
    setCreateFolderParentPath(undefined);
    setCreateFolderError(undefined);
    setRenameFolderVisible(false);
    setRenamingFolderPath(undefined);
    setRenameFolderError(undefined);
    setDeleteFolderVisible(false);
    setDeletingFolderPath(undefined);
    setDeleteFolderError(undefined);
  }, []);

  return useMemo(
    () => ({
      createFolderError,
      createFolderParentPath,
      createFolderVisible,
      createNewFolder,
      creatingFolder,
      deleteExistingFolder,
      deleteFolderError,
      deleteFolderPending,
      deleteFolderVisible,
      deletingFolderContents,
      deletingFolderPath,
      renameExistingFolder,
      renameFolderError,
      renameFolderPending,
      renameFolderVisible,
      renamingFolderPath,
      reset,
      setCreateFolderError,
      setCreateFolderParentPath,
      setCreateFolderVisible,
      setDeleteFolderError,
      setDeleteFolderVisible,
      setDeletingFolderPath,
      setRenameFolderError,
      setRenameFolderVisible,
      setRenamingFolderPath,
    }),
    [
      createFolderError,
      createFolderParentPath,
      createFolderVisible,
      createNewFolder,
      creatingFolder,
      deleteExistingFolder,
      deleteFolderError,
      deleteFolderPending,
      deleteFolderVisible,
      deletingFolderContents,
      deletingFolderPath,
      renameExistingFolder,
      renameFolderError,
      renameFolderPending,
      renameFolderVisible,
      renamingFolderPath,
      reset,
    ],
  );
}
