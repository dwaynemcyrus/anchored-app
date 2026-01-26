import { create } from "zustand";

export const SYNC_STATUS = {
  SYNCED: "synced",
  SYNCING: "syncing",
  OFFLINE: "offline",
  ERROR: "error",
};

export const useSyncStore = create((set) => ({
  status: SYNC_STATUS.SYNCED,
  pendingCount: 0,
  lastError: null,
  lastSyncedAt: null,
  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastError: (lastError) => set({ lastError }),
  clearError: () => set({ lastError: null }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}));
