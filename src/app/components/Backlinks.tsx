import type { AnchoredDocument } from "../documents";
import { displayFilePath } from "../fileTypes";

type BacklinksProps = {
  documents: AnchoredDocument[];
  onOpen: (documentId: string) => void;
  showFileExtensions: boolean;
};

export function Backlinks({
  documents,
  onOpen,
  showFileExtensions,
}: BacklinksProps) {
  return (
    <aside aria-labelledby="backlinks-title" className="backlinks">
      <h2 id="backlinks-title">Backlinks ({documents.length})</h2>
      {documents.length === 0 ? (
        <p>No notes link here.</p>
      ) : (
        <ul>
          {documents.map((document) => (
            <li key={document.id}>
              <button type="button" onClick={() => onOpen(document.id)}>
                {displayFilePath(
                  document.relativePath ?? document.name,
                  showFileExtensions,
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
