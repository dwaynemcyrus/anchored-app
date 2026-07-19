import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type DragEvent,
} from "react";

import type { AnchoredDocument } from "../documents";
import { fileTypeLabel, fileTypeForName } from "../fileTypes";
import {
  ChevronIcon,
  FileTypeIcon,
  FolderIcon,
  NewFileIcon,
  NewFolderIcon,
  RenameIcon,
  SearchIcon,
  TrashIcon,
} from "./Icons";
import { IconButton } from "./IconButton";

const TREE_ROW_HEIGHT = 40;
const TREE_OVERSCAN = 8;

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
  onRenameDocument: (documentId: string) => void;
  onRenameFolder: (folderPath: string) => void;
  onSelectDocument: (documentId: string) => void;
  onToggleFolder: (folder: string) => void;
  onTrashDocument: (documentId: string) => void;
};

type TreeRowData =
  | {
      depth: number;
      kind: "folder";
      path: string;
    }
  | {
      depth: number;
      document: AnchoredDocument;
      kind: "file";
    };

type ContextMenuState = {
  item: TreeRowData;
  x: number;
  y: number;
};

function folderName(path: string): string {
  return path.split("/").pop() ?? path;
}

function parentFolderPath(path: string): string | undefined {
  const segments = path.split("/");
  segments.pop();
  return segments.length > 0 ? segments.join("/") : undefined;
}

function compareNames(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function treeRowKey(row: TreeRowData): string {
  return row.kind === "folder" ? `folder:${row.path}` : row.document.id;
}

function documentMatchesQuery(
  document: AnchoredDocument,
  normalizedQuery: string,
): boolean {
  return (
    normalizedQuery.length === 0 ||
    document.name.toLocaleLowerCase().includes(normalizedQuery) ||
    fileTypeLabel(fileTypeForName(document.name))
      .toLocaleLowerCase()
      .includes(normalizedQuery) ||
    document.aliases.some((alias) =>
      alias.toLocaleLowerCase().includes(normalizedQuery),
    )
  );
}

function documentIsDraggable(document: AnchoredDocument): boolean {
  return (
    Boolean(document.relativePath) &&
    document.isMarkdown !== false &&
    document.saveState === "saved"
  );
}

function VirtualTree({
  rows,
  activeDocumentId,
  expandedFolders,
  selectedKey,
  onContextMenu,
  onSelectDocument,
  onSelectFolder,
  onToggleFolder,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  dropTargetFolder,
}: {
  rows: TreeRowData[];
  activeDocumentId: string;
  expandedFolders: Set<string>;
  selectedKey?: string;
  onContextMenu: (event: MouseEvent, item: TreeRowData) => void;
  onSelectDocument: (documentId: string) => void;
  onSelectFolder: (folderPath: string) => void;
  onToggleFolder: (folderPath: string) => void;
  onDragStart: (event: DragEvent, document: AnchoredDocument) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent, folderPath: string) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent, folderPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onRenameFolder: (folderPath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  dropTargetFolder?: string;
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    function updateSize() {
      setViewportHeight(element?.clientHeight ?? 0);
    }

    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(element);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const visibleStart = Math.max(
    0,
    Math.floor(scrollTop / TREE_ROW_HEIGHT) - TREE_OVERSCAN,
  );
  const visibleEnd = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportHeight) / TREE_ROW_HEIGHT) + TREE_OVERSCAN,
  );
  const visibleRows = rows.slice(visibleStart, visibleEnd);

  return (
    <nav
      ref={scrollRef}
      aria-label="Vault files"
      className="file-tree"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: rows.length * TREE_ROW_HEIGHT }}>
        <div
          style={{
            transform: `translateY(${visibleStart * TREE_ROW_HEIGHT}px)`,
          }}
        >
          {visibleRows.map((row) => {
            const key = treeRowKey(row);
            return row.kind === "folder" ? (
              <FolderTreeRow
                expanded={expandedFolders.has(row.path)}
                key={key}
                path={row.path}
                selected={selectedKey === key}
                depth={row.depth}
                onContextMenu={(event) => onContextMenu(event, row)}
                onSelect={() => onSelectFolder(row.path)}
                onToggle={() => onToggleFolder(row.path)}
                onDragOver={(event) => onDragOver(event, row.path)}
                onDragLeave={onDragLeave}
                onDrop={(event) => onDrop(event, row.path)}
                onCreateFolder={() => onCreateFolder(row.path)}
                onRename={() => onRenameFolder(row.path)}
                onDelete={() => onDeleteFolder(row.path)}
                dropTarget={dropTargetFolder === row.path}
              />
            ) : (
              <FileTreeRow
                active={row.document.id === activeDocumentId}
                depth={row.depth}
                document={row.document}
                key={key}
                selected={selectedKey === key}
                onContextMenu={(event) => onContextMenu(event, row)}
                onSelect={() => onSelectDocument(row.document.id)}
                onDragStart={(event) => onDragStart(event, row.document)}
                onDragEnd={onDragEnd}
              />
            );
          })}
        </div>
      </div>
    </nav>
  );
}

const FolderTreeRow = memo(function FolderTreeRow({
  depth,
  expanded,
  path,
  selected,
  onContextMenu,
  onSelect,
  onToggle,
  onDragOver,
  onDragLeave,
  onDrop,
  onCreateFolder,
  onRename,
  onDelete,
  dropTarget,
}: {
  depth: number;
  expanded: boolean;
  path: string;
  selected: boolean;
  onContextMenu: (event: MouseEvent) => void;
  onSelect: () => void;
  onToggle: () => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent) => void;
  onCreateFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  dropTarget: boolean;
}) {
  return (
    <div
      aria-expanded={expanded}
      aria-selected={selected}
      aria-label={folderName(path)}
      className={`tree-row tree-row--folder${selected ? " is-selected" : ""}${dropTarget ? " is-drop-target" : ""}`}
      role="button"
      style={{ paddingLeft: `${8 + depth * 18}px` }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button
        aria-label={`${expanded ? "Collapse" : "Expand"} ${folderName(path)}`}
        className="tree-row__disclosure"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <ChevronIcon className={expanded ? "is-expanded" : ""} />
      </button>
      <FolderIcon />
      <span>{folderName(path)}</span>
      <span className="tree-row__actions">
        <IconButton
          label={`Create subfolder inside ${folderName(path)}`}
          onClick={(event) => {
            event.stopPropagation();
            onCreateFolder();
          }}
        >
          <NewFolderIcon />
        </IconButton>
        <IconButton
          label={`Rename ${folderName(path)} folder`}
          onClick={(event) => {
            event.stopPropagation();
            onRename();
          }}
        >
          <RenameIcon />
        </IconButton>
        <IconButton
          label={`Delete ${folderName(path)} folder`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <TrashIcon />
        </IconButton>
      </span>
    </div>
  );
});

const FileTreeRow = memo(function FileTreeRow({
  active,
  depth,
  document,
  selected,
  onContextMenu,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  active: boolean;
  depth: number;
  document: AnchoredDocument;
  selected: boolean;
  onContextMenu: (event: MouseEvent) => void;
  onSelect: () => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const type = fileTypeForName(document.name);
  const draggable = documentIsDraggable(document);
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={document.name}
      className={`tree-row tree-row--file${active ? " is-active" : ""}${
        selected ? " is-selected" : ""
      }`}
      draggable={draggable}
      style={{ paddingLeft: `${26 + depth * 18}px` }}
      title={`${document.name} · ${fileTypeLabel(type)}`}
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <FileTypeIcon fileName={document.name} />
      <span>{document.name}</span>
      <span className="tree-row__type" aria-hidden="true">
        {fileTypeLabel(type)}
      </span>
    </button>
  );
});

function ContextMenu({
  menu,
  onClose,
  onCreateFolder,
  onDeleteFolder,
  onOpen,
  onRenameDocument,
  onRenameFolder,
  onTrashDocument,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onCreateFolder: (parentPath?: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onOpen: (documentId: string) => void;
  onRenameDocument: (documentId: string) => void;
  onRenameFolder: (folderPath: string) => void;
  onTrashDocument: (documentId: string) => void;
}) {
  useEffect(() => {
    function close() {
      onClose();
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  const item = menu.item;
  return (
    <div
      aria-label="File tree actions"
      className="tree-context-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {item.kind === "file" ? (
        <>
          <button
            role="menuitem"
            type="button"
            onClick={() => onOpen(item.document.id)}
          >
            Open
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => onRenameDocument(item.document.id)}
          >
            Rename
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => onTrashDocument(item.document.id)}
          >
            Move to Trash
          </button>
        </>
      ) : (
        <>
          <button
            role="menuitem"
            type="button"
            onClick={() => onCreateFolder(item.path)}
          >
            New subfolder
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => onRenameFolder(item.path)}
          >
            Rename
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => onDeleteFolder(item.path)}
          >
            Delete folder
          </button>
        </>
      )}
    </div>
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
  onRenameDocument,
  onRenameFolder,
  onSelectDocument,
  onToggleFolder,
  onTrashDocument,
}: FileRailProps) {
  const [selectedKey, setSelectedKey] = useState<string>();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [draggingDocumentId, setDraggingDocumentId] = useState<string>();
  const [dropTargetFolder, setDropTargetFolder] = useState<string>();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredDocuments = useMemo(
    () =>
      documents
        .filter((document) => documentMatchesQuery(document, normalizedQuery))
        .sort((left, right) => compareNames(left.name, right.name)),
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
  const folderChildren = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const folder of folders) {
      const parent = parentFolderPath(folder) ?? "";
      const current = groups.get(parent) ?? [];
      current.push(folder);
      groups.set(parent, current);
    }
    groups.forEach((children) => children.sort(compareNames));
    return groups;
  }, [folders]);
  const visibleFolderMatches = useMemo(() => {
    if (normalizedQuery.length === 0) return new Set(folders);
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
  const rows = useMemo(() => {
    const nextRows: TreeRowData[] = [];
    function appendFolderContents(parentPath: string, depth: number) {
      const childFolders = folderChildren.get(parentPath) ?? [];
      for (const folder of childFolders) {
        if (normalizedQuery.length > 0 && !visibleFolderMatches.has(folder)) {
          continue;
        }
        nextRows.push({ kind: "folder", path: folder, depth });
        const isExpanded =
          normalizedQuery.length > 0 || expandedFolders.has(folder);
        if (isExpanded) appendFolderContents(folder, depth + 1);
      }
      for (const document of documentsByFolder.get(parentPath) ?? []) {
        nextRows.push({ kind: "file", document, depth });
      }
    }
    appendFolderContents("", 0);
    return nextRows;
  }, [
    documentsByFolder,
    expandedFolders,
    folderChildren,
    normalizedQuery.length,
    visibleFolderMatches,
  ]);

  function showContextMenu(event: MouseEvent, item: TreeRowData) {
    event.preventDefault();
    setSelectedKey(
      item.kind === "folder" ? `folder:${item.path}` : item.document.id,
    );
    setContextMenu({ item, x: event.clientX, y: event.clientY });
  }

  function closeContextMenu() {
    setContextMenu(undefined);
  }

  function selectDocument(documentId: string) {
    setSelectedKey(documentId);
    closeContextMenu();
    onSelectDocument(documentId);
  }

  function selectFolder(folderPath: string) {
    setSelectedKey(`folder:${folderPath}`);
  }

  function runContextAction(action: () => void) {
    closeContextMenu();
    action();
  }

  function handleDragStart(event: DragEvent, document: AnchoredDocument) {
    if (!documentIsDraggable(document)) return;
    setDraggingDocumentId(document.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", document.id);
    }
  }

  function handleDragEnd() {
    setDraggingDocumentId(undefined);
    setDropTargetFolder(undefined);
  }

  function handleDragOver(event: DragEvent, folderPath: string) {
    if (!draggingDocumentId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDropTargetFolder(folderPath);
  }

  function handleDrop(event: DragEvent, folderPath: string) {
    event.preventDefault();
    const documentId =
      event.dataTransfer?.getData("text/plain") || draggingDocumentId;
    if (documentId) onMoveDocument(documentId, folderPath);
    handleDragEnd();
  }

  function handleTreeKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (event.key === "Escape") {
      closeContextMenu();
      return;
    }
    if (rows.length === 0) return;
    const currentIndex = Math.max(
      0,
      rows.findIndex((row) => treeRowKey(row) === selectedKey),
    );
    let nextIndex: number | undefined;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = rows.length - 1;
    if (event.key === "ArrowDown")
      nextIndex = Math.min(rows.length - 1, currentIndex + 1);
    if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
    if (nextIndex !== undefined) {
      event.preventDefault();
      setSelectedKey(treeRowKey(rows[nextIndex]));
      return;
    }
    const currentRow = rows[currentIndex];
    if (currentRow.kind === "folder" && event.key === "ArrowRight") {
      event.preventDefault();
      if (!expandedFolders.has(currentRow.path))
        onToggleFolder(currentRow.path);
      return;
    }
    if (currentRow.kind === "folder" && event.key === "ArrowLeft") {
      event.preventDefault();
      if (expandedFolders.has(currentRow.path)) {
        onToggleFolder(currentRow.path);
      } else {
        const parent = parentFolderPath(currentRow.path);
        if (parent) setSelectedKey(`folder:${parent}`);
      }
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && currentRow) {
      event.preventDefault();
      if (currentRow.kind === "folder") onToggleFolder(currentRow.path);
      else selectDocument(currentRow.document.id);
      return;
    }
    if (
      (event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")) &&
      currentRow
    ) {
      event.preventDefault();
      setContextMenu({ item: currentRow, x: 120, y: 120 });
    }
  }

  return (
    <aside
      aria-label="File explorer"
      className="file-rail"
      onKeyDown={handleTreeKeyDown}
    >
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
      {rows.length > 0 ? (
        <VirtualTree
          activeDocumentId={activeDocumentId}
          expandedFolders={expandedFolders}
          rows={rows}
          selectedKey={selectedKey}
          onContextMenu={showContextMenu}
          onSelectDocument={selectDocument}
          onSelectFolder={selectFolder}
          onToggleFolder={(folder) => {
            closeContextMenu();
            onToggleFolder(folder);
          }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={() => setDropTargetFolder(undefined)}
          onDrop={handleDrop}
          onCreateFolder={(path) => onCreateFolder(path)}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          dropTargetFolder={dropTargetFolder}
        />
      ) : (
        <nav aria-label="Vault files" className="file-tree">
          <p className="file-tree__empty">
            {normalizedQuery.length > 0
              ? "No matching files."
              : "No Markdown notes or folders."}
          </p>
        </nav>
      )}
      {contextMenu ? (
        <ContextMenu
          menu={contextMenu}
          onClose={closeContextMenu}
          onCreateFolder={(path) =>
            runContextAction(() => onCreateFolder(path))
          }
          onDeleteFolder={(path) =>
            runContextAction(() => onDeleteFolder(path))
          }
          onOpen={(id) => runContextAction(() => selectDocument(id))}
          onRenameDocument={(id) =>
            runContextAction(() => onRenameDocument(id))
          }
          onRenameFolder={(path) =>
            runContextAction(() => onRenameFolder(path))
          }
          onTrashDocument={(id) => runContextAction(() => onTrashDocument(id))}
        />
      ) : null}
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
