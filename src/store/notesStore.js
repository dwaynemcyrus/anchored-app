import { create } from "zustand";
import { createDebouncedSaver, loadNotesFromStorage } from "../lib/notesPersistence";

const debouncedPersist = createDebouncedSaver(500);

const sortNotes = (notes) => notes.slice().sort((a, b) => b.updatedAt - a.updatedAt);

const createNoteId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `note_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const normalizeNote = (note) => {
  if (!note || typeof note !== "object") return null;
  if (typeof note.id !== "string") return null;
  const createdAt = Number.isFinite(note.createdAt) ? note.createdAt : Date.now();
  const updatedAt = Number.isFinite(note.updatedAt) ? note.updatedAt : createdAt;
  return {
    id: note.id,
    title: typeof note.title === "string" || note.title === null ? note.title : null,
    body: typeof note.body === "string" ? note.body : "",
    createdAt,
    updatedAt,
  };
};

export const getDerivedTitle = (note) => {
  const title = typeof note?.title === "string" ? note.title.trim() : "";
  if (title) return title;
  if (!note || typeof note.body !== "string") return "Untitled";
  const lines = note.body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return "Untitled";
};

export const useNotesStore = create((set, get) => ({
  notes: [],
  hasHydrated: false,
  hydrate: () => {
    if (get().hasHydrated) return;
    const stored = loadNotesFromStorage();
    const normalized = stored.map(normalizeNote).filter(Boolean);
    set({
      notes: sortNotes(normalized),
      hasHydrated: true,
    });
  },
  createNote: () => {
    const now = Date.now();
    const note = {
      id: createNoteId(),
      title: null,
      body: "",
      createdAt: now,
      updatedAt: now,
    };
    set((state) => {
      const next = sortNotes([note, ...state.notes]);
      debouncedPersist(next);
      return { notes: next };
    });
    return note.id;
  },
  updateNoteBody: (id, body) => {
    if (typeof id !== "string") return;
    set((state) => {
      const next = state.notes.map((note) =>
        note.id === id
          ? { ...note, body, updatedAt: Date.now() }
          : note
      );
      const sorted = sortNotes(next);
      debouncedPersist(sorted);
      return { notes: sorted };
    });
  },
  updateNote: (id, updates) => {
    if (typeof id !== "string" || !updates) return;
    set((state) => {
      const next = state.notes.map((note) => {
        if (note.id !== id) return note;
        const updated = { ...note, ...updates };
        if (!Number.isFinite(updated.updatedAt)) {
          updated.updatedAt = Date.now();
        }
        return updated;
      });
      const sorted = sortNotes(next);
      debouncedPersist(sorted);
      return { notes: sorted };
    });
  },
}));
