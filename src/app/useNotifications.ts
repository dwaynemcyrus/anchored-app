import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import {
  clearResolvedNotifications,
  GENERAL_NOTIFICATION_SCOPE,
  loadNotificationHistory,
  recordNotification,
  resolveNotification,
  resolveNotifications,
  saveNotificationHistory,
  type NewNotificationHistoryEntry,
  type NotificationHistoryEntry,
} from "./notificationHistory";

const MINOR_NOTICE_DURATION_MS = 12_000;

type VaultNotice = {
  id: number;
  persistent: boolean;
  text: string;
};

type VaultNoticeOptions = {
  history?: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">;
  persistent?: boolean;
};

type NotificationsDependencies = {
  vaultIdRef: RefObject<string>;
};

export type NotificationsApi = {
  addHistoryEntry: (
    message: string,
    input: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">,
  ) => void;
  addVaultNotice: (text: string, options?: VaultNoticeOptions) => void;
  clearResolvedHistory: () => void;
  deleteHistoryEntry: (entryId: string) => void;
  dismissVaultNotice: (id: number) => void;
  notificationHistory: NotificationHistoryEntry[];
  notificationHistoryVisible: boolean;
  reset: () => void;
  resolveHistoryEntry: (entryId: string) => void;
  resolveHistorySource: (sourceId: string) => void;
  setNotificationHistoryVisible: (visible: boolean) => void;
  vaultNotices: VaultNotice[];
};

/// Owns vault notice toasts and the persisted notification history: their
/// state, the auto-dismiss timers, the localStorage persistence effect, and
/// the mutations. Extracted from App.tsx following the useTrashPanel
/// pattern. `vaultIdRef` stays owned by App.tsx (used for unrelated
/// purposes elsewhere) and is passed in, not moved. The returned object is
/// memoized so callers that list it as a dependency do not recreate on
/// every render.
export function useNotifications({
  vaultIdRef,
}: NotificationsDependencies): NotificationsApi {
  const [vaultNotices, setVaultNotices] = useState<VaultNotice[]>([]);
  const [notificationHistoryVisible, setNotificationHistoryVisible] =
    useState(false);
  const [notificationHistory, setNotificationHistory] = useState(() => {
    try {
      return loadNotificationHistory(window.localStorage, Date.now());
    } catch {
      return [];
    }
  });
  const vaultNoticeIdRef = useRef(0);
  const vaultNoticeTimeoutsRef = useRef<Map<number, number>>(new Map());
  const notificationIdRef = useRef(0);

  const addHistoryEntry = useCallback(
    (
      message: string,
      input: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">,
    ) => {
      const now = Date.now();
      notificationIdRef.current += 1;
      setNotificationHistory((current) =>
        recordNotification(
          current,
          {
            ...input,
            id: `${now}-${notificationIdRef.current}`,
            message,
            scopeId: vaultIdRef.current || GENERAL_NOTIFICATION_SCOPE,
          },
          now,
        ),
      );
    },
    [vaultIdRef],
  );

  const resolveHistorySource = useCallback(
    (sourceId: string) => {
      setNotificationHistory((current) =>
        resolveNotifications(
          current,
          vaultIdRef.current || GENERAL_NOTIFICATION_SCOPE,
          sourceId,
          Date.now(),
        ),
      );
    },
    [vaultIdRef],
  );

  const addVaultNotice = useCallback(
    (text: string, options: VaultNoticeOptions = {}) => {
      vaultNoticeIdRef.current += 1;
      const notice = {
        id: vaultNoticeIdRef.current,
        persistent: options.persistent ?? false,
        text,
      };
      setVaultNotices((currentNotices) => {
        if (
          currentNotices.some((currentNotice) => currentNotice.text === text)
        ) {
          return currentNotices;
        }
        return [notice, ...currentNotices];
      });
      if (options.history) addHistoryEntry(text, options.history);
    },
    [addHistoryEntry],
  );

  const dismissVaultNotice = useCallback((id: number) => {
    setVaultNotices((currentNotices) =>
      currentNotices.filter((currentNotice) => currentNotice.id !== id),
    );
  }, []);

  const clearResolvedHistory = useCallback(() => {
    setNotificationHistory((current) =>
      clearResolvedNotifications(
        current,
        vaultIdRef.current || GENERAL_NOTIFICATION_SCOPE,
      ),
    );
  }, [vaultIdRef]);

  const deleteHistoryEntry = useCallback((entryId: string) => {
    setNotificationHistory((current) =>
      current.filter(
        (entry) =>
          entry.id !== entryId ||
          (entry.requiresAction && entry.resolvedAt === undefined),
      ),
    );
  }, []);

  const resolveHistoryEntry = useCallback(
    (entryId: string) => {
      setNotificationHistory((current) =>
        resolveNotification(
          current,
          vaultIdRef.current || GENERAL_NOTIFICATION_SCOPE,
          entryId,
          Date.now(),
        ),
      );
    },
    [vaultIdRef],
  );

  useEffect(() => {
    const activeNoticeIds = new Set(vaultNotices.map((notice) => notice.id));

    vaultNoticeTimeoutsRef.current.forEach((timeout, noticeId) => {
      if (!activeNoticeIds.has(noticeId)) {
        window.clearTimeout(timeout);
        vaultNoticeTimeoutsRef.current.delete(noticeId);
      }
    });

    vaultNotices.forEach((notice) => {
      if (notice.persistent || vaultNoticeTimeoutsRef.current.has(notice.id)) {
        return;
      }

      const timeout = window.setTimeout(() => {
        vaultNoticeTimeoutsRef.current.delete(notice.id);
        setVaultNotices((currentNotices) =>
          currentNotices.filter(
            (currentNotice) => currentNotice.id !== notice.id,
          ),
        );
      }, MINOR_NOTICE_DURATION_MS);
      vaultNoticeTimeoutsRef.current.set(notice.id, timeout);
    });
  }, [vaultNotices]);

  useEffect(
    () => () => {
      vaultNoticeTimeoutsRef.current.forEach((timeout) =>
        window.clearTimeout(timeout),
      );
      vaultNoticeTimeoutsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    try {
      saveNotificationHistory(
        window.localStorage,
        notificationHistory,
        Date.now(),
      );
    } catch {
      // Notification history is optional and must never block the editor.
    }
  }, [notificationHistory]);

  const reset = useCallback(() => {
    setVaultNotices([]);
    setNotificationHistoryVisible(false);
  }, []);

  return useMemo(
    () => ({
      addHistoryEntry,
      addVaultNotice,
      clearResolvedHistory,
      deleteHistoryEntry,
      dismissVaultNotice,
      notificationHistory,
      notificationHistoryVisible,
      reset,
      resolveHistoryEntry,
      resolveHistorySource,
      setNotificationHistoryVisible,
      vaultNotices,
    }),
    [
      addHistoryEntry,
      addVaultNotice,
      clearResolvedHistory,
      deleteHistoryEntry,
      dismissVaultNotice,
      notificationHistory,
      notificationHistoryVisible,
      reset,
      resolveHistoryEntry,
      resolveHistorySource,
      vaultNotices,
    ],
  );
}
