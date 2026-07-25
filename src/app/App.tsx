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
import { ConflictResolutionDialog } from "./components/ConflictResolutionDialog";
import { CreateVaultDialog } from "./components/CreateVaultDialog";
import { CreateMissingWikilinkDialog } from "./components/CreateMissingWikilinkDialog";
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
import { readErrorMessage } from "./errors";
import { useConflictResolution } from "./useConflictResolution";
import { useFolderDialogs } from "./useFolderDialogs";
import { useMissingWikilinkDialog } from "./useMissingWikilinkDialog";
import { useSidebarState } from "./useSidebarState";
import { useTimestampMigration } from "./useTimestampMigration";
import { useTrashPanel } from "./useTrashPanel";
import {
  VaultSearchPalette,
  type VaultSearchState,
} from "./components/VaultSearchPalette";
import {
  applyVaultPatch,
  createUntitledDocument,
  documentsFromVault,
  folderDisplayName,
  folderName,
  folderPathsFromVault,
  mergeFolderPaths,
  mergeDocumentsFromVault,
  type AnchoredDocument,
  type DocumentSaveState,
} from "./documents";
import {
  backlinksForDocument,
  buildDocumentLinkIndex,
  resolveWikilink,
  wikilinkCreationName,
} from "./links";
import {
  buildWikilinkCandidates,
  type DocumentActivity,
} from "./linkCandidates";
import { fileExtension } from "./fileTypes";
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
  createUntitledVaultFile,
  createVaultFile,
  forgetVault,
  listRememberedVaults,
  moveVaultFileToFolder,
  moveVaultFileToWorkbench,
  moveVaultFolder,
  openDevelopmentVault,
  openRememberedVault,
  readVaultFile,
  reconcileVaultFileMove,
  renameVaultFile,
  rescanVault,
  rescanVaultPaths,
  saveVaultFile,
  searchVault,
  selectVault,
  stopVault,
  watchVault,
  type VaultChange,
  type VaultChangeBatch,
  isBrowserDevelopmentFixture,
  restoreArchivedVaultFile,
  type RememberedVault,
  type VaultDocument,
  type VaultSnapshot,
} from "../lib/tauri/vault";
import { openScratchpad, type ScratchpadMode } from "../lib/tauri/scratchpad";
import { checkForUpdate, installUpdate } from "./updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { mergeThreeWay } from "./threeWayMerge";
import { saveConflictSnapshot } from "./conflictSnapshots";

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
  const [focusDocumentId, setFocusDocumentId] = useState<string>();
  const [cursorPosition, setCursorPosition] = useState<EditorCursorPosition>({
    line: 1,
    column: 1,
  });
  const [query, setQuery] = useState("");
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");
  const [vaultSearchState, setVaultSearchState] = useState<VaultSearchState>({
    status: "idle",
  });
  const [vaultSearchVisible, setVaultSearchVisible] = useState(false);
  const [findRequest, setFindRequest] = useState(0);
  const [vaultName, setVaultName] = useState("");
  const [vaultId, setVaultId] = useState("");
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [markdownSettings, setMarkdownSettings] = useState<MarkdownSettings>(
    initialMarkdownSettings,
  );
  const [selectingVault, setSelectingVault] = useState(false);
  const [creatingVault, setCreatingVault] = useState(false);
  const [createVaultVisible, setCreateVaultVisible] = useState(false);
  const [createVaultError, setCreateVaultError] = useState<
    string | undefined
  >();
  const [reloadingApp, setReloadingApp] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateStatus, setUpdateStatus] = useState<
    "available" | "checking" | "error" | "idle" | "current" | "installing"
  >("idle");
  const [updateError, setUpdateError] = useState<string>();
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
  const vaultTreeRefreshTimeoutRef = useRef<number | undefined>(undefined);
  const vaultNoticeIdRef = useRef(0);
  const vaultNoticeTimeoutsRef = useRef<Map<number, number>>(new Map());
  const notificationIdRef = useRef(0);
  const documentsRef = useRef(documents);
  const activeDocumentIdRef = useRef("");
  const focusDocumentIdRef = useRef<string | undefined>(undefined);
  const pendingSessionRelativePathRef = useRef<string | undefined>(undefined);
  const sessionRestoreStatusRef = useRef<"pending" | "restoring" | "done">(
    "pending",
  );
  const vaultIdRef = useRef("");

  const sidebar = useSidebarState();
  const conflictResolution = useConflictResolution();

  documentsRef.current = documents;
  activeDocumentIdRef.current = activeDocumentId;
  focusDocumentIdRef.current = focusDocumentId;

  const setActiveDocument = useCallback((documentId: string) => {
    activeDocumentIdRef.current = documentId;
    setActiveDocumentId(documentId);
  }, []);

  const setFocusDocument = useCallback((documentId?: string) => {
    focusDocumentIdRef.current = documentId;
    setFocusDocumentId(documentId);
  }, []);

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
  const saveState: DocumentSaveState = activeDocument?.saveState ?? "saved";
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
        const savedDocument = await createUntitledVaultFile(
          contentAtSave,
          "inbox",
        );
        const persistedDocumentId = `vault-path:${savedDocument.relativePath}`;
        const pathParts = savedDocument.relativePath.split("/");
        const name = pathParts.pop() ?? document.name;
        const folderPath = pathParts.join("/");
        const folder = folderPath || vaultName;
        const currentDocument = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        const hasNewerEdit = currentDocument?.sourceText !== sourceAtSave;
        const wasActive = activeDocumentIdRef.current === documentId;
        const shouldFocus = focusDocumentIdRef.current === documentId;

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
                  id: persistedDocumentId,
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
        if (wasActive) setActiveDocument(persistedDocumentId);
        if (shouldFocus) {
          setFocusDocument(hasNewerEdit ? undefined : persistedDocumentId);
        }
        if (folderPath) {
          sidebar.setExpandedFolders((currentFolders) =>
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
    // sidebar.setExpandedFolders is a raw useState setter (always stable);
    // depending on the whole `sidebar` object would recreate this callback
    // whenever expandedFolders/sidebarOpen change, including as a result of
    // this callback's own calls to sidebar.setExpandedFolders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      addHistoryEntry,
      resolveHistorySource,
      setActiveDocument,
      setFocusDocument,
      sidebar.setExpandedFolders,
      vaultName,
    ],
  );

  const createNote = useCallback(() => {
    if (!vaultSelected) {
      addVaultNotice("Open a vault before creating a note.");
      return;
    }
    const nextDocument = createUntitledDocument();
    const nextDocuments = [...documentsRef.current, nextDocument];

    loadRequestRef.current += 1;
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    setActiveDocument(nextDocument.id);
    setFocusDocument(nextDocument.id);
    if (nextDocument.folderPath) {
      sidebar.setExpandedFolders((currentFolders) =>
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
    sidebar.setSidebarOpen(false);
    setDocumentActivity((current) =>
      markDocumentActive(current, nextDocument.id, Date.now()),
    );
    void saveUntitledDocument(nextDocument.id);
    // sidebar.setExpandedFolders/setSidebarOpen are raw useState setters
    // (always stable); depending on the whole `sidebar` object would
    // recreate this callback whenever expandedFolders/sidebarOpen change,
    // including as a result of this callback's own calls below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    addVaultNotice,
    saveUntitledDocument,
    setActiveDocument,
    setFocusDocument,
    sidebar.setExpandedFolders,
    sidebar.setSidebarOpen,
    vaultSelected,
  ]);

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
          sidebar.setExpandedFolders((currentFolders) =>
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
    // sidebar.setExpandedFolders is a raw useState setter (always stable);
    // see the comment on saveUntitledDocument's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      addHistoryEntry,
      addVaultNotice,
      resolveHistorySource,
      sidebar.setExpandedFolders,
      vaultName,
    ],
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

        if (
          current.sourceText === undefined ||
          current.savedSourceText === undefined ||
          current.relativePath === undefined
        )
          return;
        const merge = mergeThreeWay(
          current.savedSourceText,
          current.sourceText,
          external.content,
        );
        saveConflictSnapshot(window.localStorage, {
          base: current.savedSourceText,
          external: external.content,
          local: current.sourceText,
          path: current.relativePath,
          savedAt: Date.now(),
          vaultId: vaultIdRef.current,
        });
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
              ? {
                  ...candidate,
                  conflictBaseSourceText: current.savedSourceText,
                  conflictExternalSourceText: external.content,
                  saveMessage:
                    merge.status === "clean"
                      ? `${message} Anchored found a non-overlapping merge you can review.`
                      : message,
                  saveState: "conflict",
                }
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
                  conflictBaseSourceText: undefined,
                  conflictExternalSourceText: undefined,
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

  const adoptVaultSnapshot = useCallback(
    (snapshot: VaultSnapshot) => {
      const activeDocumentBeforeRefresh = documentsRef.current.find(
        (document) => document.id === activeDocumentIdRef.current,
      );
      const activeRelativePath = activeDocumentBeforeRefresh?.relativePath;
      if (snapshot.vaultId) {
        vaultIdRef.current = snapshot.vaultId;
        setVaultId(snapshot.vaultId);
      }
      const nextDocuments = mergeDocumentsFromVault(
        documentsRef.current,
        snapshot,
      );
      const nextActiveDocumentId = activeRelativePath
        ? (nextDocuments.find(
            (document) => document.relativePath === activeRelativePath,
          )?.id ?? "")
        : activeDocumentIdRef.current;
      const nextFolders = folderPathsFromVault(snapshot);
      documentsRef.current = nextDocuments;
      setDocuments(nextDocuments);
      if (nextActiveDocumentId !== activeDocumentIdRef.current) {
        setActiveDocument(nextActiveDocumentId);
      }
      setDocumentActivity((current) =>
        reconcileDocumentActivity(current, nextDocuments, Date.now()),
      );
      setFolderPaths(nextFolders);
      sidebar.setExpandedFolders((currentFolders) => {
        const available = new Set(nextFolders);
        return new Set(
          Array.from(currentFolders).filter((folder) => available.has(folder)),
        );
      });
      recordSnapshotEvents(snapshot);
      const summary = vaultSummaryMessage(snapshot);
      if (summary) addVaultNotice(summary);
    },
    // sidebar.setExpandedFolders is a raw useState setter (always stable);
    // see the comment on saveUntitledDocument's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      addVaultNotice,
      recordSnapshotEvents,
      setActiveDocument,
      sidebar.setExpandedFolders,
    ],
  );

  const onActiveDocumentTrashed = useCallback(() => {
    loadRequestRef.current += 1;
    setActiveDocument("");
    setFocusDocument(undefined);
    setDocumentLoad({ status: "idle" });
  }, [setActiveDocument, setFocusDocument]);

  const trash = useTrashPanel({
    addHistoryEntry,
    addVaultNotice,
    adoptVaultSnapshot,
    documentsRef,
    onActiveDocumentTrashed,
  });

  const folderDialogs = useFolderDialogs({
    addTrashEntry: trash.addTrashEntry,
    addVaultNotice,
    adoptVaultSnapshot,
    documents,
    folderPaths,
    hasUnfinishedEdits,
    setExpandedFolders: sidebar.setExpandedFolders,
    vaultSelected,
  });

  const timestampMigration = useTimestampMigration({
    adoptVaultSnapshot,
    documentsRef,
    vaultSelected,
  });

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
      sidebar.setExpandedFolders(new Set(nextFolders));
      setActiveDocument("");
      setFocusDocument(undefined);
      setQuery("");
      setDocumentLoad({ status: "idle" });
      setVaultNotices([]);
      timestampMigration.reset();
      trash.reset();
      setNotificationHistoryVisible(false);
      recordSnapshotEvents(snapshot);
      const summary = vaultSummaryMessage(snapshot);
      if (summary) addVaultNotice(summary);
    },
    // trash.reset and timestampMigration.reset both have stable identities
    // (useCallback with no deps inside their hooks); the containing objects
    // are recreated every render, so depending on them directly would defeat
    // this memoization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      addVaultNotice,
      recordSnapshotEvents,
      setActiveDocument,
      setFocusDocument,
      timestampMigration.reset,
      trash.reset,
    ],
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

  const refreshVaultForPaths = useCallback(
    async (relativePaths: string[]) => {
      if (
        !vaultSelected ||
        rescanInFlightRef.current ||
        documentsRef.current.some((document) => document.saveState === "saving")
      ) {
        return;
      }
      rescanInFlightRef.current = true;
      let patch;
      try {
        patch = await rescanVaultPaths(relativePaths);
      } catch (error) {
        rescanInFlightRef.current = false;
        addVaultNotice(readErrorMessage(error), { persistent: true });
        addHistoryEntry("Vault refresh could not be completed.", {
          kind: "error",
        });
        return;
      }
      rescanInFlightRef.current = false;
      if (!patch) return;
      if (patch.requiresFullRescan) {
        await refreshVault();
        return;
      }
      setDocuments((current) => applyVaultPatch(current, patch));
      if (patch.upsertedFolders.length > 0) {
        setFolderPaths((current) =>
          mergeFolderPaths(current, patch.upsertedFolders),
        );
      }
    },
    [addHistoryEntry, addVaultNotice, refreshVault, vaultSelected],
  );

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

    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      pendingSessionRelativePathRef.current = undefined;
      setOpeningRememberedVaultId("__development_fixture__");
      void openDevelopmentVault()
        .then(async (snapshot) => {
          activateVaultSnapshot(snapshot);
          await Promise.all([
            refreshRememberedVaults(),
            trash.refreshTrashEntries(),
          ]);
        })
        .catch((error) => {
          addVaultNotice(readErrorMessage(error), { persistent: true });
        })
        .finally(() => {
          sessionRestoreStatusRef.current = "done";
          setOpeningRememberedVaultId(undefined);
        });
      return;
    }

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
        await Promise.all([
          refreshRememberedVaults(),
          trash.refreshTrashEntries(),
        ]);
      })
      .catch(() => {
        pendingSessionRelativePathRef.current = undefined;
        clearSessionState(window.localStorage);
      })
      .finally(() => {
        sessionRestoreStatusRef.current = "done";
        setOpeningRememberedVaultId(undefined);
      });
    // trash.refreshTrashEntries has a stable identity; see the comment on
    // activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    addVaultNotice,
    activateVaultSnapshot,
    refreshRememberedVaults,
    rememberedVaultsLoading,
    trash.refreshTrashEntries,
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

  const reconcileExternalMove = useCallback(
    async (change: VaultChange) => {
      const oldRelativePath = change.oldRelativePath;
      if (!oldRelativePath || oldRelativePath === change.relativePath) return;

      const current = documentsRef.current.find(
        (document) => document.relativePath === oldRelativePath,
      );
      const nextDocumentId = `vault-path:${change.relativePath}`;
      if (current) {
        const parts = change.relativePath.split("/");
        const name = parts.pop() ?? current.name;
        const folderPath = parts.join("/");
        const nextDocuments = documentsRef.current.map((document) =>
          document.id === current.id
            ? {
                ...document,
                folder: folderPath || vaultName,
                folderPath,
                id: nextDocumentId,
                name,
                relativePath: change.relativePath,
              }
            : document,
        );
        documentsRef.current = nextDocuments;
        setDocuments(nextDocuments);
        if (activeDocumentIdRef.current === current.id) {
          setActiveDocument(nextDocumentId);
        }
        if (focusDocumentIdRef.current === current.id) {
          setFocusDocument(nextDocumentId);
        }
      }

      try {
        const result = await reconcileVaultFileMove(
          oldRelativePath,
          change.relativePath,
          markdownSettings.updateTypeOnExternalMove,
        );
        if (current?.sourceText !== undefined) {
          await checkExternalDocument(nextDocumentId);
        }
        if (result.updatedLinks && result.updatedLinks > 0) {
          addVaultNotice(
            `${result.relativePath.split("/").pop() ?? result.relativePath} moved. ${
              result.updatedLinks
            } link${result.updatedLinks === 1 ? "" : "s"} updated across ${
              result.updatedFiles ?? 0
            } note${result.updatedFiles === 1 ? "" : "s"}.`,
          );
        }
      } catch (error) {
        addVaultNotice(
          `Anchored could not reconcile the moved note safely: ${readErrorMessage(error)}`,
          { persistent: true },
        );
        if (current?.sourceText !== undefined) {
          await checkExternalDocument(nextDocumentId);
        }
      }
    },
    [
      addVaultNotice,
      checkExternalDocument,
      markdownSettings.updateTypeOnExternalMove,
      setActiveDocument,
      setFocusDocument,
      vaultName,
    ],
  );

  useEffect(() => {
    if (isBrowserDevelopmentFixture()) return;
    if (!vaultSelected) {
      void stopVault().catch(() => undefined);
      return;
    }

    let disposed = false;
    const unlistenPromise = listen<VaultChangeBatch>(
      "vault-changed",
      (event) => {
        if (
          disposed ||
          (event.payload.vaultId &&
            event.payload.vaultId !== vaultIdRef.current)
        ) {
          return;
        }
        const moveChanges = event.payload.changes.filter(
          (change) =>
            change.oldRelativePath &&
            change.relativePath.toLowerCase().endsWith(".md"),
        );
        const movePromises = moveChanges.map((change) =>
          reconcileExternalMove(change),
        );

        const activeDocument = documentsRef.current.find(
          (document) => document.id === activeDocumentIdRef.current,
        );
        const activeDocumentId = activeDocumentIdRef.current;
        const activePath = activeDocument?.relativePath;
        if (
          activeDocumentId &&
          activePath &&
          event.payload.changes.some(
            (change) =>
              !change.oldRelativePath && change.relativePath === activePath,
          )
        ) {
          void checkExternalDocument(activeDocumentId);
        }
        const scheduleFullRefresh = () => {
          if (vaultTreeRefreshTimeoutRef.current !== undefined) {
            window.clearTimeout(vaultTreeRefreshTimeoutRef.current);
          }
          vaultTreeRefreshTimeoutRef.current = window.setTimeout(() => {
            vaultTreeRefreshTimeoutRef.current = undefined;
            void refreshVault();
          }, 250);
        };
        // Markdown renames/moves already need a full rescan afterward (link
        // rewrites can touch any note), so only the remaining changes are
        // worth a targeted patch: everything else, plus non-Markdown asset
        // renames, which never carry links to rewrite.
        const targetedRelativePaths = Array.from(
          new Set(
            event.payload.changes
              .filter((change) => !moveChanges.includes(change))
              .flatMap((change) =>
                change.oldRelativePath
                  ? [change.oldRelativePath, change.relativePath]
                  : [change.relativePath],
              ),
          ),
        );
        const schedulePathRefresh = (relativePaths: string[]) => {
          if (vaultTreeRefreshTimeoutRef.current !== undefined) {
            window.clearTimeout(vaultTreeRefreshTimeoutRef.current);
          }
          vaultTreeRefreshTimeoutRef.current = window.setTimeout(() => {
            vaultTreeRefreshTimeoutRef.current = undefined;
            void refreshVaultForPaths(relativePaths);
          }, 250);
        };
        if (movePromises.length > 0) {
          void Promise.allSettled(movePromises).then(scheduleFullRefresh);
        } else if (targetedRelativePaths.length > 0) {
          schedulePathRefresh(targetedRelativePaths);
        } else {
          scheduleFullRefresh();
        }
      },
    );
    void watchVault().catch((error) => {
      if (!disposed) addVaultNotice(readErrorMessage(error));
    });

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
      void stopVault().catch(() => undefined);
      if (vaultTreeRefreshTimeoutRef.current !== undefined) {
        window.clearTimeout(vaultTreeRefreshTimeoutRef.current);
        vaultTreeRefreshTimeoutRef.current = undefined;
      }
    };
  }, [
    addVaultNotice,
    checkExternalDocument,
    reconcileExternalMove,
    refreshVault,
    refreshVaultForPaths,
    vaultName,
    vaultSelected,
    vaultId,
  ]);
  const selectDocument = useCallback(
    async (documentId: string) => {
      const document = documentsRef.current.find(
        (candidate) => candidate.id === documentId,
      );
      if (!document) return;

      if (
        focusDocumentIdRef.current &&
        focusDocumentIdRef.current !== documentId
      ) {
        setFocusDocument(undefined);
      }
      setDocumentActivity((current) =>
        markDocumentActive(current, documentId, Date.now()),
      );
      setActiveDocument(documentId);
      setCursorPosition({ line: 1, column: 1 });
      sidebar.setSidebarOpen(false);

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
    },
    // sidebar.setSidebarOpen is a raw useState setter (always stable); see
    // the comment on saveUntitledDocument's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setActiveDocument, setFocusDocument, sidebar.setSidebarOpen],
  );

  const missingWikilink = useMissingWikilinkDialog({
    adoptVaultSnapshot,
    selectDocument,
    setFocusDocument,
  });

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
                conflictBaseSourceText: undefined,
                conflictCopyPath: undefined,
                conflictExternalSourceText: undefined,
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

  async function resolveConflict(documentId: string, content: string) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.relativePath || !document.conflictExternalSourceText) return;
    try {
      const saved = await saveVaultFile({
        content: normalizeMarkdownLineEndings(content),
        expectedContent: document.conflictExternalSourceText,
        relativePath: document.relativePath,
      });
      setDocuments((currentDocuments) =>
        currentDocuments.map((candidate) =>
          candidate.id === documentId
            ? {
                ...candidate,
                conflictBaseSourceText: undefined,
                conflictExternalSourceText: undefined,
                conflictCopyPath: undefined,
                saveMessage: undefined,
                saveState: "saved",
                savedSourceText: saved.content,
                sourceText: saved.content,
              }
            : candidate,
        ),
      );
      conflictResolution.closeConflictResolution();
      resolveHistorySource(documentId);
      await refreshVault();
    } catch (error) {
      addVaultNotice(
        `The conflict changed again and was not overwritten: ${readErrorMessage(error)}`,
        { persistent: true },
      );
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
    sidebar.setExpandedFolders((currentFolders) => {
      const nextExpanded = new Set(currentFolders);
      nextFolders.forEach((folder) => nextExpanded.add(folder));
      return nextExpanded;
    });
    setActiveDocument(relocatedDocumentId);
    setFocusDocument(undefined);
    setDocumentLoad({ status: "idle" });
    addVaultNotice(message, { history: { kind: "rename" } });
  }

  async function renameDocument(documentId: string, name: string) {
    let document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.relativePath || document.isMarkdown === false) {
      return;
    }
    let relativePath = document.relativePath;
    const otherDocumentsHaveUnfinishedEdits = documentsRef.current.some(
      (candidate) =>
        candidate.id !== documentId && documentHasUnfinishedEdits(candidate),
    );
    if (otherDocumentsHaveUnfinishedEdits) {
      addVaultNotice("Save all open note changes before renaming a note.");
      return;
    }
    if (!name.trim()) {
      addVaultNotice("Enter a filename before renaming this note.");
      return;
    }

    let renameCompleted = false;
    setRenamingDocumentId(documentId);
    try {
      if (documentHasUnfinishedEdits(document)) {
        await saveDocument(documentId);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0);
        });
        document = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        if (
          !document ||
          documentHasUnfinishedEdits(document) ||
          !document.relativePath
        ) {
          addVaultNotice("Save the note successfully before renaming it.", {
            persistent: true,
          });
          return;
        }
        relativePath = document.relativePath;
      }
      const extension = fileExtension(document.name) || "md";
      const stem = name.trim().replace(/\.(md|markdown|mdown|mkdn|mdwn)$/i, "");
      const outcome = await renameVaultFile({
        name: `${stem}.${extension}`,
        relativePath,
      });
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

  async function applyLifecycleResult(
    documentId: string,
    result: VaultDocument,
    message: string,
  ) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (
      document?.relativePath &&
      result.relativePath !== document.relativePath
    ) {
      await finishRelocatedDocument(
        {
          relativePath: result.relativePath,
          updatedFiles: result.updatedFiles ?? 0,
          updatedLinks: result.updatedLinks ?? 0,
        },
        message,
      );
      return;
    }
    applyLifecycleDocument(documentId, result);
    addVaultNotice(message, { history: { kind: "vault" } });
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
      await applyLifecycleResult(
        documentId,
        result,
        `${document.name} moved to Archive.`,
      );
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
      await applyLifecycleResult(
        documentId,
        result,
        `${document.name} restored to ${
          destinationStatus === "inbox" ? "Inbox" : "Workbench"
        }.`,
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
      await applyLifecycleResult(
        documentId,
        result,
        `${document.name} moved to Workbench.`,
      );
    } catch (error) {
      addVaultNotice(readErrorMessage(error), { persistent: true });
    } finally {
      setTransitioningDocumentId(undefined);
    }
  }

  const openWikilink = useCallback(
    (target: string) => {
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
              documentsRef.current.find(
                (document) => document.id === documentId,
              )?.name,
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
      if (wikilinkCreationName(target)) {
        missingWikilink.openMissingWikilinkDialog(target);
        return;
      }
      addVaultNotice(`[[${target}]] does not match a note or alias.`);
      addHistoryEntry("A wikilink did not match a note or alias.", {
        kind: "link",
      });
    },
    // missingWikilink.openMissingWikilinkDialog is a useCallback with an
    // empty deps array (always stable); depending on the whole
    // `missingWikilink` object would recreate this callback whenever its
    // dialog state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeDocumentId,
      addHistoryEntry,
      addVaultNotice,
      missingWikilink.openMissingWikilinkDialog,
      selectDocument,
    ],
  );

  useEffect(() => {
    const unlistenPromise = listen<{ target: string }>(
      "scratchpad-open-wikilink",
      (event) => openWikilink(event.payload.target),
    );
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [openWikilink]);

  function closeDocument() {
    loadRequestRef.current += 1;
    setActiveDocument("");
    setFocusDocument(undefined);
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
      await Promise.all([
        refreshRememberedVaults(),
        trash.refreshTrashEntries(),
      ]);
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
      await Promise.all([
        refreshRememberedVaults(),
        trash.refreshTrashEntries(),
      ]);
    } catch (error) {
      setCreateVaultError(readErrorMessage(error));
    } finally {
      setCreatingVault(false);
    }
  }

  async function handleCheckForUpdates() {
    setUpdateStatus("checking");
    setUpdateError(undefined);

    try {
      const update = await checkForUpdate();
      setAvailableUpdate(update);
      setUpdateStatus(update ? "available" : "current");
    } catch (error) {
      setAvailableUpdate(null);
      setUpdateError(readErrorMessage(error));
      setUpdateStatus("error");
    }
  }

  async function handleInstallUpdate() {
    if (!availableUpdate) return;

    setUpdateStatus("installing");
    setUpdateError(undefined);
    try {
      await installUpdate(availableUpdate);
    } catch (error) {
      setUpdateError(readErrorMessage(error));
      setUpdateStatus("error");
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
      await Promise.all([
        refreshRememberedVaults(),
        trash.refreshTrashEntries(),
      ]);
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
    sidebar.setExpandedFolders((currentFolders) => {
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
      sidebar.setExpandedFolders((current) => new Set(current).add(folderPath));
      setFocusDocument(documentId);
      setActiveDocument(documentId);
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
        sidebarOpen={sidebar.sidebarOpen}
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
        onToggleSidebar={() => sidebar.setSidebarOpen((isOpen) => !isOpen)}
      />
      <div className={`workspace${sidebar.sidebarOpen ? " sidebar-open" : ""}`}>
        <FileRail
          activeDocumentId={activeDocument?.id ?? ""}
          documents={documents}
          expandedFolders={sidebar.expandedFolders}
          folders={folderPaths}
          query={query}
          searchInputRef={searchInputRef}
          trashCount={trash.trashEntries.length}
          vaultName={vaultName}
          vaultSelected={vaultSelected}
          showFileExtensions={markdownSettings.showFileExtensions}
          onArchiveDocument={requestArchiveDocument}
          onCreateNote={createNote}
          onCreateNoteInFolder={(folderPath) =>
            void createNoteInFolder(folderPath)
          }
          onCreateFolder={(parentPath) => {
            folderDialogs.setCreateFolderParentPath(parentPath);
            folderDialogs.setCreateFolderError(undefined);
            folderDialogs.setCreateFolderVisible(true);
          }}
          onDeleteFolder={(folderPath) => {
            folderDialogs.setDeletingFolderPath(folderPath);
            folderDialogs.setDeleteFolderError(undefined);
            folderDialogs.setDeleteFolderVisible(true);
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
          onOpenTrash={trash.openTrashPanel}
          onOpenScratchpad={() => openScratchpadWindow("list")}
          onQueryChange={setQuery}
          onPreviewDocument={(documentId) => {
            void selectDocument(documentId).then(() => {
              window.dispatchEvent(new Event("anchored:show-preview"));
            });
          }}
          onRenameDocument={(documentId) => {
            void selectDocument(documentId).then(() => {
              window.dispatchEvent(new Event("anchored:begin-rename"));
            });
          }}
          onRenameFolder={(folderPath) => {
            folderDialogs.setRenamingFolderPath(folderPath);
            folderDialogs.setRenameFolderError(undefined);
            folderDialogs.setRenameFolderVisible(true);
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
            sidebar.setExpandedFolders(
              expanded ? new Set(folderPaths) : new Set(),
            )
          }
          onTrashDocument={(documentId) => {
            void selectDocument(documentId).then(() =>
              trash.trashDocument(documentId),
            );
          }}
        />
        <EditorSurface
          backlinks={backlinks}
          document={activeDocument}
          focusDocumentId={focusDocumentId}
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
          onRenameDocument={(name) => {
            if (activeDocument) void renameDocument(activeDocument.id, name);
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
            if (activeDocument) void trash.trashDocument(activeDocument.id);
          }}
          moving={movingDocumentId === activeDocument?.id}
          markdownSettings={markdownSettings}
          renaming={renamingDocumentId === activeDocument?.id}
          trashing={trash.trashingDocumentId === activeDocument?.id}
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
                      conflictResolution.openConflictResolution(
                        activeDocument.id,
                      )
                    }
                  >
                    Resolve conflict
                  </button>
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
      {conflictResolution.conflictResolutionDocumentId
        ? (() => {
            const conflictDocument = documents.find(
              (candidate) =>
                candidate.id ===
                conflictResolution.conflictResolutionDocumentId,
            );
            if (
              !conflictDocument?.conflictBaseSourceText ||
              !conflictDocument.conflictExternalSourceText ||
              conflictDocument.sourceText === undefined
            ) {
              return null;
            }
            const merge = mergeThreeWay(
              conflictDocument.conflictBaseSourceText,
              conflictDocument.sourceText,
              conflictDocument.conflictExternalSourceText,
            );
            return (
              <ConflictResolutionDialog
                base={conflictDocument.conflictBaseSourceText}
                external={conflictDocument.conflictExternalSourceText}
                local={conflictDocument.sourceText}
                merged={merge.status === "clean" ? merge.content : undefined}
                onApply={(content) =>
                  void resolveConflict(conflictDocument.id, content)
                }
                onCancel={() => conflictResolution.closeConflictResolution()}
                onKeepExternal={() => {
                  conflictResolution.closeConflictResolution();
                  void reloadExternalDocument(conflictDocument.id);
                }}
              />
            );
          })()
        : null}
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
          timestampMigrationBlocked={documents.some(
            (document) =>
              document.saveState === "saving" ||
              document.saveState === "conflict",
          )}
          timestampMigrationBusy={timestampMigration.timestampMigrationBusy}
          timestampMigrationError={timestampMigration.timestampMigrationError}
          timestampMigrationMessage={
            timestampMigration.timestampMigrationMessage
          }
          timestampMigrationPreview={
            timestampMigration.timestampMigrationPreview
          }
          updateError={updateError}
          updateNotes={availableUpdate?.body}
          updateStatus={updateStatus}
          updateVersion={availableUpdate?.version}
          vaultSelected={vaultSelected}
          onClose={() => {
            if (!reloadingApp) {
              setSettingsVisible(false);
            }
          }}
          onCheckForUpdates={() => void handleCheckForUpdates()}
          onInstallUpdate={() => void handleInstallUpdate()}
          onMarkdownSettingsChange={setMarkdownSettings}
          onApplyTimestampMigration={() =>
            void timestampMigration.applyTimestampMigration()
          }
          onPreviewTimestampMigration={() =>
            void timestampMigration.previewTimestampMigration()
          }
          onReload={() => void reloadApp()}
        />
      ) : null}
      {folderDialogs.createFolderVisible ? (
        <FolderDialog
          actionLabel="Create folder"
          creating={folderDialogs.creatingFolder}
          description={`Create a folder inside ${folderDisplayName(folderDialogs.createFolderParentPath ?? "")}.`}
          error={folderDialogs.createFolderError}
          nameLabel="Folder name"
          placeholder="New folder"
          title="Create folder"
          onClose={() => {
            if (!folderDialogs.creatingFolder) {
              folderDialogs.setCreateFolderError(undefined);
              folderDialogs.setCreateFolderParentPath(undefined);
              folderDialogs.setCreateFolderVisible(false);
            }
          }}
          onCreate={(name) => void folderDialogs.createNewFolder(name)}
        />
      ) : null}
      {folderDialogs.renameFolderVisible && folderDialogs.renamingFolderPath ? (
        <FolderDialog
          actionLabel="Rename folder"
          creating={folderDialogs.renameFolderPending}
          description={`Rename ${folderName(folderDialogs.renamingFolderPath)} inside ${folderDisplayName(
            folderDialogs.renamingFolderPath.split("/").slice(0, -1).join("/"),
          )}.`}
          error={folderDialogs.renameFolderError}
          initialName={folderName(folderDialogs.renamingFolderPath)}
          nameLabel="New folder name"
          placeholder="Renamed folder"
          title="Rename folder"
          onClose={() => {
            if (!folderDialogs.renameFolderPending) {
              folderDialogs.setRenameFolderError(undefined);
              folderDialogs.setRenamingFolderPath(undefined);
              folderDialogs.setRenameFolderVisible(false);
            }
          }}
          onCreate={(name) => void folderDialogs.renameExistingFolder(name)}
        />
      ) : null}
      {folderDialogs.deleteFolderVisible && folderDialogs.deletingFolderPath ? (
        <DeleteFolderDialog
          deleting={folderDialogs.deleteFolderPending}
          error={folderDialogs.deleteFolderError}
          fileCount={folderDialogs.deletingFolderContents.fileCount}
          folderCount={folderDialogs.deletingFolderContents.folderCount}
          folderName={folderName(folderDialogs.deletingFolderPath)}
          onClose={() => {
            if (!folderDialogs.deleteFolderPending) {
              folderDialogs.setDeleteFolderError(undefined);
              folderDialogs.setDeletingFolderPath(undefined);
              folderDialogs.setDeleteFolderVisible(false);
            }
          }}
          onDelete={(confirmation) =>
            void folderDialogs.deleteExistingFolder(confirmation)
          }
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
      {missingWikilink.missingWikilinkTarget ? (
        <CreateMissingWikilinkDialog
          creating={missingWikilink.creatingMissingWikilink}
          error={missingWikilink.missingWikilinkError}
          target={missingWikilink.missingWikilinkTarget}
          onClose={() => missingWikilink.closeMissingWikilinkDialog()}
          onCreate={() => void missingWikilink.createMissingWikilinkNote()}
        />
      ) : null}
      {trash.trashVisible ? (
        <TrashPanel
          entries={trash.trashEntries}
          error={trash.trashError}
          loading={trash.trashLoading}
          restoringId={trash.restoringTrashId}
          onClose={() => trash.setTrashVisible(false)}
          onRestore={(entry) => void trash.restoreTrashEntry(entry)}
        />
      ) : null}
      {quickOpenVisible ? (
        <QuickOpenPalette
          query={quickOpenQuery}
          results={quickOpenResults}
          showFileExtensions={markdownSettings.showFileExtensions}
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
          showFileExtensions={markdownSettings.showFileExtensions}
          onClose={() => setVaultSearchVisible(false)}
          onOpen={(relativePath) => void openVaultSearchResult(relativePath)}
          onQueryChange={setVaultSearchQuery}
        />
      ) : null}
      <StatusBar
        cursorPosition={cursorPosition}
        document={activeDocument}
        showFileExtensions={markdownSettings.showFileExtensions}
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
