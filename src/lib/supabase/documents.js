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

async function getAuthedUserId() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) {
    throw error;
  }
  const userId = data?.user?.id;
  if (!userId) {
    throw new Error("No authenticated user available for Supabase");
  }
  return userId;
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

export async function fetchDocumentById(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Document id is required");
  }
  const client = getSupabaseClient();
  const response = await client
    .from(DOCUMENTS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

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

export async function fetchDocumentBody(documentId) {
  if (typeof documentId !== "string" || !documentId.trim()) {
    throw new Error("Document id is required");
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
    .insert({ ...document, user_id: userId })
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
