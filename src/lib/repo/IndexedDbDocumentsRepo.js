import { DOCUMENTS_STORE, openAnchoredDb } from "../db/indexedDb";
import {
  bulkUpsertDocumentBodies,
  getDocumentBodiesByIds,
  getDocumentBody,
  removeDocumentBody,
  upsertDocumentBody,
} from "../db/documentBodies";
import { ensureIsoTimestamp, parseIsoTimestamp } from "../utils/timestamps";
import { deriveDocumentTitle } from "../documents/deriveTitle";
import { clearSearchIndex, removeFromSearchIndex } from "../search/searchDocuments";
import {
  DOCUMENT_TYPE_NOTE,
  DOCUMENT_TYPE_INBOX,
} from "../../types/document";
import { parseTimestamp } from "../backup/parseTimestamp";

const DEFAULT_PAGE_LIMIT = 200;

function ensureId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Document id is required");
  }
}

function ensureInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Document input is required");
  }
  if (typeof input.type !== "string" || !input.type.trim()) {
    throw new Error("Document type is required");
  }
  if (typeof input.body !== "string") {
    throw new Error("Document body is required");
  }
}

function ensurePatch(patch) {
  if (!patch || typeof patch !== "object") {
    throw new Error("Document patch is required");
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `doc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toListItem(document) {
  return {
    id: document.id,
    type: document.type,
    title: deriveDocumentTitle(document),
    updatedAt: Number.isFinite(document.updatedAt)
      ? document.updatedAt
      : parseIsoTimestamp(document.updated_at, Date.now()),
    archivedAt: document.archivedAt ?? null,
  };
}

function normalizeStoredDocument(document) {
  if (!document || typeof document !== "object") return document;
  const createdAtMs = Number.isFinite(document.createdAt)
    ? document.createdAt
    : parseIsoTimestamp(document.created_at, null);
  const updatedAtMs = Number.isFinite(document.updatedAt)
    ? document.updatedAt
    : parseIsoTimestamp(document.updated_at, createdAtMs ?? Date.now());
  return {
    ...document,
    createdAt: createdAtMs ?? Date.now(),
    updatedAt: updatedAtMs ?? Date.now(),
    created_at: ensureIsoTimestamp(
      document.created_at,
      createdAtMs ? new Date(createdAtMs).toISOString() : new Date().toISOString()
    ),
    updated_at: ensureIsoTimestamp(
      document.updated_at,
      updatedAtMs ? new Date(updatedAtMs).toISOString() : new Date().toISOString()
    ),
  };
}

function stripBody(document) {
  if (!document || typeof document !== "object") return document;
  const { body, ...rest } = document;
  return rest;
}

function attachBody(document, bodyRecord) {
  if (!document || typeof document !== "object") return document;
  return {
    ...document,
    body: typeof bodyRecord?.content === "string" ? bodyRecord.content : "",
  };
}

async function getDb() {
  return openAnchoredDb();
}

export class IndexedDbDocumentsRepo {
  async list(options = {}) {
    const {
      type,
      limit = DEFAULT_PAGE_LIMIT,
      offset = 0,
      includeArchived = false,
      includeTrashed = false,
    } = options;
    const db = await getDb();
    const types = Array.isArray(type) ? type : type ? [type] : null;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const normalizedItems = items.map(normalizeStoredDocument);
        const filtered = normalizedItems
          .filter((document) => {
            if (types && !types.includes(document.type)) {
              return false;
            }
            if (document.deletedAt != null) {
              return includeTrashed;
            }
            if (!includeArchived && document.archivedAt != null) {
              return false;
            }
            return true;
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(filtered.slice(offset, offset + limit).map(toListItem));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async get(id) {
    ensureId(id);
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        const document = normalizeStoredDocument(request.result || null);
        if (!document) {
          resolve(null);
          return;
        }
        getDocumentBody(id)
          .then((bodyRecord) => resolve(attachBody(document, bodyRecord)))
          .catch(() => resolve(attachBody(document, null)));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getBySlug(slug) {
    if (typeof slug !== "string" || !slug.trim()) {
      throw new Error("Document slug is required");
    }
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const index = store.index("slug");
      const request = index.get(slug);

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async create(input) {
    ensureInput(input);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const document = {
      id: generateId(),
      type: input.type || DOCUMENT_TYPE_NOTE,
      slug: input.slug ?? null,
      title: input.title ?? null,
      meta: input.meta || {},
      version: typeof input.version === "number" ? input.version : 1,
      createdAt: now,
      updatedAt: now,
      created_at: nowIso,
      updated_at: nowIso,
      deletedAt: null,
      archivedAt: input.archivedAt ?? null,
      inboxAt: input.inboxAt ?? null,
    };

    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.add(document);

      request.onsuccess = async () => {
        try {
          await upsertDocumentBody(document.id, input.body, {
            updatedAt: document.updatedAt,
          });
        } catch (error) {
          console.error("Failed to write document body", error);
        }
        resolve({ ...document, body: input.body });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async update(id, patch) {
    ensureId(id);
    ensurePatch(patch);
    const db = await getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const existing = normalizeStoredDocument(getRequest.result);
        if (!existing || existing.deletedAt != null) {
          reject(new Error("Document not found"));
          return;
        }
        const now = Date.now();
        const nowIso = new Date(now).toISOString();
        const updated = {
          ...existing,
          ...stripBody(patch),
          updatedAt: now,
          updated_at: nowIso,
          version: typeof patch.version === "number"
            ? patch.version
            : (existing.version ?? 1) + 1,
          // Track when an inbox item is processed to staged
          ...(existing.type === "inbox" && patch.type === "staged"
            ? { processedFromInboxAt: now }
            : {}),
        };
        const putRequest = store.put(updated);
        putRequest.onsuccess = async () => {
          if (typeof patch.body === "string") {
            try {
              await upsertDocumentBody(id, patch.body, { updatedAt: now });
            } catch (error) {
              console.error("Failed to update document body", error);
            }
          }
          resolve(
            typeof patch.body === "string"
              ? { ...updated, body: patch.body }
              : updated
          );
        };
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async trash(id) {
    ensureId(id);
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          reject(new Error("Document not found"));
          return;
        }
        const now = Date.now();
        const updated = {
          ...existing,
          deletedAt: now,
          updatedAt: now,
          inboxAt: null,
        };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async restore(id) {
    ensureId(id);
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          reject(new Error("Document not found"));
          return;
        }
        const now = Date.now();
        const updated = {
          ...existing,
          deletedAt: null,
          updatedAt: now,
        };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async archive(id) {
    ensureId(id);
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          reject(new Error("Document not found"));
          return;
        }
        if (existing.deletedAt != null) {
          reject(new Error("Cannot archive trashed document"));
          return;
        }
        const now = Date.now();
        const updated = {
          ...existing,
          archivedAt: now,
          updatedAt: now,
          inboxAt: null,
        };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async unarchive(id) {
    ensureId(id);
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          reject(new Error("Document not found"));
          return;
        }
        if (existing.deletedAt != null) {
          reject(new Error("Cannot unarchive trashed document"));
          return;
        }
        const now = Date.now();
        const updated = {
          ...existing,
          archivedAt: null,
          updatedAt: now,
        };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async delete(id) {
    ensureId(id);
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.delete(id);

      request.onsuccess = async () => {
        removeFromSearchIndex(id);
        try {
          await removeDocumentBody(id);
        } catch (error) {
          console.error("Failed to remove document body", error);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getSearchableDocs(options = {}) {
    const { type, includeTrashed = false, includeArchived = false } = options;
    const db = await getDb();
    const types = Array.isArray(type) ? type : type ? [type] : null;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.getAll();

      request.onsuccess = async () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const normalizedItems = items.map(normalizeStoredDocument);
        const filtered = normalizedItems.filter((doc) => {
          if (types && !types.includes(doc.type)) {
            return false;
          }
          if (doc.deletedAt != null) {
            return includeTrashed;
          }
          if (!includeArchived && doc.archivedAt != null) {
            return false;
          }
          return true;
        });
        try {
          const bodyRecords = await getDocumentBodiesByIds(
            filtered.map((doc) => doc.id)
          );
          const bodiesById = new Map(
            bodyRecords.map((record) => [record.documentId, record.content])
          );
          const docs = filtered.map((doc) => ({
            id: doc.id,
            type: doc.type,
            title: deriveDocumentTitle(doc),
            slug: doc.slug || null,
            body: bodiesById.get(doc.id) ?? "",
            updatedAt: Number.isFinite(doc.updatedAt)
              ? doc.updatedAt
              : parseIsoTimestamp(doc.updated_at, Date.now()),
            createdAt: Number.isFinite(doc.createdAt)
              ? doc.createdAt
              : parseIsoTimestamp(doc.created_at, Date.now()),
            deletedAt: doc.deletedAt ?? null,
            archivedAt: doc.archivedAt ?? null,
            inboxAt: doc.inboxAt ?? null,
          }));
          resolve(docs);
        } catch (error) {
          const docs = filtered.map((doc) => ({
            id: doc.id,
            type: doc.type,
            title: deriveDocumentTitle(doc),
            slug: doc.slug || null,
            body: "",
            updatedAt: Number.isFinite(doc.updatedAt)
              ? doc.updatedAt
              : parseIsoTimestamp(doc.updated_at, Date.now()),
            createdAt: Number.isFinite(doc.createdAt)
              ? doc.createdAt
              : parseIsoTimestamp(doc.created_at, Date.now()),
            deletedAt: doc.deletedAt ?? null,
            archivedAt: doc.archivedAt ?? null,
            inboxAt: doc.inboxAt ?? null,
          }));
          resolve(docs);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all notes (full documents) for backup export.
   * Includes trashed and archived notes.
   * @returns {Promise<Array>}
   */
  async listAllForBackup() {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const index = store.index("type");
      const request = index.getAll(DOCUMENT_TYPE_NOTE);

      request.onsuccess = async () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const normalizedItems = items.map(normalizeStoredDocument);
        try {
          const bodyRecords = await getDocumentBodiesByIds(
            normalizedItems.map((doc) => doc.id)
          );
          const bodiesById = new Map(
            bodyRecords.map((record) => [record.documentId, record.content])
          );
          resolve(
            normalizedItems.map((doc) => ({
              ...doc,
              body: bodiesById.get(doc.id) ?? "",
            }))
          );
        } catch (error) {
          resolve(normalizedItems.map((doc) => ({ ...doc, body: "" })));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete all notes. Used for Replace All import.
   * @returns {Promise<void>}
   */
  async deleteAllNotes() {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const index = store.index("type");
      const request = index.getAllKeys(DOCUMENT_TYPE_NOTE);

      request.onsuccess = () => {
        const keys = request.result || [];
        let deleted = 0;
        if (keys.length === 0) {
          clearSearchIndex();
          resolve();
          return;
        }
        for (const key of keys) {
          const deleteRequest = store.delete(key);
          deleteRequest.onsuccess = async () => {
            removeFromSearchIndex(key);
            try {
              await removeDocumentBody(key);
            } catch (error) {
              console.error("Failed to remove document body", error);
            }
            deleted++;
            if (deleted === keys.length) {
              clearSearchIndex();
              resolve();
            }
          };
          deleteRequest.onerror = () => reject(deleteRequest.error);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Bulk upsert notes for import.
   * @param {Array} notes - Array of full document objects
   * @returns {Promise<{ created: number, updated: number }>}
   */
  async bulkUpsert(notes) {
    if (!Array.isArray(notes) || notes.length === 0) {
      return { created: 0, updated: 0 };
    }

    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      let created = 0;
      let updated = 0;
      let processed = 0;
      const bodyRecords = [];

      for (const note of notes) {
        const normalizedNote = normalizeStoredDocument(note);
        const getRequest = store.get(normalizedNote.id);
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          const putRequest = store.put(stripBody(normalizedNote));
          putRequest.onsuccess = () => {
            if (existing) {
              updated++;
            } else {
              created++;
            }
            if (typeof normalizedNote.body === "string") {
              bodyRecords.push({
                documentId: normalizedNote.id,
                content: normalizedNote.body,
                updatedAt: normalizedNote.updatedAt ?? Date.now(),
                updated_at: normalizedNote.updated_at ?? new Date().toISOString(),
                syncedAt: normalizedNote.syncedAt ?? null,
              });
            }
            processed++;
            if (processed === notes.length) {
              bulkUpsertDocumentBodies(bodyRecords)
                .then(() => resolve({ created, updated }))
                .catch(() => resolve({ created, updated }));
            }
          };
          putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      }
    });
  }

  /**
   * List documents in inbox.
   * Inbox = type === "inbox" AND deletedAt == null
   * Sorted oldest-first by inboxAt, then createdAt, then id.
   * @returns {Promise<Array>}
   */
  async listInboxNotes() {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const index = store.index("type");
      const request = index.getAll(DOCUMENT_TYPE_INBOX);

      request.onsuccess = async () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const normalizedItems = items.map(normalizeStoredDocument);
        const inboxNotes = normalizedItems.filter(
          (doc) => doc.deletedAt == null
        );

        // Sort: oldest inboxAt first, then createdAt, then id
        inboxNotes.sort((a, b) => {
          const aInbox = parseTimestamp(a.inboxAt);
          const bInbox = parseTimestamp(b.inboxAt);

          // Notes with unparseable inboxAt go to the end
          if (aInbox === null && bInbox === null) {
            // Both unparseable, use createdAt
            const aCreated = parseTimestamp(a.createdAt) ?? 0;
            const bCreated = parseTimestamp(b.createdAt) ?? 0;
            if (aCreated !== bCreated) return aCreated - bCreated;
            return (a.id || "").localeCompare(b.id || "");
          }
          if (aInbox === null) return 1;
          if (bInbox === null) return -1;

          // Both parseable
          if (aInbox !== bInbox) return aInbox - bInbox;

          // Tie-breaker: createdAt
          const aCreated = parseTimestamp(a.createdAt) ?? 0;
          const bCreated = parseTimestamp(b.createdAt) ?? 0;
          if (aCreated !== bCreated) return aCreated - bCreated;

          // Tie-breaker: id
          return (a.id || "").localeCompare(b.id || "");
        });

        try {
          const bodyRecords = await getDocumentBodiesByIds(
            inboxNotes.map((doc) => doc.id)
          );
          const bodiesById = new Map(
            bodyRecords.map((record) => [record.documentId, record.content])
          );
          resolve(
            inboxNotes.map((doc) => ({
              ...doc,
              body: bodiesById.get(doc.id) ?? "",
            }))
          );
        } catch (error) {
          resolve(inboxNotes.map((doc) => ({ ...doc, body: "" })));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get count of notes in inbox.
   * @returns {Promise<number>}
   */
  async getInboxCount() {
    const notes = await this.listInboxNotes();
    return notes.length;
  }

  /**
   * List trashed documents.
   * Trashed = deletedAt != null
   * Sorted by deletedAt descending (most recently trashed first).
   * @returns {Promise<Array>}
   */
  async listTrashed() {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.getAll();

      request.onsuccess = async () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const normalizedItems = items.map(normalizeStoredDocument);
        const trashed = normalizedItems.filter((doc) => doc.deletedAt != null);

        // Sort by deletedAt descending (most recent first)
        trashed.sort((a, b) => {
          const aDeleted = parseTimestamp(a.deletedAt) ?? 0;
          const bDeleted = parseTimestamp(b.deletedAt) ?? 0;
          return bDeleted - aDeleted;
        });

        try {
          const bodyRecords = await getDocumentBodiesByIds(
            trashed.map((doc) => doc.id)
          );
          const bodiesById = new Map(
            bodyRecords.map((record) => [record.documentId, record.content])
          );
          resolve(
            trashed.map((doc) => ({
              ...doc,
              body: bodiesById.get(doc.id) ?? "",
            }))
          );
        } catch (error) {
          resolve(trashed.map((doc) => ({ ...doc, body: "" })));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Find document by exact title match.
   * @param {string} title - Title to match exactly
   * @returns {Promise<Object | null>}
   */
  async findDocByExactTitle(title) {
    if (typeof title !== "string" || !title.trim()) {
      return null;
    }
    const normalizedTitle = title.trim().toLowerCase();
    const db = await getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.getAll();

      request.onsuccess = async () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const normalizedItems = items.map(normalizeStoredDocument);
        const match = normalizedItems.find((doc) => {
          if (doc.deletedAt != null) return false;
          const docTitle = deriveDocumentTitle(doc);
          return docTitle.trim().toLowerCase() === normalizedTitle;
        });
        if (!match) {
          resolve(null);
          return;
        }
        try {
          const bodyRecord = await getDocumentBody(match.id);
          resolve(attachBody(match, bodyRecord));
        } catch (error) {
          resolve(attachBody(match, null));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all documents with metadata needed for wiki-link search.
   * Excludes trashed documents by default.
   * @param {Object} options
   * @param {boolean} options.includeArchived - Include archived docs (default: false)
   * @returns {Promise<Array<{id, title, slug, type, updatedAt, archivedAt}>>}
   */
  async getDocsForLinkSearch(options = {}) {
    const { includeArchived = false } = options;
    const db = await getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const normalizedItems = items.map(normalizeStoredDocument);
        const docs = normalizedItems
          .filter((doc) => {
            // Always exclude trashed
            if (doc.deletedAt != null) return false;
            // Always exclude inbox items
            if (doc.inboxAt != null) return false;
            // Optionally exclude archived
            if (!includeArchived && doc.archivedAt != null) return false;
            return true;
          })
          .map((doc) => ({
            id: doc.id,
            title: deriveDocumentTitle(doc),
            slug: doc.slug || null,
            type: doc.type,
            updatedAt: Number.isFinite(doc.updatedAt)
              ? doc.updatedAt
              : parseIsoTimestamp(doc.updated_at, Date.now()),
            archivedAt: doc.archivedAt ?? null,
          }));
        resolve(docs);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Create a new document from a title (for wiki-link creation).
   * @param {string} title - The title for the new document
   * @returns {Promise<Object>} - The created document
   */
  async createDocFromTitle(title) {
    if (typeof title !== "string" || !title.trim()) {
      throw new Error("Title is required");
    }
    const trimmedTitle = title.trim();
    return this.create({
      type: DOCUMENT_TYPE_NOTE,
      title: trimmedTitle,
      body: "",
    });
  }

  /**
   * Insert a template document with a specific ID.
   * Used for seeding built-in templates.
   * @param {Object} template - Full template document with ID
   * @returns {Promise<Object>}
   */
  async insertTemplate(template) {
    if (!template || !template.id) {
      throw new Error("Template with id is required");
    }
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.put(stripBody(template));

      request.onsuccess = async () => {
        if (typeof template.body === "string") {
          try {
            await upsertDocumentBody(template.id, template.body, {
              updatedAt: template.updatedAt ?? Date.now(),
            });
          } catch (error) {
            console.error("Failed to write template body", error);
          }
        }
        resolve(template);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
