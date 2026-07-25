import { useCallback, useMemo, useState } from "react";

import { readErrorMessage } from "./errors";
import type { NewNotificationHistoryEntry } from "./notificationHistory";
import {
  createVault,
  forgetVault,
  listRememberedVaults,
  openRememberedVault,
  selectVault,
  type RememberedVault,
  type VaultSnapshot,
} from "../lib/tauri/vault";

type VaultNoticeOptions = {
  history?: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">;
  persistent?: boolean;
};

type VaultSwitcherDependencies = {
  activateVaultSnapshot: (snapshot: VaultSnapshot) => void;
  addVaultNotice: (text: string, options?: VaultNoticeOptions) => void;
  hasUnfinishedEdits: () => boolean;
  refreshTrashEntries: () => Promise<void>;
  vaultSelected: boolean;
};

export type VaultSwitcherApi = {
  createNewVault: (name: string) => Promise<void>;
  createVaultError: string | undefined;
  creatingVault: boolean;
  createVaultVisible: boolean;
  forgetKnownVault: (rememberedVaultId: string) => Promise<void>;
  openKnownVault: (rememberedVaultId: string) => Promise<void>;
  openSwitcher: () => void;
  openVault: () => Promise<void>;
  openingRememberedVaultId: string | undefined;
  refreshRememberedVaults: () => Promise<void>;
  rememberedVaults: RememberedVault[];
  rememberedVaultsError: string | undefined;
  rememberedVaultsLoading: boolean;
  reset: () => void;
  selectingVault: boolean;
  setCreateVaultError: (error: string | undefined) => void;
  setCreateVaultVisible: (visible: boolean) => void;
  setOpeningRememberedVaultId: (id: string | undefined) => void;
  setRememberedVaultsError: (error: string | undefined) => void;
  setVaultSwitcherVisible: (visible: boolean) => void;
  vaultSwitcherVisible: boolean;
};

/// Owns the vault switcher (remembered vaults + open/create/forget flows)
/// and the create-vault dialog. Extracted from App.tsx following the
/// useTrashPanel pattern. The returned object is memoized so callers that
/// list it as a dependency do not recreate on every render.
export function useVaultSwitcher({
  activateVaultSnapshot,
  addVaultNotice,
  hasUnfinishedEdits,
  refreshTrashEntries,
  vaultSelected,
}: VaultSwitcherDependencies): VaultSwitcherApi {
  const [selectingVault, setSelectingVault] = useState(false);
  const [creatingVault, setCreatingVault] = useState(false);
  const [createVaultVisible, setCreateVaultVisible] = useState(false);
  const [createVaultError, setCreateVaultError] = useState<
    string | undefined
  >();
  const [vaultSwitcherVisible, setVaultSwitcherVisible] = useState(false);
  const [rememberedVaults, setRememberedVaults] = useState<RememberedVault[]>(
    [],
  );
  const [rememberedVaultsLoading, setRememberedVaultsLoading] = useState(true);
  const [rememberedVaultsError, setRememberedVaultsError] = useState<
    string | undefined
  >();
  const [openingRememberedVaultId, setOpeningRememberedVaultId] = useState<
    string | undefined
  >();

  const refreshRememberedVaults = useCallback(async () => {
    setRememberedVaultsLoading(true);
    setRememberedVaultsError(undefined);
    try {
      setRememberedVaults(await listRememberedVaults());
    } catch {
      setRememberedVaultsError(
        "Remembered vaults are available in the Anchored desktop app.",
      );
    } finally {
      setRememberedVaultsLoading(false);
    }
  }, []);

  const openVault = useCallback(async () => {
    if (vaultSelected && hasUnfinishedEdits()) {
      addVaultNotice(
        "Save or close all draft changes before switching vaults.",
      );
      return;
    }
    setSelectingVault(true);

    try {
      const snapshot = await selectVault();
      if (!snapshot) return;
      activateVaultSnapshot(snapshot);
      setVaultSwitcherVisible(false);
      await Promise.all([refreshRememberedVaults(), refreshTrashEntries()]);
    } catch {
      addVaultNotice(
        "Vault selection is available in the Anchored desktop app.",
        { history: { kind: "error" }, persistent: true },
      );
    } finally {
      setSelectingVault(false);
    }
  }, [
    activateVaultSnapshot,
    addVaultNotice,
    hasUnfinishedEdits,
    refreshRememberedVaults,
    refreshTrashEntries,
    vaultSelected,
  ]);

  const createNewVault = useCallback(
    async (name: string) => {
      if (vaultSelected && hasUnfinishedEdits()) {
        addVaultNotice(
          "Save or close all draft changes before switching vaults.",
        );
        return;
      }
      setCreatingVault(true);
      setCreateVaultError(undefined);

      try {
        const snapshot = await createVault({ name });
        if (!snapshot) {
          setCreateVaultVisible(false);
          return;
        }
        activateVaultSnapshot(snapshot);
        setCreateVaultVisible(false);
        setVaultSwitcherVisible(false);
        await Promise.all([refreshRememberedVaults(), refreshTrashEntries()]);
      } catch (error) {
        setCreateVaultError(readErrorMessage(error));
      } finally {
        setCreatingVault(false);
      }
    },
    [
      activateVaultSnapshot,
      addVaultNotice,
      hasUnfinishedEdits,
      refreshRememberedVaults,
      refreshTrashEntries,
      vaultSelected,
    ],
  );

  const openKnownVault = useCallback(
    async (rememberedVaultId: string) => {
      if (hasUnfinishedEdits()) {
        addVaultNotice(
          "Save or close all draft changes before switching vaults.",
        );
        return;
      }

      setOpeningRememberedVaultId(rememberedVaultId);
      setRememberedVaultsError(undefined);
      try {
        const snapshot = await openRememberedVault(rememberedVaultId);
        activateVaultSnapshot(snapshot);
        setVaultSwitcherVisible(false);
        await Promise.all([refreshRememberedVaults(), refreshTrashEntries()]);
      } catch (error) {
        setRememberedVaultsError(readErrorMessage(error));
      } finally {
        setOpeningRememberedVaultId(undefined);
      }
    },
    [
      activateVaultSnapshot,
      addVaultNotice,
      hasUnfinishedEdits,
      refreshRememberedVaults,
      refreshTrashEntries,
    ],
  );

  const forgetKnownVault = useCallback(async (rememberedVaultId: string) => {
    setRememberedVaultsError(undefined);
    try {
      setRememberedVaults(await forgetVault(rememberedVaultId));
    } catch (error) {
      setRememberedVaultsError(readErrorMessage(error));
    }
  }, []);

  const openSwitcher = useCallback(() => {
    if (!vaultSelected && rememberedVaults.length === 0) {
      void openVault();
      return;
    }
    setVaultSwitcherVisible(true);
    void refreshRememberedVaults();
  }, [
    openVault,
    refreshRememberedVaults,
    rememberedVaults.length,
    vaultSelected,
  ]);

  const reset = useCallback(() => {
    setVaultSwitcherVisible(false);
    setCreateVaultVisible(false);
    setCreateVaultError(undefined);
  }, []);

  return useMemo(
    () => ({
      createNewVault,
      createVaultError,
      creatingVault,
      createVaultVisible,
      forgetKnownVault,
      openKnownVault,
      openSwitcher,
      openVault,
      openingRememberedVaultId,
      refreshRememberedVaults,
      rememberedVaults,
      rememberedVaultsError,
      rememberedVaultsLoading,
      reset,
      selectingVault,
      setCreateVaultError,
      setCreateVaultVisible,
      setOpeningRememberedVaultId,
      setRememberedVaultsError,
      setVaultSwitcherVisible,
      vaultSwitcherVisible,
    }),
    [
      createNewVault,
      createVaultError,
      creatingVault,
      createVaultVisible,
      forgetKnownVault,
      openKnownVault,
      openSwitcher,
      openVault,
      openingRememberedVaultId,
      refreshRememberedVaults,
      rememberedVaults,
      rememberedVaultsError,
      rememberedVaultsLoading,
      reset,
      selectingVault,
      vaultSwitcherVisible,
    ],
  );
}
