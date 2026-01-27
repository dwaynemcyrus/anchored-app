import { getDocumentsRepo } from "../repo/getDocumentsRepo";
import { DOCUMENTS_STORE, openAnchoredDb } from "../db/indexedDb";

function resolveTags(document) {
  const metaTags = Array.isArray(document?.meta?.tags) ? document.meta.tags : [];
  const tags = Array.isArray(document?.tags) ? document.tags : metaTags;
  return Array.isArray(tags) ? tags : [];
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

function resolveFrontmatter(document, reason) {
  const base =
    document?.frontmatter ??
    document?.meta?.frontmatter ??
    document?.meta ??
    {};
  const now = new Date().toISOString();
  return {
    ...base,
    conflictOf: document?.id ?? null,
    conflictAt: now,
    conflictReason: reason,
  };
}

function buildConflictMeta(document, reason) {
  const tags = resolveTags(document);
  const uniqueTags = Array.from(new Set([...tags, "conflict"]))
    .filter(Boolean);
  const frontmatter = resolveFrontmatter(document, reason);
  return {
    ...(document?.meta ?? {}),
    tags: uniqueTags,
    status: resolveStatus(document),
    subtype: resolveSubtype(document),
    frontmatter,
  };
}

export async function createConflictCopy({ document, reason }) {
  if (!document || typeof document !== "object") {
    throw new Error("Document is required to create a conflict copy");
  }
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("Conflict reason is required");
  }

  const repo = getDocumentsRepo();
  const meta = buildConflictMeta(document, reason);
  const conflictTitle = `${document.title ?? "Untitled"} (Conflict copy)`;

  const created = await repo.create({
    type: document.type,
    title: conflictTitle,
    body: document.body ?? "",
    meta,
    archivedAt: document.archivedAt ?? null,
    inboxAt: document.inboxAt ?? null,
  });

  try {
    const db = await openAnchoredDb();
    const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
    const store = transaction.objectStore(DOCUMENTS_STORE);
    const getRequest = store.get(created.id);
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) return;
      store.put({
        ...existing,
        is_conflict: true,
        original_id: document.id ?? null,
      });
    };
  } catch (error) {
    console.error("Failed to annotate conflict copy", error);
  }

  return created;
}
