import { useMemo, useState, type RefObject } from "react";

import type { AnchoredDocument } from "../documents";
import {
  ChevronIcon,
  FileIcon,
  FolderIcon,
  NewFileIcon,
  NewFolderIcon,
  RenameIcon,
  SearchIcon,
  TrashIcon,
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
  vaultName: string;
  vaultSelected: boolean;
  onCreateFolder: (parentPath?: string) => void;
  onCreateNote: () => void;
  onDeleteFolder: (folderPath: string) => void;
  onMoveDocument: (documentId: string, destinationFolderPath: string) => void;
  onOpenTrash: () => void;
  onQueryChange: (query: string) => void;
  onRenameFolder: (folderPath: string) => void;
  onSelectDocument: (documentId: string) => void;
  onToggleFolder: (folder: string) => void;
};

function folderDepth(path: string): number {
  return path.split("/").length - 1;
}

function folderName(path: string): string {
  return path.split("/").pop() ?? path;
}

function parentFolderPath(path: string): string | undefined {
  const segments = path.split("/");
  segments.pop();
  return segments.length > 0 ? segments.join("/") : undefined;
}

function documentMatchesQuery(
  document: AnchoredDocument,
  normalizedQuery: string,
): boolean {
  return (
    normalizedQuery.length === 0 ||
    document.name.toLocaleLowerCase().includes(normalizedQuery) ||
    document.aliases.some((alias) =>
      alias.toLocaleLowerCase().includes(normalizedQuery),
    )
  );
}

export function FileRail({
  activeDocumentId,
  documents,
  expandedFolders,
  folders,
  query,
  searchInputRef,
  trashCount,
  vaultName,
  vaultSelected,
  onCreateFolder,
  onCreateNote,
  onDeleteFolder,
  onMoveDocument,
  onOpenTrash,
  onQueryChange,
  onRenameFolder,
  onSelectDocument,
  onToggleFolder,
}: FileRailProps) {
  const [draggingDocumentId, setDraggingDocumentId] = useState<
    string | undefined
  >();
  const [dropTargetFolder, setDropTargetFolder] = useState<
    string | undefined
  >();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) =>
        documentMatchesQuery(document, normalizedQuery),
      ),
    [documents, normalizedQuery],
  );
  const documentsByFolder = useMemo(() => {
    const groups = new Map<string, AnchoredDocument[]>();
    for (const document of filteredDocuments) {
      const folderPath = document.folderPath ?? "";
      const current = groups.get(folderPath) ?? [];
      current.push(document);
      groups.set(folderPath, current);
    }
    return groups;
  }, [filteredDocuments]);
  const visibleFolderMatches = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return new Set(folders);
    }

    return new Set(
      folders.filter((folder) =>
        filteredDocuments.some(
          (document) =>
            (document.folderPath ?? "") === folder ||
            (document.folderPath ?? "").startsWith(`${folder}/`),
        ),
      ),
    );
  }, [filteredDocuments, folders, normalizedQuery.length]);

  function folderIsVisible(path: string): boolean {
    if (normalizedQuery.length > 0) {
      return visibleFolderMatches.has(path);
    }

    let parent = parentFolderPath(path);
    while (parent) {
      if (!expandedFolders.has(parent)) {
        return false;
      }
      parent = parentFolderPath(parent);
    }
    return true;
  }

  function documentIsDraggable(document: AnchoredDocument): boolean {
    return (
      document.id.startsWith("vault-id:") &&
      Boolean(document.relativePath) &&
      document.saveState === "saved"
    );
  }

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
            vaultSelected
              ? "Create folder at vault root"
              : "Open a vault before creating a folder"
          }
          onClick={() => onCreateFolder(undefined)}
        >
          <NewFolderIcon />
        </IconButton>
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
        {(documentsByFolder.get("") ?? []).map((document) => {
          const isActive = document.id === activeDocumentId;
          const draggable = documentIsDraggable(document);

          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={`tree-row tree-row--file${
                isActive ? " is-active" : ""
              }`}
              draggable={draggable}
              key={document.id}
              type="button"
              onClick={() => onSelectDocument(document.id)}
              onDragEnd={() => {
                setDraggingDocumentId(undefined);
                setDropTargetFolder(undefined);
              }}
              onDragStart={(event) => {
                if (!draggable) {
                  event.preventDefault();
                  return;
                }
                setDraggingDocumentId(document.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", document.id);
              }}
            >
              <FileIcon />
              <span>{document.name}</span>
            </button>
          );
        })}
        {folders.map((folder) => {
          if (!folderIsVisible(folder)) {
            return null;
          }

          const folderDocuments = documentsByFolder.get(folder) ?? [];
          const isExpanded =
            normalizedQuery.length > 0 || expandedFolders.has(folder);
          const depth = folderDepth(folder);

          return (
            <div className="tree-group" key={folder}>
              <div
                className={`tree-row tree-row--folder${
                  dropTargetFolder === folder ? " is-drop-target" : ""
                }`}
                style={{ paddingLeft: `${12 + depth * 18}px` }}
                onDragLeave={() => {
                  if (dropTargetFolder === folder) {
                    setDropTargetFolder(undefined);
                  }
                }}
                onDragOver={(event) => {
                  if (!draggingDocumentId) return;
                  event.preventDefault();
                  if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move";
                  }
                  setDropTargetFolder(folder);
                }}
                onDrop={(event) => {
                  if (!draggingDocumentId) return;
                  event.preventDefault();
                  const movedDocumentId = draggingDocumentId;
                  setDraggingDocumentId(undefined);
                  setDropTargetFolder(undefined);
                  onMoveDocument(movedDocumentId, folder);
                }}
              >
                <button
                  aria-expanded={isExpanded}
                  className="tree-row__button"
                  type="button"
                  onClick={() => onToggleFolder(folder)}
                >
                  <ChevronIcon className={isExpanded ? "is-expanded" : ""} />
                  <FolderIcon />
                  <span>{folderName(folder)}</span>
                </button>
                <div className="tree-row__actions">
                  <IconButton
                    className="tree-row__action"
                    label={`Rename ${folderName(folder)} folder`}
                    onClick={() => onRenameFolder(folder)}
                  >
                    <RenameIcon />
                  </IconButton>
                  <IconButton
                    className="tree-row__action"
                    label={`Delete ${folderName(folder)} folder`}
                    onClick={() => onDeleteFolder(folder)}
                  >
                    <TrashIcon />
                  </IconButton>
                  <IconButton
                    className="tree-row__action"
                    label={`Create subfolder inside ${folderName(folder)}`}
                    onClick={() => onCreateFolder(folder)}
                  >
                    <NewFolderIcon />
                  </IconButton>
                </div>
              </div>
              {isExpanded ? (
                <div role="group">
                  {folderDocuments.map((document) => {
                    const isActive = document.id === activeDocumentId;
                    const draggable = documentIsDraggable(document);

                    return (
                      <button
                        aria-current={isActive ? "page" : undefined}
                        className={`tree-row tree-row--file${
                          isActive ? " is-active" : ""
                        }`}
                        draggable={draggable}
                        key={document.id}
                        style={{ paddingLeft: `${42 + depth * 18}px` }}
                        type="button"
                        onClick={() => onSelectDocument(document.id)}
                        onDragEnd={() => {
                          setDraggingDocumentId(undefined);
                          setDropTargetFolder(undefined);
                        }}
                        onDragStart={(event) => {
                          if (!draggable) {
                            event.preventDefault();
                            return;
                          }
                          setDraggingDocumentId(document.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", document.id);
                        }}
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
        {documents.length === 0 && folders.length === 0 ? (
          <p className="file-tree__empty">No Markdown notes or folders.</p>
        ) : null}
        {normalizedQuery.length > 0 && filteredDocuments.length === 0 ? (
          <p className="file-tree__empty">No matching notes.</p>
        ) : null}
      </nav>
      {vaultSelected ? (
        <footer className="file-rail__footer">
          <span className="file-rail__scope">{vaultName}</span>
          <button type="button" onClick={onOpenTrash}>
            Trash{trashCount > 0 ? ` (${trashCount})` : ""}
          </button>
        </footer>
      ) : null}
    </aside>
  );
}
