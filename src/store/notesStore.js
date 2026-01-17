import { create } from "zustand";
import { getDocumentsRepo } from "../lib/repo/getDocumentsRepo";
import { deriveDocumentTitle } from "../lib/documents/deriveTitle";
import { DOCUMENT_TYPE_NOTE } from "../types/document";

const sortNotes = (notes) => notes.slice().sort((a, b) => b.updatedAt - a.updatedAt);

const toListItem = (document) => ({
  id: document.id,
  type: document.type,
  title: deriveDocumentTitle(document),
  updatedAt: document.updatedAt,
});

const upsertListItem = (notes, item) => {
  const next = notes.slice();
  const index = next.findIndex((note) => note.id === item.id);
  if (index === -1) {
    next.push(item);
  } else {
    next[index] = { ...next[index], ...item };
  }
  return sortNotes(next);
};

export const getDerivedTitle = (note) => deriveDocumentTitle(note);

export const useNotesStore = create((set, get) => ({
  notes: [],
  notesById: {},
  hasHydrated: false,
  hydrate: async () => {
    if (get().hasHydrated) return;
    try {
      const repo = getDocumentsRepo();
      const list = await repo.list({ type: DOCUMENT_TYPE_NOTE });
      set({
        notes: sortNotes(list),
        hasHydrated: true,
      });
    } catch (error) {
      console.error("Failed to hydrate notes list", error);
      set({ notes: [], hasHydrated: true });
    }
  },
  loadNote: async (id) => {
    if (typeof id !== "string") return null;
    const cached = get().notesById[id];
    if (cached) return cached;
    try {
      const repo = getDocumentsRepo();
      const document = await repo.get(id);
      if (!document) return null;
      set((state) => ({
        notesById: { ...state.notesById, [id]: document },
        notes: upsertListItem(state.notes, toListItem(document)),
      }));
      return document;
    } catch (error) {
      console.error("Failed to load note", error);
      return null;
    }
  },
  createNote: async () => {
    try {
      const repo = getDocumentsRepo();
      const document = await repo.create({
        type: DOCUMENT_TYPE_NOTE,
        body: "",
        meta: {},
      });
      set((state) => ({
        notesById: { ...state.notesById, [document.id]: document },
        notes: upsertListItem(state.notes, toListItem(document)),
      }));
      return document.id;
    } catch (error) {
      console.error("Failed to create note", error);
      return null;
    }
  },
  updateNoteBody: async (id, body) => {
    if (typeof id !== "string") return;
    const now = Date.now();
    set((state) => {
      const existing = state.notesById[id];
      const updated = existing
        ? { ...existing, body, updatedAt: now }
        : {
            id,
            type: DOCUMENT_TYPE_NOTE,
            title: null,
            body,
            meta: {},
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
      return {
        notesById: { ...state.notesById, [id]: updated },
        notes: upsertListItem(state.notes, toListItem(updated)),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.update(id, { body });
    } catch (error) {
      console.error("Failed to update note body", error);
    }
  },
  updateNote: async (id, updates) => {
    if (typeof id !== "string" || !updates) return;
    const now = Date.now();
    set((state) => {
      const existing = state.notesById[id];
      if (!existing) return state;
      const updated = { ...existing, ...updates, updatedAt: now };
      return {
        notesById: { ...state.notesById, [id]: updated },
        notes: upsertListItem(state.notes, toListItem(updated)),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.update(id, updates);
    } catch (error) {
      console.error("Failed to update note", error);
    }
  },
}));
