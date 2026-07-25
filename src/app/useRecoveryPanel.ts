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
  refreshRecovery: () => void;
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
 * Read when the panel opens, and again whenever the caller says something has
 * changed. Not polled: nothing here changes a note, so asking the index
 * repeatedly while someone types would cost more than it is worth.
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

  const load = useCallback(
    (relativePath: string | undefined, showLoading: boolean) => {
      if (showLoading) setRecoveryLoading(true);
      setRecoveryError(undefined);

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
          if (showLoading) setRecoveryLoading(false);
        }
      })();
    },
    [],
  );

  const openRecoveryPanel = useCallback(
    (relativePath?: string) => {
      setRecoveryVisible(true);
      setVersionsFor(relativePath);
      load(relativePath, true);
    },
    [load],
  );

  /**
   * Re-reads without the loading state, so a save landing while the panel is
   * open updates the list in place instead of blanking it.
   */
  const refreshRecovery = useCallback(() => {
    setVersionsFor((current) => {
      load(current, false);
      return current;
    });
  }, [load]);

  return {
    conflicts,
    openRecoveryPanel,
    refreshRecovery,
    recoveryError,
    recoveryLoading,
    recoveryVisible,
    setRecoveryVisible,
    reset,
    versions,
    versionsFor,
  };
}
