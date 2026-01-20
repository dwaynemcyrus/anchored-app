import { create } from "zustand";
import { getDocumentsRepo } from "../lib/repo/getDocumentsRepo";
import { deriveDocumentTitle } from "../lib/documents/deriveTitle";
import { DOCUMENT_TYPE_NOTE, DOCUMENT_TYPE_DAILY } from "../types/document";

const sortNotes = (notes) => notes.slice().sort((a, b) => b.updatedAt - a.updatedAt);

const toListItem = (document) => ({
  id: document.id,
  type: document.type,
  title: deriveDocumentTitle(document),
  updatedAt: document.updatedAt,
  archivedAt: document.archivedAt ?? null,
  inboxAt: document.inboxAt ?? null,
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
  hydrateError: null,
  listIncludeArchived: false,
  inboxCount: 0,
  inboxCountLoaded: false,
  loadInboxCount: async () => {
    try {
      const repo = getDocumentsRepo();
      const notes = await repo.listInboxNotes();
      // Exclude daily notes from inbox count
      const filtered = notes.filter((note) => note.type !== DOCUMENT_TYPE_DAILY);
      set({ inboxCount: filtered.length, inboxCountLoaded: true });
    } catch (error) {
      console.error("Failed to load inbox count:", error);
      set({ inboxCountLoaded: true });
    }
  },
  decrementInboxCount: () => {
    set((state) => ({
      inboxCount: Math.max(0, state.inboxCount - 1),
    }));
  },
  hydrate: async (options = {}) => {
    const { includeArchived, force = false } = options;
    const currentIncludeArchived = get().listIncludeArchived;
    const nextIncludeArchived =
      typeof includeArchived === "boolean" ? includeArchived : currentIncludeArchived;
    // Skip if already hydrated successfully and no changes requested
    if (get().hasHydrated && !get().hydrateError && !force && nextIncludeArchived === currentIncludeArchived) {
      return { success: true };
    }
    try {
      const repo = getDocumentsRepo();
      const list = await repo.list({
        type: DOCUMENT_TYPE_NOTE,
        includeArchived: nextIncludeArchived,
      });
      set({
        notes: sortNotes(list),
        hasHydrated: true,
        hydrateError: null,
        listIncludeArchived: nextIncludeArchived,
      });
      return { success: true };
    } catch (error) {
      console.error("Failed to hydrate notes list", error);
      set({
        notes: [],
        hasHydrated: true,
        hydrateError: error.message,
        listIncludeArchived: nextIncludeArchived,
      });
      return { success: false, error: error.message };
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
    const { body = "", title = null, meta = {}, inboxAt = null } = input;
    try {
      const repo = getDocumentsRepo();
      const document = await repo.create({
        type: DOCUMENT_TYPE_NOTE,
        body,
        title,
        meta,
        archivedAt: input.archivedAt ?? null,
        inboxAt,
      });
      set((state) => ({
        notesById: { ...state.notesById, [document.id]: document },
        notes: suppressListUpdate
          ? state.notes
          : shouldIncludeInList(document, state.listIncludeArchived)
            ? upsertListItem(state.notes, toListItem(document))
            : state.notes,
        // Increment inbox count if note was added to inbox
        inboxCount: inboxAt != null ? state.inboxCount + 1 : state.inboxCount,
      }));
      return document.id;
    } catch (error) {
      console.error("Failed to create note", error);
      return null;
    }
  },
  updateNoteBody: async (id, body) => {
    if (typeof id !== "string") return { success: false, error: "Invalid id" };
    const now = Date.now();
    const previousState = {
      note: get().notesById[id],
      notes: get().notes,
    };
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
      return { success: true };
    } catch (error) {
      console.error("Failed to update note body", error);
      // Rollback to previous state
      set((state) => ({
        notesById: previousState.note
          ? { ...state.notesById, [id]: previousState.note }
          : state.notesById,
        notes: previousState.notes,
      }));
      return { success: false, error: error.message };
    }
  },
  updateNote: async (id, updates) => {
    if (typeof id !== "string" || !updates) return { success: false, error: "Invalid input" };
    const now = Date.now();
    const previousState = {
      note: get().notesById[id],
      notes: get().notes,
    };
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
      return { success: true };
    } catch (error) {
      console.error("Failed to update note", error);
      // Rollback to previous state
      set((state) => ({
        notesById: previousState.note
          ? { ...state.notesById, [id]: previousState.note }
          : state.notesById,
        notes: previousState.notes,
      }));
      return { success: false, error: error.message };
    }
  },
  archiveNote: async (id, options = {}) => {
    if (typeof id !== "string") return;
    const { wasInInbox = false } = options;
    const now = Date.now();
    set((state) => {
      const existing = state.notesById[id];
      // Check if note was in inbox (from cache or caller)
      const noteWasInInbox = wasInInbox || (existing?.inboxAt != null);
      // Update notesById if the note is cached there
      const nextNotesById = existing
        ? { ...state.notesById, [id]: { ...existing, archivedAt: now, updatedAt: now, inboxAt: null } }
        : state.notesById;
      // Always update the list - remove if not showing archived, otherwise update archivedAt
      const nextNotes = state.listIncludeArchived
        ? state.notes.map((note) =>
            note.id === id ? { ...note, archivedAt: now, updatedAt: now } : note
          )
        : removeListItem(state.notes, id);
      return {
        notesById: nextNotesById,
        notes: nextNotes,
        // Decrement inbox count if note was in inbox
        inboxCount: noteWasInInbox ? Math.max(0, state.inboxCount - 1) : state.inboxCount,
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
      // Update notesById if the note is cached there
      const nextNotesById = existing
        ? { ...state.notesById, [id]: { ...existing, archivedAt: null, updatedAt: now } }
        : state.notesById;
      // Update the list item to clear archivedAt
      const nextNotes = state.notes.map((note) =>
        note.id === id ? { ...note, archivedAt: null, updatedAt: now } : note
      );
      return {
        notesById: nextNotesById,
        notes: sortNotes(nextNotes),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.unarchive(id);
    } catch (error) {
      console.error("Failed to unarchive note", error);
    }
  },
  trashNote: async (id, options = {}) => {
    if (typeof id !== "string") return;
    const { wasInInbox = false } = options;
    const now = Date.now();
    set((state) => {
      const existing = state.notesById[id];
      // Check if note was in inbox (from cache or caller)
      const noteWasInInbox = wasInInbox || (existing?.inboxAt != null);
      // Update notesById if the note is cached there
      const nextNotesById = existing
        ? { ...state.notesById, [id]: { ...existing, deletedAt: now, updatedAt: now, inboxAt: null } }
        : state.notesById;
      // Always remove from list - trashed notes never show in list
      return {
        notesById: nextNotesById,
        notes: removeListItem(state.notes, id),
        // Decrement inbox count if note was in inbox
        inboxCount: noteWasInInbox ? Math.max(0, state.inboxCount - 1) : state.inboxCount,
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
    // For restore, we need to re-fetch the note to get full data for the list
    // Since trashed notes aren't in the list, we may not have the data
    try {
      const repo = getDocumentsRepo();
      await repo.restore(id);
      // Fetch the restored note to get current data
      const restored = await repo.get(id);
      if (!restored) return;
      set((state) => {
        const nextNotesById = { ...state.notesById, [id]: restored };
        const nextNotes = shouldIncludeInList(restored, state.listIncludeArchived)
          ? upsertListItem(state.notes, toListItem(restored))
          : state.notes;
        return {
          notesById: nextNotesById,
          notes: nextNotes,
        };
      });
    } catch (error) {
      console.error("Failed to restore note", error);
    }
  },
}));
