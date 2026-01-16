const NOTES_STORAGE_KEY = "anchored.notes.v0";
const DEFAULT_DEBOUNCE_MS = 500;

export function loadNotesFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

export function persistNotesToStorage(notes) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch (error) {
    // Ignore write failures (storage full, privacy mode, etc.).
  }
}

export function createDebouncedSaver(delayMs = DEFAULT_DEBOUNCE_MS) {
  let timer = null;

  return function debouncedSave(notes) {
    if (typeof window === "undefined") return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      persistNotesToStorage(notes);
      timer = null;
    }, delayMs);
  };
}

export { NOTES_STORAGE_KEY };
