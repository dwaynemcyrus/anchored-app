import { describe, expect, it } from "vitest";

import {
  clearResolvedNotifications,
  GENERAL_NOTIFICATION_SCOPE,
  loadNotificationHistory,
  NOTIFICATION_RETENTION_DAYS,
  notificationHistoryForScope,
  pruneNotificationHistory,
  recordNotification,
  resolveNotification,
  resolveNotifications,
  saveNotificationHistory,
  type NotificationHistoryEntry,
} from "./notificationHistory";

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
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
    scopeId: "vault-one",
    updatedAt: 100,
    ...overrides,
  };
}

describe("notification history", () => {
  it("ignores malformed, obsolete, and expired stored entries", () => {
    const storage = new MemoryStorage();
    const now = (NOTIFICATION_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1_000;
    storage.setItem(
      "anchored.notification-history.v2",
      JSON.stringify({
        entries: [
          entry(),
          entry({ id: "kept", updatedAt: now - 1_000 }),
          { id: "invalid" },
        ],
        version: 2,
      }),
    );

    expect(loadNotificationHistory(storage, now).map(({ id }) => id)).toEqual([
      "kept",
    ]);
    storage.setItem(
      "anchored.notification-history.v2",
      JSON.stringify({ entries: [], version: 0 }),
    );
    expect(loadNotificationHistory(storage, now)).toEqual([]);
    storage.setItem("anchored.notification-history.v2", "not json");
    expect(loadNotificationHistory(storage, now)).toEqual([]);
  });

  it("migrates legacy entries into General without guessing a vault", () => {
    const storage = new MemoryStorage();
    const legacy: Partial<NotificationHistoryEntry> = { ...entry() };
    delete legacy.scopeId;
    storage.setItem(
      "anchored.notification-history.v1",
      JSON.stringify({ entries: [legacy], version: 1 }),
    );

    expect(loadNotificationHistory(storage, 100)).toEqual([
      expect.objectContaining({ scopeId: GENERAL_NOTIFICATION_SCOPE }),
    ]);
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
        resolveNotifications([conflict], "vault-one", "vault-id:one", 200),
        now,
      ),
    ).toEqual([]);
  });

  it("deduplicates only within the same vault", () => {
    const first = recordNotification(
      [],
      {
        id: "one",
        kind: "link",
        message: "A link is unresolved.",
        scopeId: "vault-one",
      },
      100,
    );
    const repeated = recordNotification(
      first,
      {
        id: "two",
        kind: "link",
        message: "A link is unresolved.",
        scopeId: "vault-one",
      },
      200,
    );
    const otherVault = recordNotification(
      repeated,
      {
        id: "three",
        kind: "link",
        message: "A link is unresolved.",
        scopeId: "vault-two",
      },
      300,
    );

    expect(notificationHistoryForScope(otherVault, "vault-one")).toEqual([
      expect.objectContaining({ count: 2, id: "one", updatedAt: 200 }),
    ]);
    expect(notificationHistoryForScope(otherVault, "vault-two")).toEqual([
      expect.objectContaining({ count: 1, id: "three" }),
    ]);
  });

  it("bounds each vault independently and survives unavailable storage", () => {
    const storage = new MemoryStorage();
    const entries = ["vault-one", "vault-two"].flatMap((scopeId) =>
      Array.from({ length: 300 }, (_, index) =>
        entry({ id: `${scopeId}-${index}`, scopeId, updatedAt: index }),
      ),
    );

    saveNotificationHistory(storage, entries, 300);
    const loaded = loadNotificationHistory(storage, 300);
    expect(notificationHistoryForScope(loaded, "vault-one")).toHaveLength(250);
    expect(notificationHistoryForScope(loaded, "vault-two")).toHaveLength(250);
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

  it("clears resolved records only in the selected vault", () => {
    const conflict = entry({
      id: "conflict",
      kind: "conflict",
      requiresAction: true,
    });
    const otherVault = entry({ id: "other", scopeId: "vault-two" });

    expect(
      clearResolvedNotifications(
        [
          entry(),
          conflict,
          { ...conflict, id: "resolved", resolvedAt: 200 },
          otherVault,
        ],
        "vault-one",
      ),
    ).toEqual([conflict, otherVault]);
  });

  it("resolves an active conflict only in the selected vault", () => {
    const conflict = entry({
      id: "conflict",
      kind: "conflict",
      requiresAction: true,
    });
    const sameIdElsewhere = { ...conflict, scopeId: "vault-two" };

    expect(
      resolveNotification(
        [conflict, sameIdElsewhere],
        "vault-one",
        "conflict",
        250,
      ),
    ).toEqual([
      { ...conflict, resolvedAt: 250, updatedAt: 250 },
      sameIdElsewhere,
    ]);
  });
});
