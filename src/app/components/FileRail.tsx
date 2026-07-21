import {
  memo,
  useCallback,
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
import { buildVaultCollections } from "../collections";
import { fileTypeLabel, fileTypeForName } from "../fileTypes";
import {
  defaultFileRailPreferences,
  loadFileRailPreferences,
  saveFileRailPreferences,
  type FileRailPreferences,
  type WorkbenchListMode,
  type WorkbenchSort,
} from "../fileRailPreferences";
import {
  ChevronIcon,
  ExpandCollapseIcon,
  FileTypeIcon,
  FolderIcon,
  NewFileIcon,
  NewFolderIcon,
  SearchIcon,
  ScratchpadIcon,
} from "./Icons";
import { IconButton } from "./IconButton";

function initialFileRailPreferences(): FileRailPreferences {
  try {
    return loadFileRailPreferences(window.localStorage);
  } catch {
    return defaultFileRailPreferences;
  }
}

function persistFileRailPreferences(preferences: FileRailPreferences): void {
  try {
    saveFileRailPreferences(window.localStorage, preferences);
  } catch {
    // Storage access is optional and must never block the file rail.
  }
}

function useNavigationDocuments(
  documents: AnchoredDocument[],
): AnchoredDocument[] {
  const signature = documents
    .map((document) =>
      [
        document.id,
        document.name,
        document.relativePath ?? "",
        document.folderPath ?? "",
        document.isMarkdown === false ? "asset" : "note",
        document.saveState ?? "",
        document.status ?? "",
        document.noteType ?? "",
        document.modifiedMillis ?? "",
        document.createdAt ?? "",
        document.updatedAt ?? "",
        document.archivedAt ?? "",
        document.aliases.join("\u001f"),
      ].join("\u001e"),
    )
    .join("\u001d");
  const cached = useRef({ documents, signature });
  if (cached.current.signature !== signature) {
    cached.current = { documents, signature };
  }
  return cached.current.documents;
}

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
  onArchiveDocument: (documentId: string) => void;
  onCreateFolder: (parentPath?: string) => void;
  onCreateNoteInFolder: (folderPath: string) => void;
  onCreateNote: () => void;
  onDeleteFolder: (folderPath: string) => void;
  onMoveDocument: (documentId: string, destinationFolderPath: string) => void;
  onMoveDocumentToWorkbench: (documentId: string) => void;
  onMoveDocumentRequest: (documentId: string) => void;
  onMoveFolderRequest: (folderPath: string) => void;
  onOpenTrash: () => void;
  onOpenScratchpad: () => void;
  onQueryChange: (query: string) => void;
  onRenameDocument: (documentId: string) => void;
  onRenameFolder: (folderPath: string) => void;
  onPreviewDocument: (documentId: string) => void;
  onRestoreDocument: (
    documentId: string,
    destinationStatus: "active" | "inbox",
  ) => void;
  onSelectDocument: (documentId: string) => void;
  onSearchDocument: (documentId: string) => void;
  onSearchInFolder: (folderPath: string) => void;
  onToggleFolder: (folder: string) => void;
  onSetAllFoldersExpanded: (expanded: boolean) => void;
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

type CollectionRowData =
  | {
      count: number;
      depth: number;
      key: string;
      kind: "collection";
      label: string;
    }
  | {
      depth: number;
      document: AnchoredDocument;
      kind: "file";
    };

type NavigableRow = TreeRowData | CollectionRowData;

type ContextMenuState = {
  item: NavigableRow;
  x: number;
  y: number;
};

const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function folderName(path: string): string {
  return path.split("/").pop() ?? path;
}

function parentFolderPath(path: string): string | undefined {
  const segments = path.split("/");
  segments.pop();
  return segments.length > 0 ? segments.join("/") : undefined;
}

function compareNames(left: string, right: string): number {
  return nameCollator.compare(left, right);
}

function compareDocumentPaths(
  left: AnchoredDocument,
  right: AnchoredDocument,
): number {
  return compareNames(
    left.relativePath ?? left.name,
    right.relativePath ?? right.name,
  );
}

function compareOptionalDates(
  left: number | undefined,
  right: number | undefined,
  direction: "asc" | "desc",
): number {
  const leftMissing = left === undefined || !Number.isFinite(left) || left <= 0;
  const rightMissing =
    right === undefined || !Number.isFinite(right) || right <= 0;
  if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
  if (leftMissing || rightMissing || left === right) return 0;
  return direction === "asc" ? left - right : right - left;
}

function sortWorkbenchDocuments(
  documents: AnchoredDocument[],
  sort: WorkbenchSort,
): AnchoredDocument[] {
  return [...documents].sort((left, right) => {
    let result = 0;
    if (sort === "name-asc" || sort === "name-desc") {
      result = compareNames(left.name, right.name);
      if (sort === "name-desc") result *= -1;
    } else if (sort === "modified-asc" || sort === "modified-desc") {
      result = compareOptionalDates(
        left.modifiedMillis,
        right.modifiedMillis,
        sort.endsWith("asc") ? "asc" : "desc",
      );
    } else {
      result = compareOptionalDates(
        left.createdAt ? Date.parse(left.createdAt) : undefined,
        right.createdAt ? Date.parse(right.createdAt) : undefined,
        sort.endsWith("asc") ? "asc" : "desc",
      );
    }
    return result || compareDocumentPaths(left, right);
  });
}

function treeRowKey(row: NavigableRow): string {
  if (row.kind === "folder") return `folder:${row.path}`;
  if (row.kind === "collection") return row.key;
  return row.document.id;
}

function documentMatchesQuery(
  document: AnchoredDocument,
  normalizedQuery: string,
): boolean {
  return (
    normalizedQuery.length === 0 ||
    document.name.toLocaleLowerCase().includes(normalizedQuery) ||
    document.relativePath?.toLocaleLowerCase().includes(normalizedQuery) ||
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
    document.status?.trim().toLocaleLowerCase() !== "archived" &&
    document.saveState === "saved"
  );
}

function PhysicalTree({
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
  dropTargetFolder,
}: {
  rows: TreeRowData[];
  activeDocumentId: string;
  expandedFolders: Set<string>;
  selectedKey?: string;
  onContextMenu: (event: MouseEvent, item: NavigableRow) => void;
  onSelectDocument: (documentId: string) => void;
  onSelectFolder: (folderPath: string) => void;
  onToggleFolder: (folderPath: string) => void;
  onDragStart: (event: DragEvent, document: AnchoredDocument) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent, folderPath: string) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent, folderPath: string) => void;
  dropTargetFolder?: string;
}) {
  return (
    <nav aria-label="Vault files" className="file-tree">
      {rows.map((row) => {
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
    </nav>
  );
}

const CollectionTree = memo(function CollectionTree({
  activeDocumentId,
  collapsedCollections,
  duplicateNames,
  rows,
  selectedKey,
  onContextMenu,
  onSelectCollection,
  onSelectDocument,
  onToggleCollection,
}: {
  activeDocumentId: string;
  collapsedCollections: Set<string>;
  duplicateNames: Set<string>;
  rows: CollectionRowData[];
  selectedKey?: string;
  onContextMenu: (event: MouseEvent, item: NavigableRow) => void;
  onSelectCollection: (key: string) => void;
  onSelectDocument: (documentId: string) => void;
  onToggleCollection: (key: string) => void;
}) {
  return (
    <nav aria-label="Vault collections" className="file-tree">
      {rows.map((row) => {
        const key = treeRowKey(row);
        return row.kind === "collection" ? (
          <CollectionTreeRow
            count={row.count}
            depth={row.depth}
            expanded={!collapsedCollections.has(row.key)}
            expandable={row.key !== "collection:scratchpad"}
            key={key}
            label={row.label}
            selected={selectedKey === key}
            scratchpad={row.key === "collection:scratchpad"}
            onContextMenu={(event) => onContextMenu(event, row)}
            onSelect={() => onSelectCollection(row.key)}
            onToggle={() => onToggleCollection(row.key)}
          />
        ) : (
          <FileTreeRow
            active={row.document.id === activeDocumentId}
            allowDrag={false}
            depth={row.depth}
            detail={
              duplicateNames.has(row.document.name.toLocaleLowerCase())
                ? row.document.relativePath
                : undefined
            }
            document={row.document}
            key={key}
            selected={selectedKey === key}
            onContextMenu={(event) =>
              onContextMenu(event, {
                depth: row.depth,
                document: row.document,
                kind: "file",
              })
            }
            onSelect={() => onSelectDocument(row.document.id)}
          />
        );
      })}
    </nav>
  );
});

const CollectionTreeRow = memo(function CollectionTreeRow({
  count,
  depth,
  expanded,
  expandable,
  label,
  selected,
  scratchpad,
  onContextMenu,
  onSelect,
  onToggle,
}: {
  count: number;
  depth: number;
  expanded: boolean;
  expandable: boolean;
  label: string;
  selected: boolean;
  scratchpad: boolean;
  onContextMenu: (event: MouseEvent) => void;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      aria-expanded={expandable ? expanded : undefined}
      aria-label={label}
      aria-selected={selected}
      className={`tree-row tree-row--folder tree-row--collection${
        selected ? " is-selected" : ""
      }`}
      role="button"
      style={{ paddingLeft: `${8 + depth * 18}px` }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      {expandable ? (
        <button
          aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
          className="tree-row__disclosure"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <ChevronIcon className={expanded ? "is-expanded" : ""} />
        </button>
      ) : (
        <span className="tree-row__disclosure" aria-hidden="true" />
      )}
      {scratchpad ? <ScratchpadIcon /> : <FolderIcon />}
      <span>{label}</span>
      <span aria-hidden="true" className="tree-row__count">
        {count}
      </span>
    </div>
  );
});

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
    </div>
  );
});

const FileTreeRow = memo(function FileTreeRow({
  active,
  allowDrag = true,
  depth,
  detail,
  document,
  selected,
  onContextMenu,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  active: boolean;
  allowDrag?: boolean;
  depth: number;
  detail?: string;
  document: AnchoredDocument;
  selected: boolean;
  onContextMenu: (event: MouseEvent) => void;
  onSelect: () => void;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const type = fileTypeForName(document.name);
  const draggable = allowDrag && documentIsDraggable(document);
  const rowDetail = detail ?? fileTypeLabel(type);
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={document.name}
      className={`tree-row tree-row--file${active ? " is-active" : ""}${
        selected ? " is-selected" : ""
      }`}
      draggable={draggable}
      style={{ paddingLeft: `${26 + depth * 18}px` }}
      title={`${document.name} · ${rowDetail}`}
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <FileTypeIcon fileName={document.name} />
      <span>
        {document.name}
        {document.isRecoveryCopy ? " · Recovery copy" : ""}
      </span>
      <span className="tree-row__type" aria-hidden="true">
        {rowDetail}
      </span>
    </button>
  );
});

function ContextMenu({
  menu,
  onArchiveDocument,
  onClose,
  onCreateFolder,
  onCreateNoteInFolder,
  onDeleteFolder,
  onOpen,
  onMoveDocumentRequest,
  onMoveFolderRequest,
  onMoveDocumentToWorkbench,
  onRenameDocument,
  onRenameFolder,
  onPreviewDocument,
  onRestoreDocument,
  onTrashDocument,
  onSearchDocument,
  onSearchInFolder,
  onSetWorkbenchListMode,
  onSetWorkbenchSort,
}: {
  menu: ContextMenuState;
  onArchiveDocument: (documentId: string) => void;
  onClose: () => void;
  onCreateFolder: (parentPath?: string) => void;
  onCreateNoteInFolder: (folderPath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onOpen: (documentId: string) => void;
  onMoveDocumentRequest: (documentId: string) => void;
  onMoveFolderRequest: (folderPath: string) => void;
  onMoveDocumentToWorkbench: (documentId: string) => void;
  onRenameDocument: (documentId: string) => void;
  onRenameFolder: (folderPath: string) => void;
  onPreviewDocument: (documentId: string) => void;
  onRestoreDocument: (
    documentId: string,
    destinationStatus: "active" | "inbox",
  ) => void;
  onTrashDocument: (documentId: string) => void;
  onSearchDocument: (documentId: string) => void;
  onSearchInFolder: (folderPath: string) => void;
  onSetWorkbenchListMode: (mode: WorkbenchListMode) => void;
  onSetWorkbenchSort: (sort: WorkbenchSort) => void;
}) {
  useEffect(() => {
    function close() {
      onClose();
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [onClose]);

  const item = menu.item;
  if (item.kind === "collection") {
    if (item.key !== "collection:workbench") return null;
    return (
      <div
        aria-label="Workbench view and sort"
        className="tree-context-menu"
        role="menu"
        style={{ left: menu.x, top: menu.y }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <button
          role="menuitem"
          type="button"
          onClick={() => onSetWorkbenchListMode("flat")}
        >
          Flat list
        </button>
        <button
          role="menuitem"
          type="button"
          onClick={() => onSetWorkbenchListMode("grouped")}
        >
          Group by Type
        </button>
        <button
          role="menuitem"
          type="button"
          onClick={() => onSetWorkbenchSort("name-asc")}
        >
          Name A–Z
        </button>
        <button
          role="menuitem"
          type="button"
          onClick={() => onSetWorkbenchSort("name-desc")}
        >
          Name Z–A
        </button>
        <button
          role="menuitem"
          type="button"
          onClick={() => onSetWorkbenchSort("modified-desc")}
        >
          Last Edited newest
        </button>
        <button
          role="menuitem"
          type="button"
          onClick={() => onSetWorkbenchSort("modified-asc")}
        >
          Last Edited oldest
        </button>
        <button
          role="menuitem"
          type="button"
          onClick={() => onSetWorkbenchSort("created-desc")}
        >
          Created newest
        </button>
        <button
          role="menuitem"
          type="button"
          onClick={() => onSetWorkbenchSort("created-asc")}
        >
          Created oldest
        </button>
      </div>
    );
  }
  const editableFile =
    item.kind === "file" && item.document.isMarkdown !== false;
  const archivedFile =
    editableFile &&
    item.document.status?.trim().toLocaleLowerCase() === "archived";
  const inboxFile =
    editableFile &&
    !archivedFile &&
    (!item.document.status?.trim() ||
      item.document.status.trim().toLocaleLowerCase() === "inbox");
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
          {!editableFile ? (
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
          {editableFile ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => onPreviewDocument(item.document.id)}
            >
              Preview
            </button>
          ) : null}
          {editableFile ? (
            <button
              disabled={archivedFile}
              role="menuitem"
              title={
                archivedFile
                  ? "Archived notes cannot be physically moved."
                  : undefined
              }
              type="button"
              onClick={() => onMoveDocumentRequest(item.document.id)}
            >
              Move To…
            </button>
          ) : null}
          {editableFile ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => onSearchDocument(item.document.id)}
            >
              Search in Note
            </button>
          ) : null}
          {editableFile && !archivedFile ? (
            <>
              {!inboxFile ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => onRestoreDocument(item.document.id, "inbox")}
                >
                  Move to Inbox
                </button>
              ) : null}
              {inboxFile &&
              item.document.noteType?.toLocaleLowerCase() !== "scratchpad" ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => onMoveDocumentToWorkbench(item.document.id)}
                >
                  Move to Workbench…
                </button>
              ) : null}
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
                onClick={() => onArchiveDocument(item.document.id)}
              >
                Archive
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => onTrashDocument(item.document.id)}
              >
                Move to Trash
              </button>
            </>
          ) : null}
          {archivedFile ? (
            <>
              <button
                role="menuitem"
                type="button"
                onClick={() => onRestoreDocument(item.document.id, "inbox")}
              >
                Restore to Inbox
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => onRestoreDocument(item.document.id, "active")}
              >
                Restore to Workbench
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => onTrashDocument(item.document.id)}
              >
                Move to Trash
              </button>
            </>
          ) : null}
        </>
      ) : (
        <>
          <button
            role="menuitem"
            type="button"
            onClick={() => onCreateNoteInFolder(item.path)}
          >
            New note
          </button>
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
            onClick={() => onMoveFolderRequest(item.path)}
          >
            Move Folder To…
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => onSearchInFolder(item.path)}
          >
            Search in Folder
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
  onArchiveDocument,
  onCreateFolder,
  onCreateNoteInFolder,
  onCreateNote,
  onDeleteFolder,
  onMoveDocument,
  onMoveDocumentRequest,
  onMoveFolderRequest,
  onMoveDocumentToWorkbench,
  onOpenScratchpad,
  onOpenTrash,
  onQueryChange,
  onPreviewDocument,
  onRenameDocument,
  onRenameFolder,
  onRestoreDocument,
  onSelectDocument,
  onSearchDocument,
  onSearchInFolder,
  onToggleFolder,
  onSetAllFoldersExpanded,
  onTrashDocument,
}: FileRailProps) {
  const [selectedKey, setSelectedKey] = useState<string>();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [draggingDocumentId, setDraggingDocumentId] = useState<string>();
  const [dropTargetFolder, setDropTargetFolder] = useState<string>();
  const [collapsedCollections, setCollapsedCollections] = useState<Set<string>>(
    () => new Set(),
  );
  const [preferences, setPreferences] = useState<FileRailPreferences>(
    initialFileRailPreferences,
  );
  const navigationDocuments = useNavigationDocuments(documents);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredDocuments = useMemo(
    () =>
      navigationDocuments
        .filter((document) => documentMatchesQuery(document, normalizedQuery))
        .sort((left, right) => compareNames(left.name, right.name)),
    [navigationDocuments, normalizedQuery],
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
  const collections = useMemo(
    () => buildVaultCollections(navigationDocuments),
    [navigationDocuments],
  );
  const filteredCollections = useMemo(
    () =>
      normalizedQuery.length === 0
        ? collections
        : buildVaultCollections(filteredDocuments),
    [collections, filteredDocuments, normalizedQuery.length],
  );
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of navigationDocuments) {
      const key = document.name.toLocaleLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts)
        .filter(([, count]) => count > 1)
        .map(([name]) => name),
    );
  }, [navigationDocuments]);
  const collectionRows = useMemo(() => {
    const nextRows: CollectionRowData[] = [];
    const searching = normalizedQuery.length > 0;
    const isExpanded = (key: string) =>
      searching || !collapsedCollections.has(key);
    const appendDocuments = (
      collectionDocuments: AnchoredDocument[],
      depth: number,
    ) => {
      for (const document of collectionDocuments) {
        nextRows.push({ depth, document, kind: "file" });
      }
    };
    const appendGroup = (
      key: string,
      label: string,
      count: number,
      depth: number,
    ) => {
      nextRows.push({ count, depth, key, kind: "collection", label });
    };

    appendGroup("collection:inbox", "Inbox", collections.inbox.length, 0);
    if (isExpanded("collection:inbox")) {
      appendDocuments(filteredCollections.inbox, 1);
    }

    appendGroup(
      "collection:scratchpad",
      "Scratchpad",
      collections.scratchpad.length,
      0,
    );

    appendGroup(
      "collection:workbench",
      "Workbench",
      collections.workbench.length,
      0,
    );
    if (isExpanded("collection:workbench")) {
      if (preferences.workbenchListMode === "flat") {
        appendDocuments(
          sortWorkbenchDocuments(
            filteredCollections.workbench,
            preferences.workbenchSort,
          ),
          1,
        );
      } else {
        const fullCounts = new Map(
          collections.workbenchGroups.map((group) => [
            group.name.toLocaleLowerCase(),
            group.documents.length,
          ]),
        );
        for (const group of filteredCollections.workbenchGroups) {
          const key = `collection:workbench:${group.name.toLocaleLowerCase()}`;
          appendGroup(
            key,
            group.name,
            fullCounts.get(group.name.toLocaleLowerCase()) ?? 0,
            1,
          );
          if (isExpanded(key)) {
            appendDocuments(
              sortWorkbenchDocuments(
                group.documents,
                preferences.workbenchSort,
              ),
              2,
            );
          }
        }
      }
    }

    appendGroup("collection:archive", "Archive", collections.archive.length, 0);
    if (isExpanded("collection:archive")) {
      appendDocuments(filteredCollections.archive, 1);
    }

    appendGroup("collection:assets", "Assets", collections.assets.length, 0);
    if (isExpanded("collection:assets")) {
      if (preferences.assetListMode === "alphabetical") {
        appendDocuments(filteredCollections.assets, 1);
      } else {
        const fullCounts = new Map(
          collections.assetGroups.map((group) => [
            group.name.toLocaleLowerCase(),
            group.documents.length,
          ]),
        );
        for (const group of filteredCollections.assetGroups) {
          const key = `collection:assets:${group.name.toLocaleLowerCase()}`;
          appendGroup(
            key,
            group.name,
            fullCounts.get(group.name.toLocaleLowerCase()) ?? 0,
            1,
          );
          if (isExpanded(key)) appendDocuments(group.documents, 2);
        }
      }
    }

    return nextRows;
  }, [
    collapsedCollections,
    collections,
    filteredCollections,
    normalizedQuery.length,
    preferences.assetListMode,
    preferences.workbenchListMode,
    preferences.workbenchSort,
  ]);
  const navigationRows: NavigableRow[] =
    preferences.mode === "collections" ? collectionRows : rows;
  const expandableCollectionKeys = useMemo(() => {
    const keys = [
      "collection:inbox",
      "collection:workbench",
      "collection:archive",
      "collection:assets",
    ];
    if (preferences.workbenchListMode === "grouped") {
      keys.push(
        ...collections.workbenchGroups.map(
          (group) => `collection:workbench:${group.name.toLocaleLowerCase()}`,
        ),
      );
    }
    if (preferences.assetListMode === "grouped") {
      keys.push(
        ...collections.assetGroups.map(
          (group) => `collection:assets:${group.name.toLocaleLowerCase()}`,
        ),
      );
    }
    return keys;
  }, [
    collections.assetGroups,
    collections.workbenchGroups,
    preferences.assetListMode,
    preferences.workbenchListMode,
  ]);
  const allExpanded =
    preferences.mode === "collections"
      ? expandableCollectionKeys.every((key) => !collapsedCollections.has(key))
      : folders.length > 0 &&
        folders.every((folder) => expandedFolders.has(folder));

  useEffect(() => {
    persistFileRailPreferences(preferences);
  }, [preferences]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(undefined);
  }, []);

  const showContextMenu = useCallback(
    (event: MouseEvent, item: NavigableRow) => {
      event.preventDefault();
      setSelectedKey(treeRowKey(item));
      const menuWidth = 190;
      const menuHeight =
        item.kind === "collection"
          ? 292
          : item.kind === "folder"
            ? 250
            : item.document.isMarkdown === false
              ? 180
              : 330;
      setContextMenu({
        item,
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth)),
        y: Math.max(
          8,
          Math.min(
            event.clientY,
            window.innerHeight - Math.min(menuHeight, window.innerHeight - 16),
          ),
        ),
      });
    },
    [],
  );

  const selectDocument = useCallback(
    (documentId: string) => {
      setSelectedKey(documentId);
      closeContextMenu();
      onSelectDocument(documentId);
    },
    [closeContextMenu, onSelectDocument],
  );

  function selectFolder(folderPath: string) {
    setSelectedKey(`folder:${folderPath}`);
  }

  const selectCollection = useCallback(
    (key: string) => {
      setSelectedKey(key);
      if (key === "collection:scratchpad") onOpenScratchpad();
    },
    [onOpenScratchpad],
  );

  const toggleCollection = useCallback(
    (key: string) => {
      closeContextMenu();
      setCollapsedCollections((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [closeContextMenu],
  );

  function updatePreferences(next: Partial<FileRailPreferences>) {
    closeContextMenu();
    setPreferences((current) => ({ ...current, ...next }));
  }

  function toggleAllGroups() {
    closeContextMenu();
    if (preferences.mode === "files") {
      onSetAllFoldersExpanded(!allExpanded);
      return;
    }
    setCollapsedCollections(
      allExpanded ? new Set(expandableCollectionKeys) : new Set(),
    );
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
    if (navigationRows.length === 0) return;
    const currentIndex = Math.max(
      0,
      navigationRows.findIndex((row) => treeRowKey(row) === selectedKey),
    );
    let nextIndex: number | undefined;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = navigationRows.length - 1;
    if (event.key === "ArrowDown")
      nextIndex = Math.min(navigationRows.length - 1, currentIndex + 1);
    if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
    if (nextIndex !== undefined) {
      event.preventDefault();
      setSelectedKey(treeRowKey(navigationRows[nextIndex]));
      return;
    }
    const currentRow = navigationRows[currentIndex];
    if (currentRow.kind === "collection" && event.key === "ArrowRight") {
      event.preventDefault();
      if (collapsedCollections.has(currentRow.key)) {
        toggleCollection(currentRow.key);
      }
      return;
    }
    if (currentRow.kind === "collection" && event.key === "ArrowLeft") {
      event.preventDefault();
      if (!collapsedCollections.has(currentRow.key)) {
        toggleCollection(currentRow.key);
      }
      return;
    }
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
      else if (currentRow.kind === "collection") {
        if (currentRow.key === "collection:scratchpad") {
          selectCollection(currentRow.key);
        } else {
          toggleCollection(currentRow.key);
        }
      } else selectDocument(currentRow.document.id);
      return;
    }
    if (
      (event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")) &&
      currentRow &&
      currentRow.kind !== "collection"
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
      <div className={`file-rail__tools file-rail__tools--${preferences.mode}`}>
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
        {preferences.mode === "files" ? (
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
        ) : null}
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
      <div className="file-rail__view-options">
        <div aria-label="Sidebar view" className="file-rail__segmented">
          <button
            aria-pressed={preferences.mode === "collections"}
            type="button"
            onClick={() => updatePreferences({ mode: "collections" })}
          >
            Collections
          </button>
          <button
            aria-pressed={preferences.mode === "files"}
            type="button"
            onClick={() => updatePreferences({ mode: "files" })}
          >
            Files
          </button>
        </div>
        <div className="file-rail__view-actions">
          {preferences.mode === "collections" ? (
            <div
              aria-label="Asset list order"
              className="file-rail__segmented file-rail__segmented--compact"
            >
              <button
                aria-label="Group assets by type"
                aria-pressed={preferences.assetListMode === "grouped"}
                title="Group assets by type"
                type="button"
                onClick={() => updatePreferences({ assetListMode: "grouped" })}
              >
                Type
              </button>
              <button
                aria-label="Sort assets alphabetically"
                aria-pressed={preferences.assetListMode === "alphabetical"}
                title="Sort assets alphabetically"
                type="button"
                onClick={() =>
                  updatePreferences({ assetListMode: "alphabetical" })
                }
              >
                A–Z
              </button>
            </div>
          ) : null}
          <IconButton
            disabled={preferences.mode === "files" && folders.length === 0}
            label={allExpanded ? "Collapse all groups" : "Expand all groups"}
            onClick={toggleAllGroups}
          >
            <ExpandCollapseIcon />
          </IconButton>
        </div>
      </div>
      {preferences.mode === "collections" ? (
        <div
          className="file-rail__workbench-options"
          aria-label="Workbench view and sort"
        >
          <select
            aria-label="Workbench view"
            value={preferences.workbenchListMode}
            onChange={(event) =>
              updatePreferences({
                workbenchListMode: event.target.value as WorkbenchListMode,
              })
            }
          >
            <option value="flat">Flat</option>
            <option value="grouped">Group by Type</option>
          </select>
          <select
            aria-label="Workbench sort"
            value={preferences.workbenchSort}
            onChange={(event) =>
              updatePreferences({
                workbenchSort: event.target.value as WorkbenchSort,
              })
            }
          >
            <option value="modified-desc">Last Edited · Newest</option>
            <option value="modified-asc">Last Edited · Oldest</option>
            <option value="created-desc">Created · Newest</option>
            <option value="created-asc">Created · Oldest</option>
            <option value="name-asc">Name · A–Z</option>
            <option value="name-desc">Name · Z–A</option>
          </select>
        </div>
      ) : null}
      {preferences.mode === "collections" ? (
        <CollectionTree
          activeDocumentId={activeDocumentId}
          collapsedCollections={collapsedCollections}
          duplicateNames={duplicateNames}
          rows={collectionRows}
          selectedKey={selectedKey}
          onContextMenu={showContextMenu}
          onSelectCollection={selectCollection}
          onSelectDocument={selectDocument}
          onToggleCollection={toggleCollection}
        />
      ) : rows.length > 0 ? (
        <PhysicalTree
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
          onArchiveDocument={(id) =>
            runContextAction(() => onArchiveDocument(id))
          }
          onClose={closeContextMenu}
          onCreateFolder={(path) =>
            runContextAction(() => onCreateFolder(path))
          }
          onCreateNoteInFolder={(path) =>
            runContextAction(() => onCreateNoteInFolder(path))
          }
          onDeleteFolder={(path) =>
            runContextAction(() => onDeleteFolder(path))
          }
          onOpen={(id) => runContextAction(() => selectDocument(id))}
          onMoveDocumentToWorkbench={(id) =>
            runContextAction(() => onMoveDocumentToWorkbench(id))
          }
          onMoveDocumentRequest={(id) =>
            runContextAction(() => onMoveDocumentRequest(id))
          }
          onMoveFolderRequest={(path) =>
            runContextAction(() => onMoveFolderRequest(path))
          }
          onPreviewDocument={(id) =>
            runContextAction(() => onPreviewDocument(id))
          }
          onRenameDocument={(id) =>
            runContextAction(() => onRenameDocument(id))
          }
          onRenameFolder={(path) =>
            runContextAction(() => onRenameFolder(path))
          }
          onRestoreDocument={(id, destinationStatus) =>
            runContextAction(() => onRestoreDocument(id, destinationStatus))
          }
          onTrashDocument={(id) => runContextAction(() => onTrashDocument(id))}
          onSearchDocument={(id) =>
            runContextAction(() => onSearchDocument(id))
          }
          onSearchInFolder={(path) =>
            runContextAction(() => onSearchInFolder(path))
          }
          onSetWorkbenchListMode={(mode) =>
            runContextAction(() =>
              updatePreferences({ workbenchListMode: mode }),
            )
          }
          onSetWorkbenchSort={(sort) =>
            runContextAction(() => updatePreferences({ workbenchSort: sort }))
          }
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
