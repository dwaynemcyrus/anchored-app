import {
  openAnchoredDb,
  SYNC_META_STORE,
  SYNC_QUEUE_STORE,
} from "../db/indexedDb";

export const MAX_RETRY_COUNT = 5;
type SyncOperation = {
  id?: string;
  table: string;
  record_id: string;
  operation: string;
  payload?: unknown;
  timestamp?: string;
  createdAt?: string;
  lastAttemptAt?: string | null;
  nextAttemptAt?: string | null;
  lastError?: unknown;
  retry_count?: number;
  status?: string;
};

type ListQueueOptions = {
  limit?: number | null;
  includeDeferred?: boolean;
};

const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function ensureOperation(operation: SyncOperation) {
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

export async function enqueueOperation(operation: SyncOperation) {
  ensureOperation(operation);
  const nowIso = new Date().toISOString();
  const record = {
    id: operation.id || generateId(),
    table: operation.table,
    record_id: operation.record_id,
    operation: operation.operation,
    payload: operation.payload ?? null,
    timestamp: operation.timestamp ?? nowIso,
    createdAt: nowIso,
    nextAttemptAt: operation.nextAttemptAt ?? null,
    lastError: operation.lastError ?? null,
    retry_count: typeof operation.retry_count === "number" ? operation.retry_count : 0,
  };

  const db = await getDb();
  return new Promise<SyncOperation>((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.add(record);

    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export async function listQueue({
  limit = null,
  includeDeferred = true,
}: ListQueueOptions = {}): Promise<SyncOperation[]> {
  const db = await getDb();
  return new Promise<SyncOperation[]>((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readonly");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = Array.isArray(request.result) ? request.result : [];
      const now = Date.now();
      const filtered = includeDeferred
        ? items
        : items.filter((item) => {
            if (!item.nextAttemptAt) return true;
            const nextAttempt = Date.parse(item.nextAttemptAt);
            return Number.isNaN(nextAttempt) || nextAttempt <= now;
          });
      const sorted = filtered.sort((a, b) => {
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

export async function getNextReadyOperation(): Promise<SyncOperation | null> {
  const db = await getDb();
  return new Promise<SyncOperation | null>((resolve, reject) => {
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

export async function updateOperation(
  id: string,
  updates: Partial<SyncOperation> = {}
): Promise<SyncOperation> {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Sync operation id is required");
  }
  const db = await getDb();
  return new Promise<SyncOperation>((resolve, reject) => {
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

export function computeBackoffMs(retryCount: number) {
  if (typeof retryCount !== "number" || retryCount <= 0) return 0;
  const backoff = BASE_BACKOFF_MS * Math.pow(2, retryCount - 1);
  return Math.min(backoff, MAX_BACKOFF_MS);
}

export async function removeOperation(id: string): Promise<void> {
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

export async function clearQueue(): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getQueueCount(): Promise<number> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, "readonly");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.count();

    request.onsuccess = () => resolve(request.result || 0);
    request.onerror = () => reject(request.error);
  });
}

export async function getQueueStats(): Promise<{
  count: number;
  retryCount: number;
  maxRetry: number;
  overLimitCount: number;
  maxRetryLimit: number;
}> {
  const items = await listQueue();
  const retryItems = items.filter((item) => (item.retry_count ?? 0) > 0);
  const maxRetry = retryItems.reduce(
    (max, item) => Math.max(max, item.retry_count ?? 0),
    0
  );
  const overLimitCount = items.filter(
    (item) => (item.retry_count ?? 0) >= MAX_RETRY_COUNT
  ).length;
  return {
    count: items.length,
    retryCount: retryItems.length,
    maxRetry,
    overLimitCount,
    maxRetryLimit: MAX_RETRY_COUNT,
  };
}

export async function setSyncMeta(key: string, value: unknown): Promise<void> {
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

export async function getSyncMeta(key: string): Promise<unknown> {
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
