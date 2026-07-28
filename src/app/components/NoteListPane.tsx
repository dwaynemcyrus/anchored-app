import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import type { AnchoredDocument } from "../documents";
import { displayFileName } from "../fileTypes";
import type { WorkbenchSort } from "../fileRailPreferences";
import { noteRowHeights } from "../noteListLayout";
import { sortNotes } from "../noteListScope";
import type { ExcerptLines } from "../paneLayout";
import { useListWindow } from "../useListWindow";
import { useNotePreview, type NotePreviewsApi } from "../useNotePreviews";
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

type NoteRowProps = {
  document: AnchoredDocument;
  excerptLines: ExcerptLines;
  index: number;
  isActive: boolean;
  previews: NotePreviewsApi;
  setSize: number;
  showFileExtensions: boolean;
  onDragDocument: (documentId: string) => void;
  onDragEnd: () => void;
  onSelectDocument: (documentId: string) => void;
  onContextMenu: (event: MouseEvent, document: AnchoredDocument) => void;
};

function NoteRow({
  document,
  excerptLines,
  index,
  isActive,
  previews,
  setSize,
  showFileExtensions,
  onDragDocument,
  onDragEnd,
  onSelectDocument,
  onContextMenu,
}: NoteRowProps) {
  const source = useMemo(
    () =>
      document.relativePath
        ? {
            modifiedMillis: document.modifiedMillis,
            relativePath: document.relativePath,
          }
        : undefined,
    [document.modifiedMillis, document.relativePath],
  );
  const preview = useNotePreview(previews, source);
  const displayName = displayFileName(document.name, showFileExtensions);
  const when = relativeDate(document);

  return (
    // The list is virtualized, so the rows in the document are a window onto a
    // longer one. Assistive technology is told the real length and position.
    <li aria-posinset={index + 1} aria-setsize={setSize}>
      <button
        // The row's identity is the note's name. Without this the accessible
        // name becomes the whole row, excerpt and date included, which reads
        // poorly and is unstable as the relative date ticks over.
        aria-label={displayName}
        aria-current={isActive ? "page" : undefined}
        className={`note-row${isActive ? " is-active" : ""}`}
        data-excerpt-lines={excerptLines}
        data-index={index}
        draggable={Boolean(document.relativePath)}
        type="button"
        onClick={() => onSelectDocument(document.id)}
        onDragEnd={onDragEnd}
        onDragStart={(event) => {
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", document.id);
          }
          onDragDocument(document.id);
        }}
        onContextMenu={(event) => onContextMenu(event, document)}
      >
        <span className="note-row__title">{displayName}</span>
        {/* Always present, even while unread: a row that grows once its
            excerpt arrives would shift every row below it mid-scroll. */}
        <span className="note-row__excerpt">{preview ?? ""}</span>
        <span className="note-row__meta">
          {[when, document.folder].filter(Boolean).join(" · ")}
        </span>
      </button>
    </li>
  );
}

/// The middle pane: the notes inside whatever the navigation pane has
/// selected.
///
/// Only the rows near the viewport exist in the document. A vault folder can
/// hold thousands of notes, and rendering all of them cost both the initial
/// render and every scroll frame after it; the rows above and below are stood
/// in for by padding, so the scrollbar still describes the whole list.
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
  const [pendingFocus, setPendingFocus] = useState<number | undefined>(
    undefined,
  );
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const sorted = useMemo(() => sortNotes(documents, sort), [documents, sort]);
  const rowHeight = noteRowHeights[excerptLines];
  const { startIndex, endIndex, offsetTop, offsetBottom } = useListWindow(
    bodyRef,
    sorted.length,
    rowHeight,
  );

  const closeMenu = useCallback(() => setMenu(undefined), []);

  const handleContextMenu = useCallback(
    (event: MouseEvent, document: AnchoredDocument) => {
      event.preventDefault();
      setMenu({ document, x: event.clientX, y: event.clientY });
    },
    [],
  );

  /// Arrow keys walk the list. Tab alone would only reach the rows that happen
  /// to be rendered, so without this virtualizing the list would put most of it
  /// out of a keyboard's reach.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const from = Number(
        (event.target as HTMLElement).getAttribute?.("data-index"),
      );
      if (Number.isNaN(from)) return;

      const to = Math.max(
        0,
        Math.min(
          sorted.length - 1,
          from + (event.key === "ArrowDown" ? 1 : -1),
        ),
      );
      if (to === from) return;
      event.preventDefault();

      const body = bodyRef.current;
      if (body) {
        const top = to * rowHeight;
        if (top < body.scrollTop) body.scrollTop = top;
        else if (top + rowHeight > body.scrollTop + body.clientHeight) {
          body.scrollTop = top + rowHeight - body.clientHeight;
        }
      }
      setPendingFocus(to);
    },
    [rowHeight, sorted.length],
  );

  // The row a key press asked for may not have been rendered yet, so the focus
  // waits for the window that contains it.
  useEffect(() => {
    if (pendingFocus === undefined) return;
    const row = bodyRef.current?.querySelector<HTMLElement>(
      `[data-index="${pendingFocus}"]`,
    );
    if (!row) return;
    row.focus();
    setPendingFocus(undefined);
  }, [endIndex, pendingFocus, startIndex]);

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

      <div className="note-list__body" ref={bodyRef}>
        {sorted.length === 0 ? (
          <p className="note-list__empty">No notes in {scopeLabel}</p>
        ) : (
          <ul
            className="note-list__rows"
            style={{
              paddingTop: `${offsetTop}px`,
              paddingBottom: `${offsetBottom}px`,
              // Read back by the stylesheet, so the height the window maths
              // assumes and the height a row actually takes cannot drift.
              ["--note-row-height" as string]: `${rowHeight}px`,
            }}
            onKeyDown={handleKeyDown}
          >
            {sorted.slice(startIndex, endIndex).map((document, offset) => (
              <NoteRow
                document={document}
                excerptLines={excerptLines}
                index={startIndex + offset}
                isActive={document.id === activeDocumentId}
                key={document.id}
                previews={previews}
                setSize={sorted.length}
                showFileExtensions={showFileExtensions}
                onContextMenu={handleContextMenu}
                onDragDocument={onDragDocument}
                onDragEnd={onDragEnd}
                onSelectDocument={onSelectDocument}
              />
            ))}
          </ul>
        )}
      </div>

      {menu ? (
        <NoteContextMenu menu={menu} onClose={closeMenu} {...menuActions} />
      ) : null}
    </section>
  );
}
