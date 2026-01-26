import {
  enqueueOperation,
  getNextReadyOperation,
  getQueueCount,
  getSyncMeta,
  listQueue,
  removeOperation,
  setSyncMeta,
  updateOperation,
} from "./syncQueue";
import {
  fetchDocumentBodiesByIds,
  fetchDocumentById,
  fetchDocumentBody,
  fetchDocumentsUpdatedSince,
  insertDocument,
  insertDocumentBody,
  updateDocument,
  updateDocumentBody,
} from "../supabase/documents";
import { useSyncStore, SYNC_STATUS } from "../../store/syncStore";
import { createConflictCopy } from "./conflictCopy";
import { getDocumentsRepo } from "../repo/getDocumentsRepo";
import { buildSearchIndex } from "../search/searchDocuments";

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1500;
const MAX_DELAY_MS = 60000;
const META_LAST_SYNCED_AT = "lastSyncedAt";

let syncInFlight = null;
let listenersInitialized = false;
const listeners = new Set();

function isBrowser() {
  return typeof window !== "undefined";
}

function isOnline() {
  if (!isBrowser()) return false;
  return navigator.onLine;
}

function getStoreActions() {
  const store = useSyncStore.getState();
  return {
    setStatus: store.setStatus,
    setPendingCount: store.setPendingCount,
    setLastError: store.setLastError,
    setLastSyncedAt: store.setLastSyncedAt,
  };
}

function notify(event) {
  listeners.forEach((listener) => listener(event));
}

export function addSyncListener(listener) {
  if (typeof listener !== "function") {
    throw new Error("Sync listener must be a function");
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initSyncListeners() {
  if (!isBrowser() || listenersInitialized) return;
  listenersInitialized = true;
  window.addEventListener("online", () => {
    scheduleSync({ reason: "online" });
  });
  window.addEventListener("offline", () => {
    getStoreActions().setStatus(SYNC_STATUS.OFFLINE);
  });
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return null;
}

function parseIsoToMs(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function resolveStatus(document) {
  if (document?.status) return document.status;
  if (document?.meta?.status) return document.meta.status;
  if (document?.deletedAt) return "trash";
  if (document?.archivedAt) return "archived";
  return "active";
}

function resolveTags(document) {
  if (Array.isArray(document?.tags)) return document.tags;
  if (Array.isArray(document?.meta?.tags)) return document.meta.tags;
  return [];
}

function resolveSubtype(document) {
  return document?.subtype ?? document?.meta?.subtype ?? null;
}

function resolveFrontmatter(document) {
  if (document?.frontmatter) return document.frontmatter;
  if (document?.meta?.frontmatter) return document.meta.frontmatter;
  return document?.meta ?? {};
}

function toServerDocument(document) {
  if (!document) return null;
  return {
    id: document.id,
    type: document.type,
    subtype: resolveSubtype(document),
    title: document.title ?? null,
    status: resolveStatus(document),
    tags: resolveTags(document),
    frontmatter: resolveFrontmatter(document),
    created_at: toIso(document.createdAt),
    updated_at: toIso(document.updatedAt),
  };
}

function fromServerDocument(document, body) {
  const updatedAt = parseIsoToMs(document.updated_at) ?? Date.now();
  const createdAt = parseIsoToMs(document.created_at) ?? updatedAt;
  const status = document.status ?? "active";
  const isTrashed = status === "trash";
  const isArchived = status === "archived";
  const frontmatter = document.frontmatter ?? {};

  return {
    id: document.id,
    type: document.type,
    subtype: document.subtype ?? null,
    title: document.title ?? null,
    body: body ?? "",
    meta: {
      ...frontmatter,
      status,
      tags: Array.isArray(document.tags) ? document.tags : [],
      subtype: document.subtype ?? null,
      frontmatter,
    },
    tags: Array.isArray(document.tags) ? document.tags : [],
    status,
    frontmatter,
    createdAt,
    updatedAt,
    deletedAt: isTrashed ? updatedAt : null,
    archivedAt: isArchived ? updatedAt : null,
    inboxAt: null,
  };
}

async function refreshPendingCount() {
  try {
    const count = await getQueueCount();
    getStoreActions().setPendingCount(count);
  } catch (error) {
    console.error("Failed to update sync pending count", error);
  }
}

function getBackoffDelay(attempts) {
  const exp = Math.pow(2, Math.max(0, attempts));
  const delay = BASE_DELAY_MS * exp;
  return Math.min(delay, MAX_DELAY_MS);
}

async function applyRemoteDocuments(documents) {
  if (!documents.length) return;
  const repo = getDocumentsRepo();
  await repo.bulkUpsert(documents);
  buildSearchIndex(await repo.getSearchableDocs({
    includeArchived: true,
    includeTrashed: true,
  }));
  notify({ type: "remoteApplied", documents });
}

async function pullRemoteChanges() {
  const lastSyncedAt = await getSyncMeta(META_LAST_SYNCED_AT);
  const remoteDocs = await fetchDocumentsUpdatedSince({ since: lastSyncedAt });
  if (!remoteDocs || remoteDocs.length === 0) {
    return;
  }
  const ids = remoteDocs.map((doc) => doc.id);
  const bodies = await fetchDocumentBodiesByIds(ids);
  const bodiesById = new Map(
    bodies.map((body) => [body.document_id, body.content])
  );

  const localDocs = remoteDocs.map((doc) =>
    fromServerDocument(doc, bodiesById.get(doc.id) ?? "")
  );

  await applyRemoteDocuments(localDocs);
  const latest = remoteDocs.reduce((max, doc) => {
    const timestamp = parseIsoToMs(doc.updated_at) ?? 0;
    return Math.max(max, timestamp);
  }, parseIsoToMs(lastSyncedAt) ?? 0);
  const nextSync = latest ? new Date(latest).toISOString() : new Date().toISOString();
  await setSyncMeta(META_LAST_SYNCED_AT, nextSync);
  getStoreActions().setLastSyncedAt(nextSync);
}

async function pushCreate(document) {
  const serverDocument = toServerDocument(document);
  if (!serverDocument) throw new Error("Missing document snapshot");
  await insertDocument(serverDocument);
  if (typeof document.body === "string") {
    await insertDocumentBody(document.id, document.body);
  }
}

async function pushUpdate(document) {
  const serverDocument = toServerDocument(document);
  if (!serverDocument) throw new Error("Missing document snapshot");

  const existing = await fetchDocumentById(document.id);
  if (!existing) {
    await insertDocument(serverDocument);
    if (typeof document.body === "string") {
      await insertDocumentBody(document.id, document.body);
    }
    return { conflict: false };
  }

  const serverUpdatedAt = parseIsoToMs(existing.updated_at) ?? 0;
  const localUpdatedAt = typeof document.updatedAt === "number" ? document.updatedAt : 0;
  if (serverUpdatedAt > localUpdatedAt) {
    return { conflict: true, serverDocument: existing };
  }

  await updateDocument(document.id, serverDocument);
  if (typeof document.body === "string") {
    const existingBody = await fetchDocumentBody(document.id);
    if (existingBody) {
      await updateDocumentBody(document.id, document.body);
    } else {
      await insertDocumentBody(document.id, document.body);
    }
  }
  return { conflict: false };
}

async function resolveConflict({ localDocument, serverDocument }) {
  const conflictCopy = await createConflictCopy({
    document: localDocument,
    reason: "server-newer",
  });
  notify({ type: "conflict", conflictCopy });
  await enqueueOperation({
    type: "create",
    documentId: conflictCopy.id,
    payload: { document: conflictCopy },
  });

  const serverBody = await fetchDocumentBody(serverDocument.id);
  const merged = fromServerDocument(serverDocument, serverBody?.content ?? "");
  await applyRemoteDocuments([merged]);
  return conflictCopy;
}

async function processOperation(operation) {
  const { type, payload } = operation;
  const document = payload?.document ?? null;

  if (!document) {
    throw new Error("Sync operation missing document payload");
  }

  if (type === "create") {
    await pushCreate(document);
    return { handled: true };
  }

  const result = await pushUpdate(document);
  if (result?.conflict) {
    await resolveConflict({ localDocument: document, serverDocument: result.serverDocument });
  }
  return { handled: true };
}

async function handleOperation(operation) {
  try {
    await processOperation(operation);
    await removeOperation(operation.id);
    await refreshPendingCount();
    return true;
  } catch (error) {
    const attempts = (operation.attempts ?? 0) + 1;
    const nextAttemptAt = Date.now() + getBackoffDelay(attempts);
    await updateOperation(operation.id, {
      attempts,
      nextAttemptAt,
      lastError: error.message || "Unknown error",
    });
    await refreshPendingCount();

    if (attempts >= MAX_ATTEMPTS) {
      const store = getStoreActions();
      store.setStatus(SYNC_STATUS.ERROR);
      store.setLastError(error.message || "Sync failed");
      return false;
    }
    return false;
  }
}

async function runSync() {
  const store = getStoreActions();
  initSyncListeners();

  if (!isOnline()) {
    store.setStatus(SYNC_STATUS.OFFLINE);
    await refreshPendingCount();
    return;
  }

  store.setStatus(SYNC_STATUS.SYNCING);
  store.setLastError(null);
  await refreshPendingCount();

  let nextOperation = await getNextReadyOperation();
  while (nextOperation) {
    const success = await handleOperation(nextOperation);
    if (!success) break;
    nextOperation = await getNextReadyOperation();
  }

  try {
    const remaining = await listQueue({ includeDeferred: false });
    if (!remaining.length) {
      await pullRemoteChanges();
    }
  } catch (error) {
    console.error("Failed to pull remote changes", error);
    store.setLastError(error.message || "Sync pull failed");
    store.setStatus(SYNC_STATUS.ERROR);
    return;
  }

  await refreshPendingCount();
  store.setStatus(SYNC_STATUS.SYNCED);
}

export function scheduleSync({ reason } = {}) {
  if (!isBrowser()) return Promise.resolve();
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync()
    .catch((error) => {
      console.error("Sync run failed", error);
      const store = getStoreActions();
      store.setLastError(error.message || "Sync failed");
      store.setStatus(SYNC_STATUS.ERROR);
    })
    .finally(() => {
      syncInFlight = null;
    });

  return syncInFlight;
}

export async function enqueueSyncOperation(operation) {
  if (!isBrowser()) return null;
  const queued = await enqueueOperation(operation);
  await refreshPendingCount();
  scheduleSync({ reason: "enqueue" });
  return queued;
}
