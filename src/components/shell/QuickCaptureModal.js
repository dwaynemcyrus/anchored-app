"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotesStore } from "../../store/notesStore";
import { getDocumentsRepo } from "../../lib/repo/getDocumentsRepo";
import { searchDocs } from "../../lib/search/searchDocs";
import { DOCUMENT_TYPE_NOTE } from "../../types/document";
import styles from "./QuickCaptureModal.module.css";

const SEARCH_DEBOUNCE_MS = 200;
const RESULTS_LIMIT = 12;
const RECENTS_LIMIT = 3;

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
  const router = useRouter();
  const notes = useNotesStore((state) => state.notes);
  const hydrate = useNotesStore((state) => state.hydrate);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef(null);

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

  useEffect(() => {
    if (!isOpen) return;
    void hydrate();
  }, [hydrate, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmedQuery = value.trim();
    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const repo = getDocumentsRepo();
        const docs = await repo.getSearchableDocs({ type: DOCUMENT_TYPE_NOTE });
        const results = searchDocs(docs, trimmedQuery);
        setSearchResults(results.slice(0, RESULTS_LIMIT));
      } catch (error) {
        console.error("Quick capture search failed:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [isOpen, value]);

  const trimmedValue = value.trim();
  const isSearchMode = trimmedValue.length >= 2;
  const recentNotes = useMemo(() => notes.slice(0, RECENTS_LIMIT), [notes]);
  const displayList = isSearchMode ? searchResults : recentNotes;

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSave();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  const handleOpenNote = useCallback(
    (id) => {
      if (!id) return;
      router.push(`/knowledge/notes/${id}`);
      onCancel?.();
    },
    [router, onCancel]
  );

  const helperText =
    !isSearchMode && trimmedValue.length > 0 ? "Type 2+ characters to search" : "";

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onPointerDown={onBackdrop}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Quick capture"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Capture..."
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
            <div className={styles.actionButtons}>
              <button type="button" className={styles.button} onClick={onCancel}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={onSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
        <div className={styles.results}>
          <div className={styles.resultsHeader}>
            <div className={styles.sectionTitle}>
              {isSearchMode ? "Results" : "Recently edited"}
            </div>
            {helperText ? <div className={styles.helper}>{helperText}</div> : null}
          </div>
          {displayList.length === 0 ? (
            <div className={styles.emptyState}>
              {isSearchMode
                ? isSearching
                  ? "Searching..."
                  : "No results found"
                : "No recent notes yet"}
            </div>
          ) : (
            <ul className={styles.list} aria-label="Quick capture results">
              {displayList.map((item) => (
                <li key={item.id} className={styles.listItem}>
                  <button
                    type="button"
                    className={styles.listButton}
                    onClick={() => handleOpenNote(item.id)}
                  >
                    {item.title || "Untitled"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
