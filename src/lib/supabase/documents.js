import { getSupabaseClient, getUserId } from "./client";

const DOCUMENTS_TABLE = "documents";
const BODIES_TABLE = "document_bodies";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function filterUuidList(values = []) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === "string" && UUID_PATTERN.test(value));
}

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
  const userId = await getAuthedUserId();
  let query = client
    .from(DOCUMENTS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true });

  const sinceIso = toIsoTimestamp(since);
  if (sinceIso) {
    query = query.gt("updated_at", sinceIso);
  }
  if (limit) {
    query = query.limit(limit);
  }

  const response = await query;
  const data = unwrapResponse(response);
  return Array.isArray(data) ? data.filter((doc) => UUID_PATTERN.test(doc.id)) : data;
}

export async function fetchDocumentById(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Document id is required");
  }
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  const client = getSupabaseClient();
  const userId = await getAuthedUserId();
  const response = await client
    .from(DOCUMENTS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  return unwrapResponse(response);
}

export async function fetchDocumentBodiesByIds(documentIds = []) {
  const filteredIds = filterUuidList(documentIds);
  if (filteredIds.length === 0) {
    return [];
  }
  const client = getSupabaseClient();
  const response = await client
    .from(BODIES_TABLE)
    .select("*")
    .in("document_id", filteredIds);

  return unwrapResponse(response);
}

export async function fetchDocumentBodiesUpdatedSince({ since, limit = 500 } = {}) {
  const client = getSupabaseClient();
  let query = client.from(BODIES_TABLE).select("*").order("updated_at", {
    ascending: true,
  });

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

export async function fetchDocumentBody(documentId) {
  if (typeof documentId !== "string" || !documentId.trim()) {
    throw new Error("Document id is required");
  }
  if (!UUID_PATTERN.test(documentId)) {
    return null;
  }
  const client = getSupabaseClient();
  const response = await client
    .from(BODIES_TABLE)
    .select("*")
    .eq("document_id", documentId)
    .maybeSingle();

  return unwrapResponse(response);
}

export async function insertDocument(document) {
  const client = getSupabaseClient();
  const userId = document.user_id ?? (await getAuthedUserId());
  const response = await client
    .from(DOCUMENTS_TABLE)
    .insert({
      version: 1,
      ...document,
      user_id: userId,
    })
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function updateDocument(id, updates) {
  const client = getSupabaseClient();
  const userId = await getAuthedUserId();
  const response = await client
    .from(DOCUMENTS_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function updateDocumentWithVersion(id, updates, expectedVersion) {
  if (typeof expectedVersion !== "number") {
    throw new Error("Expected version is required");
  }
  const client = getSupabaseClient();
  const userId = await getAuthedUserId();
  const response = await client
    .from(DOCUMENTS_TABLE)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
      version: expectedVersion + 1,
    })
    .eq("id", id)
    .eq("user_id", userId)
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
  const response = await client
    .from(BODIES_TABLE)
    .insert({ document_id: documentId, content })
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function updateDocumentBody(documentId, content) {
  const client = getSupabaseClient();
  const response = await client
    .from(BODIES_TABLE)
    .update({ content, updated_at: new Date().toISOString() })
    .eq("document_id", documentId)
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function upsertDocument(document) {
  if (!document?.id || !UUID_PATTERN.test(document.id)) {
    throw new Error("Document id must be a UUID");
  }
  const client = getSupabaseClient();
  const userId = document.user_id ?? (await getAuthedUserId());
  const response = await client
    .from(DOCUMENTS_TABLE)
    .upsert({ ...document, user_id: userId }, { onConflict: "id" })
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function upsertDocumentBody(body) {
  if (!body || typeof body.document_id !== "string") {
    throw new Error("Document body with document_id is required");
  }
  if (!UUID_PATTERN.test(body.document_id)) {
    throw new Error("Document body document_id must be a UUID");
  }
  const client = getSupabaseClient();
  const response = await client
    .from(BODIES_TABLE)
    .upsert({ ...body }, { onConflict: "document_id" })
    .select("*")
    .single();

  return unwrapResponse(response);
}
