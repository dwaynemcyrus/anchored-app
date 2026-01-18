"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useNotesStore, getDerivedTitle } from "../../store/notesStore";
import { getDocumentsRepo } from "../../lib/repo/getDocumentsRepo";
import { searchDocs } from "../../lib/search/searchDocs";
import { DOCUMENT_TYPE_NOTE } from "../../types/document";
import styles from "../../styles/notesList.module.css";

const DEBOUNCE_MS = 250;

function formatUpdatedAt(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const notes = useNotesStore((state) => state.notes);
  const hydrate = useNotesStore((state) => state.hydrate);
  const createNote = useNotesStore((state) => state.createNote);

  const [query, setQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef(null);
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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
        const docs = await repo.getSearchableDocs({ type: DOCUMENT_TYPE_NOTE });
        const results = searchDocs(docs, trimmedQuery);
        setSearchResults(results);
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
  }, [query]);

  const handleQueryChange = useCallback((e) => {
    setQuery(e.target.value);
  }, []);

  const handleClear = useCallback(() => {
    setQuery("");
  }, []);

  const handleCreate = async () => {
    const id = await createNote({ suppressListUpdate: true });
    if (id) {
      router.push(`/knowledge/notes/${id}`);
    }
  };

  const isSearchMode = query.trim().length >= 2;
  const displayList = isSearchMode ? searchResults : notes;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>Notes</h1>
          <button type="button" className={styles.newButton} onClick={handleCreate}>
            New
          </button>
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

        {displayList.length === 0 ? (
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
              <Link
                key={item.id}
                href={`/knowledge/notes/${item.id}`}
                className={styles.listItem}
              >
                <div className={styles.listItemTitle}>
                  {isSearchMode ? item.title : getDerivedTitle(item)}
                </div>
                {isSearchMode && item.snippet && (
                  <div className={styles.listItemSnippet}>{item.snippet}</div>
                )}
                <div className={styles.listItemMeta}>{formatUpdatedAt(item.updatedAt)}</div>
              </Link>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
