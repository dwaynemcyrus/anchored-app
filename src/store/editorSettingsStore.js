import { create } from "zustand";

const STORAGE_KEY = "anchored.editor.settings.v1";
const TYPEWRITER_STORAGE_KEY = "anchored.editor.typewriter.enabled";
const FONT_SIZES = ["small", "default", "large"];

const readStoredSettings = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Failed to read editor settings", error);
    return null;
  }
};

const writeStoredSettings = (settings) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to persist editor settings", error);
  }
};

const readTypewriterSetting = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TYPEWRITER_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch (error) {
    console.warn("Failed to read typewriter setting", error);
    return null;
  }
};

const writeTypewriterSetting = (enabled) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TYPEWRITER_STORAGE_KEY, enabled ? "true" : "false");
  } catch (error) {
    console.warn("Failed to persist typewriter setting", error);
  }
};

export const useEditorSettingsStore = create((set, get) => ({
  focusMode: false,
  fontSize: "default",
  typewriterEnabled: false,
  hasHydrated: false,
  hydrate: () => {
    if (get().hasHydrated) return;
    const stored = readStoredSettings();
    const typewriterSetting = readTypewriterSetting();
    set({
      focusMode: stored ? Boolean(stored.focusMode) : false,
      fontSize: stored && FONT_SIZES.includes(stored.fontSize) ? stored.fontSize : "default",
      typewriterEnabled: typewriterSetting ?? false,
      hasHydrated: true,
    });
  },
  toggleFocusMode: () => {
    set((state) => {
      const next = { ...state, focusMode: !state.focusMode };
      writeStoredSettings({ focusMode: next.focusMode, fontSize: next.fontSize });
      return next;
    });
  },
  cycleFontSize: () => {
    set((state) => {
      const currentIndex = FONT_SIZES.indexOf(state.fontSize);
      const nextIndex = currentIndex === -1 ? 1 : (currentIndex + 1) % FONT_SIZES.length;
      const next = { ...state, fontSize: FONT_SIZES[nextIndex] };
      writeStoredSettings({ focusMode: next.focusMode, fontSize: next.fontSize });
      return next;
    });
  },
  toggleTypewriter: () => {
    set((state) => {
      const nextEnabled = !state.typewriterEnabled;
      writeTypewriterSetting(nextEnabled);
      return { ...state, typewriterEnabled: nextEnabled };
    });
  },
}));
