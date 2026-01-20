import { create } from "zustand";

const STORAGE_KEY = "anchored.workbench.v1";
const MAX_PINNED = 5;

const readStoredSettings = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Failed to read workbench settings", error);
    return null;
  }
};

const writeStoredSettings = (settings) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to persist workbench settings", error);
  }
};

export const useWorkbenchStore = create((set, get) => ({
  pinnedIds: [],
  hasHydrated: false,

  hydrate: () => {
    if (get().hasHydrated) return;
    const stored = readStoredSettings();
    if (stored && Array.isArray(stored.pinnedIds)) {
      set({
        pinnedIds: stored.pinnedIds.filter((id) => typeof id === "string"),
        hasHydrated: true,
      });
      return;
    }
    set({ hasHydrated: true });
  },

  /**
   * Attempt to pin a document.
   * @param {string} id
   * @returns {{ success: boolean, alreadyPinned?: boolean, needsReplace?: boolean }}
   */
  pin: (id) => {
    const { pinnedIds } = get();

    if (pinnedIds.includes(id)) {
      return { success: false, alreadyPinned: true };
    }

    if (pinnedIds.length >= MAX_PINNED) {
      return { success: false, needsReplace: true };
    }

    const next = [...pinnedIds, id];
    set({ pinnedIds: next });
    writeStoredSettings({ pinnedIds: next });
    return { success: true };
  },

  /**
   * Remove a document from workbench.
   * @param {string} id
   */
  unpin: (id) => {
    const { pinnedIds } = get();
    const next = pinnedIds.filter((pinned) => pinned !== id);
    set({ pinnedIds: next });
    writeStoredSettings({ pinnedIds: next });
  },

  /**
   * Replace an existing pinned doc with a new one at the same index.
   * @param {string} oldId
   * @param {string} newId
   * @returns {boolean} success
   */
  replace: (oldId, newId) => {
    const { pinnedIds } = get();
    const index = pinnedIds.indexOf(oldId);
    if (index === -1) return false;

    const next = [...pinnedIds];
    next[index] = newId;
    set({ pinnedIds: next });
    writeStoredSettings({ pinnedIds: next });
    return true;
  },

  /**
   * Remove invalid IDs from the pinned list.
   * @param {string[]} validIds - list of IDs that exist
   */
  cleanupInvalidIds: (validIds) => {
    const { pinnedIds } = get();
    const validSet = new Set(validIds);
    const next = pinnedIds.filter((id) => validSet.has(id));
    if (next.length !== pinnedIds.length) {
      set({ pinnedIds: next });
      writeStoredSettings({ pinnedIds: next });
    }
  },
}));
