import { DOCUMENTS_STORE, openAnchoredDb } from "../db/indexedDb";
import { deriveDocumentTitle } from "../documents/deriveTitle";
import { DOCUMENT_TYPE_NOTE } from "../../types/document";

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
  };
}

async function getDb() {
  return openAnchoredDb();
}

export class IndexedDbDocumentsRepo {
  async list(options = {}) {
    const { type, limit = DEFAULT_PAGE_LIMIT, offset = 0 } = options;
    const db = await getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCUMENTS_STORE, "readonly");
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const source = type ? store.index("type") : store;
      const request = type ? source.getAll(type) : source.getAll();

      request.onsuccess = () => {
        const items = Array.isArray(request.result) ? request.result : [];
        const filtered = items
          .filter((document) => document.deletedAt == null)
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
        const document = request.result;
        if (!document || document.deletedAt != null) {
          resolve(null);
          return;
        }
        resolve(document);
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
      title: input.title ?? null,
      body: input.body,
      meta: input.meta || {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
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
}
