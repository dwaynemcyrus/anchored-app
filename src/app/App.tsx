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
import { NavigationPane } from "./components/NavigationPane";
import { WorkspaceEditor } from "./components/WorkspaceEditor";
import {
  activateGroup,
  activeDocumentId as workspaceActiveDocumentId,
  openDocumentIds,
  activeLeaf,
  closeTab,
  createWorkspace,
  openDocument,
  remapDocumentId,
  splitGroup,
  stepHistory,
  type Workspace,
} from "./workspaceTree";
import { NoteListPane } from "./components/NoteListPane";
import { InspectorPane } from "./components/InspectorPane";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { PaneSplitter } from "./components/PaneSplitter";
import type { FileRailMode, WorkbenchSort } from "./fileRailPreferences";
import {
  defaultNoteListScope,
  documentsForScope,
  scopeLabel,
  type NoteListScope,
} from "./noteListScope";
import type { PaneKey } from "./paneLayout";
import { usePaneLayout, usePaneWidthVariables } from "./usePaneLayout";
import { usePaneSwipe } from "./usePaneSwipe";
import { useNotePreviews } from "./useNotePreviews";
import { FolderDialog } from "./components/FolderDialog";
import { LifecycleTypeDialog } from "./components/LifecycleTypeDialog";
import { MoveNoteDialog } from "./components/MoveNoteDialog";
import { NotificationCenter } from "./components/NotificationCenter";
import { QuickOpenPalette } from "./components/QuickOpenPalette";
import { SettingsModal } from "./components/SettingsModal";
import { StatusBar } from "./components/StatusBar";
import type { EditorCursorPosition } from "./components/MarkdownEditor";
import { TitleBar } from "./components/TitleBar";
import { RecoveryPanel } from "./components/RecoveryPanel";
import { TrashPanel } from "./components/TrashPanel";
import { VaultSwitcher } from "./components/VaultSwitcher";
import { readErrorMessage } from "./errors";
import { useConflictResolution } from "./useConflictResolution";
import { useFolderDialogs } from "./useFolderDialogs";
import { useMissingWikilinkDialog } from "./useMissingWikilinkDialog";
import { useNotifications } from "./useNotifications";
import { useRetrievalPalettes } from "./useRetrievalPalettes";
import { useSidebarState } from "./useSidebarState";
import { useTimestampMigration } from "./useTimestampMigration";
import { useRecoveryPanel } from "./useRecoveryPanel";
import { useTrashPanel } from "./useTrashPanel";
import { useVaultSwitcher } from "./useVaultSwitcher";
import { useDocumentAutosave } from "./useDocumentAutosave";
import { useDocumentLoadStates } from "./useDocumentLoadStates";
import { useWindowCloseGuard } from "./useWindowCloseGuard";
import { VaultSearchPalette } from "./components/VaultSearchPalette";
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
import { displayFileName, fileExtension } from "./fileTypes";
import {
  loadDocumentActivity,
  markDocumentActive,
  reconcileDocumentActivity,
  saveDocumentActivity,
} from "./recentDocuments";
import {
  loadMarkdownSettings,
  saveMarkdownSettings,
} from "./markdown/settings";
import {
  DEFAULT_MARKDOWN_SETTINGS,
  type MarkdownSettings,
} from "./markdown/types";
import { lintFrontmatter } from "./markdown/frontmatterLint";
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
  GENERAL_NOTIFICATION_SCOPE,
  notificationHistoryForScope,
} from "./notificationHistory";
import {
  archiveVaultFile,
  createVaultDatabaseBackup,
  createVaultConflictCopy,
  createUntitledVaultFile,
  createVaultFile,
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
  stopVault,
  watchVault,
  type VaultChange,
  type VaultChangeBatch,
  isBrowserDevelopmentFixture,
  restoreArchivedVaultFile,
  type VaultDocument,
  type VaultSnapshot,
  type VaultStorageStatus,
  vaultStorageStatus,
  verifyVaultDatabase,
} from "../lib/tauri/vault";
import { openScratchpad, type ScratchpadMode } from "../lib/tauri/scratchpad";
import { checkForUpdate, installUpdate } from "./updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { mergeThreeWay } from "./threeWayMerge";
import { saveConflictSnapshot } from "./conflictSnapshots";

const ACTIVITY_REFRESH_INTERVAL_MS = 60_000;
const FRONTMATTER_LINT_NOTIFICATION_DELAY_MS = 1_500;

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
  const [listScope, setListScope] =
    useState<NoteListScope>(defaultNoteListScope);
  const [listSort, setListSort] = useState<WorkbenchSort>("modified-desc");
  const [navigationMode, setNavigationMode] =
    useState<FileRailMode>("collections");
  const [draggingDocumentId, setDraggingDocumentId] = useState<string>();
  const paneLayout = usePaneLayout();
  const [workspace, setWorkspace] = useState<Workspace>(createWorkspace);
  const [focusDocumentId, setFocusDocumentId] = useState<string>();
  const [cursorPosition, setCursorPosition] = useState<EditorCursorPosition>({
    line: 1,
    column: 1,
  });
  const [query, setQuery] = useState("");
  const [vaultName, setVaultName] = useState("");
  const [vaultId, setVaultId] = useState("");
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [markdownSettings, setMarkdownSettings] = useState<MarkdownSettings>(
    initialMarkdownSettings,
  );
  const [reloadingApp, setReloadingApp] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateStatus, setUpdateStatus] = useState<
    "available" | "checking" | "error" | "idle" | "current" | "installing"
  >("idle");
  const [updateError, setUpdateError] = useState<string>();
  const [vaultSelected, setVaultSelected] = useState(false);
  const [storageStatus, setStorageStatus] = useState<VaultStorageStatus>();
  const [storageBusy, setStorageBusy] = useState<"backup" | "verify">();
  const [storageError, setStorageError] = useState<string>();
  const [storageMessage, setStorageMessage] = useState<string>();
  const [transitioningDocumentId, setTransitioningDocumentId] = useState<
    string | undefined
  >();
  const [lifecycleTypeRequest, setLifecycleTypeRequest] =
    useState<LifecycleTypeRequest>();
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
  const notePreviews = useNotePreviews(readVaultFile, vaultSelected);
  usePaneWidthVariables(paneLayout);
  usePaneSwipe(
    paneLayout.workspaceRef,
    paneLayout.stepLeftStage,
    vaultSelected,
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rescanInFlightRef = useRef(false);
  const saveInFlightRef = useRef(new Set<string>());
  const externalCheckInFlightRef = useRef(new Set<string>());
  const externalCheckPendingRef = useRef(new Set<string>());
  const conflictCopyInFlightRef = useRef(new Set<string>());
  const focusRefreshTimeoutRef = useRef<number | undefined>(undefined);
  const vaultTreeRefreshTimeoutRef = useRef<number | undefined>(undefined);
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
  const notifications = useNotifications({ vaultIdRef });
  const {
    clearDocumentLoad,
    completeDocumentLoad,
    documentLoadState,
    failDocumentLoad,
    isCurrentLoad,
    resetDocumentLoads,
    startDocumentLoad,
  } = useDocumentLoadStates();

  /// What the active tab of the active group is showing. Derived rather than
  /// stored: the workspace is the one place a document is open, so there is no
  /// second copy of that fact to fall out of step with it.
  const activeDocumentId = workspaceActiveDocumentId(workspace);
  const openTabDocumentIds = useMemo(
    () => openDocumentIds(workspace),
    [workspace],
  );

  documentsRef.current = documents;
  activeDocumentIdRef.current = activeDocumentId;
  focusDocumentIdRef.current = focusDocumentId;

  /// Opens a document, or closes the active tab when given nothing.
  ///
  /// The callers that clear this were written when the editor held a single
  /// document and clearing was the only way to empty it. Closing the tab is
  /// what that means now.
  const setActiveDocument = useCallback(
    (documentId: string, options: { newTab?: boolean } = {}) => {
      activeDocumentIdRef.current = documentId;
      setWorkspace((current) =>
        documentId
          ? openDocument(current, documentId, options)
          : closeTab(
              current,
              activeLeaf(current).id,
              activeLeaf(current).active,
            ),
      );
    },
    [],
  );

  const setFocusDocument = useCallback((documentId?: string) => {
    focusDocumentIdRef.current = documentId;
    setFocusDocumentId(documentId);
  }, []);

  const remapDocumentIdentity = useCallback(
    (fromDocumentId: string, toDocumentId: string) => {
      if (!fromDocumentId || fromDocumentId === toDocumentId) return;
      if (activeDocumentIdRef.current === fromDocumentId) {
        activeDocumentIdRef.current = toDocumentId;
      }
      setWorkspace((current) =>
        remapDocumentId(current, fromDocumentId, toDocumentId),
      );
      if (focusDocumentIdRef.current === fromDocumentId) {
        setFocusDocument(toDocumentId);
      }
      setDocumentActivity((current) => {
        const activity = current.get(fromDocumentId);
        if (!activity) return current;
        const existing = current.get(toDocumentId);
        const next = new Map(current);
        next.delete(fromDocumentId);
        next.set(toDocumentId, {
          firstSeenAt: Math.min(
            existing?.firstSeenAt ?? activity.firstSeenAt,
            activity.firstSeenAt,
          ),
          lastActiveAt: Math.max(
            existing?.lastActiveAt ?? 0,
            activity.lastActiveAt,
          ),
        });
        return next;
      });
      clearDocumentLoad(fromDocumentId);
    },
    [clearDocumentLoad, setFocusDocument],
  );

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
  // A search narrows the list pane rather than restructuring the tree, so the
  // scope still says where you are while the query says what you are after.
  const listedDocuments = useMemo(() => {
    const scoped = documentsForScope(documents, listScope);
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return scoped;
    return scoped.filter((document) =>
      [document.name, document.relativePath ?? "", ...document.aliases].some(
        (value) => value.toLocaleLowerCase().includes(needle),
      ),
    );
  }, [documents, listScope, query]);
  const listScopeLabel = useMemo(
    () => scopeLabel(listScope, vaultName),
    [listScope, vaultName],
  );
  const wikilinkCandidates = useMemo(
    () =>
      buildWikilinkCandidates(deferredDocuments, documentActivity, linkIndex),
    [deferredDocuments, documentActivity, linkIndex],
  );
  const notificationScopeId = vaultId || GENERAL_NOTIFICATION_SCOPE;
  const visibleNotificationHistory = useMemo(
    () =>
      notificationHistoryForScope(
        notifications.notificationHistory,
        notificationScopeId,
      ),
    [notifications.notificationHistory, notificationScopeId],
  );

  useEffect(() => {
    if (!markdownSettings.frontmatterValidation.enabled) return;
    if (!activeDocument?.sourceText) return;
    const document = activeDocument;

    const timeout = window.setTimeout(() => {
      const diagnostics = lintFrontmatter(document.sourceText ?? "");
      if (diagnostics.length === 0) return;
      const summary =
        diagnostics.length === 1
          ? diagnostics[0].message
          : `${diagnostics.length} frontmatter issues, including: ${diagnostics[0].message}`;
      notifications.addHistoryEntry(`${document.name}: ${summary}`, {
        kind: "frontmatter",
        sourceId: document.id,
      });
    }, FRONTMATTER_LINT_NOTIFICATION_DELAY_MS);

    return () => window.clearTimeout(timeout);
    // notifications.addHistoryEntry has a stable identity; see the comment
    // on activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocument, markdownSettings.frontmatterValidation.enabled]);

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
                  noteId: savedDocument.identity,
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
        remapDocumentIdentity(documentId, persistedDocumentId);
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
        notifications.resolveHistorySource(
          savedDocument.identity ?? persistedDocumentId,
        );
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
        notifications.addHistoryEntry(`${document.name} could not be saved.`, {
          kind: "error",
          sourceId: document.noteId ?? document.id,
        });
      }
    },
    // sidebar.setExpandedFolders is a raw useState setter (always stable);
    // depending on the whole `sidebar` object would recreate this callback
    // whenever expandedFolders changes, including as a result of
    // this callback's own calls to sidebar.setExpandedFolders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      notifications.addHistoryEntry,
      notifications.resolveHistorySource,
      remapDocumentIdentity,
      sidebar.setExpandedFolders,
      vaultName,
    ],
  );

  const createNote = useCallback(() => {
    if (!vaultSelected) {
      notifications.addVaultNotice("Open a vault before creating a note.");
      return;
    }
    const nextDocument = createUntitledDocument();
    const nextDocuments = [...documentsRef.current, nextDocument];

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
    setDocumentActivity((current) =>
      markDocumentActive(current, nextDocument.id, Date.now()),
    );
    void saveUntitledDocument(nextDocument.id);
    // sidebar.setExpandedFolders is a raw useState setter (always stable),
    // (always stable); depending on the whole `sidebar` object would
    // so listing it does not recreate this callback whenever the set changes,
    // including as a result of this callback's own calls below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    notifications.addVaultNotice,
    saveUntitledDocument,
    setActiveDocument,
    setFocusDocument,
    sidebar.setExpandedFolders,
    vaultSelected,
  ]);

  const saveDocumentAs = useCallback(
    async (documentId: string) => {
      const document = documentsRef.current.find(
        (candidate) => candidate.id === documentId,
      );
      if (!document || document.sourceText === undefined) return;
      if (document.status?.trim().toLocaleLowerCase() === "archived") {
        notifications.addVaultNotice(
          "Restore this archived note before saving a copy.",
        );
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
                  noteId: savedDocument.identity ?? current.noteId,
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
          notifications.addHistoryEntry(
            `${document.name} has unsaved changes because its file changed outside Anchored.`,
            {
              kind: "conflict",
              requiresAction: true,
              sourceId:
                savedDocument.identity ?? document.noteId ?? document.id,
            },
          );
        } else {
          notifications.resolveHistorySource(
            savedDocument.identity ?? document.noteId ?? document.id,
          );
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
        notifications.addHistoryEntry(`${document.name} could not be saved.`, {
          kind: "error",
          sourceId: document.noteId ?? document.id,
        });
      }
    },
    // sidebar.setExpandedFolders is a raw useState setter (always stable);
    // see the comment on saveUntitledDocument's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      notifications.addHistoryEntry,
      notifications.addVaultNotice,
      notifications.resolveHistorySource,
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
        notifications.addVaultNotice(
          `Anchored could not create a recovery copy: ${readErrorMessage(error)}`,
          { persistent: true },
        );
        return undefined;
      } finally {
        conflictCopyInFlightRef.current.delete(documentId);
      }
    },
    // notifications.addVaultNotice has a stable identity; see the comment
    // on activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifications.addVaultNotice],
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
                    noteId: external.identity ?? candidate.noteId,
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
          notifications.resolveHistorySource(
            external.identity ?? current.noteId ?? documentId,
          );
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
          notifications.addHistoryEntry(
            `${current.name} has unsaved changes because its file changed outside Anchored.`,
            {
              kind: "conflict",
              requiresAction: true,
              sourceId: current.noteId ?? current.id,
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
    // notifications.addHistoryEntry and notifications.resolveHistorySource
    // both have stable identities; see the comment on
    // activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      notifications.addHistoryEntry,
      createConflictCopyForDocument,
      notifications.resolveHistorySource,
    ],
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
        notifications.addVaultNotice(
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
        notifications.resolveHistorySource(document.noteId ?? document.id);
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
                  noteId: savedDocument.identity ?? current.noteId,
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
        notifications.resolveHistorySource(
          savedDocument.identity ?? document.noteId ?? document.id,
        );
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
        notifications.addHistoryEntry(
          nextSaveState === "conflict"
            ? `${document.name} has unsaved changes because its file changed outside Anchored.`
            : `${document.name} could not be saved.`,
          {
            kind: nextSaveState,
            requiresAction: nextSaveState === "conflict",
            sourceId: document.noteId ?? document.id,
          },
        );
      } finally {
        saveInFlightRef.current.delete(documentId);
        if (externalCheckPendingRef.current.delete(documentId)) {
          window.setTimeout(() => void checkExternalDocument(documentId), 50);
        }
      }
    },
    // notifications.addHistoryEntry, notifications.addVaultNotice, and
    // notifications.resolveHistorySource all have stable identities; see
    // the comment on activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      notifications.addHistoryEntry,
      notifications.addVaultNotice,
      checkExternalDocument,
      createConflictCopyForDocument,
      notifications.resolveHistorySource,
      saveDocumentAs,
    ],
  );

  const recordSnapshotEvents = useCallback(
    (snapshot: VaultSnapshot) => {
      if (snapshot.warnings.skippedSymlinks > 0) {
        notifications.addHistoryEntry(
          `${snapshot.warnings.skippedSymlinks} symlink entr${
            snapshot.warnings.skippedSymlinks === 1 ? "y was" : "ies were"
          } skipped for safety.`,
          { kind: "error" },
        );
      }
    },
    // notifications.addHistoryEntry has a stable identity; see the comment
    // on activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifications.addHistoryEntry],
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
      const identityRemaps = documentsRef.current.flatMap((document) => {
        if (!document.noteId) return [];
        const replacement = nextDocuments.find(
          (candidate) => candidate.noteId === document.noteId,
        );
        return replacement && replacement.id !== document.id
          ? [[document.id, replacement.id] as const]
          : [];
      });
      const nextActiveDocumentId = activeRelativePath
        ? (nextDocuments.find(
            (document) => document.relativePath === activeRelativePath,
          )?.id ?? "")
        : activeDocumentIdRef.current;
      const nextFolders = folderPathsFromVault(snapshot);
      documentsRef.current = nextDocuments;
      setDocuments(nextDocuments);
      for (const [fromDocumentId, toDocumentId] of identityRemaps) {
        remapDocumentIdentity(fromDocumentId, toDocumentId);
      }
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
      if (summary) notifications.addVaultNotice(summary);
    },
    // sidebar.setExpandedFolders is a raw useState setter (always stable);
    // see the comment on saveUntitledDocument's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      notifications.addVaultNotice,
      recordSnapshotEvents,
      remapDocumentIdentity,
      setActiveDocument,
      sidebar.setExpandedFolders,
    ],
  );

  const onActiveDocumentTrashed = useCallback(() => {
    setActiveDocument("");
    setFocusDocument(undefined);
  }, [setActiveDocument, setFocusDocument]);

  const recovery = useRecoveryPanel();
  // A save records a version, so Recovery must not keep showing what it read
  // when it opened. Driven by the save landing rather than a timer: nothing
  // else changes what this panel shows.
  const refreshRecovery = recovery.refreshRecovery;
  const recoveryVisible = recovery.recoveryVisible;
  useEffect(() => {
    if (!recoveryVisible || saveState !== "saved") return;
    refreshRecovery();
  }, [recoveryVisible, saveState, refreshRecovery]);

  const trash = useTrashPanel({
    addHistoryEntry: notifications.addHistoryEntry,
    addVaultNotice: notifications.addVaultNotice,
    adoptVaultSnapshot,
    documentsRef,
    onActiveDocumentTrashed,
  });

  const folderDialogs = useFolderDialogs({
    addTrashEntry: trash.addTrashEntry,
    addVaultNotice: notifications.addVaultNotice,
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

  const refreshStorageStatus = useCallback(async () => {
    if (!vaultSelected) {
      setStorageStatus(undefined);
      return;
    }
    try {
      setStorageStatus(await vaultStorageStatus());
      setStorageError(undefined);
    } catch (error) {
      setStorageError(readErrorMessage(error));
    }
  }, [vaultSelected]);

  useEffect(() => {
    if (!settingsVisible) return;
    void refreshStorageStatus();
  }, [refreshStorageStatus, settingsVisible, vaultId]);

  const handleVerifyDatabase = useCallback(async () => {
    setStorageBusy("verify");
    setStorageError(undefined);
    setStorageMessage(undefined);
    try {
      setStorageStatus(await verifyVaultDatabase());
      setStorageMessage("SQLite integrity check passed.");
    } catch (error) {
      setStorageError(readErrorMessage(error));
    } finally {
      setStorageBusy(undefined);
    }
  }, []);

  const handleCreateDatabaseBackup = useCallback(async () => {
    setStorageBusy("backup");
    setStorageError(undefined);
    setStorageMessage(undefined);
    try {
      const status = await createVaultDatabaseBackup();
      setStorageStatus(status);
      setStorageMessage("A SQLite recovery copy was created.");
    } catch (error) {
      setStorageError(readErrorMessage(error));
    } finally {
      setStorageBusy(undefined);
    }
  }, []);

  const activateVaultSnapshot = useCallback(
    (snapshot: VaultSnapshot) => {
      const nextDocuments = documentsFromVault(snapshot);
      const nextFolders = folderPathsFromVault(snapshot);

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
      // A different vault means different documents, so the whole workspace
      // goes rather than the active tab: every open tab named a note that is
      // no longer there, and any split was arranged around them.
      activeDocumentIdRef.current = "";
      setWorkspace(createWorkspace());
      setFocusDocument(undefined);
      setQuery("");
      resetDocumentLoads();
      notifications.reset();
      timestampMigration.reset();
      trash.reset();
      recordSnapshotEvents(snapshot);
      const summary = vaultSummaryMessage(snapshot);
      if (summary) notifications.addVaultNotice(summary);
    },
    // trash.reset, timestampMigration.reset, notifications.reset, and
    // notifications.addVaultNotice all have stable identities (useCallback
    // with no deps, or memoized, inside their hooks); the containing
    // objects are recreated every render, so depending on them directly
    // would defeat this memoization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      notifications.addVaultNotice,
      notifications.reset,
      recordSnapshotEvents,
      resetDocumentLoads,
      setActiveDocument,
      setFocusDocument,
      timestampMigration.reset,
      trash.reset,
    ],
  );

  const vaultSwitcher = useVaultSwitcher({
    activateVaultSnapshot,
    addVaultNotice: notifications.addVaultNotice,
    hasUnfinishedEdits,
    refreshTrashEntries: trash.refreshTrashEntries,
    vaultSelected,
  });

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
      notifications.addVaultNotice(readErrorMessage(error), {
        persistent: true,
      });
      notifications.addHistoryEntry("Vault refresh could not be completed.", {
        kind: "error",
      });
    } finally {
      rescanInFlightRef.current = false;
    }
    // notifications.addHistoryEntry and notifications.addVaultNotice both
    // have stable identities; see the comment on activateVaultSnapshot's
    // dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    notifications.addHistoryEntry,
    notifications.addVaultNotice,
    adoptVaultSnapshot,
    vaultSelected,
  ]);

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
        notifications.addVaultNotice(readErrorMessage(error), {
          persistent: true,
        });
        notifications.addHistoryEntry("Vault refresh could not be completed.", {
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
    // notifications.addHistoryEntry and notifications.addVaultNotice both
    // have stable identities; see the comment on activateVaultSnapshot's
    // dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      notifications.addHistoryEntry,
      notifications.addVaultNotice,
      refreshVault,
      vaultSelected,
    ],
  );

  useEffect(() => {
    try {
      saveDocumentActivity(window.localStorage, documentActivity);
    } catch {
      // Activity ranking is optional and must never block the editor shell.
    }
  }, [documentActivity]);

  useEffect(() => {
    void vaultSwitcher.refreshRememberedVaults();
    // vaultSwitcher.refreshRememberedVaults has a stable identity; see the
    // comment on activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultSwitcher.refreshRememberedVaults]);

  useEffect(() => {
    if (
      sessionRestoreStatusRef.current !== "pending" ||
      vaultSwitcher.rememberedVaultsLoading
    ) {
      return;
    }
    sessionRestoreStatusRef.current = "restoring";

    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      pendingSessionRelativePathRef.current = undefined;
      vaultSwitcher.setOpeningRememberedVaultId("__development_fixture__");
      void openDevelopmentVault()
        .then(async (snapshot) => {
          activateVaultSnapshot(snapshot);
          await Promise.all([
            vaultSwitcher.refreshRememberedVaults(),
            trash.refreshTrashEntries(),
          ]);
        })
        .catch((error) => {
          notifications.addVaultNotice(readErrorMessage(error), {
            persistent: true,
          });
        })
        .finally(() => {
          sessionRestoreStatusRef.current = "done";
          vaultSwitcher.setOpeningRememberedVaultId(undefined);
        });
      return;
    }

    const session = loadSessionState(window.localStorage);
    if (!session?.vaultId) {
      sessionRestoreStatusRef.current = "done";
      return;
    }

    pendingSessionRelativePathRef.current = session.activeRelativePath;
    vaultSwitcher.setOpeningRememberedVaultId(session.vaultId);
    vaultSwitcher.setRememberedVaultsError(undefined);

    void openRememberedVault(session.vaultId)
      .then(async (snapshot) => {
        activateVaultSnapshot(snapshot);
        await Promise.all([
          vaultSwitcher.refreshRememberedVaults(),
          trash.refreshTrashEntries(),
        ]);
      })
      .catch(() => {
        pendingSessionRelativePathRef.current = undefined;
        clearSessionState(window.localStorage);
      })
      .finally(() => {
        sessionRestoreStatusRef.current = "done";
        vaultSwitcher.setOpeningRememberedVaultId(undefined);
      });
    // trash.refreshTrashEntries and vaultSwitcher's members have stable
    // identities; see the comment on activateVaultSnapshot's dependency
    // array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    notifications.addVaultNotice,
    activateVaultSnapshot,
    vaultSwitcher.refreshRememberedVaults,
    vaultSwitcher.rememberedVaultsLoading,
    vaultSwitcher.setOpeningRememberedVaultId,
    vaultSwitcher.setRememberedVaultsError,
    trash.refreshTrashEntries,
  ]);

  const openScratchpadWindow = useCallback(
    (mode: ScratchpadMode) => {
      if (!vaultSelected) {
        notifications.addVaultNotice("Open a vault before using Scratchpad.");
        return;
      }
      void openScratchpad(mode).catch((error: unknown) => {
        notifications.addVaultNotice(readErrorMessage(error), {
          persistent: true,
        });
      });
    },
    // notifications.addVaultNotice has a stable identity; see the comment
    // on activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifications.addVaultNotice, vaultSelected],
  );

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

  useDocumentAutosave(documents, saveDocument);

  useWindowCloseGuard({
    documents,
    onBlocked: (message) =>
      notifications.addVaultNotice(message, {
        persistent: true,
      }),
    saveDocument,
  });

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
        remapDocumentIdentity(current.id, nextDocumentId);
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
          notifications.addVaultNotice(
            `${result.relativePath.split("/").pop() ?? result.relativePath} moved. ${
              result.updatedLinks
            } link${result.updatedLinks === 1 ? "" : "s"} updated across ${
              result.updatedFiles ?? 0
            } note${result.updatedFiles === 1 ? "" : "s"}.`,
          );
        }
      } catch (error) {
        notifications.addVaultNotice(
          `Anchored could not reconcile the moved note safely: ${readErrorMessage(error)}`,
          { persistent: true },
        );
        if (current?.sourceText !== undefined) {
          await checkExternalDocument(nextDocumentId);
        }
      }
    },
    // notifications.addVaultNotice has a stable identity; see the comment
    // on activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      notifications.addVaultNotice,
      checkExternalDocument,
      markdownSettings.updateTypeOnExternalMove,
      remapDocumentIdentity,
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
      if (!disposed) notifications.addVaultNotice(readErrorMessage(error));
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
    // notifications.addVaultNotice has a stable identity; see the comment
    // on activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    notifications.addVaultNotice,
    checkExternalDocument,
    reconcileExternalMove,
    refreshVault,
    refreshVaultForPaths,
    vaultName,
    vaultSelected,
    vaultId,
  ]);
  const loadDocument = useCallback(
    async (documentId: string, retry = false) => {
      const document = documentsRef.current.find(
        (candidate) => candidate.id === documentId,
      );
      if (!document) return;

      if (
        document.isMarkdown === false ||
        !document.relativePath ||
        document.sourceText !== undefined
      ) {
        clearDocumentLoad(documentId);
        return;
      }

      const relativePath = document.relativePath;
      const ticket = startDocumentLoad(documentId, retry);
      if (!ticket) return;

      try {
        const openedDocument = await readVaultFile(relativePath);
        if (!isCurrentLoad(ticket)) return;
        if (openedDocument.relativePath !== relativePath) {
          throw new Error("The opened file did not match the requested note.");
        }
        const currentDocument = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        if (
          !currentDocument ||
          currentDocument.relativePath !== relativePath ||
          currentDocument.sourceText !== undefined
        ) {
          completeDocumentLoad(ticket);
          return;
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
        completeDocumentLoad(ticket);
      } catch (error) {
        failDocumentLoad(ticket, readErrorMessage(error));
      }
    },
    [
      clearDocumentLoad,
      completeDocumentLoad,
      failDocumentLoad,
      isCurrentLoad,
      startDocumentLoad,
    ],
  );

  useEffect(() => {
    for (const documentId of openTabDocumentIds) {
      void loadDocument(documentId);
    }
  }, [loadDocument, openTabDocumentIds]);

  const selectDocument = useCallback(
    async (documentId: string, options: { newTab?: boolean } = {}) => {
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
      setActiveDocument(documentId, options);
      setCursorPosition({ line: 1, column: 1 });

      await loadDocument(documentId);
    },
    [loadDocument, setActiveDocument, setFocusDocument],
  );

  const missingWikilink = useMissingWikilinkDialog({
    adoptVaultSnapshot,
    selectDocument,
    setFocusDocument,
  });

  const retrieval = useRetrievalPalettes({
    activeDocumentId,
    addHistoryEntry: notifications.addHistoryEntry,
    addVaultNotice: notifications.addVaultNotice,
    adoptVaultSnapshot,
    deferredDocuments,
    documentsRef,
    selectDocument,
    vaultSelected,
    wikilinkCandidates,
  });

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const commandKey = event.metaKey || event.ctrlKey;

      // Command-1/2/3 reach the panes directly, which is what a keyboard user
      // has instead of the swipe. Unlike the title-bar button, each of these
      // toggles one named pane rather than walking the ladder.
      if (commandKey && !event.altKey && !event.shiftKey) {
        const pane = { "1": "navigation", "2": "list", "3": "inspector" }[
          event.key
        ] as PaneKey | undefined;
        if (pane) {
          event.preventDefault();
          paneLayout.togglePane(pane);
          return;
        }
      }

      // The workspace shortcuts, following Obsidian so the muscle memory
      // carries over. All of them act on the group that is currently active.
      if (commandKey && !event.altKey) {
        if (event.key.toLowerCase() === "t" && !event.shiftKey) {
          event.preventDefault();
          createNote();
          return;
        }
        if (event.key.toLowerCase() === "w" && !event.shiftKey) {
          event.preventDefault();
          closeDocument();
          return;
        }
        if (event.key === "\\") {
          event.preventDefault();
          setWorkspace((current) =>
            splitGroup(
              current,
              current.activeGroupId,
              event.shiftKey ? "column" : "row",
            ),
          );
          return;
        }
      }

      // Back and forward walk the active tab's own history.
      if (commandKey && event.altKey) {
        const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
        if (step) {
          event.preventDefault();
          setWorkspace((current) =>
            stepHistory(current, current.activeGroupId, step),
          );
          return;
        }
      }

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
        retrieval.openQuickOpen();
      }

      if (commandKey && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        retrieval.openVaultSearch();
      }

      if (
        commandKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "f" &&
        !event.defaultPrevented
      ) {
        event.preventDefault();
        retrieval.triggerFind();
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
    // retrieval's methods have stable identities; see the comment on
    // activateVaultSnapshot's dependency array above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeDocumentId,
    createNote,
    openScratchpadWindow,
    retrieval.openQuickOpen,
    retrieval.openVaultSearch,
    retrieval.triggerFind,
    saveDocument,
    saveDocumentAs,
  ]);

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
                noteId: external.identity ?? current.noteId,
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
      notifications.resolveHistorySource(
        external.identity ?? document.noteId ?? documentId,
      );
    } catch (error) {
      notifications.addVaultNotice(readErrorMessage(error), {
        persistent: true,
      });
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
                noteId: saved.identity ?? candidate.noteId,
                saveMessage: undefined,
                saveState: "saved",
                savedSourceText: saved.content,
                sourceText: saved.content,
              }
            : candidate,
        ),
      );
      conflictResolution.closeConflictResolution();
      notifications.resolveHistorySource(
        saved.identity ?? document.noteId ?? documentId,
      );
      await refreshVault();
    } catch (error) {
      notifications.addVaultNotice(
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
      notifications.addVaultNotice(readErrorMessage(error), {
        persistent: true,
      });
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
  async function finishRelocatedDocument(
    outcome: {
      relativePath: string;
      updatedFiles: number;
      updatedLinks: number;
    },
    message: string,
    previousDocumentId?: string,
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
    if (previousDocumentId) {
      remapDocumentIdentity(previousDocumentId, relocatedDocumentId);
    } else {
      setActiveDocument(relocatedDocumentId);
      setFocusDocument(undefined);
    }
    notifications.addVaultNotice(message, { history: { kind: "rename" } });
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
      notifications.addVaultNotice(
        "Save all open note changes before renaming a note.",
      );
      return;
    }
    if (!name.trim()) {
      notifications.addVaultNotice(
        "Enter a filename before renaming this note.",
      );
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
          notifications.addVaultNotice(
            "Save the note successfully before renaming it.",
            {
              persistent: true,
            },
          );
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
      await finishRelocatedDocument(outcome, message, document.id);
    } catch (error) {
      notifications.addVaultNotice(
        renameCompleted
          ? `The note was renamed, but Anchored could not refresh it: ${readErrorMessage(error)}`
          : readErrorMessage(error),
        { persistent: true },
      );
      notifications.addHistoryEntry(
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
      notifications.addVaultNotice(
        "Save all open note changes before moving a note.",
      );
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
      await finishRelocatedDocument(outcome, message, document.id);
      setMoveDocumentVisible(false);
      setMoveDocumentId(undefined);
    } catch (error) {
      notifications.addVaultNotice(
        moveCompleted
          ? `The note was moved, but Anchored could not refresh it: ${readErrorMessage(error)}`
          : readErrorMessage(error),
        { persistent: true },
      );
      notifications.addHistoryEntry(
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
        documentId,
      );
      return;
    }
    applyLifecycleDocument(documentId, result);
    notifications.addVaultNotice(message, { history: { kind: "vault" } });
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
      notifications.addVaultNotice("Save this note before archiving it.");
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
      notifications.addVaultNotice(readErrorMessage(error), {
        persistent: true,
      });
      notifications.addHistoryEntry(
        `${document.name} could not be archived safely.`,
        {
          kind: "error",
        },
      );
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
      notifications.addVaultNotice(readErrorMessage(error), {
        persistent: true,
      });
      notifications.addHistoryEntry(
        `${document.name} could not be restored safely.`,
        {
          kind: "error",
        },
      );
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
      notifications.addVaultNotice(readErrorMessage(error), {
        persistent: true,
      });
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
        notifications.addVaultNotice(
          `[[${target}]] is ambiguous${
            names.length > 0 ? `: ${names.join(", ")}.` : "."
          }`,
        );
        notifications.addHistoryEntry(
          "A wikilink was ambiguous and was not opened.",
          {
            kind: "link",
          },
        );
        return;
      }
      if (wikilinkCreationName(target)) {
        missingWikilink.openMissingWikilinkDialog(target);
        return;
      }
      notifications.addVaultNotice(
        `[[${target}]] does not match a note or alias.`,
      );
      notifications.addHistoryEntry(
        "A wikilink did not match a note or alias.",
        {
          kind: "link",
        },
      );
    },
    // missingWikilink.openMissingWikilinkDialog is a useCallback with an
    // empty deps array (always stable); depending on the whole
    // `missingWikilink` object would recreate this callback whenever its
    // dialog state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeDocumentId,
      notifications.addHistoryEntry,
      notifications.addVaultNotice,
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
    setActiveDocument("");
    setFocusDocument(undefined);
    setCursorPosition({ line: 1, column: 1 });
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
      notifications.addVaultNotice(
        "Wait for the current save to finish before reloading.",
      );
      return;
    }

    const blockedDocuments = documentsRef.current.filter(
      (document) =>
        document.saveState === "conflict" ||
        document.saveState === "error" ||
        (!document.relativePath && document.sourceText !== undefined),
    );
    if (blockedDocuments.length > 0) {
      notifications.addVaultNotice(
        "Resolve note save problems before reloading Anchored.",
        {
          persistent: true,
        },
      );
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
        notifications.addVaultNotice(
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
    } catch (error) {
      notifications.addVaultNotice(readErrorMessage(error), {
        persistent: true,
      });
    }
  }

  async function moveExistingFolder(destinationFolder: string) {
    if (!moveFolderPath) return;
    setMoveFolderPending(true);
    try {
      const snapshot = await moveVaultFolder(moveFolderPath, destinationFolder);
      adoptVaultSnapshot(snapshot);
      setMoveFolderPath(undefined);
      notifications.addVaultNotice(`${folderName(moveFolderPath)} moved.`, {
        history: { kind: "vault" },
      });
    } catch (error) {
      notifications.addVaultNotice(readErrorMessage(error), {
        persistent: true,
      });
    } finally {
      setMoveFolderPending(false);
    }
  }

  return (
    <div className="app-shell">
      <TitleBar
        inspectorOpen={!paneLayout.collapsed.inspector}
        leftStage={paneLayout.leftStage}
        notificationCount={visibleNotificationHistory.length}
        saveState={activeDocument ? saveState : undefined}
        selectingVault={vaultSwitcher.selectingVault}
        vaultSelected={vaultSelected}
        vaultName={vaultName}
        onCreateNote={createNote}
        onOpenNotifications={() =>
          notifications.setNotificationHistoryVisible(true)
        }
        onOpenScratchpad={() => openScratchpadWindow("new")}
        onOpenSearch={retrieval.openVaultSearch}
        onOpenSettings={() => setSettingsVisible(true)}
        onSelectVault={vaultSwitcher.openSwitcher}
        onCycleLeftPanes={paneLayout.cycleLeftPanes}
        onToggleInspector={() => paneLayout.togglePane("inspector")}
      />
      {!vaultSelected ? (
        <WelcomeScreen
          onCreateVault={() => {
            vaultSwitcher.setCreateVaultError(undefined);
            vaultSwitcher.setCreateVaultVisible(true);
          }}
          // Goes through the switcher, not straight to the native picker, so
          // remembered vaults stay reachable with none open.
          onOpenVault={vaultSwitcher.openSwitcher}
        />
      ) : (
        <div className="workspace" ref={paneLayout.workspaceRef}>
          <NavigationPane
            documents={documents}
            draggingDocumentId={draggingDocumentId}
            expandedFolders={sidebar.expandedFolders}
            folders={folderPaths}
            mode={navigationMode}
            query={query}
            scope={listScope}
            searchInputRef={searchInputRef}
            trashCount={trash.trashEntries.length}
            vaultName={vaultName}
            onCreateFolder={(parentPath) => {
              folderDialogs.setCreateFolderParentPath(parentPath);
              folderDialogs.setCreateFolderError(undefined);
              folderDialogs.setCreateFolderVisible(true);
            }}
            onCreateNote={createNote}
            onCreateNoteInFolder={(folderPath) =>
              void createNoteInFolder(folderPath)
            }
            onDropDocument={(documentId, folderPath) => {
              setDraggingDocumentId(undefined);
              void moveDocumentToFolder(documentId, folderPath);
            }}
            onDeleteFolder={(folderPath) => {
              folderDialogs.setDeletingFolderPath(folderPath);
              folderDialogs.setDeleteFolderError(undefined);
              folderDialogs.setDeleteFolderVisible(true);
            }}
            onModeChange={setNavigationMode}
            onMoveFolderRequest={setMoveFolderPath}
            onOpenTrash={trash.openTrashPanel}
            onQueryChange={setQuery}
            onRenameFolder={(folderPath) => {
              folderDialogs.setRenamingFolderPath(folderPath);
              folderDialogs.setRenameFolderError(undefined);
              folderDialogs.setRenameFolderVisible(true);
            }}
            onScopeChange={setListScope}
            onSearchInFolder={(folderPath) => {
              setQuery(`${folderPath}/`);
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
            onToggleFolder={toggleFolder}
          />
          <PaneSplitter
            label="Resize navigation pane"
            pane="navigation"
            width={paneLayout.widths.navigation}
            onCollapse={() => paneLayout.togglePane("navigation")}
            onReset={() => paneLayout.resetPane("navigation")}
            onResize={(width) => paneLayout.resizePane("navigation", width)}
          />

          <NoteListPane
            activeDocumentId={activeDocument?.id ?? ""}
            documents={listedDocuments}
            excerptLines={paneLayout.excerptLines}
            openDocumentIds={openTabDocumentIds}
            previews={notePreviews}
            scopeLabel={listScopeLabel}
            showFileExtensions={markdownSettings.showFileExtensions}
            sort={listSort}
            onArchiveDocument={requestArchiveDocument}
            onDragDocument={setDraggingDocumentId}
            onDragEnd={() => setDraggingDocumentId(undefined)}
            onMoveDocumentRequest={(documentId) => {
              setMoveDocumentId(documentId);
              setMoveDocumentVisible(true);
            }}
            onMoveDocumentToWorkbench={(documentId) =>
              setLifecycleTypeRequest({ action: "workbench", documentId })
            }
            onOpen={selectDocument}
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
            onRestoreDocument={(documentId, destinationStatus) =>
              requestRestoreArchivedDocument(documentId, destinationStatus)
            }
            onSearchDocument={(documentId) => {
              void selectDocument(documentId).then(() =>
                retrieval.triggerFind(),
              );
            }}
            onSelectDocument={(documentId, options) =>
              void selectDocument(documentId, options)
            }
            onSortChange={setListSort}
            onTrashDocument={(documentId) => {
              void selectDocument(documentId).then(() =>
                trash.trashDocument(documentId),
              );
            }}
          />
          <PaneSplitter
            label="Resize note list pane"
            pane="list"
            width={paneLayout.widths.list}
            onCollapse={() => paneLayout.togglePane("list")}
            onReset={() => paneLayout.resetPane("list")}
            onResize={(width) => paneLayout.resizePane("list", width)}
          />

          <WorkspaceEditor
            titleFor={(documentId) =>
              displayFileName(
                documents.find((document) => document.id === documentId)
                  ?.name ?? "Untitled",
                markdownSettings.showFileExtensions,
              )
            }
            workspace={workspace}
            onNewTab={(groupId) => {
              setWorkspace((current) => activateGroup(current, groupId));
              createNote();
            }}
            onWorkspaceChange={setWorkspace}
            renderEditor={({ documentId }) => {
              const slotDocument = documents.find(
                (document) => document.id === documentId,
              );
              return (
                <EditorSurface
                  document={slotDocument}
                  focusDocumentId={focusDocumentId}
                  hasDocuments={documents.some(
                    (document) => document.isMarkdown !== false,
                  )}
                  findRequest={retrieval.findRequest}
                  loadState={documentLoadState(slotDocument?.id)}
                  vaultName={vaultName}
                  vaultSelected={vaultSelected}
                  wikilinkCandidates={wikilinkCandidates}
                  lifecycleChanging={
                    transitioningDocumentId === slotDocument?.id
                  }
                  onArchiveDocument={() => {
                    if (slotDocument) requestArchiveDocument(slotDocument.id);
                  }}
                  onCreateVault={() => {
                    vaultSwitcher.setCreateVaultError(undefined);
                    vaultSwitcher.setCreateVaultVisible(true);
                  }}
                  onDocumentChange={updateDocumentContent}
                  onCursorPosition={setCursorPosition}
                  onOpenLinkedDocument={(documentId) =>
                    void selectDocument(documentId)
                  }
                  onOpenMoveDocument={() => {
                    if (
                      slotDocument?.relativePath &&
                      slotDocument.isMarkdown !== false
                    ) {
                      setMoveDocumentId(slotDocument.id);
                      setMoveDocumentVisible(true);
                    }
                  }}
                  onOpenVault={() => void vaultSwitcher.openVault()}
                  onOpenWikilink={openWikilink}
                  onRetryDocument={() => {
                    if (slotDocument) void loadDocument(slotDocument.id, true);
                  }}
                  onRenameDocument={(name) => {
                    if (slotDocument)
                      void renameDocument(slotDocument.id, name);
                  }}
                  onRestoreDocument={(destinationStatus) => {
                    if (slotDocument) {
                      requestRestoreArchivedDocument(
                        slotDocument.id,
                        destinationStatus,
                      );
                    }
                  }}
                  onSaveDocument={() => {
                    if (slotDocument) void saveDocument(slotDocument.id);
                  }}
                  onSaveDocumentAs={() => {
                    if (slotDocument) void saveDocumentAs(slotDocument.id);
                  }}
                  onTrashDocument={() => {
                    if (slotDocument) void trash.trashDocument(slotDocument.id);
                  }}
                  moving={movingDocumentId === slotDocument?.id}
                  markdownSettings={markdownSettings}
                  renaming={renamingDocumentId === slotDocument?.id}
                  trashing={trash.trashingDocumentId === slotDocument?.id}
                />
              );
            }}
          />
          {/* The inspector's handle sits on the editor's right edge, so dragging
            it left widens the inspector — hence `inverted`. */}
          <PaneSplitter
            inverted
            label="Resize inspector pane"
            pane="inspector"
            width={paneLayout.widths.inspector}
            onCollapse={() => paneLayout.togglePane("inspector")}
            onReset={() => paneLayout.resetPane("inspector")}
            onResize={(width) => paneLayout.resizePane("inspector", width)}
          />

          <InspectorPane
            backlinks={backlinks}
            hasDocument={Boolean(activeDocument)}
            showFileExtensions={markdownSettings.showFileExtensions}
            onOpen={(documentId) => void selectDocument(documentId)}
          />
        </div>
      )}
      {notifications.vaultNotices.length > 0 || activeDocument?.saveMessage ? (
        <div aria-label="Notifications" className="vault-notifications">
          {notifications.vaultNotices.map((notice) => (
            <div className="vault-message" key={notice.id} role="status">
              <div className="vault-message__row">
                <span>{notice.text}</span>
                <button
                  aria-label={`Dismiss notification: ${notice.text}`}
                  className="vault-message__dismiss"
                  type="button"
                  onClick={() => notifications.dismissVaultNotice(notice.id)}
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
      {notifications.notificationHistoryVisible ? (
        <NotificationCenter
          entries={visibleNotificationHistory}
          onClearResolved={notifications.clearResolvedHistory}
          onClose={() => notifications.setNotificationHistoryVisible(false)}
          onDelete={notifications.deleteHistoryEntry}
          onResolve={notifications.resolveHistoryEntry}
        />
      ) : null}
      {settingsVisible ? (
        <SettingsModal
          excerptLines={paneLayout.excerptLines}
          markdownSettings={markdownSettings}
          reloading={reloadingApp}
          storageBusy={storageBusy}
          storageError={storageError}
          storageMessage={storageMessage}
          storageStatus={storageStatus}
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
          onExcerptLinesChange={paneLayout.setExcerptLines}
          onMarkdownSettingsChange={setMarkdownSettings}
          onApplyTimestampMigration={() =>
            void timestampMigration.applyTimestampMigration()
          }
          onPreviewTimestampMigration={() =>
            void timestampMigration.previewTimestampMigration()
          }
          onReload={() => void reloadApp()}
          onCreateDatabaseBackup={() => void handleCreateDatabaseBackup()}
          onVerifyDatabase={() => void handleVerifyDatabase()}
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
      {vaultSwitcher.vaultSwitcherVisible ? (
        <VaultSwitcher
          currentVaultId={vaultId}
          error={vaultSwitcher.rememberedVaultsError}
          loading={vaultSwitcher.rememberedVaultsLoading}
          openingVaultId={vaultSwitcher.openingRememberedVaultId}
          vaults={vaultSwitcher.rememberedVaults}
          onClose={() => vaultSwitcher.setVaultSwitcherVisible(false)}
          onCreateVault={() => {
            vaultSwitcher.setCreateVaultError(undefined);
            vaultSwitcher.setVaultSwitcherVisible(false);
            vaultSwitcher.setCreateVaultVisible(true);
          }}
          onForget={(rememberedVaultId) =>
            void vaultSwitcher.forgetKnownVault(rememberedVaultId)
          }
          onOpenAnother={() => void vaultSwitcher.openVault()}
          onOpenRemembered={(rememberedVaultId) =>
            void vaultSwitcher.openKnownVault(rememberedVaultId)
          }
        />
      ) : null}
      {vaultSwitcher.createVaultVisible ? (
        <CreateVaultDialog
          creating={vaultSwitcher.creatingVault}
          error={vaultSwitcher.createVaultError}
          onClose={() => {
            if (!vaultSwitcher.creatingVault) {
              vaultSwitcher.setCreateVaultError(undefined);
              vaultSwitcher.setCreateVaultVisible(false);
            }
          }}
          onCreate={(name) => void vaultSwitcher.createNewVault(name)}
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
      {recovery.recoveryVisible ? (
        <RecoveryPanel
          conflicts={recovery.conflicts}
          error={recovery.recoveryError}
          loading={recovery.recoveryLoading}
          versions={recovery.versions}
          versionsFor={recovery.versionsFor}
          onClose={() => recovery.setRecoveryVisible(false)}
        />
      ) : null}
      {retrieval.quickOpenVisible ? (
        <QuickOpenPalette
          query={retrieval.quickOpenQuery}
          results={retrieval.quickOpenResults}
          showFileExtensions={markdownSettings.showFileExtensions}
          onClose={() => retrieval.setQuickOpenVisible(false)}
          onOpen={(documentId) => {
            retrieval.setQuickOpenVisible(false);
            void selectDocument(documentId);
          }}
          onQueryChange={retrieval.setQuickOpenQuery}
        />
      ) : null}
      {retrieval.vaultSearchVisible ? (
        <VaultSearchPalette
          query={retrieval.vaultSearchQuery}
          searchState={retrieval.vaultSearchState}
          vaultSelected={vaultSelected}
          showFileExtensions={markdownSettings.showFileExtensions}
          onClose={() => retrieval.setVaultSearchVisible(false)}
          onOpen={(relativePath) =>
            void retrieval.openVaultSearchResult(relativePath)
          }
          onQueryChange={retrieval.setVaultSearchQuery}
        />
      ) : null}
      {vaultSelected ? (
        <StatusBar
          cursorPosition={cursorPosition}
          document={activeDocument}
          showFileExtensions={markdownSettings.showFileExtensions}
          vaultFileCount={
            documents.filter(
              (document) =>
                document.relativePath && document.isMarkdown !== false,
            ).length
          }
          vaultName={vaultName}
        />
      ) : null}
    </div>
  );
}
