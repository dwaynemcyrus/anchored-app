"use client";

import { useCallback } from "react";
import { deriveDocumentTitle } from "@/lib/documents/deriveTitle";
import styles from "./ReplaceModal.module.css";

export default function ReplaceModal({
  isOpen,
  pinnedDocs,
  newDoc,
  onReplace,
  onCancel,
}) {
  const handleSelect = useCallback(
    (oldDoc) => {
      onReplace?.(oldDoc);
    },
    [onReplace]
  );

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onCancel?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Workbench is full"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Workbench is full</h2>
          <p className={styles.subtitle}>Select a document to replace</p>
        </div>

        {newDoc && (
          <div className={styles.newDocSection}>
            <div className={styles.sectionLabel}>Adding</div>
            <div className={styles.newDocCard}>
              {deriveDocumentTitle(newDoc)}
            </div>
          </div>
        )}

        <div className={styles.replaceSection}>
          <div className={styles.sectionLabel}>Replace one of these</div>
          <ul className={styles.list}>
            {pinnedDocs.map((doc) => (
              <li key={doc.id} className={styles.listItem}>
                <button
                  type="button"
                  className={styles.listButton}
                  onClick={() => handleSelect(doc)}
                >
                  <span className={styles.listButtonTitle}>
                    {deriveDocumentTitle(doc)}
                  </span>
                  <span className={styles.listButtonArrow}>&times;</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
