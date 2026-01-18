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
  archivedAt: document.archivedAt ?? null,
});

const shouldIncludeInList = (document, includeArchived) =>
  document.deletedAt == null && (includeArchived || document.archivedAt == null);

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

const removeListItem = (notes, id) => notes.filter((note) => note.id !== id);

export const getDerivedTitle = (note) => deriveDocumentTitle(note);

export const useNotesStore = create((set, get) => ({
  notes: [],
  notesById: {},
  hasHydrated: false,
  listIncludeArchived: false,
  hydrate: async (options = {}) => {
    const { includeArchived, force = false } = options;
    const currentIncludeArchived = get().listIncludeArchived;
    const nextIncludeArchived =
      typeof includeArchived === "boolean" ? includeArchived : currentIncludeArchived;
    if (get().hasHydrated && !force && nextIncludeArchived === currentIncludeArchived) return;
    try {
      const repo = getDocumentsRepo();
      const list = await repo.list({
        type: DOCUMENT_TYPE_NOTE,
        includeArchived: nextIncludeArchived,
      });
      set({
        notes: sortNotes(list),
        hasHydrated: true,
        listIncludeArchived: nextIncludeArchived,
      });
    } catch (error) {
      console.error("Failed to hydrate notes list", error);
      set({ notes: [], hasHydrated: true, listIncludeArchived: nextIncludeArchived });
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
        notes: shouldIncludeInList(document, state.listIncludeArchived)
          ? upsertListItem(state.notes, toListItem(document))
          : removeListItem(state.notes, document.id),
      }));
      return document;
    } catch (error) {
      console.error("Failed to load note", error);
      return null;
    }
  },
  createNote: async (input = {}, options = {}) => {
    const { suppressListUpdate = false } = options;
    const { body = "", title = null, meta = {} } = input;
    try {
      const repo = getDocumentsRepo();
      const document = await repo.create({
        type: DOCUMENT_TYPE_NOTE,
        body,
        title,
        meta,
        archivedAt: input.archivedAt ?? null,
      });
      set((state) => ({
        notesById: { ...state.notesById, [document.id]: document },
        notes: suppressListUpdate
          ? state.notes
          : shouldIncludeInList(document, state.listIncludeArchived)
            ? upsertListItem(state.notes, toListItem(document))
            : state.notes,
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
            archivedAt: null,
          };
      return {
        notesById: { ...state.notesById, [id]: updated },
        notes: shouldIncludeInList(updated, state.listIncludeArchived)
          ? upsertListItem(state.notes, toListItem(updated))
          : removeListItem(state.notes, id),
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
        notes: shouldIncludeInList(updated, state.listIncludeArchived)
          ? upsertListItem(state.notes, toListItem(updated))
          : removeListItem(state.notes, id),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.update(id, updates);
    } catch (error) {
      console.error("Failed to update note", error);
    }
  },
  archiveNote: async (id) => {
    if (typeof id !== "string") return;
    const now = Date.now();
    set((state) => {
      const existing = state.notesById[id];
      if (!existing) return state;
      const updated = { ...existing, archivedAt: now, updatedAt: now };
      return {
        notesById: { ...state.notesById, [id]: updated },
        notes: shouldIncludeInList(updated, state.listIncludeArchived)
          ? upsertListItem(state.notes, toListItem(updated))
          : removeListItem(state.notes, id),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.archive(id);
    } catch (error) {
      console.error("Failed to archive note", error);
    }
  },
  unarchiveNote: async (id) => {
    if (typeof id !== "string") return;
    const now = Date.now();
    set((state) => {
      const existing = state.notesById[id];
      if (!existing) return state;
      const updated = { ...existing, archivedAt: null, updatedAt: now };
      return {
        notesById: { ...state.notesById, [id]: updated },
        notes: shouldIncludeInList(updated, state.listIncludeArchived)
          ? upsertListItem(state.notes, toListItem(updated))
          : removeListItem(state.notes, id),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.unarchive(id);
    } catch (error) {
      console.error("Failed to unarchive note", error);
    }
  },
  trashNote: async (id) => {
    if (typeof id !== "string") return;
    const now = Date.now();
    set((state) => {
      const existing = state.notesById[id];
      if (!existing) return state;
      const updated = { ...existing, deletedAt: now, updatedAt: now };
      return {
        notesById: { ...state.notesById, [id]: updated },
        notes: removeListItem(state.notes, id),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.trash(id);
    } catch (error) {
      console.error("Failed to trash note", error);
    }
  },
  restoreNote: async (id) => {
    if (typeof id !== "string") return;
    const now = Date.now();
    set((state) => {
      const existing = state.notesById[id];
      if (!existing) return state;
      const updated = { ...existing, deletedAt: null, updatedAt: now };
      return {
        notesById: { ...state.notesById, [id]: updated },
        notes: shouldIncludeInList(updated, state.listIncludeArchived)
          ? upsertListItem(state.notes, toListItem(updated))
          : removeListItem(state.notes, id),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.restore(id);
    } catch (error) {
      console.error("Failed to restore note", error);
    }
  },
}));
