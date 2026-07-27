import { useEffect } from "react";

import type { AnchoredDocument } from "../documents";

export type NoteContextMenuState = {
  document: AnchoredDocument;
  x: number;
  y: number;
};

export type NoteContextMenuActions = {
  onArchiveDocument: (documentId: string) => void;
  onMoveDocumentRequest: (documentId: string) => void;
  onMoveDocumentToWorkbench: (documentId: string) => void;
  onOpen: (documentId: string) => void;
  onPreviewDocument: (documentId: string) => void;
  onRenameDocument: (documentId: string) => void;
  onRestoreDocument: (
    documentId: string,
    destinationStatus: "active" | "inbox",
  ) => void;
  onSearchDocument: (documentId: string) => void;
  onTrashDocument: (documentId: string) => void;
};

type NoteContextMenuProps = NoteContextMenuActions & {
  menu: NoteContextMenuState;
  onClose: () => void;
};

/// The right-click menu for a note in the list pane.
///
/// Split out of the file rail's combined menu when notes moved into their own
/// pane: the navigation pane now only ever right-clicks folders and
/// collections, so the two menus no longer share a case.
export function NoteContextMenu({
  menu,
  onArchiveDocument,
  onClose,
  onMoveDocumentRequest,
  onMoveDocumentToWorkbench,
  onOpen,
  onPreviewDocument,
  onRenameDocument,
  onRestoreDocument,
  onSearchDocument,
  onTrashDocument,
}: NoteContextMenuProps) {
  useEffect(() => {
    function close() {
      onClose();
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [onClose]);

  const note = menu.document;
  const editable = note.isMarkdown !== false;
  const status = note.status?.trim().toLocaleLowerCase();
  const archived = editable && status === "archived";
  const inInbox = editable && !archived && (!status || status === "inbox");

  return (
    <div
      aria-label="Note actions"
      className="tree-context-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button role="menuitem" type="button" onClick={() => onOpen(note.id)}>
        Open
      </button>

      {!editable ? (
        <>
          <button
            disabled
            role="menuitem"
            title="Finder reveal is not available in this build."
            type="button"
          >
            Reveal in Finder
          </button>
          <button
            disabled
            role="menuitem"
            title="Asset moves are not available in this build."
            type="button"
          >
            Move To…
          </button>
          <button
            disabled
            role="menuitem"
            title="Asset rename is not available in this build."
            type="button"
          >
            Rename
          </button>
          <button
            disabled
            role="menuitem"
            title="Asset deletion is not available in this build."
            type="button"
          >
            Delete
          </button>
        </>
      ) : null}

      {editable ? (
        <>
          <button
            role="menuitem"
            type="button"
            onClick={() => onPreviewDocument(note.id)}
          >
            Preview
          </button>
          <button
            disabled={archived}
            role="menuitem"
            title={
              archived
                ? "Archived notes cannot be physically moved."
                : undefined
            }
            type="button"
            onClick={() => onMoveDocumentRequest(note.id)}
          >
            Move To…
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => onSearchDocument(note.id)}
          >
            Search in Note
          </button>
        </>
      ) : null}

      {editable && !archived ? (
        <>
          {!inInbox ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => onRestoreDocument(note.id, "inbox")}
            >
              Move to Inbox
            </button>
          ) : null}
          {inInbox && note.noteType?.toLocaleLowerCase() !== "scratchpad" ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => onMoveDocumentToWorkbench(note.id)}
            >
              Move to Workbench…
            </button>
          ) : null}
          <button
            role="menuitem"
            type="button"
            onClick={() => onRenameDocument(note.id)}
          >
            Rename
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => onArchiveDocument(note.id)}
          >
            Archive
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => onTrashDocument(note.id)}
          >
            Move to Trash
          </button>
        </>
      ) : null}

      {archived ? (
        <>
          <button
            role="menuitem"
            type="button"
            onClick={() => onRestoreDocument(note.id, "inbox")}
          >
            Restore to Inbox
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => onRestoreDocument(note.id, "active")}
          >
            Restore to Workbench
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => onTrashDocument(note.id)}
          >
            Move to Trash
          </button>
        </>
      ) : null}
    </div>
  );
}
