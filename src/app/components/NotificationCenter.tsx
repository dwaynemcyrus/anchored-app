import { useEffect, useRef } from "react";

import {
  NOTIFICATION_RETENTION_DAYS,
  type NotificationHistoryEntry,
  type NotificationKind,
} from "../notificationHistory";

type NotificationCenterProps = {
  entries: NotificationHistoryEntry[];
  onClearResolved: () => void;
  onClose: () => void;
  onDelete: (entryId: string) => void;
  onResolve: (entryId: string) => void;
};

const KIND_LABELS: Record<NotificationKind, string> = {
  conflict: "Conflict",
  error: "Error",
  identity: "Identity",
  link: "Link",
  rename: "Rename",
  trash: "Trash",
  vault: "Vault",
};

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function activeEntry(entry: NotificationHistoryEntry): boolean {
  return entry.requiresAction && entry.resolvedAt === undefined;
}

export function NotificationCenter({
  entries,
  onClearResolved,
  onClose,
  onDelete,
  onResolve,
}: NotificationCenterProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const canClear = entries.some((entry) => !activeEntry(entry));

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  return (
    <aside
      aria-label="Notification history"
      className="notification-center"
      role="dialog"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className="notification-center__header">
        <div>
          <h2>Notifications</h2>
          <p>
            Last {NOTIFICATION_RETENTION_DAYS} days. Active conflicts remain
            until resolved.
          </p>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Close notification history"
          className="notification-center__close"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      {entries.length > 0 ? (
        <ol className="notification-center__list">
          {entries.map((entry) => {
            const isActive = activeEntry(entry);
            return (
              <li className="notification-record" key={entry.id}>
                <div className="notification-record__meta">
                  <span>{KIND_LABELS[entry.kind]}</span>
                  <time dateTime={new Date(entry.updatedAt).toISOString()}>
                    {formatTimestamp(entry.updatedAt)}
                  </time>
                </div>
                <p>{entry.message}</p>
                <div className="notification-record__actions">
                  {entry.count > 1 ? (
                    <span>Repeated {entry.count} times</span>
                  ) : (
                    <span>{isActive ? "Needs attention" : "Recorded"}</span>
                  )}
                  {isActive ? (
                    <button
                      aria-label={`Mark notification resolved: ${entry.message}`}
                      type="button"
                      onClick={() => onResolve(entry.id)}
                    >
                      Mark resolved
                    </button>
                  ) : (
                    <button
                      aria-label={`Delete notification: ${entry.message}`}
                      type="button"
                      onClick={() => onDelete(entry.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="notification-center__empty">No notifications yet.</p>
      )}
      <footer className="notification-center__footer">
        <button disabled={!canClear} type="button" onClick={onClearResolved}>
          Clear resolved
        </button>
      </footer>
    </aside>
  );
}
