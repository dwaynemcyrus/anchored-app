import { useRef } from "react";

import { useModalDialog } from "./useModalDialog";

type SettingsModalProps = {
  reloading: boolean;
  onClose: () => void;
  onReload: () => void;
};

export function SettingsModal({
  reloading,
  onClose,
  onReload,
}: SettingsModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: closeButtonRef,
    onClose,
  });

  return (
    <aside
      ref={dialogRef}
      aria-label="Settings"
      aria-modal="true"
      className="continuity-panel continuity-panel--compact"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <header className="continuity-panel__header">
        <div>
          <h2>Settings</h2>
          <p>Danger options for the current Anchored window.</p>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Close settings"
          disabled={reloading}
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="continuity-panel__body">
        <section className="settings-section">
          <h3>Reload Anchored</h3>
          <p>
            Save the current note, reload this window, and restore the current
            vault and open note.
          </p>
        </section>
      </div>
      <footer className="continuity-panel__footer">
        <button disabled={reloading} type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="continuity-panel__primary continuity-panel__danger"
          disabled={reloading}
          type="button"
          onClick={onReload}
        >
          {reloading ? "Reloading…" : "Reload Anchored"}
        </button>
      </footer>
    </aside>
  );
}
