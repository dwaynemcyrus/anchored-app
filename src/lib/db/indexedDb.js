export const DB_NAME = "anchored_db";
export const DB_VERSION = 5;
export const DOCUMENTS_STORE = "documents";
export const SYNC_QUEUE_STORE = "syncQueue";
export const SYNC_META_STORE = "syncMeta";

export function openAnchoredDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      let store;
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        store = db.createObjectStore(DOCUMENTS_STORE, { keyPath: "id" });
      } else {
        store = request.transaction.objectStore(DOCUMENTS_STORE);
      }
      if (!store.indexNames.contains("type")) {
        store.createIndex("type", "type", { unique: false });
      }
      if (!store.indexNames.contains("updatedAt")) {
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!store.indexNames.contains("deletedAt")) {
        store.createIndex("deletedAt", "deletedAt", { unique: false });
      }
      if (!store.indexNames.contains("archivedAt")) {
        store.createIndex("archivedAt", "archivedAt", { unique: false });
      }
      if (!store.indexNames.contains("inboxAt")) {
        store.createIndex("inboxAt", "inboxAt", { unique: false });
      }
      if (!store.indexNames.contains("slug")) {
        store.createIndex("slug", "slug", { unique: false });
      }

      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const queueStore = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: "id" });
        queueStore.createIndex("createdAt", "createdAt", { unique: false });
        queueStore.createIndex("nextAttemptAt", "nextAttemptAt", { unique: false });
        queueStore.createIndex("documentId", "documentId", { unique: false });
      }

      if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
        db.createObjectStore(SYNC_META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}
