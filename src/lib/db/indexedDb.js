export const DB_NAME = "anchored_db";
export const DB_VERSION = 9;
export const DOCUMENTS_STORE = "documents";
export const DOCUMENT_BODIES_STORE = "document_bodies";
export const SYNC_QUEUE_STORE = "syncQueue";
export const SYNC_META_STORE = "syncMeta";
export const TIMER_EVENTS_STORE = "timerEvents";
export const TIMER_META_STORE = "timerMeta";

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
      if (!store.indexNames.contains("updated_at")) {
        store.createIndex("updated_at", "updated_at", { unique: false });
      }
      if (!store.indexNames.contains("created_at")) {
        store.createIndex("created_at", "created_at", { unique: false });
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

      if (!db.objectStoreNames.contains(DOCUMENT_BODIES_STORE)) {
        const bodiesStore = db.createObjectStore(DOCUMENT_BODIES_STORE, {
          keyPath: "documentId",
        });
        bodiesStore.createIndex("updatedAt", "updatedAt", { unique: false });
        bodiesStore.createIndex("updated_at", "updated_at", { unique: false });
        bodiesStore.createIndex("syncedAt", "syncedAt", { unique: false });
      }

      if (event.oldVersion < 6) {
        const documentsStore = request.transaction.objectStore(DOCUMENTS_STORE);
        const bodiesStore = request.transaction.objectStore(DOCUMENT_BODIES_STORE);
        const cursorRequest = documentsStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const document = cursor.value;
          if (typeof document?.body === "string") {
            bodiesStore.put({
              documentId: document.id,
              content: document.body,
              updatedAt: document.updatedAt ?? Date.now(),
              syncedAt: null,
            });
          }
          cursor.continue();
        };
      }

      if (event.oldVersion < 8) {
        const documentsStore = request.transaction.objectStore(DOCUMENTS_STORE);
        const cursorRequest = documentsStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const document = cursor.value;
          let next = document;
          let changed = false;
          if (!document?.created_at) {
            const createdAtMs = Number.isFinite(document?.createdAt)
              ? document.createdAt
              : Date.now();
            next = { ...next, created_at: new Date(createdAtMs).toISOString() };
            changed = true;
          }
          if (!document?.updated_at) {
            const updatedAtMs = Number.isFinite(document?.updatedAt)
              ? document.updatedAt
              : Date.now();
            next = { ...next, updated_at: new Date(updatedAtMs).toISOString() };
            changed = true;
          }
          if (changed) {
            cursor.update(next);
          }
          cursor.continue();
        };

        if (db.objectStoreNames.contains(DOCUMENT_BODIES_STORE)) {
          const bodiesStore = request.transaction.objectStore(DOCUMENT_BODIES_STORE);
          const bodyCursor = bodiesStore.openCursor();
          bodyCursor.onsuccess = () => {
            const cursor = bodyCursor.result;
            if (!cursor) return;
            const body = cursor.value;
            if (!body?.updated_at) {
              const updatedAtMs = Number.isFinite(body?.updatedAt)
                ? body.updatedAt
                : Date.now();
              cursor.update({
                ...body,
                updated_at: new Date(updatedAtMs).toISOString(),
              });
            }
            cursor.continue();
          };
        }
      }

      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const queueStore = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: "id" });
        queueStore.createIndex("createdAt", "createdAt", { unique: false });
        queueStore.createIndex("nextAttemptAt", "nextAttemptAt", { unique: false });
        queueStore.createIndex("documentId", "documentId", { unique: false });
        queueStore.createIndex("table", "table", { unique: false });
        queueStore.createIndex("record_id", "record_id", { unique: false });
        queueStore.createIndex("timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
        db.createObjectStore(SYNC_META_STORE, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(TIMER_EVENTS_STORE)) {
        const timerEventsStore = db.createObjectStore(TIMER_EVENTS_STORE, { keyPath: "id" });
        timerEventsStore.createIndex("status", "status", { unique: false });
        timerEventsStore.createIndex("client_time", "client_time", { unique: false });
        timerEventsStore.createIndex("timer_entry_id", "timer_entry_id", { unique: false });
      }

      if (!db.objectStoreNames.contains(TIMER_META_STORE)) {
        db.createObjectStore(TIMER_META_STORE, { keyPath: "key" });
      }

      if (db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const queueStore = request.transaction.objectStore(SYNC_QUEUE_STORE);
        if (!queueStore.indexNames.contains("table")) {
          queueStore.createIndex("table", "table", { unique: false });
        }
        if (!queueStore.indexNames.contains("record_id")) {
          queueStore.createIndex("record_id", "record_id", { unique: false });
        }
        if (!queueStore.indexNames.contains("timestamp")) {
          queueStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}
