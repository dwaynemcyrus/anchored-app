import type { RefObject } from "react";

import type { AnchoredDocument } from "../documents";
import {
  ChevronIcon,
  FileIcon,
  FolderIcon,
  NewFileIcon,
  SearchIcon,
} from "./Icons";
import { IconButton } from "./IconButton";

type FileRailProps = {
  activeDocumentId: string;
  documents: AnchoredDocument[];
  expandedFolders: Set<string>;
  folders: string[];
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  trashCount: number;
  vaultSelected: boolean;
  onCreateNote: () => void;
  onOpenTrash: () => void;
  onQueryChange: (query: string) => void;
  onSelectDocument: (documentId: string) => void;
  onToggleFolder: (folder: string) => void;
};

export function FileRail({
  activeDocumentId,
  documents,
  expandedFolders,
  folders,
  query,
  searchInputRef,
  trashCount,
  vaultSelected,
  onCreateNote,
  onOpenTrash,
  onQueryChange,
  onSelectDocument,
  onToggleFolder,
}: FileRailProps) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return (
    <aside aria-label="File explorer" className="file-rail">
      <div className="file-rail__tools">
        <label className="search-field">
          <span className="visually-hidden">Filter notes</span>
          <SearchIcon />
          <input
            ref={searchInputRef}
            aria-label="Filter notes"
            autoComplete="off"
            placeholder="Filter notes"
            spellCheck="false"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <IconButton
          disabled={!vaultSelected}
          label={
            vaultSelected ? "New note" : "Open a vault before creating a note"
          }
          onClick={onCreateNote}
        >
          <NewFileIcon />
        </IconButton>
      </div>
      <nav aria-label="Vault files" className="file-tree">
        {folders.map((folder) => {
          const folderDocuments = documents.filter(
            (document) =>
              document.folder === folder &&
              (normalizedQuery.length === 0 ||
                document.name.toLocaleLowerCase().includes(normalizedQuery) ||
                document.aliases.some((alias) =>
                  alias.toLocaleLowerCase().includes(normalizedQuery),
                )),
          );
          const isExpanded =
            expandedFolders.has(folder) || normalizedQuery.length > 0;

          if (normalizedQuery.length > 0 && folderDocuments.length === 0) {
            return null;
          }

          return (
            <div className="tree-group" key={folder}>
              <button
                aria-expanded={isExpanded}
                className="tree-row tree-row--folder"
                type="button"
                onClick={() => onToggleFolder(folder)}
              >
                <ChevronIcon className={isExpanded ? "is-expanded" : ""} />
                <FolderIcon />
                <span>{folder}</span>
              </button>
              {isExpanded ? (
                <div role="group">
                  {folderDocuments.map((document) => {
                    const isActive = document.id === activeDocumentId;

                    return (
                      <button
                        aria-current={isActive ? "page" : undefined}
                        className={`tree-row tree-row--file${
                          isActive ? " is-active" : ""
                        }`}
                        key={document.id}
                        type="button"
                        onClick={() => onSelectDocument(document.id)}
                      >
                        <FileIcon />
                        <span>{document.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {documents.length === 0 ? (
          <p className="file-tree__empty">No Markdown notes.</p>
        ) : null}
        {normalizedQuery.length > 0 &&
        documents.length > 0 &&
        !documents.some(
          (document) =>
            document.name.toLocaleLowerCase().includes(normalizedQuery) ||
            document.aliases.some((alias) =>
              alias.toLocaleLowerCase().includes(normalizedQuery),
            ),
        ) ? (
          <p className="file-tree__empty">No matching notes.</p>
        ) : null}
      </nav>
      {vaultSelected ? (
        <footer className="file-rail__footer">
          <button type="button" onClick={onOpenTrash}>
            Trash{trashCount > 0 ? ` (${trashCount})` : ""}
          </button>
        </footer>
      ) : null}
    </aside>
  );
}
