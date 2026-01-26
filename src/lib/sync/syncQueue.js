import {
  openAnchoredDb,
  SYNC_META_STORE,
  SYNC_QUEUE_STORE,
} from "../db/indexedDb";

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function ensureOperation(operation) {
  if (!operation || typeof operation !== "object") {
    throw new Error("Sync operation is required");
  }
  if (typeof operation.type !== "string" || !operation.type.trim()) {
    throw new Error("Sync operation type is required");
  }
  if (operation.documentId != null && typeof operation.documentId !== "string") {
    throw new Error("Sync operation documentId must be a string");
  }
}

async function getDb() {
  return openAnchoredDb();
}

export async function enqueueOperation(operation) {
  ensureOperation(operation);
  const now = Date.now();
  const record = {
    id: operation.id || generateId(),
    type: operation.type,
    documentId: operation.documentId ?? null,
    payload: operation.payload ?? {},
    createdAt: typeof operation.createdAt === "number" ? operation.createdAt : now,
    updatedAt: now,
    attempts: typeof operation.attempts === "number" ? operation.attempts : 0,
    nextAttemptAt:
      typeof operation.nextAttemptAt === "number" ? operation.nextAttemptAt : now,
    lastError: operation.lastError ?? null,
    meta: operation.meta ?? {},
  };

  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.add(record);

    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export async function listQueue({ limit = null, includeDeferred = true } = {}) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readonly");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const index = store.index("createdAt");
    const request = index.getAll();

    request.onsuccess = () => {
      const items = Array.isArray(request.result) ? request.result : [];
      const now = Date.now();
      const filtered = includeDeferred
        ? items
        : items.filter((item) => (item.nextAttemptAt ?? 0) <= now);
      const limited = limit ? filtered.slice(0, limit) : filtered;
      resolve(limited);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getNextReadyOperation() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readonly");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const index = store.index("createdAt");
    const request = index.openCursor();
    const now = Date.now();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(null);
        return;
      }
      const item = cursor.value;
      if ((item.nextAttemptAt ?? 0) <= now) {
        resolve(item);
        return;
      }
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
}

export async function updateOperation(id, updates = {}) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Sync operation id is required");
  }
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) {
        reject(new Error("Sync operation not found"));
        return;
      }
      const next = {
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      };
      const putRequest = store.put(next);
      putRequest.onsuccess = () => resolve(next);
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function removeOperation(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Sync operation id is required");
  }
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearQueue() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getQueueCount() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readonly");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.count();

    request.onsuccess = () => resolve(request.result || 0);
    request.onerror = () => reject(request.error);
  });
}

export async function setSyncMeta(key, value) {
  if (typeof key !== "string" || !key.trim()) {
    throw new Error("Sync meta key is required");
  }
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_META_STORE, "readwrite");
    const store = transaction.objectStore(SYNC_META_STORE);
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getSyncMeta(key) {
  if (typeof key !== "string" || !key.trim()) {
    throw new Error("Sync meta key is required");
  }
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_META_STORE, "readonly");
    const store = transaction.objectStore(SYNC_META_STORE);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror = () => reject(request.error);
  });
}
