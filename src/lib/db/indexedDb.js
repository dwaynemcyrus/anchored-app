export const DB_NAME = "anchored_db";
export const DB_VERSION = 2;
export const DOCUMENTS_STORE = "documents";

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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}
