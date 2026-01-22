"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useDocumentsStore, getDerivedTitle } from "../../store/documentsStore";
import { getDocumentsRepo } from "../../lib/repo/getDocumentsRepo";
import { ensureSearchIndex, searchDocuments } from "../../lib/search/searchDocuments";
import { DOCUMENT_TYPE_NOTE } from "../../types/document";
import TemplatePicker from "../templates/TemplatePicker";
import styles from "../../styles/notesList.module.css";

const DEBOUNCE_MS = 250;
const RESULTS_LIMIT = 50;

function formatUpdatedAt(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const CONFLICT_PREFIX = "CONFLICT — ";

export default function NotesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const filterConflicts = searchParams.get("filter") === "conflicts";

  const documents = useDocumentsStore((state) => state.documents);
  const hydrate = useDocumentsStore((state) => state.hydrate);
  const hydrateError = useDocumentsStore((state) => state.hydrateError);
  const createDocument = useDocumentsStore((state) => state.createDocument);
  const listIncludeArchived = useDocumentsStore((state) => state.listIncludeArchived);
  const archiveDocument = useDocumentsStore((state) => state.archiveDocument);
  const unarchiveDocument = useDocumentsStore((state) => state.unarchiveDocument);
  const trashDocument = useDocumentsStore((state) => state.trashDocument);
  const restoreDocument = useDocumentsStore((state) => state.restoreDocument);

  const [query, setQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [lastTrashed, setLastTrashed] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const debounceRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const undoTimerRef = useRef(null);
  const listIncludeArchivedRef = useRef(listIncludeArchived);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    listIncludeArchivedRef.current = listIncludeArchived;
  }, [listIncludeArchived]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  // Sync URL with debounce
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query.trim()) {
        params.set("q", query.trim());
      } else {
        params.delete("q");
      }
      const newUrl = params.toString()
        ? `/knowledge/notes?${params.toString()}`
        : "/knowledge/notes";
      router.replace(newUrl, { scroll: false });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, router, searchParams]);

  // Perform search with debounce
  useEffect(() => {
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
        // Use ref to get current value at execution time, not closure capture time
        const docs = await repo.getSearchableDocs({
          type: DOCUMENT_TYPE_NOTE,
          includeArchived: listIncludeArchivedRef.current,
        });
        ensureSearchIndex(docs);
        const results = searchDocuments(trimmedQuery, RESULTS_LIMIT);
        const docsById = new Map(docs.map((doc) => [doc.id, doc]));
        const withStatus = results.map((result) => {
          const match = docsById.get(result.id);
          return {
            ...result,
            archivedAt: match?.archivedAt ?? null,
            deletedAt: match?.deletedAt ?? null,
          };
        });
        setSearchResults(withStatus);
      } catch (error) {
        console.error("Search failed:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [listIncludeArchived, query]);

  const handleQueryChange = useCallback((e) => {
    setQuery(e.target.value);
  }, []);

  const handleClear = useCallback(() => {
    setQuery("");
  }, []);

  const handleCreate = () => {
    setIsPickerOpen(true);
  };

  const handleTemplateSelect = (doc) => {
    setIsPickerOpen(false);
    if (doc?.id) {
      router.push(`/knowledge/notes/${doc.id}`);
    }
  };

  const handlePickerCancel = () => {
    setIsPickerOpen(false);
  };

  const handleToggleArchived = () => {
    void hydrate({ includeArchived: !listIncludeArchived });
  };

  const handleRetryHydrate = () => {
    void hydrate({ force: true });
  };

  const scheduleUndo = useCallback((doc) => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    setLastTrashed(doc);
    undoTimerRef.current = setTimeout(() => {
      setLastTrashed(null);
      undoTimerRef.current = null;
    }, 5000);
  }, []);

  const handleTrash = useCallback(
    async (doc) => {
      await trashDocument(doc.id);
      setSearchResults((prev) => prev.filter((item) => item.id !== doc.id));
      scheduleUndo({
        id: doc.id,
        title: doc.title || "Untitled",
      });
    },
    [scheduleUndo, trashDocument]
  );

  const handleUndoTrash = useCallback(async () => {
    if (!lastTrashed) return;
    await restoreDocument(lastTrashed.id);
    setLastTrashed(null);
  }, [lastTrashed, restoreDocument]);

  const handleArchive = useCallback(
    async (doc) => {
      await archiveDocument(doc.id);
      if (!listIncludeArchived) {
        setSearchResults((prev) => prev.filter((item) => item.id !== doc.id));
      } else {
        setSearchResults((prev) =>
          prev.map((item) =>
            item.id === doc.id ? { ...item, archivedAt: Date.now() } : item
          )
        );
      }
    },
    [archiveDocument, listIncludeArchived]
  );

  const handleUnarchive = useCallback(
    async (doc) => {
      await unarchiveDocument(doc.id);
      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === doc.id ? { ...item, archivedAt: null } : item
        )
      );
    },
    [unarchiveDocument]
  );

  const trimmedQuery = query.trim();
  const isSearchMode = trimmedQuery.length >= 2;
  const visibleDocuments = useMemo(() => {
    // When "Show archived" is active, show ONLY archived documents
    // Otherwise show only non-archived documents
    let filtered = listIncludeArchived
      ? documents.filter((doc) => doc.archivedAt != null)
      : documents.filter((doc) => doc.archivedAt == null);

    if (filterConflicts) {
      filtered = filtered.filter(
        (doc) => getDerivedTitle(doc).startsWith(CONFLICT_PREFIX)
      );
    }

    return filtered;
  }, [listIncludeArchived, documents, filterConflicts]);

  const conflictCount = useMemo(() => {
    const filteredDocuments = listIncludeArchived
      ? documents.filter((doc) => doc.archivedAt != null)
      : documents.filter((doc) => doc.archivedAt == null);
    return filteredDocuments.filter(
      (doc) => getDerivedTitle(doc).startsWith(CONFLICT_PREFIX)
    ).length;
  }, [listIncludeArchived, documents]);

  const displayList = isSearchMode ? searchResults : visibleDocuments;

  const renderHighlightedText = (text, highlight) => {
    if (!highlight) return text;
    const lowerText = text.toLowerCase();
    const lowerHighlight = highlight.toLowerCase();
    if (!lowerHighlight) return text;
    const parts = [];
    let cursor = 0;
    while (cursor < text.length) {
      const matchIndex = lowerText.indexOf(lowerHighlight, cursor);
      if (matchIndex === -1) {
        parts.push(text.slice(cursor));
        break;
      }
      if (matchIndex > cursor) {
        parts.push(text.slice(cursor, matchIndex));
      }
      parts.push(
        <mark key={`highlight-${matchIndex}`} className={styles.highlight}>
          {text.slice(matchIndex, matchIndex + lowerHighlight.length)}
        </mark>
      );
      cursor = matchIndex + lowerHighlight.length;
    }
    return parts;
  };

  const handleClearConflictFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("filter");
    const newUrl = params.toString()
      ? `/knowledge/notes?${params.toString()}`
      : "/knowledge/notes";
    router.replace(newUrl, { scroll: false });
  }, [router, searchParams]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            {filterConflicts ? "Import Conflicts" : "Notes"}
          </h1>
          <div className={styles.headerActions}>
            {filterConflicts ? (
              <button
                type="button"
                className={styles.toggleButton}
                onClick={handleClearConflictFilter}
              >
                Show all notes
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`${styles.toggleButton} ${
                    listIncludeArchived ? styles.toggleButtonActive : ""
                  }`}
                  aria-pressed={listIncludeArchived}
                  onClick={handleToggleArchived}
                >
                  Show archived
                </button>
                <button type="button" className={styles.newButton} onClick={handleCreate}>
                  New
                </button>
              </>
            )}
          </div>
        </header>

        <div className={styles.searchContainer}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search notes…"
            value={query}
            onChange={handleQueryChange}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          {query && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={handleClear}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {lastTrashed ? (
          <div className={styles.undoBanner} role="status">
            <div className={styles.undoText}>
              Trashed. <span className={styles.undoTitle}>{lastTrashed.title}</span>
            </div>
            <button
              type="button"
              className={styles.undoButton}
              onClick={handleUndoTrash}
            >
              Undo
            </button>
          </div>
        ) : null}

        {hydrateError ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>Failed to load notes</div>
            <button type="button" className={styles.emptyAction} onClick={handleRetryHydrate}>
              Retry
            </button>
          </div>
        ) : displayList.length === 0 ? (
          isSearchMode ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>
                {isSearching ? "Searching…" : "No results found"}
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No notes yet</div>
              <button type="button" className={styles.emptyAction} onClick={handleCreate}>
                Create your first note
              </button>
            </div>
          )
        ) : (
          <section className={styles.list} aria-label="Notes list">
            {displayList.map((item) => (
              <div key={item.id} className={styles.listItem}>
                <Link
                  href={`/knowledge/notes/${item.id}`}
                  className={styles.listItemLink}
                >
                  <div className={styles.listItemTitle}>
                    {isSearchMode
                      ? renderHighlightedText(item.title || "Untitled", trimmedQuery)
                      : getDerivedTitle(item)}
                  </div>
                  {isSearchMode && item.snippet && (
                    <div className={styles.listItemSnippet}>
                      {renderHighlightedText(item.snippet, trimmedQuery)}
                    </div>
                  )}
                  <div className={styles.listItemMeta}>
                    {formatUpdatedAt(item.updatedAt)}
                  </div>
                </Link>
                <div className={styles.listItemActions}>
                  {item.archivedAt == null ? (
                    <button
                      type="button"
                      className={styles.listAction}
                      onClick={() => handleArchive(item)}
                    >
                      Archive
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.listAction}
                      onClick={() => handleUnarchive(item)}
                    >
                      Unarchive
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.listAction} ${styles.listActionDanger}`}
                    onClick={() => handleTrash(item)}
                  >
                    Trash
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>

      <TemplatePicker
        isOpen={isPickerOpen}
        onSelect={handleTemplateSelect}
        onCancel={handlePickerCancel}
      />
    </div>
  );
}
