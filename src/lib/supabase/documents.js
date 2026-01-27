import { getSupabaseClient, getUserId } from "./client";

const DOCUMENTS_TABLE = "documents";
const BODIES_TABLE = "document_bodies";

function toIsoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") return value;
  throw new Error("Invalid timestamp value");
}

function unwrapResponse({ data, error }) {
  if (error) {
    throw error;
  }
  return data;
}

async function getAuthedUserId() {
  return getUserId();
}

export async function fetchDocumentsUpdatedSince({ since, limit = 500 } = {}) {
  const client = getSupabaseClient();
  const ownerId = await getAuthedUserId();
  let query = client
    .from(DOCUMENTS_TABLE)
    .select("*")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: true });

  const sinceIso = toIsoTimestamp(since);
  if (sinceIso) {
    query = query.gt("updated_at", sinceIso);
  }
  if (limit) {
    query = query.limit(limit);
  }

  const response = await query;
  return unwrapResponse(response);
}

export async function fetchDocumentById(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Document id is required");
  }
  const client = getSupabaseClient();
  const ownerId = await getAuthedUserId();
  const response = await client
    .from(DOCUMENTS_TABLE)
    .select("*")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle();

  return unwrapResponse(response);
}

export async function fetchDocumentBodiesByIds(documentIds = []) {
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return [];
  }
  const client = getSupabaseClient();
  const ownerId = await getAuthedUserId();
  const response = await client
    .from(BODIES_TABLE)
    .select("*")
    .eq("owner_id", ownerId)
    .in("document_id", documentIds);

  return unwrapResponse(response);
}

export async function fetchDocumentBody(documentId) {
  if (typeof documentId !== "string" || !documentId.trim()) {
    throw new Error("Document id is required");
  }
  const client = getSupabaseClient();
  const ownerId = await getAuthedUserId();
  const response = await client
    .from(BODIES_TABLE)
    .select("*")
    .eq("owner_id", ownerId)
    .eq("document_id", documentId)
    .maybeSingle();

  return unwrapResponse(response);
}

export async function insertDocument(document) {
  const client = getSupabaseClient();
  const ownerId = document.owner_id ?? (await getAuthedUserId());
  const response = await client
    .from(DOCUMENTS_TABLE)
    .insert({
      version: 1,
      ...document,
      owner_id: ownerId,
      user_id: document.user_id ?? ownerId,
    })
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function updateDocument(id, updates) {
  const client = getSupabaseClient();
  const ownerId = await getAuthedUserId();
  const response = await client
    .from(DOCUMENTS_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function updateDocumentWithVersion(id, updates, expectedVersion) {
  if (typeof expectedVersion !== "number") {
    throw new Error("Expected version is required");
  }
  const client = getSupabaseClient();
  const ownerId = await getAuthedUserId();
  const response = await client
    .from(DOCUMENTS_TABLE)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
      version: expectedVersion + 1,
    })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .eq("version", expectedVersion)
    .select("*")
    .maybeSingle();

  return unwrapResponse(response);
}

export async function archiveDocument(id, expectedVersion) {
  return updateDocumentWithVersion(
    id,
    { status: "archived", deleted_at: null },
    expectedVersion
  );
}

export async function unarchiveDocument(id, expectedVersion) {
  return updateDocumentWithVersion(
    id,
    { status: "active", deleted_at: null },
    expectedVersion
  );
}

export async function trashDocument(id, expectedVersion) {
  return updateDocumentWithVersion(
    id,
    { status: "trash", deleted_at: new Date().toISOString() },
    expectedVersion
  );
}

export async function insertDocumentBody(documentId, content) {
  const client = getSupabaseClient();
  const ownerId = await getAuthedUserId();
  const response = await client
    .from(BODIES_TABLE)
    .insert({ document_id: documentId, content, owner_id: ownerId })
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function updateDocumentBody(documentId, content) {
  const client = getSupabaseClient();
  const ownerId = await getAuthedUserId();
  const response = await client
    .from(BODIES_TABLE)
    .update({ content, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("document_id", documentId)
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function upsertDocument(document) {
  const client = getSupabaseClient();
  const ownerId = document.owner_id ?? (await getAuthedUserId());
  const response = await client
    .from(DOCUMENTS_TABLE)
    .upsert(
      { ...document, owner_id: ownerId, user_id: document.user_id ?? ownerId },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function upsertDocumentBody(body) {
  if (!body || typeof body.document_id !== "string") {
    throw new Error("Document body with document_id is required");
  }
  const client = getSupabaseClient();
  const ownerId = body.owner_id ?? (await getAuthedUserId());
  const response = await client
    .from(BODIES_TABLE)
    .upsert({ ...body, owner_id: ownerId }, { onConflict: "document_id" })
    .select("*")
    .single();

  return unwrapResponse(response);
}
