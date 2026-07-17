export const NOTIFICATION_RETENTION_DAYS = 28;

const STORAGE_KEY = "anchored.notification-history.v1";
const STORAGE_VERSION = 1;
const RETENTION_MS = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
const DEDUPLICATION_WINDOW_MS = 5 * 60 * 1_000;
const MAX_ENTRIES = 250;
const MAX_MESSAGE_LENGTH = 500;

type NotificationStorage = Pick<Storage, "getItem" | "setItem">;

export type NotificationKind =
  "conflict" | "error" | "identity" | "link" | "rename" | "vault";

export type NotificationHistoryEntry = {
  count: number;
  createdAt: number;
  id: string;
  kind: NotificationKind;
  message: string;
  requiresAction: boolean;
  resolvedAt?: number;
  sourceId?: string;
  updatedAt: number;
};

export type NewNotificationHistoryEntry = Pick<
  NotificationHistoryEntry,
  "id" | "kind" | "message"
> &
  Partial<Pick<NotificationHistoryEntry, "requiresAction" | "sourceId">>;

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validKind(value: unknown): value is NotificationKind {
  return (
    value === "conflict" ||
    value === "error" ||
    value === "identity" ||
    value === "link" ||
    value === "rename" ||
    value === "vault"
  );
}

function parseEntry(value: unknown): NotificationHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<NotificationHistoryEntry>;
  if (
    typeof entry.id !== "string" ||
    entry.id.length === 0 ||
    !validKind(entry.kind) ||
    typeof entry.message !== "string" ||
    entry.message.length === 0 ||
    entry.message.length > MAX_MESSAGE_LENGTH ||
    !validTimestamp(entry.createdAt) ||
    !validTimestamp(entry.updatedAt) ||
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
  return entries
    .filter((entry) => keepEntry(entry, now))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_ENTRIES);
}

export function loadNotificationHistory(
  storage: NotificationStorage,
  now: number,
): NotificationHistoryEntry[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const payload = parsed as { entries?: unknown; version?: unknown };
    if (
      payload.version !== STORAGE_VERSION ||
      !Array.isArray(payload.entries)
    ) {
      return [];
    }

    return pruneNotificationHistory(
      payload.entries
        .slice(0, MAX_ENTRIES)
        .map(parseEntry)
        .filter((entry): entry is NotificationHistoryEntry => entry !== null),
      now,
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

export function recordNotification(
  current: readonly NotificationHistoryEntry[],
  input: NewNotificationHistoryEntry,
  now: number,
): NotificationHistoryEntry[] {
  const duplicate = current.find(
    (entry) =>
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
  sourceId: string,
  now: number,
): NotificationHistoryEntry[] {
  let changed = false;
  const next = current.map((entry) => {
    if (
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
  entryId: string,
  now: number,
): NotificationHistoryEntry[] {
  let changed = false;
  const next = current.map((entry) => {
    if (
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
): NotificationHistoryEntry[] {
  return current.filter(
    (entry) => entry.requiresAction && entry.resolvedAt === undefined,
  );
}
