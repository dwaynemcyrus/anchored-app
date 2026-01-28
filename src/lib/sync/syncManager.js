import { getDocumentsRepo } from "../repo/getDocumentsRepo";
import {
  DOCUMENTS_STORE,
  DOCUMENT_BODIES_STORE,
  openAnchoredDb,
} from "../db/indexedDb";
import { getDocumentBody } from "../db/documentBodies";
import { getSupabaseClient, getUserId } from "../supabase/client";
import {
  fetchDocumentBody,
  fetchDocumentsUpdatedSince,
  fetchDocumentBodiesByIds,
  upsertDocument,
  upsertDocumentBody,
} from "../supabase/documents";
import { startTimeEntry, stopTimeEntry, resumeTimeEntry } from "../supabase/timeEntries";
import { markTimerEventFailed, markTimerEventSynced } from "./timerSync";
import {
  enqueueOperation,
  computeBackoffMs,
  getQueueCount,
  getSyncMeta,
  listQueue,
  MAX_RETRY_COUNT,
  removeOperation,
  updateOperation,
  setSyncMeta,
} from "./syncQueue";
import { useSyncStore, SYNC_STATUS } from "../../store/syncStore";
import { getClientId } from "../clientId";
import { ensureIsoTimestamp, parseIsoTimestamp } from "../utils/timestamps";
import { createConflictCopy } from "./conflictCopy";

const META_LAST_SYNCED_AT = "lastSyncedAt";
const CLIENT_ID = getClientId();
const debouncedSaves = new Map();

let syncInFlight = null;
let listenersInitialized = false;
const listeners = new Set();
let pollIntervalId = null;
const POLL_INTERVAL_MS = 60000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

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
    setLastSuccessfulSyncAt: store.setLastSuccessfulSyncAt,
  };
}

function notify(event) {
  listeners.forEach((listener) => listener(event));
}

function buildErrorDetails(error) {
  if (!error || typeof error !== "object") {
    return { message: String(error ?? "Unknown error") };
  }
  return {
    message: error.message ?? "Unknown error",
    details: error.details ?? null,
    hint: error.hint ?? null,
    code: error.code ?? null,
    stack: error.stack ?? null,
  };
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
  if (!pollIntervalId) {
    pollIntervalId = window.setInterval(() => {
      scheduleSync({ reason: "poll" });
    }, POLL_INTERVAL_MS);
  }
}

function parseIsoToMs(value) {
  return parseIsoTimestamp(value, null);
}

function resolveStatus(document) {
  if (document?.status) return document.status;
  if (document?.meta?.status) return document.meta.status;
  if (document?.deletedAt) return "trash";
  if (document?.archivedAt) return "archived";
  return "active";
}

function resolveSubtype(document) {
  return document?.subtype ?? document?.meta?.subtype ?? null;
}

function resolveFrontmatter(document) {
  if (document?.frontmatter) return document.frontmatter;
  if (document?.meta?.frontmatter) return document.meta.frontmatter;
  const tags = Array.isArray(document?.meta?.tags) ? document.meta.tags : [];
  return {
    ...(document?.meta ?? {}),
    ...(tags.length ? { tags } : {}),
  };
}

function toServerDocument(document) {
  if (!document) return null;
  return {
    id: document.id,
    type: document.type,
    subtype: resolveSubtype(document),
    title: document.title ?? null,
    status: resolveStatus(document),
    frontmatter: resolveFrontmatter(document),
    created_at: ensureIsoTimestamp(document.createdAt ?? document.created_at),
    updated_at: ensureIsoTimestamp(document.updatedAt ?? document.updated_at),
    deleted_at: ensureIsoTimestamp(document.deletedAt ?? document.deleted_at, null),
    version: typeof document.version === "number" ? document.version : 1,
    client_id: document.clientId ?? document.client_id ?? CLIENT_ID,
    synced_at: document.syncedAt ?? document.synced_at ?? null,
  };
}

const BODY_TYPES = new Set([
  "note",
  "daily",
  "template",
  "inbox",
  "reference",
  "source",
  "journal",
  "essay",
  "staged",
  "project",
]);

function hasBody(type) {
  if (!type) return true;
  return BODY_TYPES.has(type);
}

function getLocalUpdatedAtMs(localDoc) {
  if (!localDoc) return 0;
  return parseIsoTimestamp(localDoc.updated_at, localDoc.updatedAt) ?? 0;
}

async function patchLocalRecord(storeName, id, patch) {
  const db = await openAnchoredDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) {
        resolve(false);
        return;
      }
      const next = {
        ...existing,
        ...patch,
      };
      const putRequest = store.put(next);
      putRequest.onsuccess = () => resolve(true);
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

async function upsertLocalDocument(document) {
  const db = await openAnchoredDb();
  const payload = { ...document };
  delete payload.body;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [DOCUMENTS_STORE, DOCUMENT_BODIES_STORE],
      "readwrite"
    );
    const documentStore = transaction.objectStore(DOCUMENTS_STORE);
    const bodyStore = transaction.objectStore(DOCUMENT_BODIES_STORE);
    documentStore.put(payload);
    if (typeof document.body === "string") {
      bodyStore.put({
        documentId: document.id,
        content: document.body,
        updatedAt: document.updatedAt ?? Date.now(),
        syncedAt: document.syncedAt ?? null,
        clientId: document.clientId ?? CLIENT_ID,
      });
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function enqueueDocumentUpsert(documentId, payload = null) {
  if (!documentId) return;
  await enqueueOperation({
    table: "documents",
    record_id: documentId,
    operation: "upsert",
    payload,
    timestamp: new Date().toISOString(),
    retry_count: 0,
  });
  await refreshPendingCount();
  if (isOnline()) {
    scheduleSync({ reason: "enqueue" });
  } else {
    getStoreActions().setStatus(SYNC_STATUS.OFFLINE);
  }
}

async function enqueueBodyUpsert(documentId, payload = null) {
  if (!documentId) return;
  await enqueueOperation({
    table: "document_bodies",
    record_id: documentId,
    operation: "upsert",
    payload,
    timestamp: new Date().toISOString(),
    retry_count: 0,
  });
  await refreshPendingCount();
  if (isOnline()) {
    scheduleSync({ reason: "enqueue" });
  } else {
    getStoreActions().setStatus(SYNC_STATUS.OFFLINE);
  }
}

export async function saveDocument(doc, content, options = {}) {
  if (!doc || typeof doc.id !== "string") {
    throw new Error("Document with id is required");
  }

  const repo = getDocumentsRepo();
  const existing = await repo.get(doc.id);
  const shouldWriteBody = content !== undefined;
  const nextBody =
    content !== undefined
      ? content
      : typeof doc.body === "string"
        ? doc.body
        : existing?.body ?? "";

  if (existing) {
    const patch = {
      ...doc,
      clientId: CLIENT_ID,
      syncedAt: null,
      ...(typeof options.version === "number" ? { version: options.version } : {}),
    };
    if (shouldWriteBody && hasBody(doc.type)) {
      patch.body = nextBody;
    }
    await repo.update(doc.id, patch);
  } else {
    await repo.create({
      type: doc.type,
      body: hasBody(doc.type) ? nextBody : "",
      title: doc.title ?? null,
      meta: doc.meta ?? {},
      archivedAt: doc.archivedAt ?? null,
      inboxAt: doc.inboxAt ?? null,
    });
  }

  const key = `document:${doc.id}`;
  clearTimeout(debouncedSaves.get(key));
  debouncedSaves.set(
    key,
    setTimeout(async () => {
      await enqueueDocumentUpsert(doc.id, doc);
      if (shouldWriteBody && hasBody(doc.type)) {
        await enqueueBodyUpsert(doc.id);
      }
      debouncedSaves.delete(key);
    }, 800)
  );
}

export async function saveDocumentBody(documentId, content, options = {}) {
  if (typeof documentId !== "string" || !documentId.trim()) {
    throw new Error("Document id is required");
  }
  const repo = getDocumentsRepo();
  await repo.update(documentId, {
    body: content,
    clientId: CLIENT_ID,
    syncedAt: null,
    ...(typeof options.version === "number" ? { version: options.version } : {}),
  });

  const key = `body:${documentId}`;
  clearTimeout(debouncedSaves.get(key));
  debouncedSaves.set(
    key,
    setTimeout(async () => {
      await enqueueBodyUpsert(documentId);
      await enqueueDocumentUpsert(documentId);
      debouncedSaves.delete(key);
    }, 800)
  );
}

async function syncDocumentToSupabase(documentId) {
  if (!isUuid(documentId)) {
    return;
  }
  const repo = getDocumentsRepo();
  const doc = await repo.get(documentId);
  if (!doc) return;

  try {
    const userId = await getUserId();
    const syncedAt = new Date().toISOString();
    const payload = {
      ...toServerDocument(doc),
      owner_id: userId,
      user_id: userId,
      client_id: doc.clientId ?? doc.client_id ?? CLIENT_ID,
      synced_at: syncedAt,
      deleted_at: ensureIsoTimestamp(doc.deletedAt ?? doc.deleted_at, null),
    };

    const data = await upsertDocument(payload);

    const localUpdatedAt = new Date(doc.updatedAt ?? Date.now());
    if (data?.updated_at && new Date(data.updated_at) > localUpdatedAt) {
      await handleDocumentConflict(doc, data);
    } else {
      await patchLocalRecord(DOCUMENTS_STORE, documentId, {
        syncedAt,
      });
    }

    if (hasBody(doc.type)) {
      await syncBodyToSupabase(documentId);
    }
  } catch (error) {
    console.error(`Sync failed for document:${documentId}`, error);
    const errorDetails = buildErrorDetails(error);
    console.error("Supabase error details", errorDetails);
    getStoreActions().setLastError(
      errorDetails.message || "Document sync failed",
      errorDetails
    );

    await enqueueOperation({
      table: "documents",
      record_id: documentId,
      operation: "upsert",
      payload: doc,
      timestamp: new Date().toISOString(),
      retry_count: 0,
    });

    await refreshPendingCount();
  }
}

async function syncBodyToSupabase(documentId) {
  if (!isUuid(documentId)) {
    return;
  }
  const body = await getDocumentBody(documentId);
  if (!body) return;

  try {
    const userId = await getUserId();
    const syncedAt = new Date().toISOString();
    const data = await upsertDocumentBody({
      document_id: body.documentId,
      content: body.content,
      updated_at: ensureIsoTimestamp(body.updatedAt ?? body.updated_at),
      owner_id: userId,
      user_id: userId,
      client_id: body.clientId ?? CLIENT_ID,
      synced_at: syncedAt,
    });

    const localUpdatedAt = new Date(body.updatedAt ?? Date.now());
    if (data?.updated_at && new Date(data.updated_at) > localUpdatedAt) {
      await handleBodyConflict(documentId, body, data);
    } else {
      await patchLocalRecord(DOCUMENT_BODIES_STORE, documentId, {
        syncedAt,
      });
    }
  } catch (error) {
    console.error(`Sync failed for body:${documentId}`, error);
    const errorDetails = buildErrorDetails(error);
    console.error("Supabase error details", errorDetails);
    getStoreActions().setLastError(errorDetails.message || "Body sync failed", errorDetails);

    await enqueueOperation({
      table: "document_bodies",
      record_id: documentId,
      operation: "upsert",
      payload: body,
      timestamp: new Date().toISOString(),
      retry_count: 0,
    });

    await refreshPendingCount();
  }
}

async function handleDocumentConflict(localDoc, remoteDoc) {
  const conflictCopy = await createConflictCopy({
    document: {
      ...localDoc,
      body: localDoc.body ?? "",
    },
    reason: "server-newer",
  });
  notify({ type: "conflict", conflictCopy });

  if (remoteDoc?.id) {
    const serverBody = await fetchDocumentBody(remoteDoc.id);
    await applyRemoteDocument(remoteDoc, serverBody?.content ?? "");
  }
}

async function handleBodyConflict(documentId, localBody, remoteBody) {
  const repo = getDocumentsRepo();
  const doc = await repo.get(documentId);
  if (!doc) return;

  await createConflictCopy({
    document: {
      ...doc,
      body: localBody.content,
    },
    reason: "body-conflict",
  });

  await patchLocalRecord(DOCUMENT_BODIES_STORE, documentId, {
    content: remoteBody.content,
    updatedAt: parseIsoToMs(remoteBody.updated_at) ?? Date.now(),
    syncedAt: new Date().toISOString(),
  });
}

async function syncRemoteUpdates() {
  const lastSyncedAt = await getSyncMeta(META_LAST_SYNCED_AT);
  const remoteDocs = await fetchDocumentsUpdatedSince({ since: lastSyncedAt });
  if (!remoteDocs || remoteDocs.length === 0) return;

  const repo = getDocumentsRepo();
  const ids = remoteDocs.map((doc) => doc.id).filter((id) => isUuid(id));
  const bodies = await fetchDocumentBodiesByIds(ids);
  const bodiesById = new Map(
    bodies.map((body) => [body.document_id, body])
  );

  let maxUpdatedAt = Date.parse(lastSyncedAt || "") || 0;

  for (const remoteDoc of remoteDocs) {
    if (!isUuid(remoteDoc.id)) continue;
    const bodyRecord = bodiesById.get(remoteDoc.id) || null;
    const bodyContent = bodyRecord?.content ?? "";
    const remoteUpdatedMs = parseIsoToMs(remoteDoc.updated_at) ?? 0;
    maxUpdatedAt = Math.max(maxUpdatedAt, remoteUpdatedMs);
    const localDoc = await repo.get(remoteDoc.id);

    if (!localDoc) {
      await applyRemoteDocument(remoteDoc, bodyContent);
      continue;
    }

    const localDirty = localDoc.syncedAt == null;
    const localUpdatedAt = getLocalUpdatedAtMs(localDoc);

    if (localDirty && remoteUpdatedMs > localUpdatedAt) {
      await handleDocumentConflict(localDoc, remoteDoc);
      continue;
    }

    if (!localDirty && remoteUpdatedMs > localUpdatedAt) {
      await applyRemoteDocument(remoteDoc, bodyContent);
    }
  }

  if (maxUpdatedAt) {
    const nextSync = new Date(maxUpdatedAt).toISOString();
    await setSyncMeta(META_LAST_SYNCED_AT, nextSync);
    getStoreActions().setLastSyncedAt(nextSync);
  }
}

async function applyRemoteDocument(remoteDoc, bodyContent) {
  const localDoc = {
    id: remoteDoc.id,
    type: remoteDoc.type,
    subtype: remoteDoc.subtype ?? null,
    title: remoteDoc.title ?? null,
    body: bodyContent ?? "",
    meta: {
      ...(remoteDoc.frontmatter ?? {}),
      status: remoteDoc.status ?? "active",
      tags: Array.isArray(remoteDoc.frontmatter?.tags) ? remoteDoc.frontmatter.tags : [],
      subtype: remoteDoc.subtype ?? null,
      frontmatter: remoteDoc.frontmatter ?? {},
    },
    status: remoteDoc.status ?? "active",
    frontmatter: remoteDoc.frontmatter ?? {},
    version: typeof remoteDoc.version === "number" ? remoteDoc.version : 1,
    created_at: remoteDoc.created_at ?? null,
    updated_at: remoteDoc.updated_at ?? null,
    createdAt: parseIsoToMs(remoteDoc.created_at) ?? Date.now(),
    updatedAt: parseIsoToMs(remoteDoc.updated_at) ?? Date.now(),
    deletedAt: remoteDoc.deleted_at ? parseIsoToMs(remoteDoc.deleted_at) ?? Date.now() : null,
    archivedAt: remoteDoc.status === "archived"
      ? parseIsoToMs(remoteDoc.updated_at) ?? Date.now()
      : null,
    inboxAt: null,
    clientId: remoteDoc.client_id ?? null,
    syncedAt: new Date().toISOString(),
  };

  await upsertLocalDocument(localDoc);
}

export async function deleteDocument(documentId) {
  const repo = getDocumentsRepo();
  await repo.delete(documentId);

  try {
    await enqueueOperation({
      table: "document_bodies",
      record_id: documentId,
      operation: "delete",
      payload: null,
      timestamp: new Date().toISOString(),
      retry_count: 0,
    });
    await enqueueOperation({
      table: "documents",
      record_id: documentId,
      operation: "delete",
      payload: null,
      timestamp: new Date().toISOString(),
      retry_count: 0,
    });
    await refreshPendingCount();
    if (isOnline()) {
      scheduleSync({ reason: "delete" });
    } else {
      getStoreActions().setStatus(SYNC_STATUS.OFFLINE);
    }
  } catch (error) {
    console.error(`Delete failed for document:${documentId}`, error);

    await enqueueOperation({
      table: "document_bodies",
      record_id: documentId,
      operation: "delete",
      payload: null,
      timestamp: new Date().toISOString(),
      retry_count: 0,
    });
    await enqueueOperation({
      table: "documents",
      record_id: documentId,
      operation: "delete",
      payload: null,
      timestamp: new Date().toISOString(),
      retry_count: 0,
    });

    await refreshPendingCount();
  }
}

async function refreshPendingCount() {
  const count = await getQueueCount();
  getStoreActions().setPendingCount(count);
}

export async function processSyncQueue() {
  const items = await listQueue({ includeDeferred: false });
  if (!items.length) {
    await refreshPendingCount();
    return;
  }

  for (const item of items) {
    if ((item.retry_count ?? 0) >= MAX_RETRY_COUNT) {
      continue;
    }
    try {
      const isDocTable = item.table === "documents";
      const isBodyTable = item.table === "document_bodies";
      if ((isDocTable || isBodyTable) && !isUuid(item.record_id)) {
        await removeOperation(item.id);
        continue;
      }
      if (item.table === "time_entries") {
        if (!isUuid(item.record_id)) {
          await removeOperation(item.id);
          continue;
        }
        const payload = item.payload || {};
        if (item.operation === "start") {
          const data = await startTimeEntry({
            id: payload.id,
            entityId: payload.entity_id,
            entityType: payload.entity_type,
            startedAt: payload.started_at,
            note: payload.note ?? null,
            source: payload.source ?? null,
          });
          if (payload.event_id) {
            await markTimerEventSynced(payload.event_id, data?.started_at);
          }
        } else if (item.operation === "pause" || item.operation === "stop") {
          const data = await stopTimeEntry({
            id: payload.id || item.record_id,
            endedAt: payload.ended_at,
            note: payload.note,
            durationMs: payload.duration_ms,
          });
          if (payload.event_id) {
            await markTimerEventSynced(payload.event_id, data?.ended_at);
          }
        } else if (item.operation === "resume") {
          const data = await resumeTimeEntry({
            id: payload.id || item.record_id,
          });
          if (payload.event_id) {
            await markTimerEventSynced(payload.event_id, data?.updated_at);
          }
        }
        await removeOperation(item.id);
        continue;
      }
      if (item.operation === "upsert") {
        if (item.table === "documents") {
          await syncDocumentToSupabase(item.record_id);
        } else if (item.table === "document_bodies") {
          await syncBodyToSupabase(item.record_id);
        }
      } else if (item.operation === "delete") {
        const client = getSupabaseClient();
        await client
          .from(item.table)
          .delete()
          .eq(item.table === "documents" ? "id" : "document_id", item.record_id);
      }

      await removeOperation(item.id);
    } catch (error) {
      const nextRetry = (item.retry_count ?? 0) + 1;
      const backoffMs = computeBackoffMs(nextRetry);
      if (item.table === "time_entries" && item.payload?.event_id) {
        await markTimerEventFailed(item.payload.event_id, buildErrorDetails(error));
      }
      await updateOperation(item.id, {
        retry_count: nextRetry,
        lastError: buildErrorDetails(error),
        lastAttemptAt: new Date().toISOString(),
        nextAttemptAt: backoffMs ? new Date(Date.now() + backoffMs).toISOString() : null,
        status: nextRetry >= MAX_RETRY_COUNT ? "failed" : "retrying",
      });
    }
  }

  await refreshPendingCount();
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

  try {
    await processSyncQueue();
    await syncRemoteUpdates();
  } catch (error) {
    console.error("Failed to process sync queue", error);
    store.setLastError(error?.message || "Sync failed", buildErrorDetails(error));
    store.setStatus(SYNC_STATUS.ERROR);
    return;
  }

  store.setStatus(SYNC_STATUS.SYNCED);
  store.setLastSuccessfulSyncAt(new Date().toISOString());
}

export function scheduleSync({ reason } = {}) {
  if (!isBrowser()) return Promise.resolve();
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync()
    .catch((error) => {
      console.error("Sync run failed", error);
      const store = getStoreActions();
      store.setLastError(error?.message || "Sync failed", buildErrorDetails(error));
      store.setStatus(SYNC_STATUS.ERROR);
    })
    .finally(() => {
      syncInFlight = null;
    });

  return syncInFlight;
}

export async function enqueueSyncOperation(operation) {
  if (!isBrowser()) return null;
  const store = getStoreActions();
  const documentId = operation?.documentId;
  if (!documentId) return null;

  const operationType = operation?.type === "delete" ? "delete" : "upsert";
  await enqueueOperation({
    table: "documents",
    record_id: documentId,
    operation: operationType,
    payload: operation?.payload ?? null,
    timestamp: new Date().toISOString(),
    retry_count: 0,
  });
  await refreshPendingCount();
  if (isOnline()) {
    scheduleSync({ reason: "enqueue" });
  } else {
    store.setStatus(SYNC_STATUS.OFFLINE);
  }
  return operation;
}

export async function markLastSyncedAt(value) {
  const nextValue = value ?? new Date().toISOString();
  await setSyncMeta(META_LAST_SYNCED_AT, nextValue);
  getStoreActions().setLastSyncedAt(nextValue);
}

export async function getLastSyncedAt() {
  return getSyncMeta(META_LAST_SYNCED_AT);
}
