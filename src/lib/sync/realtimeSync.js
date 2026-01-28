import { getSupabaseClient, getUserId } from "../supabase/client";
import { fetchDocumentBody } from "../supabase/documents";
import { getDocumentsRepo } from "../repo/getDocumentsRepo";
import { getClientId } from "../clientId";
import { parseIsoTimestamp } from "../utils/timestamps";
import { upsertDocumentBody } from "../db/documentBodies";

const CLIENT_ID = getClientId();
const channels = [];

function buildLocalDoc(remoteDoc, bodyContent) {
  const createdAt = parseIsoTimestamp(remoteDoc.created_at, Date.now());
  const updatedAt = parseIsoTimestamp(remoteDoc.updated_at, createdAt ?? Date.now());
  return {
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
    createdAt,
    updatedAt,
    deletedAt: remoteDoc.deleted_at ? parseIsoTimestamp(remoteDoc.deleted_at, Date.now()) : null,
    archivedAt: remoteDoc.status === "archived" ? updatedAt : null,
    inboxAt: null,
    clientId: remoteDoc.client_id ?? null,
    syncedAt: new Date().toISOString(),
  };
}

export async function setupRealtimeSync() {
  try {
    const userId = await getUserId();
    const supabase = getSupabaseClient();

    const documentsChannel = supabase
      .channel("documents-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documents",
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => handleDocumentChange(payload)
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") {
          console.warn("Realtime documents channel status", status);
        }
      });

    channels.push(documentsChannel);

    const bodiesChannel = supabase
      .channel("document-bodies-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "document_bodies",
        },
        (payload) => handleBodyChange(payload)
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") {
          console.warn("Realtime bodies channel status", status);
        }
      });

    channels.push(bodiesChannel);
  } catch (error) {
    console.warn("Realtime setup failed; falling back to polling.", error);
  }
}

async function handleDocumentChange(payload) {
  if (payload.new?.client_id === CLIENT_ID) return;
  const { eventType, new: newRecord, old: oldRecord } = payload;
  const repo = getDocumentsRepo();

  if (eventType === "DELETE") {
    await repo.delete(oldRecord.id);
    notifyRecordDeleted("document", oldRecord.id);
    return;
  }

  if (eventType === "INSERT" || eventType === "UPDATE") {
    const body = await fetchDocumentBody(newRecord.id);
    await repo.bulkUpsert([buildLocalDoc(newRecord, body?.content ?? "")]);
    notifyRecordUpdated("document", newRecord.id);
  }
}

async function handleBodyChange(payload) {
  if (payload.new?.client_id === CLIENT_ID) return;
  const { eventType, new: newRecord, old: oldRecord } = payload;
  const repo = getDocumentsRepo();

  if (eventType === "DELETE") {
    notifyRecordDeleted("body", oldRecord.document_id);
    return;
  }

  if (eventType === "INSERT" || eventType === "UPDATE") {
    await upsertDocumentBody(newRecord.document_id, newRecord.content, {
      updated_at: newRecord.updated_at,
    });
    notifyRecordUpdated("body", newRecord.document_id);
  }
}

export async function cleanupRealtimeSync() {
  const supabase = getSupabaseClient();
  for (const channel of channels) {
    await supabase.removeChannel(channel);
  }
  channels.length = 0;
}

function notifyRecordUpdated(type, recordId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("record-updated", {
      detail: { type, recordId },
    })
  );
}

function notifyRecordDeleted(type, recordId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("record-deleted", {
      detail: { type, recordId },
    })
  );
}
