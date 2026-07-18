import { useRef } from "react";

import { useModalDialog } from "./useModalDialog";

type DeleteFolderDialogProps = {
  deleting: boolean;
  error?: string;
  folderName: string;
  onClose: () => void;
  onDelete: () => void;
};

export function DeleteFolderDialog({
  deleting,
  error,
  folderName,
  onClose,
  onDelete,
}: DeleteFolderDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: cancelButtonRef,
    onClose,
  });

  return (
    <aside
      ref={dialogRef}
      aria-label="Delete folder"
      aria-modal="true"
      className="continuity-panel continuity-panel--compact"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <header className="continuity-panel__header">
        <div>
          <h2>Delete folder</h2>
          <p>
            Delete {folderName} only if it is empty. Anchored will refuse this
            action when notes or subfolders still exist inside it.
          </p>
        </div>
        <button
          aria-label="Close delete folder dialog"
          disabled={deleting}
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="continuity-panel__body">
        {error ? (
          <p className="continuity-panel__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <footer className="continuity-panel__footer">
        <button
          ref={cancelButtonRef}
          disabled={deleting}
          type="button"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="continuity-panel__primary"
          disabled={deleting}
          type="button"
          onClick={onDelete}
        >
          {deleting ? "Deleting…" : "Delete folder"}
        </button>
      </footer>
    </aside>
  );
}
