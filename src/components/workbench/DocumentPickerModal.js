"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDocumentsRepo } from "@/lib/repo/getDocumentsRepo";
import { searchDocs } from "@/lib/search/searchDocs";
import { DOCUMENT_TYPE_NOTE, DOCUMENT_TYPE_DAILY } from "@/types/document";
import styles from "./DocumentPickerModal.module.css";

const SEARCH_DEBOUNCE_MS = 200;
const RESULTS_LIMIT = 12;
const RECENTS_LIMIT = 8;

export default function DocumentPickerModal({
  isOpen,
  onSelect,
  onCancel,
  excludeIds = [],
  title = "Select a document",
}) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [recentDocs, setRecentDocs] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchDebounceRef = useRef(null);

  // Load recent docs on mount
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSearchResults([]);
      setRecentDocs([]);
      setLoading(true);
      return;
    }

    async function loadRecents() {
      try {
        const repo = getDocumentsRepo();
        const docs = await repo.list({
          type: DOCUMENT_TYPE_NOTE,
          limit: RECENTS_LIMIT + excludeIds.length,
          includeArchived: false,
        });
        // Filter out excluded IDs, daily notes, and inbox items
        const filtered = docs.filter(
          (doc) =>
            !excludeIds.includes(doc.id) &&
            doc.type !== DOCUMENT_TYPE_DAILY &&
            doc.inboxAt == null
        );
        setRecentDocs(filtered.slice(0, RECENTS_LIMIT));
      } catch (err) {
        console.error("Failed to load recent docs:", err);
      } finally {
        setLoading(false);
      }
    }
    loadRecents();

    // Focus input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, [isOpen, excludeIds]);

  // Search with debounce
  useEffect(() => {
    if (!isOpen) return;

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
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
          includeArchived: false,
        });
        const results = searchDocs(docs, trimmedQuery);
        // Filter out excluded IDs, daily notes, and inbox items
        const docsById = new Map(docs.map((d) => [d.id, d]));
        const filtered = results.filter((doc) => {
          const fullDoc = docsById.get(doc.id);
          return (
            !excludeIds.includes(doc.id) &&
            doc.type !== DOCUMENT_TYPE_DAILY &&
            fullDoc?.inboxAt == null
          );
        });
        setSearchResults(filtered.slice(0, RESULTS_LIMIT));
      } catch (err) {
        console.error("Search failed:", err);
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
  }, [isOpen, query, excludeIds]);

  const isSearchMode = query.trim().length >= 2;
  const displayList = isSearchMode ? searchResults : recentDocs;

  const handleSelect = useCallback(
    (doc) => {
      onSelect?.(doc);
    },
    [onSelect]
  );

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
    }
  };

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
        aria-label={title}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={styles.searchContainer}>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>

        <div className={styles.results}>
          <div className={styles.sectionTitle}>
            {isSearchMode ? "Results" : "Recent notes"}
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading...</div>
          ) : displayList.length === 0 ? (
            <div className={styles.emptyState}>
              {isSearchMode
                ? isSearching
                  ? "Searching..."
                  : "No results found"
                : "No recent notes"}
            </div>
          ) : (
            <ul className={styles.list}>
              {displayList.map((doc) => (
                <li key={doc.id} className={styles.listItem}>
                  <button
                    type="button"
                    className={styles.listButton}
                    onClick={() => handleSelect(doc)}
                  >
                    <span className={styles.listButtonTitle}>
                      {doc.title || "Untitled"}
                    </span>
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
