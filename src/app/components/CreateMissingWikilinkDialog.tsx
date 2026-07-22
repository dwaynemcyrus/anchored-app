import { useRef } from "react";

import { useModalDialog } from "./useModalDialog";

type CreateMissingWikilinkDialogProps = {
  creating: boolean;
  error?: string;
  target: string;
  onClose: () => void;
  onCreate: () => void;
};

export function CreateMissingWikilinkDialog({
  creating,
  error,
  target,
  onClose,
  onCreate,
}: CreateMissingWikilinkDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: closeButtonRef,
    onClose,
  });

  return (
    <aside
      ref={dialogRef}
      aria-label="Create missing note"
      aria-modal="true"
      className="continuity-panel continuity-panel--compact"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <header className="continuity-panel__header">
        <div>
          <h2>Note not found</h2>
          <p>Create a note for this unresolved wikilink?</p>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Close create missing note dialog"
          disabled={creating}
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="continuity-panel__body">
        <div className="continuity-panel__empty">
          <p>
            <code>[[{target}]]</code> does not match an existing note or alias.
          </p>
          <p>Anchored will create a blank note in the physical Inbox folder.</p>
          {error ? (
            <p className="continuity-panel__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <footer className="continuity-panel__footer">
        <button disabled={creating} type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="continuity-panel__primary"
          disabled={creating}
          type="button"
          onClick={onCreate}
        >
          {creating ? "Creating…" : "Create note"}
        </button>
      </footer>
    </aside>
  );
}
