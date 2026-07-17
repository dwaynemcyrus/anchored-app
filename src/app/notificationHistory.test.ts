import { describe, expect, it } from "vitest";

import {
  clearResolvedNotifications,
  loadNotificationHistory,
  NOTIFICATION_RETENTION_DAYS,
  pruneNotificationHistory,
  recordNotification,
  resolveNotifications,
  saveNotificationHistory,
  type NotificationHistoryEntry,
} from "./notificationHistory";

class MemoryStorage {
  value: string | null = null;

  getItem() {
    return this.value;
  }

  setItem(_key: string, value: string) {
    this.value = value;
  }
}

function entry(
  overrides: Partial<NotificationHistoryEntry> = {},
): NotificationHistoryEntry {
  return {
    count: 1,
    createdAt: 100,
    id: "notification-1",
    kind: "vault",
    message: "Vault opened.",
    requiresAction: false,
    updatedAt: 100,
    ...overrides,
  };
}

describe("notification history", () => {
  it("ignores malformed, obsolete, and expired stored entries", () => {
    const storage = new MemoryStorage();
    const now = (NOTIFICATION_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1_000;
    storage.value = JSON.stringify({
      entries: [
        entry(),
        entry({ id: "kept", updatedAt: now - 1_000 }),
        { id: "invalid" },
      ],
      version: 1,
    });

    expect(loadNotificationHistory(storage, now).map(({ id }) => id)).toEqual([
      "kept",
    ]);
    storage.value = JSON.stringify({ entries: [], version: 0 });
    expect(loadNotificationHistory(storage, now)).toEqual([]);
    storage.value = "not json";
    expect(loadNotificationHistory(storage, now)).toEqual([]);
  });

  it("keeps unresolved action entries beyond the retention period", () => {
    const now = (NOTIFICATION_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1_000;
    const conflict = entry({
      id: "conflict",
      kind: "conflict",
      requiresAction: true,
      sourceId: "vault-id:one",
    });

    expect(pruneNotificationHistory([conflict], now)).toEqual([conflict]);
    expect(
      pruneNotificationHistory(
        resolveNotifications([conflict], "vault-id:one", 200),
        now,
      ),
    ).toEqual([]);
  });

  it("deduplicates a repeated recent event and counts occurrences", () => {
    const first = recordNotification(
      [],
      { id: "one", kind: "link", message: "A link is unresolved." },
      100,
    );
    const repeated = recordNotification(
      first,
      { id: "two", kind: "link", message: "A link is unresolved." },
      200,
    );

    expect(repeated).toEqual([
      expect.objectContaining({ count: 2, id: "one", updatedAt: 200 }),
    ]);
  });

  it("bounds persisted history and survives unavailable storage", () => {
    const storage = new MemoryStorage();
    const entries = Array.from({ length: 300 }, (_, index) =>
      entry({ id: `event-${index}`, updatedAt: index }),
    );

    saveNotificationHistory(storage, entries, 300);
    expect(loadNotificationHistory(storage, 300)).toHaveLength(250);
    expect(() =>
      saveNotificationHistory(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("blocked");
          },
        },
        entries,
        300,
      ),
    ).not.toThrow();
    expect(
      loadNotificationHistory(
        {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => {},
        },
        300,
      ),
    ).toEqual([]);
  });

  it("clears ordinary and resolved entries but preserves active conflicts", () => {
    const conflict = entry({
      id: "conflict",
      kind: "conflict",
      requiresAction: true,
    });

    expect(
      clearResolvedNotifications([
        entry(),
        conflict,
        { ...conflict, id: "resolved", resolvedAt: 200 },
      ]),
    ).toEqual([conflict]);
  });
});
