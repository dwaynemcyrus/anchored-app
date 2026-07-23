import { useState } from "react";

type ConflictResolutionDialogProps = {
  base: string;
  external: string;
  local: string;
  merged?: string;
  onApply: (content: string) => void;
  onKeepExternal: () => void;
  onCancel: () => void;
};

export function ConflictResolutionDialog({
  base,
  external,
  local,
  merged,
  onApply,
  onKeepExternal,
  onCancel,
}: ConflictResolutionDialogProps) {
  const [content, setContent] = useState(merged ?? local);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="conflict-dialog-title"
        aria-modal="true"
        className="modal conflict-dialog"
        role="dialog"
      >
        <h2 id="conflict-dialog-title">Resolve external file conflict</h2>
        <p>
          The file changed outside Anchored while you had unsaved edits. The
          filesystem version is preserved until you choose an outcome.
        </p>
        <div className="conflict-dialog__versions">
          <details>
            <summary>Base version</summary>
            <pre>{base}</pre>
          </details>
          <details>
            <summary>External version</summary>
            <pre>{external}</pre>
          </details>
        </div>
        <label htmlFor="conflict-merged-content">Merged result</label>
        <textarea
          id="conflict-merged-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="modal__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onKeepExternal}>
            Keep external
          </button>
          <button type="button" onClick={() => onApply(content)}>
            Apply merged result
          </button>
        </div>
      </section>
    </div>
  );
}
