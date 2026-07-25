import { useCallback, useState } from "react";

import { readErrorMessage } from "./errors";
import {
  listVaultConflicts,
  listVaultNoteVersions,
  type NoteVersion,
  type VaultConflict,
} from "../lib/tauri/vault";

export type RecoveryPanelApi = {
  conflicts: VaultConflict[];
  openRecoveryPanel: (relativePath?: string) => void;
  recoveryError: string | undefined;
  recoveryLoading: boolean;
  recoveryVisible: boolean;
  setRecoveryVisible: (visible: boolean) => void;
  reset: () => void;
  versions: NoteVersion[];
  versionsFor: string | undefined;
};

/**
 * Loads what Recovery shows: notes changed in two places at once, and the
 * earlier copies kept of whichever note is open.
 *
 * Both are read on open rather than kept live. Nothing here changes a note,
 * so a stale view costs nothing, and polling the index while the user types
 * would.
 */
export function useRecoveryPanel(): RecoveryPanelApi {
  const [conflicts, setConflicts] = useState<VaultConflict[]>([]);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [versionsFor, setVersionsFor] = useState<string | undefined>(undefined);
  const [recoveryError, setRecoveryError] = useState<string | undefined>(
    undefined,
  );
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryVisible, setRecoveryVisible] = useState(false);

  const reset = useCallback(() => {
    setConflicts([]);
    setVersions([]);
    setVersionsFor(undefined);
    setRecoveryError(undefined);
    setRecoveryLoading(false);
    setRecoveryVisible(false);
  }, []);

  const openRecoveryPanel = useCallback((relativePath?: string) => {
    setRecoveryVisible(true);
    setRecoveryLoading(true);
    setRecoveryError(undefined);
    setVersionsFor(relativePath);

    void (async () => {
      try {
        const [foundConflicts, foundVersions] = await Promise.all([
          listVaultConflicts(),
          relativePath
            ? listVaultNoteVersions(relativePath)
            : Promise.resolve<NoteVersion[]>([]),
        ]);
        setConflicts(foundConflicts);
        setVersions(foundVersions);
      } catch (error) {
        setRecoveryError(readErrorMessage(error));
      } finally {
        setRecoveryLoading(false);
      }
    })();
  }, []);

  return {
    conflicts,
    openRecoveryPanel,
    recoveryError,
    recoveryLoading,
    recoveryVisible,
    setRecoveryVisible,
    reset,
    versions,
    versionsFor,
  };
}
