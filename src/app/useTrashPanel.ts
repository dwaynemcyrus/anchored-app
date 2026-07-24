import { useCallback, useState, type RefObject } from "react";

import { readErrorMessage } from "./errors";
import type { AnchoredDocument } from "./documents";
import type { NewNotificationHistoryEntry } from "./notificationHistory";
import {
  listVaultTrash,
  moveVaultFileToTrash,
  restoreVaultFileFromTrash,
  restoreVaultFolderFromTrash,
  type TrashEntry,
  type VaultSnapshot,
} from "../lib/tauri/vault";

type TrashNoticeOptions = {
  history?: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">;
  persistent?: boolean;
};

type TrashPanelDependencies = {
  addHistoryEntry: (
    message: string,
    input: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">,
  ) => void;
  addVaultNotice: (text: string, options?: TrashNoticeOptions) => void;
  adoptVaultSnapshot: (snapshot: VaultSnapshot) => void;
  documentsRef: RefObject<AnchoredDocument[]>;
  onActiveDocumentTrashed: () => void;
};

export type TrashPanelApi = {
  addTrashEntry: (entry: TrashEntry) => void;
  openTrashPanel: () => void;
  refreshTrashEntries: () => Promise<void>;
  reset: () => void;
  restoreTrashEntry: (entry: TrashEntry) => Promise<void>;
  restoringTrashId: string | undefined;
  setTrashVisible: (visible: boolean) => void;
  trashDocument: (documentId: string) => Promise<void>;
  trashEntries: TrashEntry[];
  trashError: string | undefined;
  trashingDocumentId: string | undefined;
  trashLoading: boolean;
  trashVisible: boolean;
};

/// Owns Trash panel visibility, its entry list, and the trash/restore
/// mutations. Extracted from App.tsx as the first slice of a larger
/// decomposition; further state groups are expected to follow the same
/// pattern (pure dependencies passed in, no hidden App-wide state).
export function useTrashPanel({
  addHistoryEntry,
  addVaultNotice,
  adoptVaultSnapshot,
  documentsRef,
  onActiveDocumentTrashed,
}: TrashPanelDependencies): TrashPanelApi {
  const [trashVisible, setTrashVisible] = useState(false);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | undefined>();
  const [restoringTrashId, setRestoringTrashId] = useState<
    string | undefined
  >();
  const [trashingDocumentId, setTrashingDocumentId] = useState<
    string | undefined
  >();

  const refreshTrashEntries = useCallback(async () => {
    setTrashLoading(true);
    setTrashError(undefined);
    try {
      setTrashEntries(await listVaultTrash());
    } catch (error) {
      setTrashError(readErrorMessage(error));
    } finally {
      setTrashLoading(false);
    }
  }, []);

  const openTrashPanel = useCallback(() => {
    setTrashVisible(true);
    void refreshTrashEntries();
  }, [refreshTrashEntries]);

  const addTrashEntry = useCallback((entry: TrashEntry) => {
    setTrashEntries((current) => [
      entry,
      ...current.filter((candidate) => candidate.id !== entry.id),
    ]);
  }, []);

  const trashDocument = useCallback(
    async (documentId: string) => {
      const document = documentsRef.current.find(
        (candidate) => candidate.id === documentId,
      );
      if (
        !document?.relativePath ||
        document.isMarkdown === false ||
        document.saveState !== "saved" ||
        (document.sourceText !== undefined &&
          document.sourceText !== document.savedSourceText)
      ) {
        addVaultNotice("Save this note before moving it to Trash.");
        return;
      }

      setTrashingDocumentId(documentId);
      try {
        const result = await moveVaultFileToTrash(document.relativePath);
        onActiveDocumentTrashed();
        adoptVaultSnapshot(result.snapshot);
        addTrashEntry(result.entry);
        addVaultNotice(`${document.name} moved to Trash.`, {
          history: { kind: "trash" },
        });
      } catch (error) {
        addVaultNotice(readErrorMessage(error), { persistent: true });
        addHistoryEntry(`${document.name} could not be moved to Trash.`, {
          kind: "error",
        });
      } finally {
        setTrashingDocumentId(undefined);
      }
    },
    [
      addHistoryEntry,
      addTrashEntry,
      addVaultNotice,
      adoptVaultSnapshot,
      documentsRef,
      onActiveDocumentTrashed,
    ],
  );

  const restoreTrashEntry = useCallback(
    async (entry: TrashEntry) => {
      setRestoringTrashId(entry.id);
      setTrashError(undefined);
      try {
        const result = entry.isFolder
          ? await restoreVaultFolderFromTrash(entry.id)
          : await restoreVaultFileFromTrash(entry.id);
        adoptVaultSnapshot(result.snapshot);
        setTrashEntries((current) =>
          current.filter((candidate) => candidate.id !== entry.id),
        );
        addVaultNotice(`${entry.name} restored to ${entry.originalPath}.`, {
          history: { kind: "trash" },
        });
      } catch (error) {
        setTrashError(readErrorMessage(error));
        addHistoryEntry(`${entry.name} could not be restored from Trash.`, {
          kind: "error",
        });
      } finally {
        setRestoringTrashId(undefined);
      }
    },
    [addHistoryEntry, addVaultNotice, adoptVaultSnapshot],
  );

  const reset = useCallback(() => {
    setTrashVisible(false);
    setTrashEntries([]);
    setTrashLoading(false);
    setTrashError(undefined);
    setRestoringTrashId(undefined);
    setTrashingDocumentId(undefined);
  }, []);

  return {
    addTrashEntry,
    openTrashPanel,
    refreshTrashEntries,
    reset,
    restoreTrashEntry,
    restoringTrashId,
    setTrashVisible,
    trashDocument,
    trashEntries,
    trashError,
    trashingDocumentId,
    trashLoading,
    trashVisible,
  };
}
