"use client";

import { useEffect } from "react";
import styles from "./QuickCaptureModal.module.css";

export default function QuickCaptureModal({
  isOpen,
  value,
  inputRef,
  onChange,
  onSave,
  onCancel,
  onBackdrop,
}) {
  useEffect(() => {
    if (!isOpen || !inputRef?.current) return;
    const focusInput = () => {
      if (!inputRef.current) return;
      try {
        inputRef.current.focus({ preventScroll: true });
      } catch {
        inputRef.current.focus();
      }
    };
    const rafId = window.requestAnimationFrame(focusInput);
    return () => window.cancelAnimationFrame(rafId);
  }, [isOpen, inputRef]);

  if (!isOpen) return null;

  const trimmedValue = value.trim();
  const canSave = trimmedValue.length > 0;

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSave) onSave();
    }
    if (event.key === "Escape" && !canSave) {
      onCancel();
    }
  };

  return (
    <div className={styles.backdrop} onPointerDown={onBackdrop}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Quick capture"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className={styles.label}>Quick Capture</div>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a quick note..."
        />
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary} ${
              canSave ? "" : styles.buttonDisabled
            }`}
            onClick={onSave}
            disabled={!canSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
