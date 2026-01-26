import { getSupabaseClient } from "./client";

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

export async function fetchDocumentsUpdatedSince({ since, limit = 500 } = {}) {
  const client = getSupabaseClient();
  let query = client
    .from(DOCUMENTS_TABLE)
    .select("*")
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

export async function fetchDocumentBodiesByIds(documentIds = []) {
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return [];
  }
  const client = getSupabaseClient();
  const response = await client
    .from(BODIES_TABLE)
    .select("*")
    .in("document_id", documentIds);

  return unwrapResponse(response);
}

export async function insertDocument(document) {
  const client = getSupabaseClient();
  const response = await client
    .from(DOCUMENTS_TABLE)
    .insert(document)
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function updateDocument(id, updates) {
  const client = getSupabaseClient();
  const response = await client
    .from(DOCUMENTS_TABLE)
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  return unwrapResponse(response);
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
    .update({ content })
    .eq("document_id", documentId)
    .select("*")
    .single();

  return unwrapResponse(response);
}
