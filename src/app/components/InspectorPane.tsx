import type { AnchoredDocument } from "../documents";
import { displayFilePath } from "../fileTypes";

type InspectorPaneProps = {
  backlinks: AnchoredDocument[];
  hasDocument: boolean;
  showFileExtensions: boolean;
  onOpen: (documentId: string) => void;
};

/// The rightmost pane. Backlinks moved here out of the bottom of the document
/// body, where they competed with the writing for attention. The pane is
/// deliberately thin for now: outline, properties, and tags are a later
/// decision, but the pane and its splitter are real so the layout is settled.
export function InspectorPane({
  backlinks,
  hasDocument,
  showFileExtensions,
  onOpen,
}: InspectorPaneProps) {
  return (
    <aside aria-label="Inspector" className="inspector" data-pane="inspector">
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
