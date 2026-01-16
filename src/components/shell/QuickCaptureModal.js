"use client";

import { useLayoutEffect } from "react";
import styles from "./QuickCaptureModal.module.css";

export default function QuickCaptureModal({
  isOpen,
  value,
  inputRef,
  shouldFocus,
  onFocused,
  rapidEnabled,
  onToggleRapid,
  onChange,
  onSave,
  onCancel,
  onBackdrop,
}) {
  useLayoutEffect(() => {
    if (!isOpen || !inputRef?.current || !shouldFocus) return;
    const focusInput = () => {
      if (!inputRef.current) return;
      inputRef.current.focus();
      if (document.activeElement !== inputRef.current) {
        setTimeout(() => {
          if (!inputRef.current) return;
          inputRef.current.focus();
          if (document.activeElement === inputRef.current) {
            onFocused?.();
          }
        }, 0);
        return;
      }
      onFocused?.();
    };
    focusInput();
  }, [isOpen, inputRef, shouldFocus, onFocused]);

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
          autoFocus
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={rapidEnabled}
            onClick={onToggleRapid}
            onMouseDown={(event) => event.preventDefault()}
            onTouchStart={(event) => event.preventDefault()}
          >
            <span
              className={`${styles.toggleTrack} ${
                rapidEnabled ? styles.toggleTrackActive : ""
              }`}
              aria-hidden="true"
            >
              <span
                className={`${styles.toggleThumb} ${
                  rapidEnabled ? styles.toggleThumbActive : ""
                }`}
              />
            </span>
            <span className={styles.toggleText}>Rapid capture</span>
          </button>
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
