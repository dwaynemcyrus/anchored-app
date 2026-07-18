import { FormEvent, useRef, useState } from "react";

import { useModalDialog } from "./useModalDialog";

type FolderDialogProps = {
  creating: boolean;
  error?: string;
  parentLabel: string;
  onClose: () => void;
  onCreate: (name: string) => void;
};

export function FolderDialog({
  creating,
  error,
  parentLabel,
  onClose,
  onCreate,
}: FolderDialogProps) {
  const [name, setName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: nameInputRef,
    onClose,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate(name);
  }

  return (
    <aside
      ref={dialogRef}
      aria-label="Create folder"
      aria-modal="true"
      className="continuity-panel continuity-panel--compact"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <form className="continuity-form" onSubmit={submit}>
        <header className="continuity-panel__header">
          <div>
            <h2>Create folder</h2>
            <p>Create a folder inside {parentLabel}.</p>
          </div>
          <button
            aria-label="Close create folder dialog"
            disabled={creating}
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="continuity-panel__body">
          <label className="continuity-field">
            <span>Folder name</span>
            <input
              ref={nameInputRef}
              autoComplete="off"
              disabled={creating}
              name="folder-name"
              placeholder="New folder"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error ? (
            <p className="continuity-panel__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="continuity-panel__footer">
          <button disabled={creating} type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="continuity-panel__primary" disabled={creating}>
            {creating ? "Creating…" : "Create folder"}
          </button>
        </footer>
      </form>
    </aside>
  );
}
