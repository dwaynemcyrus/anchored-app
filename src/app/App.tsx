import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";

import { EditorSurface } from "./components/EditorSurface";
import { CreateVaultDialog } from "./components/CreateVaultDialog";
import { DeleteFolderDialog } from "./components/DeleteFolderDialog";
import { FileRail } from "./components/FileRail";
import { FolderDialog } from "./components/FolderDialog";
import { LifecycleTypeDialog } from "./components/LifecycleTypeDialog";
import { MoveNoteDialog } from "./components/MoveNoteDialog";
import { NotificationCenter } from "./components/NotificationCenter";
import { QuickOpenPalette } from "./components/QuickOpenPalette";
import { SettingsModal } from "./components/SettingsModal";
import { StatusBar } from "./components/StatusBar";
import type { EditorCursorPosition } from "./components/MarkdownEditor";
import { TitleBar } from "./components/TitleBar";
import { TrashPanel } from "./components/TrashPanel";
import { VaultSwitcher } from "./components/VaultSwitcher";
import {
  VaultSearchPalette,
  type VaultSearchState,
} from "./components/VaultSearchPalette";
import {
  createUntitledDocument,
  documentsFromVault,
  folderPathsFromVault,
  mergeDocumentsFromVault,
  type AnchoredDocument,
  type DocumentSaveState,
} from "./documents";
import {
  backlinksForDocument,
  buildDocumentLinkIndex,
  resolveWikilink,
} from "./links";
import {
  buildWikilinkCandidates,
  type DocumentActivity,
} from "./linkCandidates";
import {
  loadDocumentActivity,
  markDocumentActive,
  reconcileDocumentActivity,
  saveDocumentActivity,
} from "./recentDocuments";
import { rankQuickOpenResults } from "./retrieval";
import {
  loadMarkdownSettings,
  saveMarkdownSettings,
} from "./markdown/settings";
import {
  DEFAULT_MARKDOWN_SETTINGS,
  type MarkdownSettings,
} from "./markdown/types";
import { applyTheme } from "./theme/apply";
import {
  hasNonUnixLineEndings,
  mergeCreatedMarkdownSource,
  normalizeMarkdownLineEndings,
} from "./markdown/source";
import {
  clearSessionState,
  loadSessionState,
  saveSessionState,
} from "./sessionState";
import { reloadAnchoredWindow } from "./windowActions";
import {
  clearResolvedNotifications,
  GENERAL_NOTIFICATION_SCOPE,
  loadNotificationHistory,
  notificationHistoryForScope,
  recordNotification,
  resolveNotification,
  resolveNotifications,
  saveNotificationHistory,
  type NewNotificationHistoryEntry,
} from "./notificationHistory";
import {
  archiveVaultFile,
  createVaultConflictCopy,
  createVault,
  createVaultFolder,
  createUntitledVaultFile,
  createVaultFile,
  deleteVaultFolder,
  forgetVault,
  listRememberedVaults,
  listVaultTrash,
  moveVaultFileToFolder,
  moveVaultFileToWorkbench,
  moveVaultFileToTrash,
  moveVaultFolderToTrash,
  moveVaultFolder,
  openRememberedVault,
  readVaultFile,
  renameVaultFolder,
  renameVaultFile,
  rescanVault,
  saveVaultFile,
  searchVault,
  selectVault,
  stopVaultFileWatch,
  watchVaultFile,
  type VaultFileChangedEvent,
  restoreVaultFileFromTrash,
  restoreVaultFolderFromTrash,
  restoreArchivedVaultFile,
  type RememberedVault,
  type TrashEntry,
  type VaultDocument,
  type VaultSnapshot,
} from "../lib/tauri/vault";
import { openScratchpad, type ScratchpadMode } from "../lib/tauri/scratchpad";

const ACTIVITY_REFRESH_INTERVAL_MS = 60_000;
const MINOR_NOTICE_DURATION_MS = 12_000;

type DocumentLoadState =
  | { status: "idle" }
  | { status: "loading"; documentId: string }
  | { status: "error"; documentId: string; message: string };

type VaultNotice = {
  id: number;
  persistent: boolean;
  text: string;
};

type VaultNoticeOptions = {
  history?: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">;
  persistent?: boolean;
};

type LifecycleTypeRequest = {
  action: "archive" | "workbench";
  documentId: string;
};

function readErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "This Markdown file could not be opened safely.";
}

function vaultSummaryMessage(snapshot: VaultSnapshot): string {
  const notices: string[] = [];
  if (snapshot.warnings.skippedSymlinks > 0) {
    const count = snapshot.warnings.skippedSymlinks;
    notices.push(
      `${count} symlink ${count === 1 ? "entry was" : "entries were"} skipped for safety.`,
    );
  }
  return notices.join(" ");
}

function documentHasUnfinishedEdits(document: AnchoredDocument): boolean {
  return (
    !document.relativePath ||
    document.saveState !== "saved" ||
    (document.sourceText !== undefined &&
      document.sourceText !== document.savedSourceText)
  );
}

function folderDisplayName(folderPath: string): string {
  return folderPath || "Vault root";
}

function folderName(folderPath: string): string {
  return folderPath.split("/").pop() ?? folderPath;
}

function initialMarkdownSettings(): MarkdownSettings {
  try {
    return loadMarkdownSettings(window.localStorage);
  } catch {
    return { ...DEFAULT_MARKDOWN_SETTINGS };
  }
}

function persistMarkdownSettings(settings: MarkdownSettings): void {
  try {
    saveMarkdownSettings(window.localStorage, settings);
  } catch {
    // Settings persistence is optional and must never block the editor.
  }
}

export function App() {
  const [documents, setDocuments] = useState<AnchoredDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const [cursorPosition, setCursorPosition] = useState<EditorCursorPosition>({
    line: 1,
    column: 1,
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [query, setQuery] = useState("");
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");
  const [vaultSearchState, setVaultSearchState] = useState<VaultSearchState>({
    status: "idle",
  });
  const [vaultSearchVisible, setVaultSearchVisible] = useState(false);
  const [findRequest, setFindRequest] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [vaultName, setVaultName] = useState("");
  const [vaultId, setVaultId] = useState("");
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [markdownSettings, setMarkdownSettings] = useState<MarkdownSettings>(
    initialMarkdownSettings,
  );
  const [selectingVault, setSelectingVault] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingVault, setCreatingVault] = useState(false);
  const [createFolderParentPath, setCreateFolderParentPath] = useState<
    string | undefined
  >();
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<
    string | undefined
  >();
  const [renamingFolderPath, setRenamingFolderPath] = useState<
    string | undefined
  >();
  const [renameFolderVisible, setRenameFolderVisible] = useState(false);
  const [renameFolderError, setRenameFolderError] = useState<
    string | undefined
  >();
  const [renameFolderPending, setRenameFolderPending] = useState(false);
  const [deletingFolderPath, setDeletingFolderPath] = useState<
    string | undefined
  >();
  const [deleteFolderVisible, setDeleteFolderVisible] = useState(false);
  const [deleteFolderError, setDeleteFolderError] = useState<
    string | undefined
  >();
  const [deleteFolderPending, setDeleteFolderPending] = useState(false);
  const [createVaultVisible, setCreateVaultVisible] = useState(false);
  const [createVaultError, setCreateVaultError] = useState<
    string | undefined
  >();
  const [reloadingApp, setReloadingApp] = useState(false);
  const [vaultSelected, setVaultSelected] = useState(false);
  const [vaultSwitcherVisible, setVaultSwitcherVisible] = useState(false);
  const [rememberedVaults, setRememberedVaults] = useState<RememberedVault[]>(
    [],
  );
  const [rememberedVaultsLoading, setRememberedVaultsLoading] = useState(true);
  const [rememberedVaultsError, setRememberedVaultsError] = useState<
    string | undefined
  >();
  const [openingRememberedVaultId, setOpeningRememberedVaultId] = useState<
    string | undefined
  >();
  const [trashVisible, setTrashVisible] = useState(false);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | undefined>();
  const [restoringTrashId, setRestoringTrashId] = useState<
    string | undefined
  >();
  const [trashingDocumentId, setTrashingDocumentId] = useState<
    string | undefined
  >();
  const [transitioningDocumentId, setTransitioningDocumentId] = useState<
    string | undefined
  >();
  const [lifecycleTypeRequest, setLifecycleTypeRequest] =
    useState<LifecycleTypeRequest>();
  const [vaultNotices, setVaultNotices] = useState<VaultNotice[]>([]);
  const [notificationHistoryVisible, setNotificationHistoryVisible] =
    useState(false);
  const [notificationHistory, setNotificationHistory] = useState(() => {
    try {
      return loadNotificationHistory(window.localStorage, Date.now());
    } catch {
      return [];
    }
  });
  const [documentLoad, setDocumentLoad] = useState<DocumentLoadState>({
    status: "idle",
  });
  const [moveDocumentId, setMoveDocumentId] = useState<string | undefined>();
  const [moveDocumentVisible, setMoveDocumentVisible] = useState(false);
  const [moveFolderPath, setMoveFolderPath] = useState<string>();
  const [moveFolderPending, setMoveFolderPending] = useState(false);
  const [movingDocumentId, setMovingDocumentId] = useState<
    string | undefined
  >();
  const [renamingDocumentId, setRenamingDocumentId] = useState<string | null>(
    null,
  );
  const [documentActivity, setDocumentActivity] = useState(() => {
    try {
      return loadDocumentActivity(window.localStorage);
    } catch {
      return new Map<string, DocumentActivity>();
    }
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  const rescanInFlightRef = useRef(false);
  const saveInFlightRef = useRef(new Set<string>());
  const externalCheckInFlightRef = useRef(new Set<string>());
  const externalCheckPendingRef = useRef(new Set<string>());
  const conflictCopyInFlightRef = useRef(new Set<string>());
  const focusRefreshTimeoutRef = useRef<number | undefined>(undefined);
  const vaultNoticeIdRef = useRef(0);
  const vaultNoticeTimeoutsRef = useRef<Map<number, number>>(new Map());
  const notificationIdRef = useRef(0);
  const documentsRef = useRef(documents);
  const pendingSessionRelativePathRef = useRef<string | undefined>(undefined);
  const sessionRestoreStatusRef = useRef<"pending" | "restoring" | "done">(
    "pending",
  );
  const vaultIdRef = useRef("");

  documentsRef.current = documents;

  const activeDocument = documents.find(
    (document) => document.id === activeDocumentId,
  );
  const moveTargetDocument = documents.find(
    (document) => document.id === moveDocumentId,
  );
  const lifecycleTypeDocument = documents.find(
    (document) => document.id === lifecycleTypeRequest?.documentId,
  );
  const existingNoteTypes = useMemo(
    () =>
      documents.flatMap((document) =>
        document.noteType?.trim() &&
        document.noteType.trim().toLocaleLowerCase() !== "scratchpad"
          ? [document.noteType.trim()]
          : [],
      ),
    [documents],
  );
  const deletingFolderContents = useMemo(() => {
    if (!deletingFolderPath) return { fileCount: 0, folderCount: 0 };
    const prefix = `${deletingFolderPath}/`;
    return {
      fileCount: documents.filter((document) =>
        (document.folderPath ?? "").startsWith(prefix),
      ).length,
      folderCount: folderPaths.filter((folder) => folder.startsWith(prefix))
        .length,
    };
  }, [deletingFolderPath, documents, folderPaths]);
  const saveState: DocumentSaveState = activeDocument?.saveState ?? "saved";
  const activeDocumentIdForWatch = activeDocument?.id;
  const activeDocumentPathForWatch = activeDocument?.relativePath;
  const activeDocumentLoaded = activeDocument?.sourceText !== undefined;
  const deferredDocuments = useDeferredValue(documents);
  const linkIndex = useMemo(
    () => buildDocumentLinkIndex(deferredDocuments),
    [deferredDocuments],
  );
  const backlinks = useMemo(
    () =>
      activeDocumentId
        ? backlinksForDocument(deferredDocuments, activeDocumentId, linkIndex)
        : [],
    [activeDocumentId, deferredDocuments, linkIndex],
  );
  const wikilinkCandidates = useMemo(
    () =>
      buildWikilinkCandidates(deferredDocuments, documentActivity, linkIndex),
    [deferredDocuments, documentActivity, linkIndex],
  );
  const quickOpenResults = useMemo(
    () =>
      quickOpenVisible
        ? rankQuickOpenResults(
            wikilinkCandidates,
            deferredDocuments,
            quickOpenQuery,
            activeDocumentId,
          )
        : [],
    [
      activeDocumentId,
      deferredDocuments,
      quickOpenQuery,
      quickOpenVisible,
      wikilinkCandidates,
    ],
  );
  const notificationScopeId = vaultId || GENERAL_NOTIFICATION_SCOPE;
  const visibleNotificationHistory = useMemo(
    () => notificationHistoryForScope(notificationHistory, notificationScopeId),
    [notificationHistory, notificationScopeId],
  );
  const addHistoryEntry = useCallback(
    (
      message: string,
      input: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">,
    ) => {
      const now = Date.now();
      notificationIdRef.current += 1;
      setNotificationHistory((current) =>
        recordNotification(
          current,
          {
            ...input,
            id: `${now}-${notificationIdRef.current}`,
            message,
            scopeId: vaultIdRef.current || GENERAL_NOTIFICATION_SCOPE,
          },
          now,
        ),
      );
    },
    [],
  );

  const resolveHistorySource = useCallback((sourceId: string) => {
    setNotificationHistory((current) =>
      resolveNotifications(
        current,
        vaultIdRef.current || GENERAL_NOTIFICATION_SCOPE,
        sourceId,
        Date.now(),
      ),
    );
  }, []);

  const addVaultNotice = useCallback(
    (text: string, options: VaultNoticeOptions = {}) => {
      vaultNoticeIdRef.current += 1;
      const notice = {
        id: vaultNoticeIdRef.current,
        persistent: options.persistent ?? false,
        text,
      };
      setVaultNotices((currentNotices) => {
        if (
          currentNotices.some((currentNotice) => currentNotice.text === text)
        ) {
          return currentNotices;
        }
        return [notice, ...currentNotices];
      });
      if (options.history) addHistoryEntry(text, options.history);
    },
    [addHistoryEntry],
  );

  useEffect(() => {
    const activeNoticeIds = new Set(vaultNotices.map((notice) => notice.id));

    vaultNoticeTimeoutsRef.current.forEach((timeout, noticeId) => {
      if (!activeNoticeIds.has(noticeId)) {
        window.clearTimeout(timeout);
        vaultNoticeTimeoutsRef.current.delete(noticeId);
      }
    });

    vaultNotices.forEach((notice) => {
      if (notice.persistent || vaultNoticeTimeoutsRef.current.has(notice.id)) {
        return;
      }

      const timeout = window.setTimeout(() => {
        vaultNoticeTimeoutsRef.current.delete(notice.id);
        setVaultNotices((currentNotices) =>
          currentNotices.filter(
            (currentNotice) => currentNotice.id !== notice.id,
          ),
        );
      }, MINOR_NOTICE_DURATION_MS);
      vaultNoticeTimeoutsRef.current.set(notice.id, timeout);
    });
  }, [vaultNotices]);

  useEffect(
    () => () => {
      vaultNoticeTimeoutsRef.current.forEach((timeout) =>
        window.clearTimeout(timeout),
      );
      vaultNoticeTimeoutsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    persistMarkdownSettings(markdownSettings);
  }, [markdownSettings]);

  useEffect(() => {
    applyTheme(markdownSettings.theme);
  }, [markdownSettings.theme]);

  const hasUnfinishedEdits = useCallback(
    () => documentsRef.current.some(documentHasUnfinishedEdits),
    [],
  );

  const refreshRememberedVaults = useCallback(async () => {
    setRememberedVaultsLoading(true);
    setRememberedVaultsError(undefined);
    try {
      setRememberedVaults(await listRememberedVaults());
    } catch {
      setRememberedVaultsError(
        "Remembered vaults are available in the Anchored desktop app.",
      );
    } finally {
      setRememberedVaultsLoading(false);
    }
  }, []);

  const refreshTrashEntries = useCallback(async () => {
    setTrashLoading(true);
    setTrashError(undefined);
    try {
      setTrashEntries(await listVaultTrash());
    } catch (error) {
      setTrashError(readErrorMessage(error));
    } finally {
      setTrashLoading(false);
    }
  }, []);

  const saveUntitledDocument = useCallback(
    async (documentId: string) => {
      const document = documentsRef.current.find(
        (candidate) => candidate.id === documentId,
      );
      if (
        !document ||
        document.relativePath ||
        document.sourceText === undefined ||
        document.saveState === "saving"
      ) {
        return;
      }

      const sourceAtSave = document.sourceText;
      const contentAtSave = normalizeMarkdownLineEndings(sourceAtSave);
      setDocuments((currentDocuments) =>
        currentDocuments.map((current) =>
          current.id === documentId
            ? { ...current, saveMessage: undefined, saveState: "saving" }
            : current,
        ),
      );

      try {
        const savedDocument = await createUntitledVaultFile(contentAtSave);
        const pathParts = savedDocument.relativePath.split("/");
        const name = pathParts.pop() ?? document.name;
        const folderPath = pathParts.join("/");
        const folder = folderPath || vaultName;
        const currentDocument = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        const hasNewerEdit = currentDocument?.sourceText !== sourceAtSave;

        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? {
                  ...current,
                  archivedAt: savedDocument.archivedAt,
                  createdAt: savedDocument.createdAt,
                  modifiedMillis: savedDocument.modifiedMillis,
                  folder,
                  folderPath,
                  name,
                  noteType: savedDocument.noteType,
                  relativePath: savedDocument.relativePath,
                  saveMessage: hasNonUnixLineEndings(sourceAtSave)
                    ? "Saved with Unix (LF) line endings."
                    : undefined,
                  saveState: hasNewerEdit ? "unsaved" : "saved",
                  savedSourceText: savedDocument.content,
                  sizeBytes: savedDocument.sizeBytes,
                  status: savedDocument.status,
                  updatedAt: savedDocument.updatedAt,
                  sourceText: hasNewerEdit
                    ? mergeCreatedMarkdownSource(
                        sourceAtSave,
                        savedDocument.content,
                        current.sourceText ?? sourceAtSave,
                      )
                    : savedDocument.content,
                }
              : current,
          ),
        );
        if (folderPath) {
          setExpandedFolders((currentFolders) =>
            new Set(currentFolders).add(folderPath),
          );
        }
        setFolderPaths((currentFolders) =>
          currentFolders.includes(folderPath)
            ? currentFolders
            : [...currentFolders, folderPath].filter(
                (value, index, values) =>
                  value.length > 0 && values.indexOf(value) === index,
              ),
        );
        resolveHistorySource(document.id);
      } catch (error) {
        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? {
                  ...current,
                  saveMessage: readErrorMessage(error),
                  saveState: "error",
                }
              : current,
          ),
        );
        addHistoryEntry(`${document.name} could not be saved.`, {
          kind: "error",
          sourceId: document.id,
        });
      }
    },
    [addHistoryEntry, resolveHistorySource, vaultName],
  );

  const createNote = useCallback(() => {
    if (!vaultSelected) {
      addVaultNotice("Open a vault before creating a note.");
      return;
    }
    const nextDocument = createUntitledDocument(documentsRef.current);
    const nextDocuments = [...documentsRef.current, nextDocument];

    loadRequestRef.current += 1;
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    setActiveDocumentId(nextDocument.id);
    if (nextDocument.folderPath) {
      setExpandedFolders((currentFolders) =>
        new Set(currentFolders).add(nextDocument.folderPath ?? ""),
      );
    }
    setFolderPaths((currentFolders) =>
      currentFolders.includes(nextDocument.folderPath ?? "")
        ? currentFolders
        : [...currentFolders, nextDocument.folderPath ?? ""].filter(
            (value, index, values) =>
              value.length > 0 && values.indexOf(value) === index,
          ),
    );
    setQuery("");
    setDocumentLoad({ status: "idle" });
    setSidebarOpen(false);
    setDocumentActivity((current) =>
      markDocumentActive(current, nextDocument.id, Date.now()),
    );
    void saveUntitledDocument(nextDocument.id);
  }, [addVaultNotice, saveUntitledDocument, vaultSelected]);

  const saveDocumentAs = useCallback(
    async (documentId: string) => {
      const document = documentsRef.current.find(
        (candidate) => candidate.id === documentId,
      );
      if (!document || document.sourceText === undefined) return;
      if (document.status?.trim().toLocaleLowerCase() === "archived") {
        addVaultNotice("Restore this archived note before saving a copy.");
        return;
      }

      const sourceAtSave = document.sourceText;
      const contentAtSave = normalizeMarkdownLineEndings(sourceAtSave);
      setDocuments((currentDocuments) =>
        currentDocuments.map((current) =>
          current.id === documentId
            ? { ...current, saveMessage: undefined, saveState: "saving" }
            : current,
        ),
      );

      try {
        const savedDocument = await createVaultFile({
          content: contentAtSave,
          suggestedName: document.name,
        });
        if (!savedDocument) {
          setDocuments((currentDocuments) =>
            currentDocuments.map((current) =>
              current.id === documentId
                ? {
                    ...current,
                    saveState:
                      current.relativePath &&
                      current.sourceText === current.savedSourceText
                        ? "saved"
                        : "unsaved",
                  }
                : current,
            ),
          );
          return;
        }

        const pathParts = savedDocument.relativePath.split("/");
        const name = pathParts.pop() ?? document.name;
        const folderPath = pathParts.join("/");
        const folder = folderPath || vaultName;
        const currentDocument = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        const hasNewerEdit = currentDocument?.sourceText !== sourceAtSave;

        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? {
                  ...current,
                  archivedAt: savedDocument.archivedAt,
                  createdAt: savedDocument.createdAt,
                  modifiedMillis: savedDocument.modifiedMillis,
                  folder,
                  folderPath,
                  name,
                  noteType: savedDocument.noteType,
                  relativePath: savedDocument.relativePath,
                  saveMessage: hasNewerEdit
                    ? "The file was created, but newer local edits still need to be reconciled before saving."
                    : hasNonUnixLineEndings(sourceAtSave)
                      ? "Saved with Unix (LF) line endings."
                      : undefined,
                  saveState: hasNewerEdit ? "conflict" : "saved",
                  savedSourceText: savedDocument.content,
                  sizeBytes: savedDocument.sizeBytes,
                  status: savedDocument.status,
                  updatedAt: savedDocument.updatedAt,
                  sourceText: hasNewerEdit
                    ? current.sourceText
                    : savedDocument.content,
                }
              : current,
          ),
        );
        if (folderPath) {
          setExpandedFolders((currentFolders) =>
            new Set(currentFolders).add(folderPath),
          );
        }
        setFolderPaths((currentFolders) =>
          currentFolders.includes(folderPath)
            ? currentFolders
            : [...currentFolders, folderPath].filter(
                (value, index, values) =>
                  value.length > 0 && values.indexOf(value) === index,
              ),
        );
        if (hasNewerEdit) {
          addHistoryEntry(
            `${document.name} has unsaved changes because its file changed outside Anchored.`,
            {
              kind: "conflict",
              requiresAction: true,
              sourceId: document.id,
            },
          );
        } else {
          resolveHistorySource(document.id);
        }
      } catch (error) {
        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? {
                  ...current,
                  saveMessage: readErrorMessage(error),
                  saveState: "error",
                }
              : current,
          ),
        );
        addHistoryEntry(`${document.name} could not be saved.`, {
          kind: "error",
          sourceId: document.id,
        });
      }
    },
    [addHistoryEntry, addVaultNotice, resolveHistorySource, vaultName],
  );

  const createConflictCopyForDocument = useCallback(
    async (
      documentId: string,
      content: string,
    ): Promise<string | undefined> => {
      const document = documentsRef.current.find(
        (candidate) => candidate.id === documentId,
      );
      if (!document?.relativePath) return undefined;
      if (document.conflictCopyPath) return document.conflictCopyPath;
      if (conflictCopyInFlightRef.current.has(documentId)) return undefined;

      conflictCopyInFlightRef.current.add(documentId);
      try {
        const copy = await createVaultConflictCopy(
          document.relativePath,
          content,
        );
        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? { ...current, conflictCopyPath: copy.relativePath }
              : current,
          ),
        );
        return copy.relativePath;
      } catch (error) {
        addVaultNotice(
          `Anchored could not create a recovery copy: ${readErrorMessage(error)}`,
          { persistent: true },
        );
        return undefined;
      } finally {
        conflictCopyInFlightRef.current.delete(documentId);
      }
    },
    [addVaultNotice],
  );

  const checkExternalDocument = useCallback(
    async (documentId: string) => {
      const document = documentsRef.current.find(
        (candidate) => candidate.id === documentId,
      );
      if (
        !document?.relativePath ||
        document.sourceText === undefined ||
        document.savedSourceText === undefined
      ) {
        return;
      }
      if (saveInFlightRef.current.has(documentId)) {
        externalCheckPendingRef.current.add(documentId);
        return;
      }
      if (externalCheckInFlightRef.current.has(documentId)) return;

      externalCheckInFlightRef.current.add(documentId);
      try {
        const external = await readVaultFile(document.relativePath);
        const current = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        if (!current || current.savedSourceText === external.content) return;

        if (current.sourceText === current.savedSourceText) {
          setDocuments((currentDocuments) =>
            currentDocuments.map((candidate) =>
              candidate.id === documentId
                ? {
                    ...candidate,
                    archivedAt: external.archivedAt,
                    conflictCopyPath: undefined,
                    createdAt: external.createdAt,
                    modifiedMillis: external.modifiedMillis,
                    noteType: external.noteType,
                    saveMessage: undefined,
                    saveState: "saved",
                    savedSourceText: external.content,
                    sizeBytes: external.sizeBytes,
                    sourceText: external.content,
                    status: external.status,
                    updatedAt: external.updatedAt,
                  }
                : candidate,
            ),
          );
          resolveHistorySource(documentId);
          return;
        }

        if (current.sourceText === undefined) return;
        const copyPath = await createConflictCopyForDocument(
          documentId,
          current.sourceText,
        );
        const message = copyPath
          ? `This Markdown file changed outside Anchored. Your local edits were kept. Recovery copy: ${copyPath}`
          : "This Markdown file changed outside Anchored. Your local edits were kept and were not saved over the external version.";
        const wasAlreadyConflicted = current.saveState === "conflict";
        setDocuments((currentDocuments) =>
          currentDocuments.map((candidate) =>
            candidate.id === documentId
              ? { ...candidate, saveMessage: message, saveState: "conflict" }
              : candidate,
          ),
        );
        if (!wasAlreadyConflicted) {
          addHistoryEntry(
            `${current.name} has unsaved changes because its file changed outside Anchored.`,
            {
              kind: "conflict",
              requiresAction: true,
              sourceId: current.id,
            },
          );
        }
      } catch (error) {
        const current = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        if (
          !current ||
          current.sourceText === undefined ||
          current.sourceText === current.savedSourceText
        )
          return;
        const copyPath = await createConflictCopyForDocument(
          documentId,
          current.sourceText,
        );
        const message = copyPath
          ? `The external Markdown file could not be read. Your local edits were kept. Recovery copy: ${copyPath}`
          : readErrorMessage(error);
        setDocuments((currentDocuments) =>
          currentDocuments.map((candidate) =>
            candidate.id === documentId
              ? { ...candidate, saveMessage: message, saveState: "conflict" }
              : candidate,
          ),
        );
      } finally {
        externalCheckInFlightRef.current.delete(documentId);
      }
    },
    [addHistoryEntry, createConflictCopyForDocument, resolveHistorySource],
  );

  const saveDocument = useCallback(
    async (documentId: string) => {
      const document = documentsRef.current.find(
        (candidate) => candidate.id === documentId,
      );
      if (!document || document.sourceText === undefined) {
        return;
      }
      if (document.status?.trim().toLocaleLowerCase() === "archived") {
        addVaultNotice(
          "Archived notes are read-only. Restore this note first.",
        );
        return;
      }
      if (!document.relativePath || document.savedSourceText === undefined) {
        await saveDocumentAs(documentId);
        return;
      }
      if (saveInFlightRef.current.has(documentId)) return;
      const sourceAtSave = document.sourceText;
      const contentAtSave = normalizeMarkdownLineEndings(sourceAtSave);
      if (
        document.sourceText === document.savedSourceText &&
        contentAtSave === document.sourceText
      ) {
        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? { ...current, saveMessage: undefined, saveState: "saved" }
              : current,
          ),
        );
        resolveHistorySource(document.id);
        return;
      }

      setDocuments((currentDocuments) =>
        currentDocuments.map((current) =>
          current.id === documentId
            ? { ...current, saveMessage: undefined, saveState: "saving" }
            : current,
        ),
      );
      saveInFlightRef.current.add(documentId);

      try {
        const savedDocument = await saveVaultFile({
          content: contentAtSave,
          expectedContent: document.savedSourceText,
          relativePath: document.relativePath,
        });
        const currentDocument = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        const hasNewerEdit = currentDocument?.sourceText !== sourceAtSave;

        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? {
                  ...current,
                  archivedAt: savedDocument.archivedAt,
                  createdAt: savedDocument.createdAt,
                  modifiedMillis: savedDocument.modifiedMillis,
                  noteType: savedDocument.noteType,
                  saveMessage: hasNewerEdit
                    ? undefined
                    : hasNonUnixLineEndings(
                          document.savedSourceText ?? sourceAtSave,
                        )
                      ? "Saved with Unix (LF) line endings."
                      : undefined,
                  saveState: hasNewerEdit ? "unsaved" : "saved",
                  conflictCopyPath: undefined,
                  savedSourceText: savedDocument.content,
                  sizeBytes: savedDocument.sizeBytes,
                  status: savedDocument.status,
                  updatedAt: savedDocument.updatedAt,
                  sourceText: hasNewerEdit
                    ? current.sourceText
                    : savedDocument.content,
                }
              : current,
          ),
        );
        resolveHistorySource(document.id);
      } catch (error) {
        const message = readErrorMessage(error);
        const nextSaveState =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "vaultConflict"
            ? "conflict"
            : "error";
        const conflictCopyPath =
          nextSaveState === "conflict"
            ? await createConflictCopyForDocument(documentId, sourceAtSave)
            : undefined;
        const saveMessage = conflictCopyPath
          ? `${message} Recovery copy: ${conflictCopyPath}`
          : message;
        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? {
                  ...current,
                  conflictCopyPath,
                  saveMessage,
                  saveState: nextSaveState,
                }
              : current,
          ),
        );
        addHistoryEntry(
          nextSaveState === "conflict"
            ? `${document.name} has unsaved changes because its file changed outside Anchored.`
            : `${document.name} could not be saved.`,
          {
            kind: nextSaveState,
            requiresAction: nextSaveState === "conflict",
            sourceId: document.id,
          },
        );
      } finally {
        saveInFlightRef.current.delete(documentId);
        if (externalCheckPendingRef.current.delete(documentId)) {
          window.setTimeout(() => void checkExternalDocument(documentId), 50);
        }
      }
    },
    [
      addHistoryEntry,
      addVaultNotice,
      checkExternalDocument,
      createConflictCopyForDocument,
      resolveHistorySource,
      saveDocumentAs,
    ],
  );

  const recordSnapshotEvents = useCallback(
    (snapshot: VaultSnapshot) => {
      if (snapshot.warnings.skippedSymlinks > 0) {
        addHistoryEntry(
          `${snapshot.warnings.skippedSymlinks} symlink entr${
            snapshot.warnings.skippedSymlinks === 1 ? "y was" : "ies were"
          } skipped for safety.`,
          { kind: "error" },
        );
      }
    },
    [addHistoryEntry],
  );

  const activateVaultSnapshot = useCallback(
    (snapshot: VaultSnapshot) => {
      const nextDocuments = documentsFromVault(snapshot);
      const nextFolders = folderPathsFromVault(snapshot);

      loadRequestRef.current += 1;
      vaultIdRef.current = snapshot.vaultId ?? "";
      documentsRef.current = nextDocuments;
      setVaultId(snapshot.vaultId ?? "");
      setVaultName(snapshot.name);
      setVaultSelected(true);
      setDocuments(nextDocuments);
      setDocumentActivity((current) =>
        reconcileDocumentActivity(current, nextDocuments, Date.now()),
      );
      setFolderPaths(nextFolders);
      setExpandedFolders(new Set(nextFolders));
      setActiveDocumentId("");
      setQuery("");
      setDocumentLoad({ status: "idle" });
      setVaultNotices([]);
      setTrashEntries([]);
      setTrashError(undefined);
      setTrashVisible(false);
      setNotificationHistoryVisible(false);
      recordSnapshotEvents(snapshot);
      const summary = vaultSummaryMessage(snapshot);
      if (summary) addVaultNotice(summary);
    },
    [addVaultNotice, recordSnapshotEvents],
  );

  const adoptVaultSnapshot = useCallback(
    (snapshot: VaultSnapshot) => {
      if (snapshot.vaultId) {
        vaultIdRef.current = snapshot.vaultId;
        setVaultId(snapshot.vaultId);
      }
      const nextDocuments = mergeDocumentsFromVault(
        documentsRef.current,
        snapshot,
      );
      const nextFolders = folderPathsFromVault(snapshot);
      documentsRef.current = nextDocuments;
      setDocuments(nextDocuments);
      setDocumentActivity((current) =>
        reconcileDocumentActivity(current, nextDocuments, Date.now()),
      );
      setFolderPaths(nextFolders);
      setExpandedFolders((currentFolders) => {
        const available = new Set(nextFolders);
        return new Set(
          Array.from(currentFolders).filter((folder) => available.has(folder)),
        );
      });
      recordSnapshotEvents(snapshot);
      const summary = vaultSummaryMessage(snapshot);
      if (summary) addVaultNotice(summary);
    },
    [addVaultNotice, recordSnapshotEvents],
  );

  const refreshVault = useCallback(async () => {
    if (
      !vaultSelected ||
      rescanInFlightRef.current ||
      documentsRef.current.some((document) => document.saveState === "saving")
    ) {
      return;
    }
    rescanInFlightRef.current = true;
    try {
      const snapshot = await rescanVault();
      if (!snapshot) return;
      adoptVaultSnapshot(snapshot);
    } catch (error) {
      addVaultNotice(readErrorMessage(error), { persistent: true });
      addHistoryEntry("Vault refresh could not be completed.", {
        kind: "error",
      });
    } finally {
      rescanInFlightRef.current = false;
    }
  }, [addHistoryEntry, addVaultNotice, adoptVaultSnapshot, vaultSelected]);

  useEffect(() => {
    try {
      saveDocumentActivity(window.localStorage, documentActivity);
    } catch {
      // Activity ranking is optional and must never block the editor shell.
    }
  }, [documentActivity]);

  useEffect(() => {
    void refreshRememberedVaults();
  }, [refreshRememberedVaults]);

  useEffect(() => {
    if (
      sessionRestoreStatusRef.current !== "pending" ||
      rememberedVaultsLoading
    ) {
      return;
    }
    sessionRestoreStatusRef.current = "restoring";

    const session = loadSessionState(window.localStorage);
    if (!session?.vaultId) {
      sessionRestoreStatusRef.current = "done";
      return;
    }

    pendingSessionRelativePathRef.current = session.activeRelativePath;
    setOpeningRememberedVaultId(session.vaultId);
    setRememberedVaultsError(undefined);

    void openRememberedVault(session.vaultId)
      .then(async (snapshot) => {
        activateVaultSnapshot(snapshot);
        await Promise.all([refreshRememberedVaults(), refreshTrashEntries()]);
      })
      .catch(() => {
        pendingSessionRelativePathRef.current = undefined;
        clearSessionState(window.localStorage);
      })
      .finally(() => {
        sessionRestoreStatusRef.current = "done";
        setOpeningRememberedVaultId(undefined);
      });
  }, [
    activateVaultSnapshot,
    refreshRememberedVaults,
    refreshTrashEntries,
    rememberedVaultsLoading,
  ]);

  useEffect(() => {
    try {
      saveNotificationHistory(
        window.localStorage,
        notificationHistory,
        Date.now(),
      );
    } catch {
      // Notification history is optional and must never block the editor.
    }
  }, [notificationHistory]);

  useEffect(() => {
    searchRequestRef.current += 1;
    const requestId = searchRequestRef.current;
    const query = vaultSearchQuery.trim();

    if (!vaultSearchVisible || !vaultSelected || query.length === 0) {
      setVaultSearchState({ status: "idle" });
      return;
    }

    setVaultSearchState({ status: "searching" });
    const timeout = window.setTimeout(() => {
      void searchVault(query)
        .then((result) => {
          if (searchRequestRef.current === requestId) {
            setVaultSearchState({ result, status: "success" });
          }
        })
        .catch((error: unknown) => {
          if (searchRequestRef.current === requestId) {
            setVaultSearchState({
              message: readErrorMessage(error),
              status: "error",
            });
          }
        });
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [vaultSearchQuery, vaultSearchVisible, vaultSelected]);

  const openScratchpadWindow = useCallback(
    (mode: ScratchpadMode) => {
      if (!vaultSelected) {
        addVaultNotice("Open a vault before using Scratchpad.");
        return;
      }
      void openScratchpad(mode).catch((error: unknown) => {
        addVaultNotice(readErrorMessage(error), { persistent: true });
      });
    },
    [addVaultNotice, vaultSelected],
  );

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const commandKey = event.metaKey || event.ctrlKey;

      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openScratchpadWindow("new");
        return;
      }

      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        openScratchpadWindow("previous");
        return;
      }

      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        openScratchpadWindow("list");
        return;
      }

      if (commandKey && !event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createNote();
      }

      if (commandKey && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setQuickOpenQuery("");
        setQuickOpenVisible(true);
      }

      if (commandKey && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setVaultSearchQuery("");
        setVaultSearchVisible(true);
      }

      if (
        commandKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "f" &&
        !event.defaultPrevented
      ) {
        event.preventDefault();
        setFindRequest((current) => current + 1);
      }

      if (
        commandKey &&
        event.key.toLowerCase() === "s" &&
        !event.defaultPrevented
      ) {
        event.preventDefault();
        if (event.shiftKey) {
          void saveDocumentAs(activeDocumentId);
        } else {
          void saveDocument(activeDocumentId);
        }
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [
    activeDocumentId,
    createNote,
    openScratchpadWindow,
    saveDocument,
    saveDocumentAs,
  ]);

  useEffect(() => {
    if (sessionRestoreStatusRef.current !== "done" && !vaultSelected) {
      return;
    }

    if (vaultSelected && vaultId) {
      saveSessionState(window.localStorage, {
        activeRelativePath: activeDocument?.relativePath,
        vaultId,
      });
      return;
    }

    clearSessionState(window.localStorage);
  }, [activeDocument?.relativePath, vaultId, vaultSelected]);

  useEffect(() => {
    if (
      !activeDocument?.relativePath ||
      activeDocument.sourceText === undefined ||
      activeDocument.savedSourceText === undefined ||
      activeDocument.sourceText === activeDocument.savedSourceText ||
      saveState !== "unsaved"
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveDocument(activeDocument.id);
    }, 1_000);

    return () => window.clearTimeout(timeout);
  }, [activeDocument, saveDocument, saveState]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (focusRefreshTimeoutRef.current !== undefined) {
        window.clearTimeout(focusRefreshTimeoutRef.current);
      }
      focusRefreshTimeoutRef.current = window.setTimeout(() => {
        focusRefreshTimeoutRef.current = undefined;
        void refreshVault();
      }, 250);
    };
    window.addEventListener("focus", scheduleRefresh);
    return () => {
      window.removeEventListener("focus", scheduleRefresh);
      if (focusRefreshTimeoutRef.current !== undefined) {
        window.clearTimeout(focusRefreshTimeoutRef.current);
      }
    };
  }, [refreshVault]);

  useEffect(() => {
    const relativePath = activeDocumentPathForWatch;
    if (
      !vaultSelected ||
      !relativePath ||
      !activeDocumentLoaded ||
      !activeDocumentIdForWatch
    ) {
      void stopVaultFileWatch().catch(() => undefined);
      return;
    }

    let disposed = false;
    const unlistenPromise = listen<VaultFileChangedEvent>(
      "vault-file-changed",
      (event) => {
        if (!disposed && event.payload.relativePath === relativePath) {
          void checkExternalDocument(activeDocumentIdForWatch);
        }
      },
    );
    void watchVaultFile(relativePath).catch((error) => {
      if (!disposed) addVaultNotice(readErrorMessage(error));
    });

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
      void stopVaultFileWatch().catch(() => undefined);
    };
  }, [
    activeDocumentIdForWatch,
    activeDocumentLoaded,
    activeDocumentPathForWatch,
    addVaultNotice,
    checkExternalDocument,
    vaultSelected,
  ]);

  const selectDocument = useCallback(async (documentId: string) => {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document) return;

    setDocumentActivity((current) =>
      markDocumentActive(current, documentId, Date.now()),
    );
    setActiveDocumentId(documentId);
    setCursorPosition({ line: 1, column: 1 });
    setSidebarOpen(false);

    if (document.isMarkdown === false) {
      loadRequestRef.current += 1;
      setDocumentLoad({ status: "idle" });
      return;
    }

    if (!document.relativePath || document.sourceText !== undefined) {
      loadRequestRef.current += 1;
      setDocumentLoad({ status: "idle" });
      return;
    }

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setDocumentLoad({ status: "loading", documentId });

    try {
      const openedDocument = await readVaultFile(document.relativePath);
      if (loadRequestRef.current !== requestId) return;
      if (openedDocument.relativePath !== document.relativePath) {
        throw new Error("The opened file did not match the requested note.");
      }

      setDocuments((currentDocuments) =>
        currentDocuments.map((currentDocument) =>
          currentDocument.id === documentId
            ? {
                ...currentDocument,
                archivedAt: openedDocument.archivedAt,
                conflictCopyPath: undefined,
                createdAt: openedDocument.createdAt,
                modifiedMillis: openedDocument.modifiedMillis,
                noteType: openedDocument.noteType,
                sizeBytes: openedDocument.sizeBytes,
                saveMessage: undefined,
                saveState: "saved",
                savedSourceText: openedDocument.content,
                sourceText: openedDocument.content,
                status: openedDocument.status,
                updatedAt: openedDocument.updatedAt,
              }
            : currentDocument,
        ),
      );
      setDocumentLoad({ status: "idle" });
    } catch (error) {
      if (loadRequestRef.current !== requestId) return;
      setDocumentLoad({
        status: "error",
        documentId,
        message: readErrorMessage(error),
      });
    }
  }, []);

  async function reloadExternalDocument(documentId: string) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.relativePath) return;

    try {
      const external = await readVaultFile(document.relativePath);
      setDocuments((currentDocuments) =>
        currentDocuments.map((current) =>
          current.id === documentId
            ? {
                ...current,
                archivedAt: external.archivedAt,
                conflictCopyPath: undefined,
                createdAt: external.createdAt,
                modifiedMillis: external.modifiedMillis,
                noteType: external.noteType,
                saveMessage: undefined,
                saveState: "saved",
                savedSourceText: external.content,
                sizeBytes: external.sizeBytes,
                sourceText: external.content,
                status: external.status,
                updatedAt: external.updatedAt,
              }
            : current,
        ),
      );
      resolveHistorySource(documentId);
    } catch (error) {
      addVaultNotice(readErrorMessage(error), { persistent: true });
    }
  }

  async function openConflictCopy(documentId: string) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.conflictCopyPath) return;

    try {
      const snapshot = await rescanVault();
      if (!snapshot) return;
      adoptVaultSnapshot(snapshot);
      const copy = documentsRef.current.find(
        (candidate) => candidate.relativePath === document.conflictCopyPath,
      );
      if (copy) await selectDocument(copy.id);
    } catch (error) {
      addVaultNotice(readErrorMessage(error), { persistent: true });
    }
  }

  useEffect(() => {
    const pendingRelativePath = pendingSessionRelativePathRef.current;
    if (!pendingRelativePath || activeDocumentId || !vaultSelected) {
      return;
    }

    const restoredDocument = documents.find(
      (document) => document.relativePath === pendingRelativePath,
    );
    pendingSessionRelativePathRef.current = undefined;
    if (restoredDocument) {
      void selectDocument(restoredDocument.id);
    }
  }, [activeDocumentId, documents, selectDocument, vaultSelected]);

  async function openVaultSearchResult(relativePath: string) {
    let document = documentsRef.current.find(
      (candidate) => candidate.relativePath === relativePath,
    );
    if (!document) {
      try {
        const snapshot = await rescanVault();
        if (snapshot) {
          adoptVaultSnapshot(snapshot);
          document = documentsRef.current.find(
            (candidate) => candidate.relativePath === relativePath,
          );
        }
      } catch (error) {
        addVaultNotice(readErrorMessage(error), { persistent: true });
        addHistoryEntry("A vault search result could not be reopened.", {
          kind: "error",
        });
        return;
      }
    }

    if (!document) {
      addVaultNotice("That search result is no longer in the vault.", {
        history: { kind: "error" },
        persistent: true,
      });
      return;
    }
    setVaultSearchVisible(false);
    await selectDocument(document.id);
  }

  async function finishRelocatedDocument(
    outcome: {
      relativePath: string;
      updatedFiles: number;
      updatedLinks: number;
    },
    message: string,
  ) {
    const [snapshot, openedDocument] = await Promise.all([
      rescanVault(),
      readVaultFile(outcome.relativePath),
    ]);
    if (!snapshot) {
      throw new Error("The updated vault could not be refreshed.");
    }
    const localDrafts = documentsRef.current.filter(
      (candidate) => !candidate.relativePath,
    );
    const relocatedDocumentId = `vault-path:${outcome.relativePath}`;
    const nextDocuments = [
      ...documentsFromVault(snapshot).map((candidate) =>
        candidate.relativePath === outcome.relativePath
          ? {
              ...candidate,
              savedSourceText: openedDocument.content,
              sizeBytes: openedDocument.sizeBytes,
              sourceText: openedDocument.content,
            }
          : candidate,
      ),
      ...localDrafts,
    ];
    const nextFolders = folderPathsFromVault(snapshot);
    loadRequestRef.current += 1;
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    setDocumentActivity((current) =>
      reconcileDocumentActivity(current, nextDocuments, Date.now()),
    );
    setFolderPaths(nextFolders);
    setExpandedFolders((currentFolders) => {
      const nextExpanded = new Set(currentFolders);
      nextFolders.forEach((folder) => nextExpanded.add(folder));
      return nextExpanded;
    });
    setActiveDocumentId(relocatedDocumentId);
    setDocumentLoad({ status: "idle" });
    addVaultNotice(message, { history: { kind: "rename" } });
  }

  async function renameDocument(documentId: string) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.relativePath || document.isMarkdown === false) {
      return;
    }
    if (hasUnfinishedEdits()) {
      addVaultNotice("Save all open note changes before renaming a note.");
      return;
    }

    let renameCompleted = false;
    setRenamingDocumentId(documentId);
    try {
      const outcome = await renameVaultFile(document.relativePath);
      if (!outcome) return;
      renameCompleted = true;
      const filename =
        outcome.relativePath.split("/").pop() ?? outcome.relativePath;
      const message = `${filename} renamed. ${outcome.updatedLinks} link${
        outcome.updatedLinks === 1 ? "" : "s"
      } updated across ${outcome.updatedFiles} note${
        outcome.updatedFiles === 1 ? "" : "s"
      }.`;
      await finishRelocatedDocument(outcome, message);
    } catch (error) {
      addVaultNotice(
        renameCompleted
          ? `The note was renamed, but Anchored could not refresh it: ${readErrorMessage(error)}`
          : readErrorMessage(error),
        { persistent: true },
      );
      addHistoryEntry(
        renameCompleted
          ? "A renamed note could not be refreshed."
          : "A note rename could not be completed safely.",
        { kind: "error" },
      );
    } finally {
      setRenamingDocumentId(null);
    }
  }

  async function moveDocumentToFolder(
    documentId: string,
    destinationFolderPath: string,
  ) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.relativePath || document.isMarkdown === false) {
      return;
    }
    if ((document.folderPath ?? "") === destinationFolderPath) {
      return;
    }
    if (hasUnfinishedEdits()) {
      addVaultNotice("Save all open note changes before moving a note.");
      return;
    }

    let moveCompleted = false;
    setMovingDocumentId(documentId);
    try {
      const outcome = await moveVaultFileToFolder(
        document.relativePath,
        destinationFolderPath,
      );
      moveCompleted = true;
      const destinationLabel = folderDisplayName(destinationFolderPath);
      const message = `${document.name} moved to ${destinationLabel}. ${
        outcome.updatedLinks
      } link${outcome.updatedLinks === 1 ? "" : "s"} updated across ${
        outcome.updatedFiles
      } note${outcome.updatedFiles === 1 ? "" : "s"}.`;
      await finishRelocatedDocument(outcome, message);
      setMoveDocumentVisible(false);
      setMoveDocumentId(undefined);
    } catch (error) {
      addVaultNotice(
        moveCompleted
          ? `The note was moved, but Anchored could not refresh it: ${readErrorMessage(error)}`
          : readErrorMessage(error),
        { persistent: true },
      );
      addHistoryEntry(
        moveCompleted
          ? "A moved note could not be refreshed."
          : "A note move could not be completed safely.",
        { kind: "error" },
      );
    } finally {
      setMovingDocumentId(undefined);
    }
  }

  function applyLifecycleDocument(documentId: string, result: VaultDocument) {
    setDocuments((currentDocuments) =>
      currentDocuments.map((current) => {
        if (current.id !== documentId) return current;
        const wasLoaded = current.sourceText !== undefined;
        return {
          ...current,
          archivedAt: result.archivedAt,
          createdAt: result.createdAt,
          modifiedMillis: result.modifiedMillis,
          noteType: result.noteType,
          savedSourceText: wasLoaded ? result.content : undefined,
          saveMessage: undefined,
          saveState: "saved",
          sizeBytes: result.sizeBytes,
          sourceText: wasLoaded ? result.content : undefined,
          status: result.status,
          updatedAt: result.updatedAt,
        };
      }),
    );
  }

  async function lifecycleExpectedContent(document: AnchoredDocument) {
    if (document.savedSourceText !== undefined) return document.savedSourceText;
    if (!document.relativePath) {
      throw new Error("This note must be saved before changing its lifecycle.");
    }
    return (await readVaultFile(document.relativePath)).content;
  }

  async function archiveDocument(
    documentId: string,
    noteType: string | undefined,
  ) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.relativePath || document.isMarkdown === false) return;
    if (
      document.saveState !== "saved" ||
      (document.sourceText !== undefined &&
        document.sourceText !== document.savedSourceText)
    ) {
      addVaultNotice("Save this note before archiving it.");
      return;
    }

    setTransitioningDocumentId(documentId);
    try {
      const result = await archiveVaultFile({
        expectedContent: await lifecycleExpectedContent(document),
        noteType,
        relativePath: document.relativePath,
        updateType: true,
      });
      applyLifecycleDocument(documentId, result);
      addVaultNotice(`${document.name} moved to Archive.`, {
        history: { kind: "vault" },
      });
    } catch (error) {
      addVaultNotice(readErrorMessage(error), { persistent: true });
      addHistoryEntry(`${document.name} could not be archived safely.`, {
        kind: "error",
      });
    } finally {
      setTransitioningDocumentId(undefined);
    }
  }

  function requestArchiveDocument(documentId: string) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (document?.noteType?.trim().toLocaleLowerCase() === "scratchpad") {
      void archiveDocument(documentId, "scratchpad");
      return;
    }
    setLifecycleTypeRequest({ action: "archive", documentId });
  }

  async function restoreArchivedDocument(
    documentId: string,
    destinationStatus: "active" | "inbox",
    noteType?: string,
  ) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.relativePath || document.isMarkdown === false) return;

    setTransitioningDocumentId(documentId);
    try {
      const result = await restoreArchivedVaultFile({
        destinationStatus,
        expectedContent: await lifecycleExpectedContent(document),
        noteType,
        relativePath: document.relativePath,
        updateType: destinationStatus === "active",
      });
      applyLifecycleDocument(documentId, result);
      addVaultNotice(
        `${document.name} restored to ${
          destinationStatus === "inbox" ? "Inbox" : "Workbench"
        }.`,
        { history: { kind: "vault" } },
      );
    } catch (error) {
      addVaultNotice(readErrorMessage(error), { persistent: true });
      addHistoryEntry(`${document.name} could not be restored safely.`, {
        kind: "error",
      });
    } finally {
      setTransitioningDocumentId(undefined);
    }
  }

  function requestRestoreArchivedDocument(
    documentId: string,
    destinationStatus: "active" | "inbox",
  ) {
    if (destinationStatus === "inbox") {
      void restoreArchivedDocument(documentId, "inbox");
      return;
    }
    setLifecycleTypeRequest({ action: "workbench", documentId });
  }

  async function moveDocumentToWorkbench(
    documentId: string,
    noteType: string | undefined,
  ) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.relativePath || document.isMarkdown === false) return;
    setTransitioningDocumentId(documentId);
    try {
      const result = await moveVaultFileToWorkbench({
        expectedContent: await lifecycleExpectedContent(document),
        noteType,
        relativePath: document.relativePath,
        updateType: true,
      });
      applyLifecycleDocument(documentId, result);
      addVaultNotice(`${document.name} moved to Workbench.`, {
        history: { kind: "vault" },
      });
    } catch (error) {
      addVaultNotice(readErrorMessage(error), { persistent: true });
    } finally {
      setTransitioningDocumentId(undefined);
    }
  }

  async function trashDocument(documentId: string) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (
      !document?.relativePath ||
      document.isMarkdown === false ||
      document.saveState !== "saved" ||
      (document.sourceText !== undefined &&
        document.sourceText !== document.savedSourceText)
    ) {
      addVaultNotice("Save this note before moving it to Trash.");
      return;
    }

    setTrashingDocumentId(documentId);
    try {
      const result = await moveVaultFileToTrash(document.relativePath);
      loadRequestRef.current += 1;
      setActiveDocumentId("");
      setDocumentLoad({ status: "idle" });
      adoptVaultSnapshot(result.snapshot);
      setTrashEntries((current) => [
        result.entry,
        ...current.filter((entry) => entry.id !== result.entry.id),
      ]);
      addVaultNotice(`${document.name} moved to Trash.`, {
        history: { kind: "trash" },
      });
    } catch (error) {
      addVaultNotice(readErrorMessage(error), { persistent: true });
      addHistoryEntry(`${document.name} could not be moved to Trash.`, {
        kind: "error",
      });
    } finally {
      setTrashingDocumentId(undefined);
    }
  }

  async function restoreTrashEntry(entry: TrashEntry) {
    setRestoringTrashId(entry.id);
    setTrashError(undefined);
    try {
      const result = entry.isFolder
        ? await restoreVaultFolderFromTrash(entry.id)
        : await restoreVaultFileFromTrash(entry.id);
      adoptVaultSnapshot(result.snapshot);
      setTrashEntries((current) =>
        current.filter((candidate) => candidate.id !== entry.id),
      );
      addVaultNotice(`${entry.name} restored to ${entry.originalPath}.`, {
        history: { kind: "trash" },
      });
    } catch (error) {
      setTrashError(readErrorMessage(error));
      addHistoryEntry(`${entry.name} could not be restored from Trash.`, {
        kind: "error",
      });
    } finally {
      setRestoringTrashId(undefined);
    }
  }

  function openWikilink(target: string) {
    const resolution = resolveWikilink(
      target,
      documentsRef.current,
      activeDocumentId,
    );
    if (resolution.status === "resolved") {
      void selectDocument(resolution.documentId);
      return;
    }
    if (resolution.status === "ambiguous") {
      const names = resolution.matches
        .map(
          (documentId) =>
            documentsRef.current.find((document) => document.id === documentId)
              ?.name,
        )
        .filter((name): name is string => Boolean(name));
      addVaultNotice(
        `[[${target}]] is ambiguous${
          names.length > 0 ? `: ${names.join(", ")}.` : "."
        }`,
      );
      addHistoryEntry("A wikilink was ambiguous and was not opened.", {
        kind: "link",
      });
      return;
    }
    addVaultNotice(`[[${target}]] does not match a note or alias.`);
    addHistoryEntry("A wikilink did not match a note or alias.", {
      kind: "link",
    });
  }

  function closeDocument() {
    loadRequestRef.current += 1;
    setActiveDocumentId("");
    setCursorPosition({ line: 1, column: 1 });
    setDocumentLoad({ status: "idle" });
  }

  function updateDocumentContent(content: string) {
    if (
      !activeDocument ||
      activeDocument.status?.trim().toLocaleLowerCase() === "archived"
    ) {
      return;
    }

    const now = Date.now();
    setDocumentActivity((current) => {
      const lastActiveAt = current.get(activeDocument.id)?.lastActiveAt ?? 0;
      return now - lastActiveAt >= ACTIVITY_REFRESH_INTERVAL_MS
        ? markDocumentActive(current, activeDocument.id, now)
        : current;
    });

    setDocuments((currentDocuments) =>
      currentDocuments.map((document) =>
        document.id === activeDocument.id
          ? {
              ...document,
              saveMessage:
                document.saveState === "conflict"
                  ? document.saveMessage
                  : undefined,
              saveState:
                document.saveState === "conflict" ? "conflict" : "unsaved",
              sourceText: content,
            }
          : document,
      ),
    );
  }

  async function openVault() {
    if (vaultSelected && hasUnfinishedEdits()) {
      addVaultNotice(
        "Save or close all draft changes before switching vaults.",
      );
      return;
    }
    setSelectingVault(true);

    try {
      const snapshot = await selectVault();
      if (!snapshot) return;
      activateVaultSnapshot(snapshot);
      setVaultSwitcherVisible(false);
      await Promise.all([refreshRememberedVaults(), refreshTrashEntries()]);
    } catch {
      addVaultNotice(
        "Vault selection is available in the Anchored desktop app.",
        { history: { kind: "error" }, persistent: true },
      );
    } finally {
      setSelectingVault(false);
    }
  }

  async function createNewVault(name: string) {
    if (vaultSelected && hasUnfinishedEdits()) {
      addVaultNotice(
        "Save or close all draft changes before switching vaults.",
      );
      return;
    }
    setCreatingVault(true);
    setCreateVaultError(undefined);

    try {
      const snapshot = await createVault({ name });
      if (!snapshot) {
        setCreateVaultVisible(false);
        return;
      }
      activateVaultSnapshot(snapshot);
      setCreateVaultVisible(false);
      setVaultSwitcherVisible(false);
      await Promise.all([refreshRememberedVaults(), refreshTrashEntries()]);
    } catch (error) {
      setCreateVaultError(readErrorMessage(error));
    } finally {
      setCreatingVault(false);
    }
  }

  async function createNewFolder(name: string) {
    if (!vaultSelected) {
      addVaultNotice("Open a vault before creating a folder.");
      return;
    }
    setCreatingFolder(true);
    setCreateFolderError(undefined);

    try {
      const snapshot = await createVaultFolder({
        name,
        parentPath: createFolderParentPath,
      });
      adoptVaultSnapshot(snapshot);
      setCreateFolderVisible(false);
      setCreateFolderParentPath(undefined);
      addVaultNotice(`${name.trim()} created.`, {
        history: { kind: "rename" },
      });
    } catch (error) {
      setCreateFolderError(readErrorMessage(error));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function renameExistingFolder(name: string) {
    if (!vaultSelected || !renamingFolderPath) {
      addVaultNotice("Open a vault before renaming a folder.");
      return;
    }
    if (hasUnfinishedEdits()) {
      addVaultNotice("Save all open note changes before renaming a folder.");
      return;
    }

    const originalFolderPath = renamingFolderPath;
    setRenameFolderPending(true);
    setRenameFolderError(undefined);
    try {
      const snapshot = await renameVaultFolder({
        folderPath: originalFolderPath,
        name,
      });
      const nextName = name.trim();
      const parentPath = originalFolderPath.split("/").slice(0, -1).join("/");
      const renamedFolderPath = parentPath
        ? `${parentPath}/${nextName}`
        : nextName;
      adoptVaultSnapshot(snapshot);
      setExpandedFolders((currentFolders) => {
        const nextFolders = new Set(currentFolders);
        return new Set(
          Array.from(nextFolders, (folderPath) =>
            folderPath === originalFolderPath
              ? renamedFolderPath
              : folderPath.startsWith(`${originalFolderPath}/`)
                ? `${renamedFolderPath}${folderPath.slice(
                    originalFolderPath.length,
                  )}`
                : folderPath,
          ),
        );
      });
      setRenameFolderVisible(false);
      setRenamingFolderPath(undefined);
      addVaultNotice(`${folderName(originalFolderPath)} renamed.`, {
        history: { kind: "rename" },
      });
    } catch (error) {
      setRenameFolderError(readErrorMessage(error));
    } finally {
      setRenameFolderPending(false);
    }
  }

  async function deleteExistingFolder(confirmation = "") {
    if (!vaultSelected || !deletingFolderPath) {
      addVaultNotice("Open a vault before deleting a folder.");
      return;
    }

    const targetFolderPath = deletingFolderPath;
    setDeleteFolderPending(true);
    setDeleteFolderError(undefined);
    try {
      if (
        deletingFolderContents.fileCount > 0 ||
        deletingFolderContents.folderCount > 0
      ) {
        const result = await moveVaultFolderToTrash(
          targetFolderPath,
          confirmation,
        );
        adoptVaultSnapshot(result.snapshot);
        setTrashEntries((current) => [
          result.entry,
          ...current.filter((entry) => entry.id !== result.entry.id),
        ]);
      } else {
        const snapshot = await deleteVaultFolder(targetFolderPath);
        adoptVaultSnapshot(snapshot);
      }
      setExpandedFolders((currentFolders) => {
        const nextFolders = new Set(currentFolders);
        Array.from(nextFolders).forEach((folderPath) => {
          if (
            folderPath === targetFolderPath ||
            folderPath.startsWith(`${targetFolderPath}/`)
          ) {
            nextFolders.delete(folderPath);
          }
        });
        return nextFolders;
      });
      setDeleteFolderVisible(false);
      setDeletingFolderPath(undefined);
      addVaultNotice(
        `${folderName(targetFolderPath)} ${confirmation ? "moved to Trash" : "deleted"}.`,
        {
          history: { kind: confirmation ? "trash" : "rename" },
        },
      );
    } catch (error) {
      setDeleteFolderError(readErrorMessage(error));
    } finally {
      setDeleteFolderPending(false);
    }
  }

  async function reloadApp() {
    if (reloadingApp) return;
    if (
      documentsRef.current.some((document) => document.saveState === "saving")
    ) {
      addVaultNotice("Wait for the current save to finish before reloading.");
      return;
    }

    const blockedDocuments = documentsRef.current.filter(
      (document) =>
        document.saveState === "conflict" ||
        document.saveState === "error" ||
        (!document.relativePath && document.sourceText !== undefined),
    );
    if (blockedDocuments.length > 0) {
      addVaultNotice("Resolve note save problems before reloading Anchored.", {
        persistent: true,
      });
      return;
    }

    const unsavedDocuments = documentsRef.current.filter(
      (document) =>
        document.relativePath &&
        document.sourceText !== undefined &&
        document.savedSourceText !== undefined &&
        document.sourceText !== document.savedSourceText,
    );

    setReloadingApp(true);
    try {
      for (const document of unsavedDocuments) {
        await saveDocument(document.id);
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });

      const remaining = documentsRef.current.filter(documentHasUnfinishedEdits);
      if (remaining.length > 0) {
        addVaultNotice(
          "Anchored could not safely reload because some note changes still need attention.",
          { persistent: true },
        );
        return;
      }

      if (vaultSelected && vaultId) {
        saveSessionState(window.localStorage, {
          activeRelativePath: activeDocument?.relativePath,
          vaultId,
        });
      } else {
        clearSessionState(window.localStorage);
      }
      reloadAnchoredWindow();
    } finally {
      setReloadingApp(false);
      setSettingsVisible(false);
    }
  }

  async function openKnownVault(rememberedVaultId: string) {
    if (hasUnfinishedEdits()) {
      addVaultNotice(
        "Save or close all draft changes before switching vaults.",
      );
      return;
    }

    setOpeningRememberedVaultId(rememberedVaultId);
    setRememberedVaultsError(undefined);
    try {
      const snapshot = await openRememberedVault(rememberedVaultId);
      activateVaultSnapshot(snapshot);
      setVaultSwitcherVisible(false);
      await Promise.all([refreshRememberedVaults(), refreshTrashEntries()]);
    } catch (error) {
      setRememberedVaultsError(readErrorMessage(error));
    } finally {
      setOpeningRememberedVaultId(undefined);
    }
  }

  async function forgetKnownVault(rememberedVaultId: string) {
    setRememberedVaultsError(undefined);
    try {
      setRememberedVaults(await forgetVault(rememberedVaultId));
    } catch (error) {
      setRememberedVaultsError(readErrorMessage(error));
    }
  }

  function toggleFolder(folder: string) {
    setExpandedFolders((currentFolders) => {
      const nextFolders = new Set(currentFolders);

      if (nextFolders.has(folder)) {
        nextFolders.delete(folder);
      } else {
        nextFolders.add(folder);
      }

      return nextFolders;
    });
  }

  async function createNoteInFolder(folderPath: string) {
    try {
      const created = await createUntitledVaultFile("", folderPath);
      const snapshot = await rescanVault();
      if (snapshot) adoptVaultSnapshot(snapshot);
      const documentId = `vault-path:${created.relativePath}`;
      setDocuments((current) =>
        current.map((document) =>
          document.id === documentId
            ? {
                ...document,
                createdAt: created.createdAt,
                savedSourceText: created.content,
                sizeBytes: created.sizeBytes,
                sourceText: created.content,
                updatedAt: created.updatedAt,
              }
            : document,
        ),
      );
      setExpandedFolders((current) => new Set(current).add(folderPath));
      setActiveDocumentId(documentId);
      setDocumentLoad({ status: "idle" });
    } catch (error) {
      addVaultNotice(readErrorMessage(error), { persistent: true });
    }
  }

  async function moveExistingFolder(destinationFolder: string) {
    if (!moveFolderPath) return;
    setMoveFolderPending(true);
    try {
      const snapshot = await moveVaultFolder(moveFolderPath, destinationFolder);
      adoptVaultSnapshot(snapshot);
      setMoveFolderPath(undefined);
      addVaultNotice(`${folderName(moveFolderPath)} moved.`, {
        history: { kind: "vault" },
      });
    } catch (error) {
      addVaultNotice(readErrorMessage(error), { persistent: true });
    } finally {
      setMoveFolderPending(false);
    }
  }

  return (
    <div className="app-shell">
      <TitleBar
        canCreateNote={vaultSelected}
        notificationCount={visibleNotificationHistory.length}
        saveState={activeDocument ? saveState : undefined}
        selectingVault={selectingVault}
        sidebarOpen={sidebarOpen}
        vaultSelected={vaultSelected}
        vaultName={vaultName}
        onCreateNote={createNote}
        onOpenNotifications={() => setNotificationHistoryVisible(true)}
        onOpenScratchpad={() => openScratchpadWindow("new")}
        onOpenSearch={() => {
          setVaultSearchQuery("");
          setVaultSearchVisible(true);
        }}
        onOpenSettings={() => setSettingsVisible(true)}
        onSelectVault={() => {
          if (!vaultSelected && rememberedVaults.length === 0) {
            void openVault();
            return;
          }
          setVaultSwitcherVisible(true);
          void refreshRememberedVaults();
        }}
        onToggleSidebar={() => setSidebarOpen((isOpen) => !isOpen)}
      />
      <div className={`workspace${sidebarOpen ? " sidebar-open" : ""}`}>
        <FileRail
          activeDocumentId={activeDocument?.id ?? ""}
          documents={documents}
          expandedFolders={expandedFolders}
          folders={folderPaths}
          query={query}
          searchInputRef={searchInputRef}
          trashCount={trashEntries.length}
          vaultName={vaultName}
          vaultSelected={vaultSelected}
          onArchiveDocument={requestArchiveDocument}
          onCreateNote={createNote}
          onCreateNoteInFolder={(folderPath) =>
            void createNoteInFolder(folderPath)
          }
          onCreateFolder={(parentPath) => {
            setCreateFolderParentPath(parentPath);
            setCreateFolderError(undefined);
            setCreateFolderVisible(true);
          }}
          onDeleteFolder={(folderPath) => {
            setDeletingFolderPath(folderPath);
            setDeleteFolderError(undefined);
            setDeleteFolderVisible(true);
          }}
          onMoveDocument={(documentId, destinationFolderPath) =>
            void moveDocumentToFolder(documentId, destinationFolderPath)
          }
          onMoveDocumentToWorkbench={(documentId) =>
            setLifecycleTypeRequest({ action: "workbench", documentId })
          }
          onMoveDocumentRequest={(documentId) => {
            setMoveDocumentId(documentId);
            setMoveDocumentVisible(true);
          }}
          onMoveFolderRequest={setMoveFolderPath}
          onOpenTrash={() => {
            setTrashVisible(true);
            void refreshTrashEntries();
          }}
          onOpenScratchpad={() => openScratchpadWindow("list")}
          onQueryChange={setQuery}
          onPreviewDocument={(documentId) => {
            void selectDocument(documentId).then(() => {
              window.dispatchEvent(new Event("anchored:show-preview"));
            });
          }}
          onRenameDocument={(documentId) => {
            void selectDocument(documentId).then(() =>
              renameDocument(documentId),
            );
          }}
          onRenameFolder={(folderPath) => {
            setRenamingFolderPath(folderPath);
            setRenameFolderError(undefined);
            setRenameFolderVisible(true);
          }}
          onRestoreDocument={(documentId, destinationStatus) =>
            requestRestoreArchivedDocument(documentId, destinationStatus)
          }
          onSelectDocument={selectDocument}
          onSearchDocument={(documentId) => {
            void selectDocument(documentId).then(() =>
              setFindRequest((current) => current + 1),
            );
          }}
          onSearchInFolder={(folderPath) => {
            setQuery(`${folderPath}/`);
            window.setTimeout(() => searchInputRef.current?.focus(), 0);
          }}
          onToggleFolder={toggleFolder}
          onSetAllFoldersExpanded={(expanded) =>
            setExpandedFolders(expanded ? new Set(folderPaths) : new Set())
          }
          onTrashDocument={(documentId) => {
            void selectDocument(documentId).then(() =>
              trashDocument(documentId),
            );
          }}
        />
        <EditorSurface
          backlinks={backlinks}
          document={activeDocument}
          hasDocuments={documents.some(
            (document) => document.isMarkdown !== false,
          )}
          findRequest={findRequest}
          loadState={
            documentLoad.status !== "idle" &&
            documentLoad.documentId === activeDocument?.id
              ? documentLoad
              : { status: "idle" }
          }
          vaultName={vaultName}
          vaultSelected={vaultSelected}
          wikilinkCandidates={wikilinkCandidates}
          lifecycleChanging={transitioningDocumentId === activeDocument?.id}
          onArchiveDocument={() => {
            if (activeDocument) requestArchiveDocument(activeDocument.id);
          }}
          onCloseDocument={closeDocument}
          onCreateVault={() => {
            setCreateVaultError(undefined);
            setCreateVaultVisible(true);
          }}
          onDocumentChange={updateDocumentContent}
          onCursorPosition={setCursorPosition}
          onOpenLinkedDocument={(documentId) => void selectDocument(documentId)}
          onOpenMoveDocument={() => {
            if (
              activeDocument?.relativePath &&
              activeDocument.isMarkdown !== false
            ) {
              setMoveDocumentId(activeDocument.id);
              setMoveDocumentVisible(true);
            }
          }}
          onOpenVault={() => void openVault()}
          onOpenWikilink={openWikilink}
          onRetryDocument={() => {
            if (activeDocument) void selectDocument(activeDocument.id);
          }}
          onRenameDocument={() => {
            if (activeDocument) void renameDocument(activeDocument.id);
          }}
          onRestoreDocument={(destinationStatus) => {
            if (activeDocument) {
              requestRestoreArchivedDocument(
                activeDocument.id,
                destinationStatus,
              );
            }
          }}
          onSaveDocument={() => {
            if (activeDocument) void saveDocument(activeDocument.id);
          }}
          onSaveDocumentAs={() => {
            if (activeDocument) void saveDocumentAs(activeDocument.id);
          }}
          onTrashDocument={() => {
            if (activeDocument) void trashDocument(activeDocument.id);
          }}
          moving={movingDocumentId === activeDocument?.id}
          markdownSettings={markdownSettings}
          renaming={renamingDocumentId === activeDocument?.id}
          trashing={trashingDocumentId === activeDocument?.id}
        />
      </div>
      {vaultNotices.length > 0 || activeDocument?.saveMessage ? (
        <div aria-label="Notifications" className="vault-notifications">
          {vaultNotices.map((notice) => (
            <div className="vault-message" key={notice.id} role="status">
              <div className="vault-message__row">
                <span>{notice.text}</span>
                <button
                  aria-label={`Dismiss notification: ${notice.text}`}
                  className="vault-message__dismiss"
                  type="button"
                  onClick={() =>
                    setVaultNotices((currentNotices) =>
                      currentNotices.filter(
                        (currentNotice) => currentNotice.id !== notice.id,
                      ),
                    )
                  }
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
          {activeDocument?.saveMessage ? (
            <div className="vault-message vault-message--error" role="alert">
              <div className="vault-message__row">
                <span>{activeDocument.saveMessage}</span>
                <button
                  aria-label={`Dismiss notification: ${activeDocument.saveMessage}`}
                  className="vault-message__dismiss"
                  type="button"
                  onClick={() =>
                    setDocuments((currentDocuments) =>
                      currentDocuments.map((document) =>
                        document.id === activeDocument.id
                          ? { ...document, saveMessage: undefined }
                          : document,
                      ),
                    )
                  }
                >
                  Dismiss
                </button>
              </div>
              {activeDocument.saveState === "conflict" ? (
                <div className="vault-message__actions">
                  {activeDocument.conflictCopyPath ? (
                    <button
                      type="button"
                      onClick={() => void openConflictCopy(activeDocument.id)}
                    >
                      Open recovery copy
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      void reloadExternalDocument(activeDocument.id)
                    }
                  >
                    Reload external version
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {notificationHistoryVisible ? (
        <NotificationCenter
          entries={visibleNotificationHistory}
          onClearResolved={() =>
            setNotificationHistory((current) =>
              clearResolvedNotifications(current, notificationScopeId),
            )
          }
          onClose={() => setNotificationHistoryVisible(false)}
          onDelete={(entryId) =>
            setNotificationHistory((current) =>
              current.filter(
                (entry) =>
                  entry.id !== entryId ||
                  (entry.requiresAction && entry.resolvedAt === undefined),
              ),
            )
          }
          onResolve={(entryId) =>
            setNotificationHistory((current) =>
              resolveNotification(
                current,
                notificationScopeId,
                entryId,
                Date.now(),
              ),
            )
          }
        />
      ) : null}
      {settingsVisible ? (
        <SettingsModal
          markdownSettings={markdownSettings}
          reloading={reloadingApp}
          onClose={() => {
            if (!reloadingApp) {
              setSettingsVisible(false);
            }
          }}
          onMarkdownSettingsChange={setMarkdownSettings}
          onReload={() => void reloadApp()}
        />
      ) : null}
      {createFolderVisible ? (
        <FolderDialog
          actionLabel="Create folder"
          creating={creatingFolder}
          description={`Create a folder inside ${folderDisplayName(createFolderParentPath ?? "")}.`}
          error={createFolderError}
          nameLabel="Folder name"
          placeholder="New folder"
          title="Create folder"
          onClose={() => {
            if (!creatingFolder) {
              setCreateFolderError(undefined);
              setCreateFolderParentPath(undefined);
              setCreateFolderVisible(false);
            }
          }}
          onCreate={(name) => void createNewFolder(name)}
        />
      ) : null}
      {renameFolderVisible && renamingFolderPath ? (
        <FolderDialog
          actionLabel="Rename folder"
          creating={renameFolderPending}
          description={`Rename ${folderName(renamingFolderPath)} inside ${folderDisplayName(
            renamingFolderPath.split("/").slice(0, -1).join("/"),
          )}.`}
          error={renameFolderError}
          initialName={folderName(renamingFolderPath)}
          nameLabel="New folder name"
          placeholder="Renamed folder"
          title="Rename folder"
          onClose={() => {
            if (!renameFolderPending) {
              setRenameFolderError(undefined);
              setRenamingFolderPath(undefined);
              setRenameFolderVisible(false);
            }
          }}
          onCreate={(name) => void renameExistingFolder(name)}
        />
      ) : null}
      {deleteFolderVisible && deletingFolderPath ? (
        <DeleteFolderDialog
          deleting={deleteFolderPending}
          error={deleteFolderError}
          fileCount={deletingFolderContents.fileCount}
          folderCount={deletingFolderContents.folderCount}
          folderName={folderName(deletingFolderPath)}
          onClose={() => {
            if (!deleteFolderPending) {
              setDeleteFolderError(undefined);
              setDeletingFolderPath(undefined);
              setDeleteFolderVisible(false);
            }
          }}
          onDelete={(confirmation) => void deleteExistingFolder(confirmation)}
        />
      ) : null}
      {moveDocumentVisible && moveTargetDocument ? (
        <MoveNoteDialog
          currentFolderPath={moveTargetDocument.folderPath ?? ""}
          documentName={moveTargetDocument.name}
          folders={folderPaths}
          moving={movingDocumentId === moveTargetDocument.id}
          onClose={() => {
            if (!movingDocumentId) {
              setMoveDocumentVisible(false);
              setMoveDocumentId(undefined);
            }
          }}
          onMove={(destinationFolderPath) =>
            void moveDocumentToFolder(
              moveTargetDocument.id,
              destinationFolderPath,
            )
          }
        />
      ) : null}
      {moveFolderPath ? (
        <MoveNoteDialog
          currentFolderPath={moveFolderPath.split("/").slice(0, -1).join("/")}
          documentName={folderName(moveFolderPath)}
          folders={folderPaths.filter(
            (folder) =>
              folder !== moveFolderPath &&
              !folder.startsWith(`${moveFolderPath}/`),
          )}
          itemKind="folder"
          moving={moveFolderPending}
          onClose={() => {
            if (!moveFolderPending) setMoveFolderPath(undefined);
          }}
          onMove={(destinationFolder) =>
            void moveExistingFolder(destinationFolder)
          }
        />
      ) : null}
      {lifecycleTypeRequest && lifecycleTypeDocument ? (
        <LifecycleTypeDialog
          action={lifecycleTypeRequest.action}
          currentType={lifecycleTypeDocument.noteType}
          documentName={lifecycleTypeDocument.name}
          existingTypes={existingNoteTypes}
          pending={transitioningDocumentId === lifecycleTypeDocument.id}
          onClose={() => setLifecycleTypeRequest(undefined)}
          onConfirm={(noteType) => {
            const request = lifecycleTypeRequest;
            setLifecycleTypeRequest(undefined);
            if (request.action === "archive") {
              void archiveDocument(request.documentId, noteType);
            } else {
              const document = documentsRef.current.find(
                (candidate) => candidate.id === request.documentId,
              );
              if (document?.status?.trim().toLocaleLowerCase() === "archived") {
                void restoreArchivedDocument(
                  request.documentId,
                  "active",
                  noteType,
                );
              } else {
                void moveDocumentToWorkbench(request.documentId, noteType);
              }
            }
          }}
        />
      ) : null}
      {vaultSwitcherVisible ? (
        <VaultSwitcher
          currentVaultId={vaultId}
          error={rememberedVaultsError}
          loading={rememberedVaultsLoading}
          openingVaultId={openingRememberedVaultId}
          vaults={rememberedVaults}
          onClose={() => setVaultSwitcherVisible(false)}
          onCreateVault={() => {
            setCreateVaultError(undefined);
            setVaultSwitcherVisible(false);
            setCreateVaultVisible(true);
          }}
          onForget={(rememberedVaultId) =>
            void forgetKnownVault(rememberedVaultId)
          }
          onOpenAnother={() => void openVault()}
          onOpenRemembered={(rememberedVaultId) =>
            void openKnownVault(rememberedVaultId)
          }
        />
      ) : null}
      {createVaultVisible ? (
        <CreateVaultDialog
          creating={creatingVault}
          error={createVaultError}
          onClose={() => {
            if (!creatingVault) {
              setCreateVaultError(undefined);
              setCreateVaultVisible(false);
            }
          }}
          onCreate={(name) => void createNewVault(name)}
        />
      ) : null}
      {trashVisible ? (
        <TrashPanel
          entries={trashEntries}
          error={trashError}
          loading={trashLoading}
          restoringId={restoringTrashId}
          onClose={() => setTrashVisible(false)}
          onRestore={(entry) => void restoreTrashEntry(entry)}
        />
      ) : null}
      {quickOpenVisible ? (
        <QuickOpenPalette
          query={quickOpenQuery}
          results={quickOpenResults}
          onClose={() => setQuickOpenVisible(false)}
          onOpen={(documentId) => {
            setQuickOpenVisible(false);
            void selectDocument(documentId);
          }}
          onQueryChange={setQuickOpenQuery}
        />
      ) : null}
      {vaultSearchVisible ? (
        <VaultSearchPalette
          query={vaultSearchQuery}
          searchState={vaultSearchState}
          vaultSelected={vaultSelected}
          onClose={() => setVaultSearchVisible(false)}
          onOpen={(relativePath) => void openVaultSearchResult(relativePath)}
          onQueryChange={setVaultSearchQuery}
        />
      ) : null}
      <StatusBar
        cursorPosition={cursorPosition}
        document={activeDocument}
        vaultFileCount={
          vaultSelected
            ? documents.filter(
                (document) =>
                  document.relativePath && document.isMarkdown !== false,
              ).length
            : undefined
        }
        vaultName={vaultName}
      />
    </div>
  );
}
