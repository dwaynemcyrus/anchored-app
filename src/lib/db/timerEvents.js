import {
  openAnchoredDb,
  TIMER_EVENTS_STORE,
  TIMER_META_STORE,
} from "./indexedDb";

function ensureId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Timer event id is required");
  }
}

function ensureKey(key) {
  if (typeof key !== "string" || !key.trim()) {
    throw new Error("Timer meta key is required");
  }
}

async function getDb() {
  return openAnchoredDb();
}

export async function addTimerEvent(event) {
  if (!event || typeof event !== "object") {
    throw new Error("Timer event is required");
  }
  ensureId(event.id);
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TIMER_EVENTS_STORE, "readwrite");
    const store = transaction.objectStore(TIMER_EVENTS_STORE);
    const request = store.put(event);

    request.onsuccess = () => resolve(event);
    request.onerror = () => reject(request.error);
  });
}

export async function getTimerEvent(id) {
  ensureId(id);
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TIMER_EVENTS_STORE, "readonly");
    const store = transaction.objectStore(TIMER_EVENTS_STORE);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function listTimerEvents({ status, limit = null } = {}) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TIMER_EVENTS_STORE, "readonly");
    const store = transaction.objectStore(TIMER_EVENTS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = Array.isArray(request.result) ? request.result : [];
      const filtered = status
        ? items.filter((item) => item.status === status)
        : items;
      const sorted = filtered.sort((a, b) => {
        const aTime = Date.parse(a.client_time || "") || 0;
        const bTime = Date.parse(b.client_time || "") || 0;
        return aTime - bTime;
      });
      const limited = limit ? sorted.slice(0, limit) : sorted;
      resolve(limited);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateTimerEvent(id, updates = {}) {
  ensureId(id);
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TIMER_EVENTS_STORE, "readwrite");
    const store = transaction.objectStore(TIMER_EVENTS_STORE);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) {
        reject(new Error("Timer event not found"));
        return;
      }
      const next = {
        ...existing,
        ...updates,
      };
      const putRequest = store.put(next);
      putRequest.onsuccess = () => resolve(next);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function setTimerMeta(key, value) {
  ensureKey(key);
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TIMER_META_STORE, "readwrite");
    const store = transaction.objectStore(TIMER_META_STORE);
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getTimerMeta(key) {
  ensureKey(key);
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TIMER_META_STORE, "readonly");
    const store = transaction.objectStore(TIMER_META_STORE);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror = () => reject(request.error);
  });
}
