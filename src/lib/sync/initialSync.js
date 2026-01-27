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
  upsertDocument,
  upsertDocumentBody,
} from "../supabase/documents";
import { getUserId } from "../supabase/client";
import { ensureIsoTimestamp, parseIsoTimestamp } from "../utils/timestamps";
import { createConflictCopy } from "./conflictCopy";

const LAST_SYNC_KEY = "last_sync_time";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function buildLocalDoc(doc, bodyContent) {
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
}

async function syncDocuments(lastSyncTime, repo) {
  const remoteDocs = await fetchDocumentsUpdatedSince({ since: lastSyncTime });
  if (!remoteDocs || remoteDocs.length === 0) return;

  const ids = remoteDocs.map((doc) => doc.id);
  const bodies = await fetchDocumentBodiesByIds(ids);
  const bodiesById = new Map(
    bodies.map((body) => [body.document_id, body.content])
  );

  for (const remoteDoc of remoteDocs) {
    const bodyContent = bodiesById.get(remoteDoc.id) ?? "";
    const localDoc = await repo.get(remoteDoc.id);
    const remoteUpdated = ensureIsoTimestamp(remoteDoc.updated_at, null);
    const remoteUpdatedMs = parseIsoTimestamp(remoteUpdated, 0);
    if (!localDoc) {
      await repo.bulkUpsert([buildLocalDoc(remoteDoc, bodyContent)]);
      continue;
    }

    const localUpdatedAt = parseIsoTimestamp(localDoc.updated_at, localDoc.updatedAt);
    const localDirty = localDoc.syncedAt == null;
    if (localDirty && remoteUpdatedMs > (localUpdatedAt ?? 0)) {
      await createConflictCopy({
        document: localDoc,
        reason: "server-newer",
      });
      await repo.bulkUpsert([buildLocalDoc(remoteDoc, bodyContent)]);
      continue;
    }

    if (!localDirty && remoteUpdatedMs > (localUpdatedAt ?? 0)) {
      await repo.bulkUpsert([buildLocalDoc(remoteDoc, bodyContent)]);
    }
  }
}

async function syncDocumentBodies(lastSyncTime, repo) {
  const remoteDocs = await fetchDocumentsUpdatedSince({ since: lastSyncTime });
  if (!remoteDocs || remoteDocs.length === 0) return;
  const docIds = remoteDocs.map((doc) => doc.id);

  const remoteBodies = await fetchDocumentBodiesByIds(docIds);
  if (!remoteBodies || remoteBodies.length === 0) return;

  for (const remoteBody of remoteBodies) {
    const localBody = await getDocumentBody(remoteBody.document_id);
    const existingDoc = await repo.get(remoteBody.document_id);
    if (!localBody) {
      await upsertLocalDocumentBody(remoteBody.document_id, remoteBody.content, {
        updated_at: remoteBody.updated_at,
      });
      continue;
    }
    const localUpdatedAt = parseIsoTimestamp(
      localBody.updated_at,
      localBody.updatedAt
    );
    const remoteUpdatedAt = parseIsoTimestamp(remoteBody.updated_at, 0);
    if (localBody.syncedAt == null && remoteUpdatedAt > (localUpdatedAt ?? 0)) {
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
    if (remoteUpdatedAt > (localUpdatedAt ?? 0)) {
      await upsertLocalDocumentBody(remoteBody.document_id, remoteBody.content, {
        updated_at: remoteBody.updated_at,
      });
    }
  }
}

async function pushUnsyncedDocuments(repo, userId) {
  const documents = await repo.list({ includeArchived: true, includeTrashed: true, limit: 1000 });
  const fullDocs = await Promise.all(documents.map((doc) => repo.get(doc.id)));
  for (const doc of fullDocs) {
    if (!doc || doc.syncedAt != null) continue;
    if (!isUuid(doc.id)) continue;
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
      owner_id: userId,
      user_id: userId,
      client_id: doc.clientId ?? null,
      synced_at: new Date().toISOString(),
    });
  }
}

async function pushUnsyncedBodies(userId) {
  const localBodies = await listDocumentBodies();
  if (!localBodies || localBodies.length === 0) return;

  for (const body of localBodies) {
    if (body.syncedAt != null) continue;
    if (!isUuid(body.documentId)) continue;
    await upsertDocumentBody({
      document_id: body.documentId,
      content: body.content,
      updated_at: ensureIsoTimestamp(body.updatedAt ?? body.updated_at),
      owner_id: userId,
      client_id: body.clientId ?? null,
      synced_at: new Date().toISOString(),
    });
  }
}
