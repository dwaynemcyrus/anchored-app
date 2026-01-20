"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotesStore } from "../../store/notesStore";
import { getDocumentsRepo } from "../../lib/repo/getDocumentsRepo";
import { buildSearchIndex, searchNotes } from "../../lib/search/searchNotes";
import { DOCUMENT_TYPE_NOTE } from "../../types/document";
import styles from "./QuickCaptureModal.module.css";

const SEARCH_DEBOUNCE_MS = 60;
const RESULTS_LIMIT = 12;
const RECENTS_LIMIT = 9;

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
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchDebounceRef = useRef(null);
  const listRef = useRef(null);

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
      setIncludeArchived(false);
      setShowSnippets(false);
      setSelectionMode(false);
      setSelectedIndex(0);
      return;
    }
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmedQuery = value.trim();
    if (trimmedQuery.length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const repo = getDocumentsRepo();
        const docs = await repo.getSearchableDocs({
          type: DOCUMENT_TYPE_NOTE,
          includeTrashed: true,
          includeArchived: true,
        });
        buildSearchIndex(docs);
        const results = searchNotes(trimmedQuery, RESULTS_LIMIT);
        const docsById = new Map(docs.map((doc) => [doc.id, doc]));
        const withStatus = results.map((result) => {
          const match = docsById.get(result.id);
          return {
            ...result,
            deletedAt: match?.deletedAt ?? null,
            archivedAt: match?.archivedAt ?? null,
            inboxAt: match?.inboxAt ?? null,
          };
        });
        setSearchResults(withStatus);
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
  const isSearchMode = trimmedValue.length > 0;
  const displayRecents = useMemo(() => {
    // Filter out inbox items (inboxAt != null) and optionally archived
    const filtered = notes.filter(
      (note) =>
        note.inboxAt == null &&
        (includeArchived || note.archivedAt == null)
    );
    return filtered.slice(0, RECENTS_LIMIT);
  }, [includeArchived, notes]);
  const visibleSearchResults = useMemo(() => {
    // Filter out trashed, inbox items, and optionally archived
    const filtered = searchResults.filter(
      (result) =>
        result.deletedAt == null &&
        result.inboxAt == null &&
        (includeArchived || result.archivedAt == null)
    );
    return filtered.slice(0, RESULTS_LIMIT);
  }, [includeArchived, searchResults]);
  const displayList = isSearchMode ? visibleSearchResults : displayRecents;

  const trashedMatchCount = useMemo(
    () => searchResults.filter((result) => result.deletedAt != null).length,
    [searchResults]
  );
  const archivedMatchCount = useMemo(
    () =>
      searchResults.filter(
        (result) => result.deletedAt == null && result.archivedAt != null
      ).length,
    [searchResults]
  );
  const shouldShowArchiveToggle =
    isSearchMode && (archivedMatchCount > 0 || includeArchived);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (selectionMode) {
        const selected = displayList[selectedIndex];
        if (selected) {
          handleOpenNote(selected.id);
        }
        return;
      }
      if (isSearchMode) {
        const bestMatch = visibleSearchResults[0];
        if (bestMatch?.matchMeta?.tier === 0) {
          handleOpenNote(bestMatch.id);
          return;
        }
        onSave();
        return;
      }
      onSave();
    }
    if (event.key === "Tab" && displayList.length > 0) {
      event.preventDefault();
      setSelectionMode(true);
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        listRef.current?.focus();
      });
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (selectionMode) {
        setSelectionMode(false);
        inputRef?.current?.focus();
        return;
      }
      if (trimmedValue.length > 0) {
        onChange("");
        return;
      }
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

  const handleListKeyDown = (event) => {
    if (!selectionMode) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) =>
        displayList.length === 0 ? 0 : (prev + 1) % displayList.length
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) =>
        displayList.length === 0
          ? 0
          : (prev - 1 + displayList.length) % displayList.length
      );
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = displayList[selectedIndex];
      if (selected) {
        handleOpenNote(selected.id);
      }
    }
    if (event.key === "Escape" || (event.key === "Tab" && event.ctrlKey)) {
      event.preventDefault();
      setSelectionMode(false);
      inputRef?.current?.focus();
    }
  };

  useEffect(() => {
    if (!selectionMode) return;
    if (displayList.length === 0) {
      setSelectionMode(false);
      setSelectedIndex(0);
      return;
    }
    if (selectedIndex > displayList.length - 1) {
      setSelectedIndex(0);
    }
  }, [displayList.length, selectedIndex, selectionMode]);

  const helperText = "";

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
            <div className={styles.resultsHeaderActions}>
              {isSearchMode ? (
                <button
                  type="button"
                  className={styles.snippetToggle}
                  aria-pressed={showSnippets}
                  onClick={() => setShowSnippets((prev) => !prev)}
                >
                  {showSnippets ? "Hide snippets" : "Show snippets"}
                </button>
              ) : null}
              {helperText ? <div className={styles.helper}>{helperText}</div> : null}
            </div>
          </div>
          {isSearchMode && trashedMatchCount > 0 ? (
            <div className={styles.matchLine}>Trash matches: {trashedMatchCount}</div>
          ) : null}
          {shouldShowArchiveToggle ? (
            <div className={styles.matchLine}>
              Archived matches: {archivedMatchCount}{" "}
              <button
                type="button"
                className={styles.matchToggle}
                onClick={() => setIncludeArchived((prev) => !prev)}
              >
                {includeArchived ? "Hide" : "Show"}
              </button>
            </div>
          ) : null}
          {displayList.length === 0 ? (
            <div className={styles.emptyState}>
              {isSearchMode
                ? isSearching
                  ? "Searching..."
                  : `No matches. Press Enter to create: ${trimmedValue}`
                : "No recent notes yet"}
            </div>
          ) : (
            <ul
              className={styles.list}
              role="listbox"
              aria-label="Quick capture results"
              aria-activedescendant={
                selectionMode && displayList[selectedIndex]
                  ? `quick-capture-option-${displayList[selectedIndex].id}`
                  : undefined
              }
              tabIndex={selectionMode ? 0 : -1}
              ref={listRef}
              onKeyDown={handleListKeyDown}
              onBlur={() => setSelectionMode(false)}
            >
              {displayList.map((item, index) => {
                const isSelected = selectionMode && index === selectedIndex;
                return (
                  <li key={item.id} className={styles.listItem}>
                    <button
                      type="button"
                      id={`quick-capture-option-${item.id}`}
                      role="option"
                      aria-selected={isSelected}
                      className={`${styles.listButton} ${
                        isSelected ? styles.listButtonSelected : ""
                      }`}
                    tabIndex={-1}
                    onClick={() => handleOpenNote(item.id)}
                  >
                      <span className={styles.listButtonContent}>
                        <span className={styles.listButtonTitle}>
                          {item.title || "Untitled"}
                        </span>
                        {showSnippets && isSearchMode && item.snippet ? (
                          <span className={styles.listButtonSnippet}>
                            {item.snippet}
                          </span>
                        ) : null}
                      </span>
                      {item.archivedAt != null ? (
                        <span className={styles.archiveBadge} aria-label="Archived">
                          A
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
