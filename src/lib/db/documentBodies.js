import { DOCUMENT_BODIES_STORE, openAnchoredDb } from "./indexedDb";
import { ensureIsoTimestamp } from "../utils/timestamps";

function ensureId(documentId) {
  if (typeof documentId !== "string" || !documentId.trim()) {
    throw new Error("Document id is required");
  }
}

async function getDb() {
  return openAnchoredDb();
}

export async function getDocumentBody(documentId) {
  ensureId(documentId);
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_BODIES_STORE, "readonly");
    const store = transaction.objectStore(DOCUMENT_BODIES_STORE);
    const request = store.get(documentId);

    request.onsuccess = () => {
      const body = request.result || null;
      if (!body) {
        resolve(null);
        return;
      }
      const updatedAt = Number.isFinite(body.updatedAt)
        ? body.updatedAt
        : Date.parse(body.updated_at || "") || Date.now();
      resolve({
        ...body,
        updatedAt,
        updated_at: body.updated_at ?? new Date(updatedAt).toISOString(),
      });
    };
    request.onerror = () => reject(request.error);
  });
}

export async function upsertDocumentBody(documentId, content, updates = {}) {
  ensureId(documentId);
  const db = await getDb();
  const now = Date.now();
  const record = {
    documentId,
    content: typeof content === "string" ? content : "",
    updatedAt: typeof updates.updatedAt === "number" ? updates.updatedAt : now,
    updated_at: ensureIsoTimestamp(updates.updated_at, new Date(now).toISOString()),
    syncedAt: updates.syncedAt ?? null,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_BODIES_STORE, "readwrite");
    const store = transaction.objectStore(DOCUMENT_BODIES_STORE);
    const request = store.put(record);

    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export async function removeDocumentBody(documentId) {
  ensureId(documentId);
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_BODIES_STORE, "readwrite");
    const store = transaction.objectStore(DOCUMENT_BODIES_STORE);
    const request = store.delete(documentId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getDocumentBodiesByIds(documentIds = []) {
  if (!Array.isArray(documentIds) || documentIds.length === 0) return [];
  const db = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_BODIES_STORE, "readonly");
    const store = transaction.objectStore(DOCUMENT_BODIES_STORE);
    const bodies = [];
    let pending = documentIds.length;

    documentIds.forEach((id) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result) bodies.push(request.result);
        pending -= 1;
        if (pending === 0) resolve(bodies);
      };
      request.onerror = () => {
        pending -= 1;
        if (pending === 0) resolve(bodies);
      };
    });
  });
}

export async function listDocumentBodies() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_BODIES_STORE, "readonly");
    const store = transaction.objectStore(DOCUMENT_BODIES_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = Array.isArray(request.result) ? request.result : [];
      const normalized = items.map((body) => {
        const updatedAt = Number.isFinite(body.updatedAt)
          ? body.updatedAt
          : Date.parse(body.updated_at || "") || Date.now();
        return {
          ...body,
          updatedAt,
          updated_at: body.updated_at ?? new Date(updatedAt).toISOString(),
        };
      });
      resolve(normalized);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function bulkUpsertDocumentBodies(records = []) {
  if (!Array.isArray(records) || records.length === 0) return;
  const db = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_BODIES_STORE, "readwrite");
    const store = transaction.objectStore(DOCUMENT_BODIES_STORE);

    for (const record of records) {
      if (!record || typeof record.documentId !== "string") continue;
      const updatedAt = Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : Date.parse(record.updated_at || "") || Date.now();
      store.put({
        ...record,
        updatedAt,
        updated_at: ensureIsoTimestamp(
          record.updated_at,
          new Date(updatedAt).toISOString()
        ),
      });
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
