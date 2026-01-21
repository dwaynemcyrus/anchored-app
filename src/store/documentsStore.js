import { create } from "zustand";
import { getDocumentsRepo } from "../lib/repo/getDocumentsRepo";
import {
  buildSearchIndex,
  updateSearchIndex,
} from "../lib/search/searchDocuments";
import { deriveDocumentTitle } from "../lib/documents/deriveTitle";
import { DOCUMENT_TYPE_NOTE, DOCUMENT_TYPE_DAILY } from "../types/document";

const sortDocuments = (documents) => documents.slice().sort((a, b) => b.updatedAt - a.updatedAt);

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

const upsertListItem = (documents, item) => {
  const next = documents.slice();
  const index = next.findIndex((doc) => doc.id === item.id);
  if (index === -1) {
    next.push(item);
  } else {
    next[index] = { ...next[index], ...item };
  }
  return sortDocuments(next);
};

const removeListItem = (documents, id) => documents.filter((doc) => doc.id !== id);

export const getDerivedTitle = (document) => deriveDocumentTitle(document);

export const useDocumentsStore = create((set, get) => ({
  documents: [],
  documentsById: {},
  hasHydrated: false,
  hydrateError: null,
  listIncludeArchived: false,
  inboxCount: 0,
  inboxCountLoaded: false,
  loadInboxCount: async () => {
    try {
      const repo = getDocumentsRepo();
      const documents = await repo.listInboxNotes();
      // Exclude daily documents from inbox count
      const filtered = documents.filter((doc) => doc.type !== DOCUMENT_TYPE_DAILY);
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
      const searchableDocs = await repo.getSearchableDocs({
        type: DOCUMENT_TYPE_NOTE,
        includeArchived: true,
        includeTrashed: true,
      });
      buildSearchIndex(searchableDocs);
      set({
        documents: sortDocuments(list),
        hasHydrated: true,
        hydrateError: null,
        listIncludeArchived: nextIncludeArchived,
      });
      return { success: true };
    } catch (error) {
      console.error("Failed to hydrate documents list", error);
      set({
        documents: [],
        hasHydrated: true,
        hydrateError: error.message,
        listIncludeArchived: nextIncludeArchived,
      });
      return { success: false, error: error.message };
    }
  },
  loadDocument: async (id) => {
    if (typeof id !== "string") return null;
    const cached = get().documentsById[id];
    if (cached) return cached;
    try {
      const repo = getDocumentsRepo();
      const document = await repo.get(id);
      if (!document) return null;
      set((state) => ({
        documentsById: { ...state.documentsById, [id]: document },
        documents: shouldIncludeInList(document, state.listIncludeArchived)
          ? upsertListItem(state.documents, toListItem(document))
          : removeListItem(state.documents, document.id),
      }));
      return document;
    } catch (error) {
      console.error("Failed to load document", error);
      return null;
    }
  },
  createDocument: async (input = {}, options = {}) => {
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
      updateSearchIndex(document);
      set((state) => ({
        documentsById: { ...state.documentsById, [document.id]: document },
        documents: suppressListUpdate
          ? state.documents
          : shouldIncludeInList(document, state.listIncludeArchived)
            ? upsertListItem(state.documents, toListItem(document))
            : state.documents,
        // Increment inbox count if document was added to inbox
        inboxCount: inboxAt != null ? state.inboxCount + 1 : state.inboxCount,
      }));
      return document.id;
    } catch (error) {
      console.error("Failed to create document", error);
      return null;
    }
  },
  updateDocumentBody: async (id, body) => {
    if (typeof id !== "string") return { success: false, error: "Invalid id" };
    const now = Date.now();
    const previousState = {
      document: get().documentsById[id],
      documents: get().documents,
    };
    set((state) => {
      const existing = state.documentsById[id];
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
        documentsById: { ...state.documentsById, [id]: updated },
        documents: shouldIncludeInList(updated, state.listIncludeArchived)
          ? upsertListItem(state.documents, toListItem(updated))
          : removeListItem(state.documents, id),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.update(id, { body });
      const updated = get().documentsById[id];
      if (updated) {
        updateSearchIndex(updated);
      }
      return { success: true };
    } catch (error) {
      console.error("Failed to update document body", error);
      // Rollback to previous state
      set((state) => ({
        documentsById: previousState.document
          ? { ...state.documentsById, [id]: previousState.document }
          : state.documentsById,
        documents: previousState.documents,
      }));
      return { success: false, error: error.message };
    }
  },
  updateDocument: async (id, updates) => {
    if (typeof id !== "string" || !updates) return { success: false, error: "Invalid input" };
    const now = Date.now();
    const previousState = {
      document: get().documentsById[id],
      documents: get().documents,
    };
    set((state) => {
      const existing = state.documentsById[id];
      if (!existing) return state;
      const updated = { ...existing, ...updates, updatedAt: now };
      return {
        documentsById: { ...state.documentsById, [id]: updated },
        documents: shouldIncludeInList(updated, state.listIncludeArchived)
          ? upsertListItem(state.documents, toListItem(updated))
          : removeListItem(state.documents, id),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.update(id, updates);
      const updated = get().documentsById[id];
      if (updated) {
        updateSearchIndex(updated);
      }
      return { success: true };
    } catch (error) {
      console.error("Failed to update document", error);
      // Rollback to previous state
      set((state) => ({
        documentsById: previousState.document
          ? { ...state.documentsById, [id]: previousState.document }
          : state.documentsById,
        documents: previousState.documents,
      }));
      return { success: false, error: error.message };
    }
  },
  archiveDocument: async (id, options = {}) => {
    if (typeof id !== "string") return;
    const { wasInInbox = false } = options;
    const now = Date.now();
    set((state) => {
      const existing = state.documentsById[id];
      // Check if document was in inbox (from cache or caller)
      const docWasInInbox = wasInInbox || (existing?.inboxAt != null);
      // Update documentsById if the document is cached there
      const nextDocumentsById = existing
        ? { ...state.documentsById, [id]: { ...existing, archivedAt: now, updatedAt: now, inboxAt: null } }
        : state.documentsById;
      // Always update the list - remove if not showing archived, otherwise update archivedAt
      const nextDocuments = state.listIncludeArchived
        ? state.documents.map((doc) =>
            doc.id === id ? { ...doc, archivedAt: now, updatedAt: now } : doc
          )
        : removeListItem(state.documents, id);
      return {
        documentsById: nextDocumentsById,
        documents: nextDocuments,
        // Decrement inbox count if document was in inbox
        inboxCount: docWasInInbox ? Math.max(0, state.inboxCount - 1) : state.inboxCount,
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.archive(id);
      const refreshed = await repo.get(id);
      if (refreshed) {
        updateSearchIndex(refreshed);
      }
    } catch (error) {
      console.error("Failed to archive document", error);
    }
  },
  unarchiveDocument: async (id) => {
    if (typeof id !== "string") return;
    const now = Date.now();
    set((state) => {
      const existing = state.documentsById[id];
      // Update documentsById if the document is cached there
      const nextDocumentsById = existing
        ? { ...state.documentsById, [id]: { ...existing, archivedAt: null, updatedAt: now } }
        : state.documentsById;
      // Update the list item to clear archivedAt
      const nextDocuments = state.documents.map((doc) =>
        doc.id === id ? { ...doc, archivedAt: null, updatedAt: now } : doc
      );
      return {
        documentsById: nextDocumentsById,
        documents: sortDocuments(nextDocuments),
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.unarchive(id);
      const refreshed = await repo.get(id);
      if (refreshed) {
        updateSearchIndex(refreshed);
      }
    } catch (error) {
      console.error("Failed to unarchive document", error);
    }
  },
  trashDocument: async (id, options = {}) => {
    if (typeof id !== "string") return;
    const { wasInInbox = false } = options;
    const now = Date.now();
    set((state) => {
      const existing = state.documentsById[id];
      // Check if document was in inbox (from cache or caller)
      const docWasInInbox = wasInInbox || (existing?.inboxAt != null);
      // Update documentsById if the document is cached there
      const nextDocumentsById = existing
        ? { ...state.documentsById, [id]: { ...existing, deletedAt: now, updatedAt: now, inboxAt: null } }
        : state.documentsById;
      // Always remove from list - trashed documents never show in list
      return {
        documentsById: nextDocumentsById,
        documents: removeListItem(state.documents, id),
        // Decrement inbox count if document was in inbox
        inboxCount: docWasInInbox ? Math.max(0, state.inboxCount - 1) : state.inboxCount,
      };
    });
    try {
      const repo = getDocumentsRepo();
      await repo.trash(id);
      const refreshed = await repo.get(id);
      if (refreshed) {
        updateSearchIndex(refreshed);
      }
    } catch (error) {
      console.error("Failed to trash document", error);
    }
  },
  restoreDocument: async (id) => {
    if (typeof id !== "string") return;
    // For restore, we need to re-fetch the document to get full data for the list
    // Since trashed documents aren't in the list, we may not have the data
    try {
      const repo = getDocumentsRepo();
      await repo.restore(id);
      // Fetch the restored document to get current data
      const restored = await repo.get(id);
      if (!restored) return;
      updateSearchIndex(restored);
      set((state) => {
        const nextDocumentsById = { ...state.documentsById, [id]: restored };
        const nextDocuments = shouldIncludeInList(restored, state.listIncludeArchived)
          ? upsertListItem(state.documents, toListItem(restored))
          : state.documents;
        return {
          documentsById: nextDocumentsById,
          documents: nextDocuments,
        };
      });
    } catch (error) {
      console.error("Failed to restore document", error);
    }
  },
}));

// Deprecated aliases for backward compatibility
// @deprecated Use useDocumentsStore instead
export const useNotesStore = useDocumentsStore;
