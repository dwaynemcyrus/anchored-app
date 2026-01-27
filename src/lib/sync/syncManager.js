import { getSyncMeta, setSyncMeta } from "./syncQueue";
import {
  fetchDocumentBodiesByIds,
  fetchDocumentById,
  fetchDocumentBody,
  fetchDocumentsUpdatedSince,
  insertDocument,
  insertDocumentBody,
  updateDocumentWithVersion,
  updateDocumentBody,
} from "../supabase/documents";
import { useSyncStore, SYNC_STATUS } from "../../store/syncStore";
import { createConflictCopy } from "./conflictCopy";
import { getDocumentsRepo } from "../repo/getDocumentsRepo";
import { buildSearchIndex } from "../search/searchDocuments";
import { deriveDocumentTitle } from "../documents/deriveTitle";

const META_LAST_SYNCED_AT = "lastSyncedAt";
const POLL_INTERVAL_MS = 60000;

let syncInFlight = null;
let listenersInitialized = false;
const listeners = new Set();
let pollIntervalId = null;

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
  window.addEventListener("focus", () => {
    scheduleSync({ reason: "focus" });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleSync({ reason: "visibility" });
    }
  });
  if (!pollIntervalId) {
    pollIntervalId = window.setInterval(() => {
      scheduleSync({ reason: "poll" });
    }, POLL_INTERVAL_MS);
  }
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
    title: deriveDocumentTitle(document),
    status: resolveStatus(document),
    frontmatter: resolveFrontmatter(document),
    created_at: toIso(document.createdAt),
    updated_at: toIso(document.updatedAt),
    version: typeof document.version === "number" ? document.version : 1,
  };
}

function fromServerDocument(document, body) {
  const updatedAt = parseIsoToMs(document.updated_at) ?? Date.now();
  const createdAt = parseIsoToMs(document.created_at) ?? updatedAt;
  const version = typeof document.version === "number" ? document.version : 1;
  const status = document.status ?? "active";
  const isTrashed = status === "trash";
  const isArchived = status === "archived";
  const frontmatter = document.frontmatter ?? {};
  const frontmatterTags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
  const deletedAt = document.deleted_at
    ? parseIsoToMs(document.deleted_at) ?? Date.now()
    : null;

  return {
    id: document.id,
    type: document.type,
    subtype: document.subtype ?? null,
    title: document.title ?? null,
    body: body ?? "",
    meta: {
      ...frontmatter,
      status,
      tags: frontmatterTags,
      subtype: document.subtype ?? null,
      frontmatter,
    },
    status,
    frontmatter,
    version,
    createdAt,
    updatedAt,
    deletedAt: deletedAt ?? (isTrashed ? updatedAt : null),
    archivedAt: isArchived ? updatedAt : null,
    inboxAt: null,
  };
}

function setPendingCount(count) {
  getStoreActions().setPendingCount(count);
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
  const created = await insertDocument(serverDocument);
  if (typeof document.body === "string") {
    await insertDocumentBody(document.id, document.body);
  }
  const merged = fromServerDocument(created, document.body ?? "");
  await applyRemoteDocuments([merged]);
}

async function pushUpdate(document, baseVersionOverride) {
  const serverDocument = toServerDocument(document);
  if (!serverDocument) throw new Error("Missing document snapshot");

  const existing = await fetchDocumentById(document.id);
  if (!existing) {
    await pushCreate(document);
    return { conflict: false };
  }

  const serverVersion = typeof existing.version === "number" ? existing.version : 1;
  const expectedVersion =
    typeof baseVersionOverride === "number"
      ? baseVersionOverride
      : typeof document.version === "number"
        ? document.version
        : 1;
  if (serverVersion !== expectedVersion) {
    return { conflict: true, serverDocument: existing };
  }

  const updated = await updateDocumentWithVersion(
    document.id,
    serverDocument,
    expectedVersion
  );
  if (!updated) {
    return { conflict: true, serverDocument: existing };
  }
  if (typeof document.body === "string") {
    const existingBody = await fetchDocumentBody(document.id);
    if (existingBody) {
      await updateDocumentBody(document.id, document.body);
    } else {
      await insertDocumentBody(document.id, document.body);
    }
  }
  const merged = fromServerDocument(updated, document.body ?? "");
  await applyRemoteDocuments([merged]);
  return { conflict: false };
}

async function resolveConflict({ localDocument, serverDocument }) {
  const conflictCopy = await createConflictCopy({
    document: localDocument,
    reason: "server-newer",
  });
  notify({ type: "conflict", conflictCopy });
  await pushCreate(conflictCopy);

  const serverBody = await fetchDocumentBody(serverDocument.id);
  const merged = fromServerDocument(serverDocument, serverBody?.content ?? "");
  await applyRemoteDocuments([merged]);
  return conflictCopy;
}

async function processOperation(operation) {
  const { type, payload } = operation;
  const document = payload?.document ?? null;
  const baseVersion =
    typeof payload?.baseVersion === "number" ? payload.baseVersion : null;

  if (!document) {
    throw new Error("Sync operation missing document payload");
  }

  if (type === "create") {
    await pushCreate(document);
    return { handled: true };
  }

  const result = await pushUpdate(document, baseVersion);
  if (result?.conflict) {
    await resolveConflict({ localDocument: document, serverDocument: result.serverDocument });
  }
  return { handled: true };
}

async function runSync() {
  const store = getStoreActions();
  initSyncListeners();

  if (!isOnline()) {
    store.setStatus(SYNC_STATUS.OFFLINE);
    setPendingCount(0);
    return;
  }

  store.setStatus(SYNC_STATUS.SYNCING);
  store.setLastError(null);

  try {
    await pullRemoteChanges();
  } catch (error) {
    console.error("Failed to pull remote changes", error);
    store.setLastError(error.message || "Sync pull failed");
    store.setStatus(SYNC_STATUS.ERROR);
    return;
  }

  setPendingCount(0);
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
  const store = getStoreActions();
  if (!isOnline()) {
    store.setStatus(SYNC_STATUS.ERROR);
    store.setLastError("Offline");
    throw new Error("Offline");
  }
  store.setStatus(SYNC_STATUS.SYNCING);
  store.setLastError(null);
  setPendingCount(0);
  await processOperation(operation);
  await pullRemoteChanges();
  store.setStatus(SYNC_STATUS.SYNCED);
  return operation;
}
