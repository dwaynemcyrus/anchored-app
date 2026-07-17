export const NOTIFICATION_RETENTION_DAYS = 28;
export const GENERAL_NOTIFICATION_SCOPE = "general";

const STORAGE_KEY = "anchored.notification-history.v2";
const LEGACY_STORAGE_KEY = "anchored.notification-history.v1";
const STORAGE_VERSION = 2;
const LEGACY_STORAGE_VERSION = 1;
const RETENTION_MS = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
const DEDUPLICATION_WINDOW_MS = 5 * 60 * 1_000;
const MAX_ENTRIES_PER_SCOPE = 250;
const MAX_STORED_ENTRIES = 25_000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_SCOPE_LENGTH = 128;

type NotificationStorage = Pick<Storage, "getItem" | "setItem">;

export type NotificationKind =
  | "conflict"
  | "error"
  | "identity"
  | "link"
  | "rename"
  | "trash"
  | "vault";

export type NotificationHistoryEntry = {
  count: number;
  createdAt: number;
  id: string;
  kind: NotificationKind;
  message: string;
  requiresAction: boolean;
  resolvedAt?: number;
  scopeId: string;
  sourceId?: string;
  updatedAt: number;
};

export type NewNotificationHistoryEntry = Pick<
  NotificationHistoryEntry,
  "id" | "kind" | "message" | "scopeId"
> &
  Partial<Pick<NotificationHistoryEntry, "requiresAction" | "sourceId">>;

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validScope(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SCOPE_LENGTH
  );
}

function validKind(value: unknown): value is NotificationKind {
  return (
    value === "conflict" ||
    value === "error" ||
    value === "identity" ||
    value === "link" ||
    value === "rename" ||
    value === "trash" ||
    value === "vault"
  );
}

function parseEntry(
  value: unknown,
  fallbackScope?: string,
): NotificationHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<NotificationHistoryEntry>;
  const scopeId = entry.scopeId ?? fallbackScope;
  if (
    typeof entry.id !== "string" ||
    entry.id.length === 0 ||
    !validKind(entry.kind) ||
    typeof entry.message !== "string" ||
    entry.message.length === 0 ||
    entry.message.length > MAX_MESSAGE_LENGTH ||
    !validTimestamp(entry.createdAt) ||
    !validTimestamp(entry.updatedAt) ||
    !validScope(scopeId) ||
    typeof entry.requiresAction !== "boolean" ||
    typeof entry.count !== "number" ||
    !Number.isInteger(entry.count) ||
    entry.count < 1 ||
    (entry.resolvedAt !== undefined && !validTimestamp(entry.resolvedAt)) ||
    (entry.sourceId !== undefined && typeof entry.sourceId !== "string")
  ) {
    return null;
  }

  return {
    count: entry.count,
    createdAt: entry.createdAt,
    id: entry.id,
    kind: entry.kind,
    message: entry.message,
    requiresAction: entry.requiresAction,
    resolvedAt: entry.resolvedAt,
    scopeId,
    sourceId: entry.sourceId,
    updatedAt: entry.updatedAt,
  };
}

function keepEntry(entry: NotificationHistoryEntry, now: number): boolean {
  if (entry.requiresAction && entry.resolvedAt === undefined) return true;
  return now - (entry.resolvedAt ?? entry.updatedAt) <= RETENTION_MS;
}

export function pruneNotificationHistory(
  entries: readonly NotificationHistoryEntry[],
  now: number,
): NotificationHistoryEntry[] {
  const scopeCounts = new Map<string, number>();

  return entries
    .filter((entry) => keepEntry(entry, now))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter((entry) => {
      const count = scopeCounts.get(entry.scopeId) ?? 0;
      if (count >= MAX_ENTRIES_PER_SCOPE) return false;
      scopeCounts.set(entry.scopeId, count + 1);
      return true;
    });
}

function parseStoredEntries(
  raw: string | null,
  expectedVersion: number,
  now: number,
  fallbackScope?: string,
): NotificationHistoryEntry[] | null {
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as { entries?: unknown; version?: unknown };
  if (
    payload.version !== expectedVersion ||
    !Array.isArray(payload.entries)
  ) {
    return null;
  }

  return pruneNotificationHistory(
    payload.entries
      .slice(0, MAX_STORED_ENTRIES)
      .map((entry) => parseEntry(entry, fallbackScope))
      .filter((entry): entry is NotificationHistoryEntry => entry !== null),
    now,
  );
}

export function loadNotificationHistory(
  storage: NotificationStorage,
  now: number,
): NotificationHistoryEntry[] {
  try {
    const current = parseStoredEntries(
      storage.getItem(STORAGE_KEY),
      STORAGE_VERSION,
      now,
    );
    if (current) return current;

    return (
      parseStoredEntries(
        storage.getItem(LEGACY_STORAGE_KEY),
        LEGACY_STORAGE_VERSION,
        now,
        GENERAL_NOTIFICATION_SCOPE,
      ) ?? []
    );
  } catch {
    return [];
  }
}

export function saveNotificationHistory(
  storage: NotificationStorage,
  entries: readonly NotificationHistoryEntry[],
  now: number,
): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        entries: pruneNotificationHistory(entries, now),
        version: STORAGE_VERSION,
      }),
    );
  } catch {
    // Notification history is optional and must never block the editor.
  }
}

export function notificationHistoryForScope(
  entries: readonly NotificationHistoryEntry[],
  scopeId: string,
): NotificationHistoryEntry[] {
  return entries.filter((entry) => entry.scopeId === scopeId);
}

export function recordNotification(
  current: readonly NotificationHistoryEntry[],
  input: NewNotificationHistoryEntry,
  now: number,
): NotificationHistoryEntry[] {
  const duplicate = current.find(
    (entry) =>
      entry.scopeId === input.scopeId &&
      entry.kind === input.kind &&
      entry.message === input.message &&
      entry.sourceId === input.sourceId &&
      entry.requiresAction === (input.requiresAction ?? false) &&
      entry.resolvedAt === undefined &&
      ((input.requiresAction ?? false) ||
        now - entry.updatedAt <= DEDUPLICATION_WINDOW_MS),
  );

  if (duplicate) {
    return pruneNotificationHistory(
      current.map((entry) =>
        entry.id === duplicate.id
          ? { ...entry, count: entry.count + 1, updatedAt: now }
          : entry,
      ),
      now,
    );
  }

  return pruneNotificationHistory(
    [
      {
        count: 1,
        createdAt: now,
        id: input.id,
        kind: input.kind,
        message: input.message.slice(0, MAX_MESSAGE_LENGTH),
        requiresAction: input.requiresAction ?? false,
        scopeId: input.scopeId,
        sourceId: input.sourceId,
        updatedAt: now,
      },
      ...current,
    ],
    now,
  );
}

export function resolveNotifications(
  current: readonly NotificationHistoryEntry[],
  scopeId: string,
  sourceId: string,
  now: number,
): NotificationHistoryEntry[] {
  let changed = false;
  const next = current.map((entry) => {
    if (
      entry.scopeId !== scopeId ||
      entry.sourceId !== sourceId ||
      !entry.requiresAction ||
      entry.resolvedAt !== undefined
    ) {
      return entry;
    }
    changed = true;
    return { ...entry, resolvedAt: now, updatedAt: now };
  });
  return changed ? next : (current as NotificationHistoryEntry[]);
}

export function resolveNotification(
  current: readonly NotificationHistoryEntry[],
  scopeId: string,
  entryId: string,
  now: number,
): NotificationHistoryEntry[] {
  let changed = false;
  const next = current.map((entry) => {
    if (
      entry.scopeId !== scopeId ||
      entry.id !== entryId ||
      !entry.requiresAction ||
      entry.resolvedAt !== undefined
    ) {
      return entry;
    }
    changed = true;
    return { ...entry, resolvedAt: now, updatedAt: now };
  });
  return changed ? next : (current as NotificationHistoryEntry[]);
}

export function clearResolvedNotifications(
  current: readonly NotificationHistoryEntry[],
  scopeId: string,
): NotificationHistoryEntry[] {
  return current.filter(
    (entry) =>
      entry.scopeId !== scopeId ||
      (entry.requiresAction && entry.resolvedAt === undefined),
  );
}
