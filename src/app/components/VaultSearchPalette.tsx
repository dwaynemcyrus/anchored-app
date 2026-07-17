import { useId, useRef, useState } from "react";

import type { VaultSearchResult } from "../../lib/tauri/vault";
import { useModalDialog } from "./useModalDialog";

export type VaultSearchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "error"; message: string }
  | { status: "success"; result: VaultSearchResult };

type VaultSearchPaletteProps = {
  query: string;
  searchState: VaultSearchState;
  vaultSelected: boolean;
  onClose: () => void;
  onOpen: (relativePath: string) => void;
  onQueryChange: (query: string) => void;
};

export function VaultSearchPalette({
  query,
  searchState,
  vaultSelected,
  onClose,
  onOpen,
  onQueryChange,
}: VaultSearchPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const matches =
    searchState.status === "success" ? searchState.result.matches : [];
  const safeSelectedIndex = Math.min(
    selectedIndex,
    Math.max(0, matches.length - 1),
  );

  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: inputRef,
    onClose,
  });

  function updateQuery(nextQuery: string) {
    setSelectedIndex(0);
    onQueryChange(nextQuery);
  }

  return (
    <div
      className="retrieval-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        aria-label="Search vault"
        aria-modal="true"
        className="retrieval-palette"
        role="dialog"
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
      >
        <label className="retrieval-palette__search">
          <span className="visually-hidden">Search Markdown content</span>
          <input
            ref={inputRef}
            aria-activedescendant={
              matches.length > 0
                ? `${listboxId}-option-${safeSelectedIndex}`
                : undefined
            }
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-label="Search Markdown content"
            autoComplete="off"
            maxLength={200}
            placeholder="Search every note…"
            role="combobox"
            spellCheck="false"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && matches.length > 0) {
                event.preventDefault();
                setSelectedIndex((current) => (current + 1) % matches.length);
              } else if (event.key === "ArrowUp" && matches.length > 0) {
                event.preventDefault();
                setSelectedIndex(
                  (current) => (current - 1 + matches.length) % matches.length,
                );
              } else if (event.key === "Enter" && matches.length > 0) {
                event.preventDefault();
                onOpen(matches[safeSelectedIndex].relativePath);
              }
            }}
          />
          <kbd>esc</kbd>
        </label>
        <div
          aria-label="Search results"
          aria-live="polite"
          className="retrieval-results"
          id={listboxId}
          role="listbox"
        >
          {!vaultSelected ? (
            <p className="retrieval-results__empty">
              Open a vault to search its Markdown notes.
            </p>
          ) : searchState.status === "searching" ? (
            <p className="retrieval-results__empty">Searching notes…</p>
          ) : searchState.status === "error" ? (
            <p className="retrieval-results__empty" role="alert">
              {searchState.message}
            </p>
          ) : searchState.status === "success" && matches.length === 0 ? (
            <p className="retrieval-results__empty">No content matches.</p>
          ) : query.trim().length === 0 ? (
            <p className="retrieval-results__empty">
              Type a word or phrase to search note contents.
            </p>
          ) : null}
          {matches.map((match, index) => (
            <button
              aria-selected={index === safeSelectedIndex}
              className="retrieval-result retrieval-result--content"
              id={`${listboxId}-option-${index}`}
              key={`${match.relativePath}:${match.line}:${index}`}
              role="option"
              type="button"
              onClick={() => onOpen(match.relativePath)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="retrieval-result__label">
                {match.relativePath}
              </span>
              <span className="retrieval-result__detail">
                Line {match.line}
              </span>
              <span className="retrieval-result__snippet">
                {match.snippet || "Empty line"}
              </span>
            </button>
          ))}
        </div>
        <footer className="retrieval-palette__footer">
          <span>↑↓ Select</span>
          <span>↵ Open</span>
          {searchState.status === "success" ? (
            <span>
              {searchState.result.matches.length} result
              {searchState.result.matches.length === 1 ? "" : "s"}
              {searchState.result.truncated ? " · limited" : ""}
              {searchState.result.skippedFiles > 0
                ? ` · ${searchState.result.skippedFiles} skipped`
                : ""}
            </span>
          ) : (
            <span>⌘⇧F Search</span>
          )}
        </footer>
      </section>
    </div>
  );
}
