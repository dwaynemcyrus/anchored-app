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
  fetchDocumentById,
  fetchDocumentsUpdatedSince,
  fetchDocumentBodiesByIds,
  fetchDocumentBodiesUpdatedSince,
  upsertDocument,
  upsertDocumentBody,
} from "../supabase/documents";
import {
  startTimeEntry,
  stopTimeEntry,
  resumeTimeEntry,
  createTimeEntryEvent,
  takeoverTimeEntry,
  renewTimeEntryLease,
} from "../supabase/timeEntries";
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
type SyncEvent = {
  type: string;
  [key: string]: unknown;
};

type TimeEntryPayload = {
  id?: string;
  entity_id?: string;
  entity_type?: string;
  started_at?: string;
  ended_at?: string;
  duration_ms?: number;
  note?: string | null;
  source?: string | null;
  client_id?: string | null;
  lease_expires_at?: string | null;
  lease_token?: string | null;
  event_id?: string | null;
};

type TimeEntryEventPayload = {
  time_entry_id?: string;
  event_type?: string;
  event_time?: string;
  event_id?: string | null;
};

const debouncedSaves = new Map<string, ReturnType<typeof setTimeout>>();

let syncInFlight: Promise<void> | null = null;
let listenersInitialized = false;
const listeners = new Set<(event: SyncEvent) => void>();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
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

function notify(event: SyncEvent) {
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

function coercePayload<T extends Record<string, unknown>>(value: unknown): T {
  return (value && typeof value === "object" ? value : {}) as T;
}

export function addSyncListener(listener: (event: SyncEvent) => void) {
  if (typeof listener !== "function") {
    throw new Error("Sync listener must be a function");
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSyncEvent(event: SyncEvent) {
  notify(event);
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

async function upsertLocalDocument(document, bodyRecord = null) {
  const db = await openAnchoredDb();
  const payload = { ...document };
  delete payload.body;
  const hasBodyRecord = bodyRecord && typeof bodyRecord === "object";
  const hasBodyString = typeof document.body === "string";
  const shouldUpdateBody = hasBodyRecord || hasBodyString;
  const bodyContent = hasBodyString
    ? document.body
    : hasBodyRecord && typeof bodyRecord.content === "string"
      ? bodyRecord.content
      : null;
  const bodyUpdatedAtMs = shouldUpdateBody
    ? (typeof bodyRecord?.updatedAt === "number" ? bodyRecord.updatedAt : null) ??
      parseIsoToMs(bodyRecord?.updated_at) ??
      (typeof document.updatedAt === "number" ? document.updatedAt : null) ??
      Date.now()
    : null;
  const bodyUpdatedAtIso =
    shouldUpdateBody && bodyUpdatedAtMs
      ? bodyRecord?.updated_at ?? new Date(bodyUpdatedAtMs).toISOString()
      : null;
  const bodyVersion =
    shouldUpdateBody && typeof bodyRecord?.version === "number" ? bodyRecord.version : null;
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      [DOCUMENTS_STORE, DOCUMENT_BODIES_STORE],
      "readwrite"
    );
    const documentStore = transaction.objectStore(DOCUMENTS_STORE);
    const bodyStore = transaction.objectStore(DOCUMENT_BODIES_STORE);
    documentStore.put(payload);
    if (typeof bodyContent === "string") {
      bodyStore.put({
        documentId: document.id,
        content: bodyContent,
        updatedAt: bodyUpdatedAtMs ?? Date.now(),
        ...(bodyUpdatedAtIso ? { updated_at: bodyUpdatedAtIso } : {}),
        syncedAt: document.syncedAt ?? null,
        clientId: document.clientId ?? CLIENT_ID,
        ...(bodyVersion != null ? { version: bodyVersion } : {}),
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

type SaveOptions = {
  version?: number;
};

export async function saveDocument(
  doc,
  content,
  options: SaveOptions = {}
) {
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

export async function saveDocumentBody(
  documentId,
  content,
  options: SaveOptions = {}
) {
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
    const remoteDoc = await fetchDocumentById(documentId);
    if (!remoteDoc && doc.syncedAt != null) {
      await createConflictCopy({
        document: {
          ...doc,
          body: doc.body ?? "",
        },
        reason: "server-deleted",
      });
      await repo.delete(documentId);
      return;
    }
    if (remoteDoc?.updated_at) {
      const remoteUpdatedMs = parseIsoToMs(remoteDoc.updated_at) ?? 0;
      const localUpdatedAtMs = getLocalUpdatedAtMs(doc);
      if (remoteUpdatedMs > localUpdatedAtMs) {
        await handleDocumentConflict(doc, remoteDoc);
        return;
      }
    }
    const syncedAt = new Date().toISOString();
    const payload = {
      ...toServerDocument(doc),
      client_id: doc.clientId ?? doc.client_id ?? CLIENT_ID,
      synced_at: syncedAt,
      deleted_at: ensureIsoTimestamp(doc.deletedAt ?? doc.deleted_at, null),
    };

    const data = await upsertDocument(payload);
    if (data?.id) {
      await applyRemoteDocument(data, null);
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
    const remoteDoc = await fetchDocumentById(documentId);
    if (!remoteDoc) {
      const repo = getDocumentsRepo();
      const localDoc = await repo.get(documentId);
      if (localDoc && localDoc.syncedAt == null) {
        await enqueueOperation({
          table: "documents",
          record_id: documentId,
          operation: "upsert",
          payload: localDoc,
          timestamp: new Date().toISOString(),
          retry_count: 0,
        });
        await refreshPendingCount();
      }
      return;
    }
    const remoteBody = await fetchDocumentBody(documentId);
    if (!remoteBody && body.syncedAt != null) {
      const repo = getDocumentsRepo();
      const localDoc = await repo.get(documentId);
      if (localDoc?.syncedAt != null) {
        if (!remoteDoc) {
          await createConflictCopy({
            document: {
              ...localDoc,
              body: body.content,
            },
            reason: "server-deleted",
          });
          await repo.delete(documentId);
          return;
        }
      }
    }
    if (remoteBody?.updated_at) {
      const remoteUpdatedMs = parseIsoToMs(remoteBody.updated_at) ?? 0;
      const localUpdatedAtMs = parseIsoToMs(body.updated_at) ?? body.updatedAt ?? 0;
      if (remoteUpdatedMs > localUpdatedAtMs) {
        await handleBodyConflict(documentId, body, remoteBody);
        return;
      }
    }
    const syncedAt = new Date().toISOString();
    const data = await upsertDocumentBody({
      document_id: body.documentId,
      content: body.content,
      updated_at: ensureIsoTimestamp(body.updatedAt ?? body.updated_at),
      version: typeof body.version === "number" ? body.version : 1,
      client_id: body.clientId ?? CLIENT_ID,
      synced_at: syncedAt,
    });

    if (data?.document_id) {
      const serverUpdatedAtIso =
        data.updated_at ?? ensureIsoTimestamp(body.updatedAt ?? body.updated_at);
      const serverUpdatedAtMs = parseIsoToMs(serverUpdatedAtIso) ?? Date.now();
      await patchLocalRecord(DOCUMENT_BODIES_STORE, documentId, {
        content: data.content ?? body.content,
        updatedAt: serverUpdatedAtMs,
        updated_at: serverUpdatedAtIso,
        version: typeof data.version === "number" ? data.version : 1,
        syncedAt,
      });
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
    await applyRemoteDocument(remoteDoc, serverBody ?? null);
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
    updated_at: remoteBody.updated_at ?? new Date().toISOString(),
    version: typeof remoteBody.version === "number" ? remoteBody.version : 1,
    syncedAt: new Date().toISOString(),
  });
}

async function syncRemoteUpdates() {
  const lastSyncedAtRaw = await getSyncMeta(META_LAST_SYNCED_AT);
  const lastSyncedAt =
    typeof lastSyncedAtRaw === "string" ||
    typeof lastSyncedAtRaw === "number" ||
    lastSyncedAtRaw instanceof Date
      ? lastSyncedAtRaw
      : null;
  const remoteDocs = await fetchDocumentsUpdatedSince({ since: lastSyncedAt ?? undefined });
  const remoteBodies = await fetchDocumentBodiesUpdatedSince({
    since: lastSyncedAt ?? undefined,
  });
  const hasRemoteDocs = Array.isArray(remoteDocs) && remoteDocs.length > 0;
  const hasRemoteBodies = Array.isArray(remoteBodies) && remoteBodies.length > 0;
  if (!hasRemoteDocs && !hasRemoteBodies) return;

  const repo = getDocumentsRepo();
  const docIds = hasRemoteDocs
    ? remoteDocs.map((doc) => doc.id).filter((id) => isUuid(id))
    : [];
  const bodies = docIds.length ? await fetchDocumentBodiesByIds(docIds) : [];
  const bodiesById = new Map(bodies.map((body) => [body.document_id, body]));
  if (Array.isArray(remoteBodies)) {
    remoteBodies.forEach((body) => {
      if (body?.document_id) {
        bodiesById.set(body.document_id, body);
      }
    });
  }

  let maxUpdatedAt =
    typeof lastSyncedAt === "number"
      ? lastSyncedAt
      : lastSyncedAt instanceof Date
        ? lastSyncedAt.getTime()
        : Date.parse(lastSyncedAt || "") || 0;

  const docIdSet = new Set(docIds);
  for (const remoteDoc of remoteDocs ?? []) {
    if (!isUuid(remoteDoc.id)) continue;
    const bodyRecord = bodiesById.get(remoteDoc.id) || null;
    const remoteUpdatedMs = parseIsoToMs(remoteDoc.updated_at) ?? 0;
    maxUpdatedAt = Math.max(maxUpdatedAt, remoteUpdatedMs);
    const localDoc = await repo.get(remoteDoc.id);

    if (!localDoc) {
      await applyRemoteDocument(remoteDoc, bodyRecord);
      continue;
    }

    const localDirty = localDoc.syncedAt == null;
    const localUpdatedMs = getLocalUpdatedAtMs(localDoc);

    if (localDirty) {
      if (remoteUpdatedMs > localUpdatedMs) {
        await handleDocumentConflict(localDoc, remoteDoc);
      }
      continue;
    }

    await applyRemoteDocument(remoteDoc, bodyRecord);
  }

  if (hasRemoteBodies) {
    for (const remoteBody of remoteBodies) {
      if (!remoteBody?.document_id || docIdSet.has(remoteBody.document_id)) {
        continue;
      }
      const remoteUpdatedMs = parseIsoToMs(remoteBody.updated_at) ?? 0;
      maxUpdatedAt = Math.max(maxUpdatedAt, remoteUpdatedMs);
      const localBody = await getDocumentBody(remoteBody.document_id);
      if (!localBody) {
        const remoteDoc = await fetchDocumentById(remoteBody.document_id);
        if (remoteDoc) {
          await applyRemoteDocument(remoteDoc, remoteBody);
          continue;
        }
      }
      if (!localBody) {
        await patchLocalRecord(DOCUMENT_BODIES_STORE, remoteBody.document_id, {
          content: remoteBody.content ?? "",
          updatedAt: remoteUpdatedMs || Date.now(),
          updated_at: remoteBody.updated_at ?? new Date().toISOString(),
          version: typeof remoteBody.version === "number" ? remoteBody.version : 1,
          syncedAt: new Date().toISOString(),
        });
        continue;
      }
      if (localBody.syncedAt == null) {
        await handleBodyConflict(remoteBody.document_id, localBody, remoteBody);
        continue;
      }
      await patchLocalRecord(DOCUMENT_BODIES_STORE, remoteBody.document_id, {
        content: remoteBody.content ?? localBody.content,
        updatedAt: remoteUpdatedMs || Date.now(),
        updated_at: remoteBody.updated_at ?? new Date().toISOString(),
        version: typeof remoteBody.version === "number" ? remoteBody.version : 1,
        syncedAt: new Date().toISOString(),
      });
    }
  }

  if (maxUpdatedAt) {
    const nextSync = new Date(maxUpdatedAt).toISOString();
    await setSyncMeta(META_LAST_SYNCED_AT, nextSync);
    getStoreActions().setLastSyncedAt(nextSync);
  }
}

async function applyRemoteDocument(remoteDoc, bodyRecord) {
  const normalizedBody =
    typeof bodyRecord === "string"
      ? { content: bodyRecord }
      : bodyRecord || null;
  const hasBody = Boolean(normalizedBody);
  const bodyContent = hasBody ? normalizedBody?.content ?? "" : "";
  const localDoc = {
    id: remoteDoc.id,
    type: remoteDoc.type,
    subtype: remoteDoc.subtype ?? null,
    title: remoteDoc.title ?? null,
    ...(hasBody ? { body: bodyContent } : {}),
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

  await upsertLocalDocument(localDoc, normalizedBody);
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

  const hasDocFirst = items
    .filter((item) => item.table === "documents")
    .concat(items.filter((item) => item.table !== "documents"));

  for (const item of hasDocFirst) {
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
        const payload = coercePayload<TimeEntryPayload>(item.payload);
        if (item.operation === "start") {
          const data = await startTimeEntry({
            id: payload.id,
            entityId: payload.entity_id,
            entityType: payload.entity_type,
            startedAt: payload.started_at,
            note: payload.note ?? null,
            source: payload.source ?? null,
            clientId: payload.client_id,
            leaseExpiresAt: payload.lease_expires_at,
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
            clientId: payload.client_id,
            leaseExpiresAt: payload.lease_expires_at,
          });
          if (payload.event_id) {
            await markTimerEventSynced(payload.event_id, data?.updated_at);
          }
        } else if (item.operation === "takeover") {
          const data = await takeoverTimeEntry({
            id: payload.id || item.record_id,
            clientId: payload.client_id,
            leaseExpiresAt: payload.lease_expires_at,
            leaseToken: payload.lease_token,
          });
          if (payload.event_id) {
            await markTimerEventSynced(payload.event_id, data?.updated_at);
          }
        } else if (item.operation === "renew") {
          await renewTimeEntryLease({
            id: payload.id || item.record_id,
            clientId: payload.client_id,
            leaseExpiresAt: payload.lease_expires_at,
          });
        }
        await removeOperation(item.id);
        continue;
      }
      if (item.table === "time_entry_events") {
        const payload = coercePayload<TimeEntryEventPayload>(item.payload);
        if (!payload.time_entry_id || !isUuid(payload.time_entry_id)) {
          await removeOperation(item.id);
          continue;
        }
        await createTimeEntryEvent({
          entryId: payload.time_entry_id,
          eventType: payload.event_type,
          eventTime: payload.event_time,
        });
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
      if (item.table === "time_entries") {
        const payload = coercePayload<TimeEntryPayload>(item.payload);
        if (payload.event_id) {
          await markTimerEventFailed(payload.event_id, buildErrorDetails(error));
        }
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

export function scheduleSync({ reason }: { reason?: string } = {}) {
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
