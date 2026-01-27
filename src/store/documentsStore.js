import { create } from "zustand";
import { getDocumentsRepo } from "../lib/repo/getDocumentsRepo";
import {
  buildSearchIndex,
  updateSearchIndex,
} from "../lib/search/searchDocuments";
import { deriveDocumentTitle } from "../lib/documents/deriveTitle";
import { DOCUMENT_TYPE_NOTE, DOCUMENT_TYPE_DAILY, DOCUMENT_TYPE_STAGED } from "../types/document";
import { ensureBuiltInTemplates } from "../lib/templates/seedTemplates";
import { addSyncListener, enqueueSyncOperation, initSyncListeners, scheduleSync } from "../lib/sync/syncManager";
import { useSyncStore } from "./syncStore";
import { getSyncMeta, setSyncMeta } from "../lib/sync/syncQueue";
import { fetchDocumentBodiesByIds, fetchDocumentsUpdatedSince } from "../lib/supabase/documents";

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
  inboxVersion: 0,
  fetchFromServer: async () => {
    const { setLastSyncedAt } = useSyncStore.getState();
    const repo = getDocumentsRepo();
    const lastSyncedAt = await getSyncMeta("lastSyncedAt");
    const remoteDocs = await fetchDocumentsUpdatedSince({ since: lastSyncedAt });
    if (!remoteDocs || remoteDocs.length === 0) return;
    const ids = remoteDocs.map((doc) => doc.id);
    const bodies = await fetchDocumentBodiesByIds(ids);
    const bodiesById = new Map(bodies.map((body) => [body.document_id, body.content]));

    const localDocs = remoteDocs.map((doc) => ({
      id: doc.id,
      type: doc.type,
      subtype: doc.subtype ?? null,
      title: doc.title ?? null,
      body: bodiesById.get(doc.id) ?? "",
      meta: {
        ...(doc.frontmatter ?? {}),
        status: doc.status ?? "active",
        tags: Array.isArray(doc.frontmatter?.tags) ? doc.frontmatter.tags : [],
        subtype: doc.subtype ?? null,
        frontmatter: doc.frontmatter ?? {},
      },
      status: doc.status ?? "active",
      frontmatter: doc.frontmatter ?? {},
      version: typeof doc.version === "number" ? doc.version : 1,
      createdAt: Date.parse(doc.created_at) || Date.now(),
      updatedAt: Date.parse(doc.updated_at) || Date.now(),
      deletedAt: doc.status === "trash" ? Date.parse(doc.updated_at) || Date.now() : null,
      archivedAt: doc.status === "archived" ? Date.parse(doc.updated_at) || Date.now() : null,
      inboxAt: null,
    }));

    await repo.bulkUpsert(localDocs);
    buildSearchIndex(await repo.getSearchableDocs({ includeArchived: true, includeTrashed: true }));
    const latest = remoteDocs.reduce((max, doc) => {
      const timestamp = Date.parse(doc.updated_at || "") || 0;
      return Math.max(max, timestamp);
    }, Date.parse(lastSyncedAt || "") || 0);
    const nextSync = latest ? new Date(latest).toISOString() : new Date().toISOString();
    await setSyncMeta("lastSyncedAt", nextSync);
    setLastSyncedAt(nextSync);
  },
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
  incrementInboxVersion: () => {
    set((state) => ({ inboxVersion: state.inboxVersion + 1 }));
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
      // Ensure built-in templates exist before any operations
      await ensureBuiltInTemplates();

      await get().fetchFromServer();
      await scheduleSync({ reason: "hydrate" });
      const repo = getDocumentsRepo();
      const list = await repo.list({
        type: [DOCUMENT_TYPE_NOTE, DOCUMENT_TYPE_STAGED],
        includeArchived: nextIncludeArchived,
      });
      const searchableDocs = await repo.getSearchableDocs({
        type: [DOCUMENT_TYPE_NOTE, DOCUMENT_TYPE_STAGED],
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
      initSyncListeners();
      scheduleSync({ reason: "hydrate" });
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
        version: 1,
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
        inboxCount: inboxAt != null ? state.inboxCount + 1 : state.inboxCount,
      }));
      await enqueueSyncOperation({
        type: "create",
        documentId: document.id,
        payload: { document },
      });
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
    const nextVersion = (get().documentsById[id]?.version ?? 1) + 1;
    set((state) => {
      const existing = state.documentsById[id];
      const updated = existing
        ? { ...existing, body, updatedAt: now, version: nextVersion }
        : {
            id,
            type: DOCUMENT_TYPE_NOTE,
            title: null,
            body,
            meta: {},
            createdAt: now,
            updatedAt: now,
            version: 1,
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
      await repo.update(id, { body, version: nextVersion });
      const updated = get().documentsById[id];
      if (updated) {
        updateSearchIndex(updated);
        await enqueueSyncOperation({
          type: "update",
          documentId: updated.id,
          payload: { document: updated, baseVersion: (updated.version ?? 1) - 1 },
        });
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
      const nextVersion = (existing.version ?? 1) + 1;
      const updated = { ...existing, ...updates, updatedAt: now, version: nextVersion };
      return {
        documentsById: { ...state.documentsById, [id]: updated },
        documents: shouldIncludeInList(updated, state.listIncludeArchived)
          ? upsertListItem(state.documents, toListItem(updated))
          : removeListItem(state.documents, id),
      };
    });
    try {
      const nextVersion = (get().documentsById[id]?.version ?? 1);
      const repo = getDocumentsRepo();
      await repo.update(id, { ...updates, version: nextVersion });
      const updated = get().documentsById[id];
      if (updated) {
        updateSearchIndex(updated);
        await enqueueSyncOperation({
          type: "update",
          documentId: updated.id,
          payload: { document: updated, baseVersion: (updated.version ?? 1) - 1 },
        });
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
      const nextVersion = existing ? (existing.version ?? 1) + 1 : null;
      // Check if document was in inbox (from cache or caller)
      const docWasInInbox = wasInInbox || (existing?.inboxAt != null);
      // Update documentsById if the document is cached there
      const nextDocumentsById = existing
        ? {
            ...state.documentsById,
            [id]: {
              ...existing,
              archivedAt: now,
              updatedAt: now,
              inboxAt: null,
              ...(nextVersion ? { version: nextVersion } : {}),
            },
          }
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
        await enqueueSyncOperation({
          type: "update",
          documentId: refreshed.id,
          payload: { document: refreshed, baseVersion: (refreshed.version ?? 1) - 1 },
        });
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
      const nextVersion = existing ? (existing.version ?? 1) + 1 : null;
      // Update documentsById if the document is cached there
      const nextDocumentsById = existing
        ? {
            ...state.documentsById,
            [id]: {
              ...existing,
              archivedAt: null,
              updatedAt: now,
              ...(nextVersion ? { version: nextVersion } : {}),
            },
          }
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
        await enqueueSyncOperation({
          type: "update",
          documentId: refreshed.id,
          payload: { document: refreshed, baseVersion: (refreshed.version ?? 1) - 1 },
        });
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
      const nextVersion = existing ? (existing.version ?? 1) + 1 : null;
      // Check if document was in inbox (from cache or caller)
      const docWasInInbox = wasInInbox || (existing?.inboxAt != null);
      // Update documentsById if the document is cached there
      const nextDocumentsById = existing
        ? {
            ...state.documentsById,
            [id]: {
              ...existing,
              deletedAt: now,
              updatedAt: now,
              inboxAt: null,
              ...(nextVersion ? { version: nextVersion } : {}),
            },
          }
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
        await enqueueSyncOperation({
          type: "update",
          documentId: refreshed.id,
          payload: { document: refreshed, baseVersion: (refreshed.version ?? 1) - 1 },
        });
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
      await enqueueSyncOperation({
        type: "update",
        documentId: restored.id,
        payload: { document: restored, baseVersion: (restored.version ?? 1) - 1 },
      });
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

addSyncListener((event) => {
  if (event?.type !== "remoteApplied") return;
  const { hydrate, loadInboxCount, incrementInboxVersion } = useDocumentsStore.getState();
  hydrate({ force: true });
  loadInboxCount();
  incrementInboxVersion();
});

// Deprecated aliases for backward compatibility
// @deprecated Use useDocumentsStore instead
export const useNotesStore = useDocumentsStore;
