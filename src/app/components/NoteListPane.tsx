import { useCallback, useMemo, useState, type MouseEvent } from "react";

import type { AnchoredDocument } from "../documents";
import { displayFileName } from "../fileTypes";
import type { WorkbenchSort } from "../fileRailPreferences";
import { sortNotes } from "../noteListScope";
import type { ExcerptLines } from "../paneLayout";
import type { NotePreviewsApi } from "../useNotePreviews";
import { ChevronIcon } from "./Icons";
import {
  NoteContextMenu,
  type NoteContextMenuActions,
  type NoteContextMenuState,
} from "./NoteContextMenu";

const sortLabels: Record<WorkbenchSort, string> = {
  "modified-desc": "Recent",
  "modified-asc": "Oldest",
  "created-desc": "Newest first",
  "created-asc": "Created oldest",
  "name-asc": "Name A–Z",
  "name-desc": "Name Z–A",
};

const sortOrder: WorkbenchSort[] = [
  "modified-desc",
  "modified-asc",
  "created-desc",
  "created-asc",
  "name-asc",
  "name-desc",
];

type NoteListPaneProps = NoteContextMenuActions & {
  activeDocumentId: string;
  onDragDocument: (documentId: string) => void;
  onDragEnd: () => void;
  documents: AnchoredDocument[];
  excerptLines: ExcerptLines;
  previews: NotePreviewsApi;
  scopeLabel: string;
  showFileExtensions: boolean;
  sort: WorkbenchSort;
  onSelectDocument: (documentId: string) => void;
  onSortChange: (sort: WorkbenchSort) => void;
};

function relativeDate(document: AnchoredDocument): string {
  const millis = document.modifiedMillis;
  if (!millis) return "";

  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return "";

  const elapsed = Date.now() - millis;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  if (elapsed < hour) return "Just now";
  if (elapsed < day) {
    const hours = Math.floor(elapsed / hour);
    return `${hours}h ago`;
  }
  if (elapsed < 2 * day) return "Yesterday";
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)}d ago`;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/// The middle pane: the notes inside whatever the navigation pane has
/// selected. Row previews come from `previews`, which reads each note only
/// once its row reaches the viewport.
export function NoteListPane({
  activeDocumentId,
  documents,
  onDragDocument,
  onDragEnd,
  excerptLines,
  previews,
  scopeLabel,
  showFileExtensions,
  sort,
  onSelectDocument,
  onSortChange,
  ...menuActions
}: NoteListPaneProps) {
  const [menu, setMenu] = useState<NoteContextMenuState | undefined>(undefined);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const sorted = useMemo(() => sortNotes(documents, sort), [documents, sort]);

  const closeMenu = useCallback(() => setMenu(undefined), []);

  const handleContextMenu = useCallback(
    (event: MouseEvent, document: AnchoredDocument) => {
      event.preventDefault();
      setMenu({ document, x: event.clientX, y: event.clientY });
    },
    [],
  );

  return (
    <section aria-label="Notes" className="note-list" data-pane="list">
      <header className="note-list__header">
        <h2 className="note-list__title" title={scopeLabel}>
          {scopeLabel}
        </h2>
        <div className="note-list__meta">
          <span aria-label={`${sorted.length} notes`}>{sorted.length}</span>
          <span className="note-list__sort">
            <button
              aria-expanded={sortMenuOpen}
              aria-haspopup="menu"
              className="note-list__sort-button"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setSortMenuOpen((open) => !open);
              }}
            >
              {sortLabels[sort]}
              <ChevronIcon />
            </button>
            {sortMenuOpen ? (
              <div
                aria-label="Sort notes"
                className="tree-context-menu note-list__sort-menu"
                role="menu"
                onClick={(event) => event.stopPropagation()}
              >
                {sortOrder.map((option) => (
                  <button
                    aria-checked={option === sort}
                    key={option}
                    role="menuitemradio"
                    type="button"
                    onClick={() => {
                      onSortChange(option);
                      setSortMenuOpen(false);
                    }}
                  >
                    {sortLabels[option]}
                  </button>
                ))}
              </div>
            ) : null}
          </span>
        </div>
      </header>

      <div className="note-list__body">
        {sorted.length === 0 ? (
          <p className="note-list__empty">No notes in {scopeLabel}</p>
        ) : (
          <ul className="note-list__rows">
            {sorted.map((document) => {
              const source = document.relativePath
                ? {
                    modifiedMillis: document.modifiedMillis,
                    relativePath: document.relativePath,
                  }
                : undefined;
              const preview = previews.previewFor(source);
              const displayName = displayFileName(
                document.name,
                showFileExtensions,
              );
              const when = relativeDate(document);

              return (
                <li key={document.id}>
                  <button
                    // The row's identity is the note's name. Without this the
                    // accessible name becomes the whole row, excerpt and date
                    // included, which reads poorly and is unstable as the
                    // relative date ticks over.
                    aria-label={displayName}
                    aria-current={
                      document.id === activeDocumentId ? "page" : undefined
                    }
                    className={`note-row${
                      document.id === activeDocumentId ? " is-active" : ""
                    }`}
                    data-excerpt-lines={excerptLines}
                    draggable={Boolean(document.relativePath)}
                    ref={previews.observeRow(source)}
                    type="button"
                    onClick={() => onSelectDocument(document.id)}
                    onDragEnd={onDragEnd}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", document.id);
                      onDragDocument(document.id);
                    }}
                    onContextMenu={(event) =>
                      handleContextMenu(event, document)
                    }
                  >
                    <span className="note-row__title">{displayName}</span>
                    {preview ? (
                      <span className="note-row__excerpt">{preview}</span>
                    ) : null}
                    <span className="note-row__meta">
                      {[when, document.folder].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {menu ? (
        <NoteContextMenu menu={menu} onClose={closeMenu} {...menuActions} />
      ) : null}
    </section>
  );
}
