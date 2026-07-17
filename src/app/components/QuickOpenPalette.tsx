import { useId, useRef, useState } from "react";

import type { QuickOpenResult } from "../retrieval";
import { useModalDialog } from "./useModalDialog";

type QuickOpenPaletteProps = {
  query: string;
  results: QuickOpenResult[];
  onClose: () => void;
  onOpen: (documentId: string) => void;
  onQueryChange: (query: string) => void;
};

export function QuickOpenPalette({
  query,
  results,
  onClose,
  onOpen,
  onQueryChange,
}: QuickOpenPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const safeSelectedIndex = Math.min(
    selectedIndex,
    Math.max(0, results.length - 1),
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
        aria-label="Quick Open"
        aria-modal="true"
        className="retrieval-palette"
        role="dialog"
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
      >
        <label className="retrieval-palette__search">
          <span className="visually-hidden">Find a note</span>
          <input
            ref={inputRef}
            aria-label="Find a note"
            aria-activedescendant={
              results.length > 0
                ? `${listboxId}-option-${safeSelectedIndex}`
                : undefined
            }
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            autoComplete="off"
            placeholder="Open a note…"
            role="combobox"
            spellCheck="false"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && results.length > 0) {
                event.preventDefault();
                setSelectedIndex((current) => (current + 1) % results.length);
              } else if (event.key === "ArrowUp" && results.length > 0) {
                event.preventDefault();
                setSelectedIndex(
                  (current) => (current - 1 + results.length) % results.length,
                );
              } else if (event.key === "Enter" && results.length > 0) {
                event.preventDefault();
                onOpen(results[safeSelectedIndex].documentId);
              }
            }}
          />
          <kbd>esc</kbd>
        </label>
        <div
          aria-label="Notes"
          className="retrieval-results"
          id={listboxId}
          role="listbox"
        >
          {results.map((result, index) => (
            <button
              aria-selected={index === safeSelectedIndex}
              className="retrieval-result"
              id={`${listboxId}-option-${index}`}
              key={result.documentId}
              role="option"
              type="button"
              onClick={() => onOpen(result.documentId)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="retrieval-result__label">{result.label}</span>
              {result.matchedAlias ? (
                <span className="retrieval-result__alias">
                  Alias: {result.matchedAlias}
                </span>
              ) : null}
              <span className="retrieval-result__detail">{result.detail}</span>
            </button>
          ))}
          {results.length === 0 ? (
            <p className="retrieval-results__empty">
              {query.trim() ? "No matching notes." : "No recent notes."}
            </p>
          ) : null}
        </div>
        <footer className="retrieval-palette__footer">
          <span>↑↓ Select</span>
          <span>↵ Open</span>
          <span>⌘P Quick Open</span>
        </footer>
      </section>
    </div>
  );
}
