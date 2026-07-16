import type { AnchoredDocument } from "../documents";

type BacklinksProps = {
  documents: AnchoredDocument[];
  onOpen: (documentId: string) => void;
};

export function Backlinks({ documents, onOpen }: BacklinksProps) {
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
                {document.relativePath ?? document.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
