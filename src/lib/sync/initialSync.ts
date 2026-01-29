import { getDocumentsRepo } from "../repo/getDocumentsRepo";
import {
  getDocumentBody,
  listDocumentBodies,
  upsertDocumentBody as upsertLocalDocumentBody,
} from "../db/documentBodies";
import { setSyncMeta } from "./syncQueue";
import {
  fetchDocumentBodiesByIds,
  fetchDocumentsUpdatedSince,
  fetchDocumentById,
  fetchDocumentBody,
  upsertDocument,
  upsertDocumentBody,
} from "../supabase/documents";
import { getSupabaseClient, getUserId } from "../supabase/client";
import { ensureIsoTimestamp, parseIsoTimestamp } from "../utils/timestamps";
import { createConflictCopy } from "./conflictCopy";
import { SYNC_STATUS, useSyncStore } from "../../store/syncStore";

const LAST_SYNC_KEY = "last_sync_time";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DocumentsRepo = ReturnType<typeof getDocumentsRepo>;

type SupabaseDoc = Awaited<ReturnType<typeof fetchDocumentsUpdatedSince>>[number];
type SupabaseBody = Awaited<ReturnType<typeof fetchDocumentBodiesByIds>>[number];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function buildLocalDoc(doc: SupabaseDoc, bodyContent: string | null) {
  const createdAt = parseIsoTimestamp(doc.created_at, Date.now());
  const updatedAt = parseIsoTimestamp(doc.updated_at, createdAt ?? Date.now());
  return {
    id: doc.id,
    type: doc.type,
    subtype: doc.subtype ?? null,
    title: doc.title ?? null,
    body: bodyContent ?? "",
    meta: {
      ...(doc.frontmatter ?? {}),
      status: doc.status ?? "active",
      tags: Array.isArray(doc.frontmatter?.tags) ? doc.frontmatter.tags : [],
      subtype: doc.subtype ?? null,
      frontmatter: doc.frontmatter ?? {},
    },
    status: doc.status ?? "active",
    frontmatter: doc.frontmatter ?? {},
    version: typeof doc.version === "number" ? doc.version : 1,
    created_at: doc.created_at ?? null,
    updated_at: doc.updated_at ?? null,
    createdAt,
    updatedAt,
    deletedAt: doc.deleted_at ? parseIsoTimestamp(doc.deleted_at, Date.now()) : null,
    archivedAt: doc.status === "archived" ? updatedAt : null,
    inboxAt: null,
    clientId: doc.client_id ?? null,
    syncedAt: new Date().toISOString(),
  };
}

export async function performInitialSync() {
  const store = useSyncStore.getState();
  store.setStatus(SYNC_STATUS.SYNCING);
  store.clearError();
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) {
      store.setStatus(SYNC_STATUS.SYNCED);
      return;
    }
    const lastSyncTime =
      (typeof window !== "undefined" && window.localStorage.getItem(LAST_SYNC_KEY)) ||
      "1970-01-01";

    const userId = await getUserId();
    const repo = getDocumentsRepo();

    await syncDocuments(lastSyncTime, repo);
    await syncDocumentBodies(lastSyncTime, repo);
    await pushUnsyncedDocuments(repo, userId);
    await pushUnsyncedBodies(userId);

    const nowIso = new Date().toISOString();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_SYNC_KEY, nowIso);
    }
    await setSyncMeta("lastSyncedAt", nowIso);
    store.setLastSyncedAt(nowIso);
    store.setLastSuccessfulSyncAt(nowIso);
    store.setStatus(SYNC_STATUS.SYNCED);
  } catch (error) {
    store.setStatus(SYNC_STATUS.ERROR);
    store.setLastError(error?.message || "Initial sync failed", {
      message: error?.message || "Initial sync failed",
      details: error?.details ?? null,
      hint: error?.hint ?? null,
      code: error?.code ?? null,
      stack: error?.stack ?? null,
    });
    throw error;
  }
}

export function resetLastSyncTime() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LAST_SYNC_KEY);
  }
  const store = useSyncStore.getState();
  store.setLastSyncedAt(null);
  store.setLastSuccessfulSyncAt(null);
  return setSyncMeta("lastSyncedAt", null);
}

async function syncDocuments(lastSyncTime: string, repo: DocumentsRepo) {
  const remoteDocs = await fetchDocumentsUpdatedSince({ since: lastSyncTime });
  if (!remoteDocs || remoteDocs.length === 0) return;

  const ids = remoteDocs.map((doc) => doc.id).filter((id) => isUuid(id));
  const bodies = await fetchDocumentBodiesByIds(ids);
  const bodiesById = new Map(
    bodies.map((body) => [body.document_id, body.content])
  );

  for (const remoteDoc of remoteDocs) {
    if (!isUuid(remoteDoc.id)) continue;
    const bodyContent = bodiesById.get(remoteDoc.id) ?? "";
    const localDoc = await repo.get(remoteDoc.id);
    const remoteUpdated = ensureIsoTimestamp(remoteDoc.updated_at, null);
    const remoteUpdatedMs = parseIsoTimestamp(remoteUpdated, 0);
    if (!localDoc) {
      await repo.bulkUpsert([buildLocalDoc(remoteDoc, bodyContent)]);
      continue;
    }

    const localDirty = localDoc.syncedAt == null;
    if (localDirty) {
      await createConflictCopy({
        document: localDoc,
        reason: "server-newer",
      });
      await repo.bulkUpsert([buildLocalDoc(remoteDoc, bodyContent)]);
      continue;
    }

    if (remoteUpdatedMs > 0) {
      await repo.bulkUpsert([buildLocalDoc(remoteDoc, bodyContent)]);
    }
  }
}

async function syncDocumentBodies(lastSyncTime: string, repo: DocumentsRepo) {
  const remoteDocs = await fetchDocumentsUpdatedSince({ since: lastSyncTime });
  if (!remoteDocs || remoteDocs.length === 0) return;
  const docIds = remoteDocs.map((doc) => doc.id).filter((id) => isUuid(id));

  const remoteBodies = await fetchDocumentBodiesByIds(docIds);
  if (!remoteBodies || remoteBodies.length === 0) return;

  for (const remoteBody of remoteBodies as SupabaseBody[]) {
    const localBody = await getDocumentBody(remoteBody.document_id);
    const existingDoc = await repo.get(remoteBody.document_id);
    if (!localBody) {
      await upsertLocalDocumentBody(remoteBody.document_id, remoteBody.content, {
        updated_at: remoteBody.updated_at,
      });
      continue;
    }
    const remoteUpdatedAt = parseIsoTimestamp(remoteBody.updated_at, 0);
    if (localBody.syncedAt == null) {
      if (existingDoc) {
        await createConflictCopy({
          document: {
            ...existingDoc,
            body: localBody.content,
          },
          reason: "body-conflict",
        });
        await upsertLocalDocumentBody(remoteBody.document_id, remoteBody.content, {
          updated_at: remoteBody.updated_at,
        });
      }
      continue;
    }
    if (remoteUpdatedAt > 0) {
      await upsertLocalDocumentBody(remoteBody.document_id, remoteBody.content, {
        updated_at: remoteBody.updated_at,
      });
    }
  }
}

async function pushUnsyncedDocuments(repo: DocumentsRepo, userId: string) {
  const documents = await repo.list({ includeArchived: true, includeTrashed: true, limit: 1000 });
  const fullDocs = await Promise.all(documents.map((doc) => repo.get(doc.id)));
  for (const doc of fullDocs) {
    if (!doc || doc.syncedAt != null) continue;
    if (!isUuid(doc.id)) continue;
    const remoteDoc = await fetchDocumentById(doc.id);
    if (remoteDoc) {
      const remoteBody = await fetchDocumentBody(doc.id);
      await createConflictCopy({
        document: {
          ...doc,
          body: doc.body ?? "",
        },
        reason: "server-newer",
      });
      await repo.bulkUpsert([buildLocalDoc(remoteDoc, remoteBody?.content ?? "")]);
      continue;
    }
    await upsertDocument({
      id: doc.id,
      type: doc.type,
      subtype: doc.subtype ?? null,
      title: doc.title ?? null,
      status: doc.status ?? "active",
      frontmatter: doc.frontmatter ?? doc.meta ?? {},
      created_at: ensureIsoTimestamp(doc.createdAt ?? doc.created_at),
      updated_at: ensureIsoTimestamp(doc.updatedAt ?? doc.updated_at),
      deleted_at: doc.deletedAt ? ensureIsoTimestamp(doc.deletedAt) : null,
      version: typeof doc.version === "number" ? doc.version : 1,
      user_id: userId,
      client_id: doc.clientId ?? null,
      synced_at: new Date().toISOString(),
    });
  }
}

async function pushUnsyncedBodies(userId: string) {
  const localBodies = await listDocumentBodies();
  if (!localBodies || localBodies.length === 0) return;

  for (const body of localBodies) {
    if (body.syncedAt != null) continue;
    if (!isUuid(body.documentId)) continue;
    const remoteBody = await fetchDocumentBody(body.documentId);
    if (remoteBody) {
      const repo = getDocumentsRepo();
      const doc = await repo.get(body.documentId);
      if (doc) {
        await createConflictCopy({
          document: {
            ...doc,
            body: body.content,
          },
          reason: "body-conflict",
        });
      }
      await upsertLocalDocumentBody(body.documentId, remoteBody.content, {
        updated_at: remoteBody.updated_at,
      });
      continue;
    }
    const remoteDoc = await fetchDocumentById(body.documentId);
    if (!remoteDoc) {
      const repo = getDocumentsRepo();
      const doc = await repo.get(body.documentId);
      if (doc) {
        await upsertDocument({
          id: doc.id,
          type: doc.type,
          subtype: doc.subtype ?? null,
          title: doc.title ?? null,
          status: doc.status ?? "active",
          frontmatter: doc.frontmatter ?? doc.meta ?? {},
          created_at: ensureIsoTimestamp(doc.createdAt ?? doc.created_at),
          updated_at: ensureIsoTimestamp(doc.updatedAt ?? doc.updated_at),
          deleted_at: doc.deletedAt ? ensureIsoTimestamp(doc.deletedAt) : null,
          version: typeof doc.version === "number" ? doc.version : 1,
          user_id: userId,
          client_id: doc.clientId ?? null,
          synced_at: new Date().toISOString(),
        });
      }
      continue;
    }
    await upsertDocumentBody({
      document_id: body.documentId,
      content: body.content,
      updated_at: ensureIsoTimestamp(body.updatedAt ?? body.updated_at),
      client_id: body.clientId ?? null,
      synced_at: new Date().toISOString(),
    });
  }
}
