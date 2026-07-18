import { FormEvent, useRef, useState } from "react";

import { useModalDialog } from "./useModalDialog";

type FolderDialogProps = {
  actionLabel: string;
  creating: boolean;
  description: string;
  error?: string;
  initialName?: string;
  nameLabel: string;
  placeholder: string;
  title: string;
  onClose: () => void;
  onCreate: (name: string) => void;
};

export function FolderDialog({
  actionLabel,
  creating,
  description,
  error,
  initialName = "",
  nameLabel,
  placeholder,
  title,
  onClose,
  onCreate,
}: FolderDialogProps) {
  const [name, setName] = useState(initialName);
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
      aria-label={title}
      aria-modal="true"
      className="continuity-panel continuity-panel--compact"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <form className="continuity-form" onSubmit={submit}>
        <header className="continuity-panel__header">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button
            aria-label={`Close ${title.toLocaleLowerCase()} dialog`}
            disabled={creating}
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="continuity-panel__body">
          <label className="continuity-field">
            <span>{nameLabel}</span>
            <input
              ref={nameInputRef}
              autoComplete="off"
              disabled={creating}
              name="folder-name"
              placeholder={placeholder}
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
            {creating ? `${actionLabel}…` : actionLabel}
          </button>
        </footer>
      </form>
    </aside>
  );
}
