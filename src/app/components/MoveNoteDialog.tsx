import { useRef } from "react";

import { useModalDialog } from "./useModalDialog";

type MoveNoteDialogProps = {
  currentFolderPath: string;
  documentName: string;
  folders: string[];
  moving: boolean;
  itemKind?: "note" | "folder";
  onClose: () => void;
  onMove: (destinationFolderPath: string) => void;
};

function folderDisplayName(path: string): string {
  return path || "Vault root";
}

export function MoveNoteDialog({
  currentFolderPath,
  documentName,
  folders,
  moving,
  itemKind = "note",
  onClose,
  onMove,
}: MoveNoteDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: closeButtonRef,
    onClose,
  });

  return (
    <aside
      ref={dialogRef}
      aria-label={`Move ${itemKind}`}
      aria-modal="true"
      className="continuity-panel continuity-panel--compact"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <header className="continuity-panel__header">
        <div>
          <h2>Move {itemKind}</h2>
          <p>Choose where {documentName} should live inside this vault.</p>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Close move note dialog"
          disabled={moving}
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="continuity-panel__body">
        <ol className="continuity-list">
          {["", ...folders].map((folderPath) => {
            const isCurrent = folderPath === currentFolderPath;
            return (
              <li
                className="continuity-record"
                key={folderPath || "vault-root"}
              >
                <div className="continuity-record__copy">
                  <strong>{folderDisplayName(folderPath)}</strong>
                  <span>
                    {isCurrent
                      ? "Current location"
                      : `Move this ${itemKind} here`}
                  </span>
                </div>
                <div className="continuity-record__actions">
                  <button
                    disabled={moving || isCurrent}
                    type="button"
                    onClick={() => onMove(folderPath)}
                  >
                    {moving && !isCurrent
                      ? "Moving…"
                      : isCurrent
                        ? "Current"
                        : "Move"}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <footer className="continuity-panel__footer">
        <button disabled={moving} type="button" onClick={onClose}>
          Cancel
        </button>
      </footer>
    </aside>
  );
}
