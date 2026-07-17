import type { AnchoredDocument } from "./documents";
import type { DocumentActivity } from "./linkCandidates";

const STORAGE_KEY = "anchored.document-activity.v1";
const STORAGE_VERSION = 1;
const MAX_STORED_DOCUMENTS = 500;

type ActivityStorage = Pick<Storage, "getItem" | "setItem">;

type StoredActivity = DocumentActivity & {
  documentId: string;
};

function persistentDocumentId(documentId: string): boolean {
  return documentId.startsWith("vault-id:");
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseStoredActivity(value: unknown): StoredActivity | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<StoredActivity>;
  if (
    typeof entry.documentId !== "string" ||
    !persistentDocumentId(entry.documentId) ||
    !validTimestamp(entry.firstSeenAt) ||
    !validTimestamp(entry.lastActiveAt)
  ) {
    return null;
  }
  return {
    documentId: entry.documentId,
    firstSeenAt: entry.firstSeenAt,
    lastActiveAt: entry.lastActiveAt,
  };
}

export function loadDocumentActivity(
  storage: ActivityStorage,
): Map<string, DocumentActivity> {
  const activity = new Map<string, DocumentActivity>();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return activity;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return activity;
    const payload = parsed as { entries?: unknown; version?: unknown };
    if (
      payload.version !== STORAGE_VERSION ||
      !Array.isArray(payload.entries)
    ) {
      return activity;
    }

    for (const value of payload.entries.slice(0, MAX_STORED_DOCUMENTS)) {
      const entry = parseStoredActivity(value);
      if (!entry) continue;
      const current = activity.get(entry.documentId);
      activity.set(entry.documentId, {
        firstSeenAt: Math.min(
          current?.firstSeenAt ?? entry.firstSeenAt,
          entry.firstSeenAt,
        ),
        lastActiveAt: Math.max(
          current?.lastActiveAt ?? entry.lastActiveAt,
          entry.lastActiveAt,
        ),
      });
    }
  } catch {
    return new Map();
  }
  return activity;
}

export function saveDocumentActivity(
  storage: ActivityStorage,
  activity: ReadonlyMap<string, DocumentActivity>,
): void {
  const entries = Array.from(activity, ([documentId, value]) => ({
    documentId,
    ...value,
  }))
    .filter(
      (entry) =>
        persistentDocumentId(entry.documentId) &&
        validTimestamp(entry.firstSeenAt) &&
        validTimestamp(entry.lastActiveAt),
    )
    .sort(
      (left, right) =>
        Math.max(right.firstSeenAt, right.lastActiveAt) -
        Math.max(left.firstSeenAt, left.lastActiveAt),
    )
    .slice(0, MAX_STORED_DOCUMENTS);
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ entries, version: STORAGE_VERSION }),
    );
  } catch {
    // Recent activity is optional; vault content never depends on this cache.
  }
}

export function registerFirstSeenDocuments(
  current: ReadonlyMap<string, DocumentActivity>,
  documents: AnchoredDocument[],
  now: number,
): Map<string, DocumentActivity> {
  const next = new Map(current);
  for (const document of documents) {
    if (!document.relativePath || next.has(document.id)) continue;
    next.set(document.id, { firstSeenAt: now, lastActiveAt: 0 });
  }
  return next;
}

export function reconcileDocumentActivity(
  current: ReadonlyMap<string, DocumentActivity>,
  documents: AnchoredDocument[],
  now: number,
): Map<string, DocumentActivity> {
  const currentDocumentIds = new Set(
    documents
      .filter((document) => document.relativePath)
      .map((document) => document.id),
  );
  const retained = new Map(
    Array.from(current).filter(([documentId]) =>
      currentDocumentIds.has(documentId),
    ),
  );

  return registerFirstSeenDocuments(retained, documents, now);
}

export function markDocumentActive(
  current: ReadonlyMap<string, DocumentActivity>,
  documentId: string,
  now: number,
): Map<string, DocumentActivity> {
  const next = new Map(current);
  const existing = next.get(documentId);
  next.set(documentId, {
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastActiveAt: Math.max(existing?.lastActiveAt ?? 0, now),
  });
  return next;
}
