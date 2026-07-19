import { useRef, useState } from "react";

import { useModalDialog } from "./useModalDialog";

type DeleteFolderDialogProps = {
  deleting: boolean;
  error?: string;
  folderName: string;
  fileCount: number;
  folderCount: number;
  onClose: () => void;
  onDelete: (confirmation: string) => void;
};

export function DeleteFolderDialog({
  deleting,
  error,
  folderName,
  fileCount,
  folderCount,
  onClose,
  onDelete,
}: DeleteFolderDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
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
            {fileCount === 0 && folderCount === 0
              ? `Delete ${folderName}?`
              : `This folder contains ${fileCount} file${fileCount === 1 ? "" : "s"} and ${folderCount} subfolder${folderCount === 1 ? "" : "s"}. Moving it to Trash will include everything inside it.`}
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
        {fileCount > 0 || folderCount > 0 ? (
          <>
            <p>
              You can restore this folder later from Trash. This cannot be
              undone from the file tree.
            </p>
            {confirming ? (
              <label className="continuity-panel__confirmation">
                Type <strong>delete folder</strong> to continue.
                <input
                  aria-label="Delete folder confirmation"
                  autoComplete="off"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
            ) : null}
          </>
        ) : null}
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
          disabled={
            deleting || (confirming && confirmation !== "delete folder")
          }
          type="button"
          onClick={() => {
            if (fileCount > 0 || folderCount > 0) {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              onDelete(confirmation);
              return;
            }
            onDelete("");
          }}
        >
          {deleting
            ? "Deleting…"
            : fileCount > 0 || folderCount > 0
              ? confirming
                ? "Move folder to Trash"
                : "Continue"
              : "Delete folder"}
        </button>
      </footer>
    </aside>
  );
}
