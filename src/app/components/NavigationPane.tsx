import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";

import { buildVaultCollections } from "../collections";
import type { AnchoredDocument } from "../documents";
import type { FileRailMode } from "../fileRailPreferences";
import {
  collectionLabels,
  isSameScope,
  type CollectionId,
  type NoteListScope,
} from "../noteListScope";
import {
  ChevronIcon,
  FolderIcon,
  NewFileIcon,
  NewFolderIcon,
  SearchIcon,
  TrashIcon,
} from "./Icons";
import { IconButton } from "./IconButton";

const collectionOrder: CollectionId[] = [
  "inbox",
  "scratchpad",
  "workbench",
  "archive",
  "assets",
];

type FolderMenuState = { path: string; x: number; y: number };

type NavigationPaneProps = {
  documents: AnchoredDocument[];
  expandedFolders: Set<string>;
  folders: string[];
  mode: FileRailMode;
  query: string;
  scope: NoteListScope;
  searchInputRef: RefObject<HTMLInputElement | null>;
  trashCount: number;
  vaultName: string;
  draggingDocumentId?: string;
  onCreateFolder: (parentPath?: string) => void;
  onDropDocument: (documentId: string, folderPath: string) => void;
  onCreateNote: () => void;
  onCreateNoteInFolder: (folderPath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onModeChange: (mode: FileRailMode) => void;
  onMoveFolderRequest: (folderPath: string) => void;
  onOpenTrash: () => void;
  onQueryChange: (query: string) => void;
  onRenameFolder: (folderPath: string) => void;
  onScopeChange: (scope: NoteListScope) => void;
  onSearchInFolder: (folderPath: string) => void;
  onToggleFolder: (folder: string) => void;
};

function folderName(path: string): string {
  return path.split("/").pop() ?? path;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

/// The leftmost pane: the five collections, or the physical folder tree.
///
/// Unlike the file rail it replaces, this tree holds containers only. Notes
/// live in the list pane, so selecting here changes what that pane lists
/// rather than opening anything.
export function NavigationPane({
  documents,
  expandedFolders,
  folders,
  mode,
  query,
  scope,
  searchInputRef,
  trashCount,
  vaultName,
  draggingDocumentId,
  onCreateFolder,
  onDropDocument,
  onCreateNote,
  onCreateNoteInFolder,
  onDeleteFolder,
  onModeChange,
  onMoveFolderRequest,
  onOpenTrash,
  onQueryChange,
  onRenameFolder,
  onScopeChange,
  onSearchInFolder,
  onToggleFolder,
}: NavigationPaneProps) {
  const [menu, setMenu] = useState<FolderMenuState | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<string | undefined>(undefined);

  const counts = useMemo(() => {
    const collections = buildVaultCollections(documents);
    return {
      inbox: collections.inbox.length,
      scratchpad: collections.scratchpad.length,
      workbench: collections.workbench.length,
      archive: collections.archive.length,
      assets: collections.assets.length,
    };
  }, [documents]);

  // Only folders whose parent chain is expanded are rendered, so a deep tree
  // costs nothing until it is opened.
  const visibleFolders = useMemo(() => {
    const sorted = [...folders].sort((left, right) =>
      left.localeCompare(right),
    );
    return sorted.filter((folder) => {
      let parent = parentPath(folder);
      while (parent) {
        if (!expandedFolders.has(parent)) return false;
        parent = parentPath(parent);
      }
      return true;
    });
  }, [expandedFolders, folders]);

  const hasChildren = useCallback(
    (path: string) => folders.some((folder) => parentPath(folder) === path),
    [folders],
  );

  const closeMenu = useCallback(() => setMenu(undefined), []);

  const handleFolderContextMenu = useCallback(
    (event: MouseEvent, path: string) => {
      event.preventDefault();
      setMenu({ path, x: event.clientX, y: event.clientY });
    },
    [],
  );

  return (
    <nav
      aria-label="Vault navigation"
      className="file-rail"
      data-pane="navigation"
    >
      <div className="file-rail__tools file-rail__tools--collections">
        <label className="search-field">
          <SearchIcon />
          <input
            aria-label="Filter notes"
            placeholder="Search notes"
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <IconButton label="New note" onClick={onCreateNote}>
          <NewFileIcon />
        </IconButton>
      </div>

      <div className="file-rail__view-options">
        <div aria-label="Navigation view" className="file-rail__segmented">
          <button
            aria-pressed={mode === "collections"}
            type="button"
            onClick={() => onModeChange("collections")}
          >
            Collections
          </button>
          <button
            aria-pressed={mode === "files"}
            type="button"
            onClick={() => onModeChange("files")}
          >
            Files
          </button>
        </div>
        {mode === "files" ? (
          <div className="file-rail__view-actions">
            <IconButton
              label="Create folder at vault root"
              onClick={() => onCreateFolder()}
            >
              <NewFolderIcon />
            </IconButton>
          </div>
        ) : null}
      </div>

      <div className="file-tree">
        {mode === "collections"
          ? collectionOrder.map((id) => {
              const selected = isSameScope(scope, { kind: "collection", id });
              return (
                <button
                  aria-current={selected ? "true" : undefined}
                  className={`tree-row tree-row--collection${
                    selected ? " is-active" : ""
                  }`}
                  key={id}
                  type="button"
                  onClick={() => onScopeChange({ kind: "collection", id })}
                >
                  <span>{collectionLabels[id]}</span>
                  <span className="tree-row__count">{counts[id]}</span>
                </button>
              );
            })
          : visibleFolders.map((path) => {
              const selected = isSameScope(scope, { kind: "folder", path });
              const expanded = expandedFolders.has(path);
              const depth = path.split("/").length - 1;
              return (
                // The disclosure and the folder are siblings rather than
                // nested buttons: expanding a folder to look inside and
                // selecting it to list its notes are separate intentions, and
                // each needs its own focusable, labelled control.
                <div
                  className="tree-row-shell"
                  key={path}
                  style={{ paddingLeft: `${depth * 18}px` }}
                >
                  {hasChildren(path) ? (
                    <button
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${folderName(path)}`}
                      className="tree-row__disclosure"
                      type="button"
                      onClick={() => onToggleFolder(path)}
                    >
                      <ChevronIcon
                        className={expanded ? "is-expanded" : undefined}
                      />
                    </button>
                  ) : (
                    <span aria-hidden="true" className="tree-row__disclosure" />
                  )}
                  <button
                    aria-current={selected ? "true" : undefined}
                    aria-label={folderName(path)}
                    className={`tree-row tree-row--folder${
                      selected ? " is-active" : ""
                    }${dropTarget === path ? " is-drop-target" : ""}`}
                    type="button"
                    onClick={() => onScopeChange({ kind: "folder", path })}
                    onContextMenu={(event) =>
                      handleFolderContextMenu(event, path)
                    }
                    onDragLeave={() =>
                      setDropTarget((current) =>
                        current === path ? undefined : current,
                      )
                    }
                    onDragOver={(event) => {
                      if (!draggingDocumentId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget(path);
                    }}
                    onDrop={(event) => {
                      if (!draggingDocumentId) return;
                      event.preventDefault();
                      setDropTarget(undefined);
                      onDropDocument(draggingDocumentId, path);
                    }}
                  >
                    <FolderIcon />
                    <span>{folderName(path)}</span>
                  </button>
                </div>
              );
            })}
      </div>

      <footer className="file-rail__footer">
        <span className="file-rail__scope">{vaultName}</span>
        <button type="button" onClick={onOpenTrash}>
          <TrashIcon />
          Trash{trashCount > 0 ? ` (${trashCount})` : ""}
        </button>
      </footer>

      {menu ? (
        <div
          aria-label="Folder actions"
          className="tree-context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onCreateNoteInFolder(menu.path);
              closeMenu();
            }}
          >
            New note
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onCreateFolder(menu.path);
              closeMenu();
            }}
          >
            New subfolder
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onMoveFolderRequest(menu.path);
              closeMenu();
            }}
          >
            Move Folder To…
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onSearchInFolder(menu.path);
              closeMenu();
            }}
          >
            Search in Folder
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onRenameFolder(menu.path);
              closeMenu();
            }}
          >
            Rename
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onDeleteFolder(menu.path);
              closeMenu();
            }}
          >
            Delete folder
          </button>
        </div>
      ) : null}
    </nav>
  );
}
