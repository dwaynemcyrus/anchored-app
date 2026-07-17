import { useRef } from "react";

import type { IdentityMigrationPreview } from "../../lib/tauri/vault";
import { useModalDialog } from "./useModalDialog";

type IdentityMigrationPanelProps = {
  error?: string;
  preview: IdentityMigrationPreview;
  status: "ready" | "applying";
  onApply: () => void;
  onClose: () => void;
};

const ISSUE_LABELS = {
  duplicateIdentity: "Duplicate identity",
  duplicateIdField: "Duplicate ID field",
  invalidIdentity: "Invalid identity",
  malformedFrontMatter: "Malformed front matter",
} as const;

export function IdentityMigrationPanel({
  error,
  preview,
  status,
  onApply,
  onClose,
}: IdentityMigrationPanelProps) {
  const visibleEligible = preview.eligibleFiles.slice(0, 100);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: closeButtonRef,
    onClose,
  });

  return (
    <section
      ref={dialogRef}
      aria-labelledby="identity-migration-title"
      aria-modal="true"
      className="identity-migration"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <div className="identity-migration__header">
        <div>
          <h2 id="identity-migration-title">Add permanent note identities</h2>
          <p>
            {preview.eligibleFiles.length} notes can receive an ID. Existing
            Markdown content will otherwise remain unchanged.
          </p>
        </div>
        <button ref={closeButtonRef} type="button" onClick={onClose}>
          Close
        </button>
      </div>

      {preview.eligibleFiles.length > 0 ? (
        <div className="identity-migration__list">
          <h3>Eligible notes</h3>
          <ul>
            {visibleEligible.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
          {preview.eligibleFiles.length > visibleEligible.length ? (
            <p>Showing the first {visibleEligible.length} eligible notes.</p>
          ) : null}
        </div>
      ) : null}

      {preview.issues.length > 0 ? (
        <div className="identity-migration__list">
          <h3>Not safe to change</h3>
          <ul>
            {preview.issues.map((issue) => (
              <li key={`${issue.relativePath}:${issue.reason}`}>
                {issue.relativePath} — {ISSUE_LABELS[issue.reason]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p role="alert">{error}</p> : null}
      <button
        className="identity-migration__apply"
        disabled={status === "applying" || preview.eligibleFiles.length === 0}
        type="button"
        onClick={onApply}
      >
        {status === "applying"
          ? "Adding identities…"
          : `Add IDs to ${preview.eligibleFiles.length} notes`}
      </button>
    </section>
  );
}
