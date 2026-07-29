import type { AnchoredDocument } from "../documents";
import { displayFilePath } from "../fileTypes";
import { CloseIcon } from "./Icons";

type InspectorPaneProps = {
  backlinks: AnchoredDocument[];
  hasDocument: boolean;
  /// The document pinned above the workspace, if any. Not the note being
  /// edited: this is the one being consulted while everything else changes
  /// around it.
  pinnedReference?: AnchoredDocument;
  showFileExtensions: boolean;
  onOpen: (documentId: string) => void;
  onUnpinReference: () => void;
};

/// The rightmost pane. Backlinks moved here out of the bottom of the document
/// body, where they competed with the writing for attention.
///
/// A pinned reference sits above them in its own section rather than behind a
/// panel switcher. Obsidian stacks several panels here and a switcher is
/// probably the eventual answer, but building one for two sections would decide
/// that question early — and this arrangement is what a switcher would later
/// absorb rather than something it would have to undo.
export function InspectorPane({
  backlinks,
  hasDocument,
  pinnedReference,
  showFileExtensions,
  onOpen,
  onUnpinReference,
}: InspectorPaneProps) {
  const referenceName = pinnedReference
    ? displayFilePath(
        pinnedReference.relativePath ?? pinnedReference.name,
        showFileExtensions,
      )
    : "";

  return (
    <aside aria-label="Inspector" className="inspector" data-pane="inspector">
      {pinnedReference ? (
        <section aria-label="Reference" className="inspector__reference">
          <header className="inspector__header">
            <h2 className="inspector__title">Reference</h2>
            <button
              aria-label={`Unpin ${referenceName} as reference`}
              className="icon-button"
              title="Unpin as reference"
              type="button"
              onClick={onUnpinReference}
            >
              <CloseIcon />
            </button>
          </header>
          <button
            className="inspector__row"
            type="button"
            onClick={() => onOpen(pinnedReference.id)}
          >
            {referenceName}
          </button>
        </section>
      ) : null}

      <header className="inspector__header">
        <h2 className="inspector__title">Backlinks</h2>
        <span className="inspector__count">{backlinks.length}</span>
      </header>

      <div className="inspector__body">
        {!hasDocument ? (
          <p className="inspector__empty">No note open</p>
        ) : backlinks.length === 0 ? (
          <p className="inspector__empty">Nothing links here yet</p>
        ) : (
          <ul className="inspector__rows">
            {backlinks.map((document) => (
              <li key={document.id}>
                <button
                  className="inspector__row"
                  type="button"
                  onClick={() => onOpen(document.id)}
                >
                  {displayFilePath(
                    document.relativePath ?? document.name,
                    showFileExtensions,
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
