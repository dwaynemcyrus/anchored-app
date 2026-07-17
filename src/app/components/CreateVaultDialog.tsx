import { FormEvent, useRef, useState } from "react";

import { useModalDialog } from "./useModalDialog";

type CreateVaultDialogProps = {
  creating: boolean;
  error?: string;
  onClose: () => void;
  onCreate: (name: string) => void;
};

export function CreateVaultDialog({
  creating,
  error,
  onClose,
  onCreate,
}: CreateVaultDialogProps) {
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
      aria-label="Create vault"
      aria-modal="true"
      className="continuity-panel continuity-panel--compact"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <form className="continuity-form" onSubmit={submit}>
        <header className="continuity-panel__header">
          <div>
            <h2>Create vault</h2>
            <p>
              Name the vault, then choose the parent folder where Anchored
              should create it.
            </p>
          </div>
          <button
            aria-label="Close create vault dialog"
            disabled={creating}
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="continuity-panel__body">
          <label className="continuity-field">
            <span>Vault name</span>
            <input
              ref={nameInputRef}
              autoComplete="off"
              disabled={creating}
              name="vault-name"
              placeholder="New vault"
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
            {creating ? "Creating…" : "Choose location…"}
          </button>
        </footer>
      </form>
    </aside>
  );
}
