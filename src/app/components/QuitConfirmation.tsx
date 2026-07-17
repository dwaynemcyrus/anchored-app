import { useRef } from "react";

import { useModalDialog } from "./useModalDialog";

type QuitConfirmationProps = {
  unfinishedCount: number;
  onCancel: () => void;
  onDiscard: () => void;
};

export function QuitConfirmation({
  unfinishedCount,
  onCancel,
  onDiscard,
}: QuitConfirmationProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: cancelButtonRef,
    onClose: onCancel,
  });
  const plural = unfinishedCount === 1 ? "note has" : "notes have";

  return (
    <div className="retrieval-overlay quit-confirmation-overlay">
      <section
        ref={dialogRef}
        aria-describedby="quit-confirmation-description"
        aria-labelledby="quit-confirmation-title"
        aria-modal="true"
        className="quit-confirmation"
        role="alertdialog"
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
      >
        <h2 id="quit-confirmation-title">Unsaved notes</h2>
        <p id="quit-confirmation-description">
          {unfinishedCount} {plural} changes that are not safely stored in the
          vault. Save or close those notes before quitting, or discard the
          changes explicitly.
        </p>
        <div className="quit-confirmation__actions">
          <button ref={cancelButtonRef} type="button" onClick={onCancel}>
            Keep Anchored Open
          </button>
          <button
            className="quit-confirmation__discard"
            type="button"
            onClick={onDiscard}
          >
            Quit Without Saving
          </button>
        </div>
      </section>
    </div>
  );
}
