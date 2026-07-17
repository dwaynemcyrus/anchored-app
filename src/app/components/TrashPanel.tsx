import { useEffect, useRef } from "react";

import type { TrashEntry } from "../../lib/tauri/vault";

type TrashPanelProps = {
  entries: TrashEntry[];
  error?: string;
  loading: boolean;
  restoringId?: string;
  onClose: () => void;
  onRestore: (entry: TrashEntry) => void;
};

function formatTrashedAt(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function TrashPanel({
  entries,
  error,
  loading,
  restoringId,
  onClose,
  onRestore,
}: TrashPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  return (
    <aside
      aria-label="Trash"
      className="continuity-panel"
      role="dialog"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className="continuity-panel__header">
        <div>
          <h2>Trash</h2>
          <p>Notes stay inside this vault and can be restored.</p>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Close Trash"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="continuity-panel__body">
        {loading ? (
          <p className="continuity-panel__empty">Loading Trash…</p>
        ) : null}
        {error ? (
          <p className="continuity-panel__error" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error && entries.length === 0 ? (
          <p className="continuity-panel__empty">Trash is empty.</p>
        ) : null}
        {entries.length > 0 ? (
          <ol className="continuity-list">
            {entries.map((entry) => {
              const isRestoring = restoringId === entry.id;
              return (
                <li className="continuity-record" key={entry.id}>
                  <div className="continuity-record__copy">
                    <strong>{entry.name}</strong>
                    <span>{entry.originalPath}</span>
                    <time dateTime={new Date(entry.trashedAt).toISOString()}>
                      Trashed {formatTrashedAt(entry.trashedAt)}
                    </time>
                  </div>
                  <div className="continuity-record__actions">
                    <button
                      disabled={restoringId !== undefined}
                      type="button"
                      onClick={() => onRestore(entry)}
                    >
                      {isRestoring ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </aside>
  );
}
