import { useCallback, useMemo, useState } from "react";

import { readErrorMessage } from "./errors";
import { wikilinkCreationName } from "./links";
import {
  createInboxVaultFile,
  rescanVault,
  type VaultSnapshot,
} from "../lib/tauri/vault";

type MissingWikilinkDialogDependencies = {
  adoptVaultSnapshot: (snapshot: VaultSnapshot) => void;
  selectDocument: (documentId: string) => Promise<void>;
  setFocusDocument: (documentId?: string) => void;
};

export type MissingWikilinkDialogApi = {
  closeMissingWikilinkDialog: () => void;
  createMissingWikilinkNote: () => Promise<void>;
  creatingMissingWikilink: boolean;
  missingWikilinkError: string | undefined;
  missingWikilinkTarget: string | undefined;
  openMissingWikilinkDialog: (target: string) => void;
  reset: () => void;
};

/// Owns the "create a note for this unresolved wikilink" dialog: its target,
/// error, and in-flight state, plus the note-creation mutation itself.
/// Extracted from App.tsx following the useTrashPanel pattern. The returned
/// object is memoized so callers that list it as a dependency (see
/// useSidebarState for why) do not recreate on every render.
export function useMissingWikilinkDialog({
  adoptVaultSnapshot,
  selectDocument,
  setFocusDocument,
}: MissingWikilinkDialogDependencies): MissingWikilinkDialogApi {
  const [missingWikilinkTarget, setMissingWikilinkTarget] = useState<
    string | undefined
  >();
  const [missingWikilinkError, setMissingWikilinkError] = useState<
    string | undefined
  >();
  const [creatingMissingWikilink, setCreatingMissingWikilink] = useState(false);

  const openMissingWikilinkDialog = useCallback((target: string) => {
    setMissingWikilinkError(undefined);
    setMissingWikilinkTarget(target);
  }, []);

  const closeMissingWikilinkDialog = useCallback(() => {
    if (creatingMissingWikilink) return;
    setMissingWikilinkError(undefined);
    setMissingWikilinkTarget(undefined);
  }, [creatingMissingWikilink]);

  const createMissingWikilinkNote = useCallback(async () => {
    if (!missingWikilinkTarget) return;
    const name = wikilinkCreationName(missingWikilinkTarget);
    if (!name) {
      setMissingWikilinkError(
        "This wikilink cannot be turned into a single Inbox note name.",
      );
      return;
    }

    setCreatingMissingWikilink(true);
    setMissingWikilinkError(undefined);
    try {
      const created = await createInboxVaultFile({ content: "", name });
      const snapshot = await rescanVault();
      if (snapshot) adoptVaultSnapshot(snapshot);
      const documentId = `vault-path:${created.relativePath}`;
      setFocusDocument(documentId);
      setMissingWikilinkTarget(undefined);
      await selectDocument(documentId);
    } catch (error) {
      setMissingWikilinkError(readErrorMessage(error));
    } finally {
      setCreatingMissingWikilink(false);
    }
  }, [
    adoptVaultSnapshot,
    missingWikilinkTarget,
    selectDocument,
    setFocusDocument,
  ]);

  const reset = useCallback(() => {
    setMissingWikilinkTarget(undefined);
    setMissingWikilinkError(undefined);
    setCreatingMissingWikilink(false);
  }, []);

  return useMemo(
    () => ({
      closeMissingWikilinkDialog,
      createMissingWikilinkNote,
      creatingMissingWikilink,
      missingWikilinkError,
      missingWikilinkTarget,
      openMissingWikilinkDialog,
      reset,
    }),
    [
      closeMissingWikilinkDialog,
      createMissingWikilinkNote,
      creatingMissingWikilink,
      missingWikilinkError,
      missingWikilinkTarget,
      openMissingWikilinkDialog,
      reset,
    ],
  );
}
