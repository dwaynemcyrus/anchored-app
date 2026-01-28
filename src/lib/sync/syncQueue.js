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
  if (typeof operation.table !== "string" || !operation.table.trim()) {
    throw new Error("Sync operation table is required");
  }
  if (typeof operation.record_id !== "string" || !operation.record_id.trim()) {
    throw new Error("Sync operation record_id is required");
  }
  if (typeof operation.operation !== "string" || !operation.operation.trim()) {
    throw new Error("Sync operation type is required");
  }
}

async function getDb() {
  return openAnchoredDb();
}

export async function enqueueOperation(operation) {
  ensureOperation(operation);
  const nowIso = new Date().toISOString();
  const record = {
    id: operation.id || generateId(),
    table: operation.table,
    record_id: operation.record_id,
    operation: operation.operation,
    payload: operation.payload ?? null,
    timestamp: operation.timestamp ?? nowIso,
    retry_count: typeof operation.retry_count === "number" ? operation.retry_count : 0,
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
    const request = store.getAll();

    request.onsuccess = () => {
      const items = Array.isArray(request.result) ? request.result : [];
      const sorted = items.sort((a, b) => {
        const aTime = Date.parse(a.timestamp || "") || 0;
        const bTime = Date.parse(b.timestamp || "") || 0;
        return aTime - bTime;
      });
      const limited = limit ? sorted.slice(0, limit) : sorted;
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
    const index = store.index("timestamp");
    const request = index.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(null);
        return;
      }
      const item = cursor.value;
      resolve(item);
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
        timestamp: updates.timestamp ?? existing.timestamp,
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

export async function getQueueStats() {
  const items = await listQueue();
  const retryItems = items.filter((item) => (item.retry_count ?? 0) > 0);
  const maxRetry = retryItems.reduce(
    (max, item) => Math.max(max, item.retry_count ?? 0),
    0
  );
  return {
    count: items.length,
    retryCount: retryItems.length,
    maxRetry,
  };
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
