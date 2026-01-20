import { DOCUMENTS_STORE, openAnchoredDb } from "../db/indexedDb";
import { deriveDocumentTitle } from "../documents/deriveTitle";
import { DOCUMENT_TYPE_NOTE } from "../../types/document";
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
    updatedAt: document.updatedAt,
    archivedAt: document.archivedAt ?? null,
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

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const source = type ? store.index("type") : store;
      const request = type ? source.getAll(type) : source.getAll();

      request.onsuccess = () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const filtered = items
          .filter((document) => {
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
        resolve(request.result || null);
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
    const document = {
      id: generateId(),
      type: input.type || DOCUMENT_TYPE_NOTE,
      slug: input.slug ?? null,
      title: input.title ?? null,
      body: input.body,
      meta: input.meta || {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      archivedAt: input.archivedAt ?? null,
      inboxAt: input.inboxAt ?? null,
    };

    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.add(document);

      request.onsuccess = () => resolve(document);
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
        const existing = getRequest.result;
        if (!existing || existing.deletedAt != null) {
          reject(new Error("Document not found"));
          return;
        }
        const updated = {
          ...existing,
          ...patch,
          updatedAt: Date.now(),
        };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve(updated);
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

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSearchableDocs(options = {}) {
    const { type, includeTrashed = false, includeArchived = false } = options;
    const db = await getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const source = type ? store.index("type") : store;
      const request = type ? source.getAll(type) : source.getAll();

      request.onsuccess = () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const docs = items
          .filter((doc) => {
            if (doc.deletedAt != null) {
              return includeTrashed;
            }
            if (!includeArchived && doc.archivedAt != null) {
              return false;
            }
            return true;
          })
          .map((doc) => ({
            id: doc.id,
            title: deriveDocumentTitle(doc),
            body: doc.body || "",
            updatedAt: doc.updatedAt,
            deletedAt: doc.deletedAt ?? null,
            archivedAt: doc.archivedAt ?? null,
          }));
        resolve(docs);
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

      request.onsuccess = () => {
        const items = Array.isArray(request.result) ? request.result : [];
        resolve(items);
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
          resolve();
          return;
        }
        for (const key of keys) {
          const deleteRequest = store.delete(key);
          deleteRequest.onsuccess = () => {
            deleted++;
            if (deleted === keys.length) {
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

      for (const note of notes) {
        const getRequest = store.get(note.id);
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          const putRequest = store.put(note);
          putRequest.onsuccess = () => {
            if (existing) {
              updated++;
            } else {
              created++;
            }
            processed++;
            if (processed === notes.length) {
              resolve({ created, updated });
            }
          };
          putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      }
    });
  }

  /**
   * List notes in inbox state.
   * Inbox = inboxAt != null AND deletedAt == null AND archivedAt == null
   * Sorted oldest-first by inboxAt, then createdAt, then id.
   * @returns {Promise<Array>}
   */
  async listInboxNotes() {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const index = store.index("type");
      const request = index.getAll(DOCUMENT_TYPE_NOTE);

      request.onsuccess = () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const inboxNotes = items.filter(
          (doc) =>
            doc.inboxAt != null &&
            doc.deletedAt == null &&
            doc.archivedAt == null
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

        resolve(inboxNotes);
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
}
