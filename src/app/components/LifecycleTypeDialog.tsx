import { useMemo, useRef, useState } from "react";

import { useModalDialog } from "./useModalDialog";

type LifecycleTypeDialogProps = {
  action: "archive" | "workbench";
  currentType?: string;
  documentName: string;
  existingTypes: string[];
  pending: boolean;
  onClose: () => void;
  onConfirm: (noteType: string | undefined) => void;
};

export function LifecycleTypeDialog({
  action,
  currentType,
  documentName,
  existingTypes,
  pending,
  onClose,
  onConfirm,
}: LifecycleTypeDialogProps) {
  const initialChoice = currentType?.trim() || "__untyped__";
  const [choice, setChoice] = useState(initialChoice);
  const [newType, setNewType] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: closeButtonRef,
    onClose,
  });
  const types = useMemo(
    () =>
      Array.from(
        new Set(existingTypes.map((value) => value.trim()).filter(Boolean)),
      ).sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
    [existingTypes],
  );
  const selectedType =
    choice === "__untyped__"
      ? undefined
      : choice === "__new__"
        ? newType.trim() || undefined
        : choice;
  const invalidNewType =
    choice === "__new__" &&
    (!selectedType ||
      selectedType.length > 100 ||
      Array.from(selectedType).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }));

  return (
    <aside
      ref={dialogRef}
      aria-label={
        action === "archive" ? "Archive note" : "Move note to Workbench"
      }
      aria-modal="true"
      className="continuity-panel continuity-panel--compact"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <header className="continuity-panel__header">
        <div>
          <h2>{action === "archive" ? "Archive note" : "Move to Workbench"}</h2>
          <p>
            Choose the type for {documentName}. Untyped removes the type
            property.
          </p>
        </div>
        <button
          ref={closeButtonRef}
          disabled={pending}
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="continuity-panel__body continuity-form">
        <label>
          <span>Type</span>
          <select
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="__untyped__">Untyped</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
            <option value="__new__">Add new type…</option>
          </select>
        </label>
        {choice === "__new__" ? (
          <label>
            <span>New type</span>
            <input
              autoFocus
              maxLength={100}
              placeholder="Article"
              value={newType}
              onChange={(event) => setNewType(event.target.value)}
            />
          </label>
        ) : null}
      </div>
      <footer className="continuity-panel__footer">
        <button disabled={pending} type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          disabled={pending || invalidNewType}
          type="button"
          onClick={() => onConfirm(selectedType)}
        >
          {pending ? "Updating…" : action === "archive" ? "Archive" : "Move"}
        </button>
      </footer>
    </aside>
  );
}
