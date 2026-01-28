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
  lastErrorDetails: null,
  lastErrorAt: null,
  lastSyncedAt: null,
  lastSuccessfulSyncAt: null,
  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastError: (lastError, lastErrorDetails = null) =>
    set({ lastError, lastErrorDetails, lastErrorAt: lastError ? new Date().toISOString() : null }),
  clearError: () => set({ lastError: null, lastErrorDetails: null, lastErrorAt: null }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setLastSuccessfulSyncAt: (lastSuccessfulSyncAt) => set({ lastSuccessfulSyncAt }),
}));
