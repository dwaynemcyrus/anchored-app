import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { EditorSurface } from "./components/EditorSurface";
import { CreateVaultDialog } from "./components/CreateVaultDialog";
import { FileRail } from "./components/FileRail";
import { IdentityMigrationPanel } from "./components/IdentityMigrationPanel";
import { NotificationCenter } from "./components/NotificationCenter";
import { QuickOpenPalette } from "./components/QuickOpenPalette";
import { SettingsModal } from "./components/SettingsModal";
import { StatusBar } from "./components/StatusBar";
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
  mergeDocumentsFromVault,
  type AnchoredDocument,
  type DocumentSaveState,
} from "./documents";
import { backlinksForDocument, resolveWikilink } from "./links";
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
  applyIdentityMigration,
  createVault,
  createUntitledVaultFile,
  createVaultFile,
  forgetVault,
  listRememberedVaults,
  listVaultTrash,
  moveVaultFileToTrash,
  openRememberedVault,
  previewIdentityMigration,
  readVaultFile,
  renameVaultFile,
  rescanVault,
  saveVaultFile,
  searchVault,
  selectVault,
  restoreVaultFileFromTrash,
  type RememberedVault,
  type TrashEntry,
  type VaultSnapshot,
  type IdentityMigrationPreview,
} from "../lib/tauri/vault";

const ACTIVITY_REFRESH_INTERVAL_MS = 60_000;
const MINOR_NOTICE_DURATION_MS = 12_000;

type DocumentLoadState =
  | { status: "idle" }
  | { status: "loading"; documentId: string }
  | { status: "error"; documentId: string; message: string };

type VaultNotice = {
  id: number;
  identityAction: boolean;
  persistent: boolean;
  text: string;
};

type VaultNoticeOptions = {
  history?: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">;
  identityAction?: boolean;
  persistent?: boolean;
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
  if (snapshot.warnings.addedIdentities > 0) {
    const count = snapshot.warnings.addedIdentities;
    notices.push(
      `${count} new note identit${count === 1 ? "y was" : "ies were"} added.`,
    );
  }
  if (snapshot.warnings.needsIdentity > 0) {
    const count = snapshot.warnings.needsIdentity;
    notices.push(
      `${count} existing note${count === 1 ? " needs" : "s need"} identities.`,
    );
  }
  if (snapshot.warnings.identityConflicts > 0) {
    notices.push(
      `${snapshot.warnings.identityConflicts} identity conflicts need attention.`,
    );
  }
  if (snapshot.warnings.skippedSymlinks > 0) {
    notices.push(
      `${snapshot.warnings.skippedSymlinks} symlink entries were skipped for safety.`,
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

export function App() {
  const [documents, setDocuments] = useState<AnchoredDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState("");
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
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [selectingVault, setSelectingVault] = useState(false);
  const [creatingVault, setCreatingVault] = useState(false);
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
  const [notesNeedingIdentity, setNotesNeedingIdentity] = useState(0);
  const [migrationPreview, setMigrationPreview] =
    useState<IdentityMigrationPreview | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<
    "idle" | "previewing" | "ready" | "applying"
  >("idle");
  const [migrationError, setMigrationError] = useState<string | undefined>();
  const [documentLoad, setDocumentLoad] = useState<DocumentLoadState>({
    status: "idle",
  });
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
  const saveState: DocumentSaveState = activeDocument?.saveState ?? "saved";
  const deferredDocuments = useDeferredValue(documents);
  const backlinks = useMemo(
    () =>
      activeDocumentId
        ? backlinksForDocument(deferredDocuments, activeDocumentId)
        : [],
    [activeDocumentId, deferredDocuments],
  );
  const wikilinkCandidates = useMemo(
    () => buildWikilinkCandidates(deferredDocuments, documentActivity),
    [deferredDocuments, documentActivity],
  );
  const quickOpenResults = useMemo(
    () =>
      rankQuickOpenResults(
        wikilinkCandidates,
        deferredDocuments,
        quickOpenQuery,
        activeDocumentId,
      ),
    [activeDocumentId, deferredDocuments, quickOpenQuery, wikilinkCandidates],
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
        identityAction: options.identityAction ?? false,
        persistent: options.persistent ?? options.identityAction ?? false,
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

      const contentAtSave = document.sourceText;
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
        const folder = pathParts.join("/") || vaultName;
        const currentDocument = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        const hasNewerEdit = currentDocument?.sourceText !== contentAtSave;

        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? {
                  ...current,
                  folder,
                  name,
                  relativePath: savedDocument.relativePath,
                  saveMessage: undefined,
                  saveState: hasNewerEdit ? "unsaved" : "saved",
                  savedSourceText: savedDocument.content,
                  sizeBytes: savedDocument.sizeBytes,
                  sourceText: hasNewerEdit
                    ? current.sourceText
                    : savedDocument.content,
                }
              : current,
          ),
        );
        setExpandedFolders((currentFolders) =>
          new Set(currentFolders).add(folder),
        );
        setFolderOrder((currentFolders) =>
          currentFolders.includes(folder)
            ? currentFolders
            : [...currentFolders, folder],
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
    setExpandedFolders((currentFolders) =>
      new Set(currentFolders).add(nextDocument.folder),
    );
    setFolderOrder((currentFolders) =>
      currentFolders.includes(nextDocument.folder)
        ? currentFolders
        : [...currentFolders, nextDocument.folder],
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

      const contentAtSave = document.sourceText;
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
        const folder = pathParts.join("/") || vaultName;
        const currentDocument = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        const hasNewerEdit = currentDocument?.sourceText !== contentAtSave;

        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? {
                  ...current,
                  folder,
                  name,
                  relativePath: savedDocument.relativePath,
                  saveMessage: hasNewerEdit
                    ? "The file was created with a permanent identity. Newer local edits were kept and need to be reconciled before saving."
                    : undefined,
                  saveState: hasNewerEdit ? "conflict" : "saved",
                  savedSourceText: savedDocument.content,
                  sizeBytes: savedDocument.sizeBytes,
                  sourceText: hasNewerEdit
                    ? current.sourceText
                    : savedDocument.content,
                }
              : current,
          ),
        );
        setExpandedFolders((currentFolders) =>
          new Set(currentFolders).add(folder),
        );
        setFolderOrder((currentFolders) =>
          currentFolders.includes(folder)
            ? currentFolders
            : [...currentFolders, folder],
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
    [addHistoryEntry, resolveHistorySource, vaultName],
  );

  const saveDocument = useCallback(
    async (documentId: string) => {
      const document = documentsRef.current.find(
        (candidate) => candidate.id === documentId,
      );
      if (!document || document.sourceText === undefined) {
        return;
      }
      if (!document.relativePath || document.savedSourceText === undefined) {
        await saveDocumentAs(documentId);
        return;
      }
      if (document.sourceText === document.savedSourceText) {
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

      const contentAtSave = document.sourceText;
      setDocuments((currentDocuments) =>
        currentDocuments.map((current) =>
          current.id === documentId
            ? { ...current, saveMessage: undefined, saveState: "saving" }
            : current,
        ),
      );

      try {
        const savedDocument = await saveVaultFile({
          content: contentAtSave,
          expectedContent: document.savedSourceText,
          relativePath: document.relativePath,
        });
        const currentDocument = documentsRef.current.find(
          (candidate) => candidate.id === documentId,
        );
        const hasNewerEdit = currentDocument?.sourceText !== contentAtSave;

        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? {
                  ...current,
                  saveMessage: undefined,
                  saveState: hasNewerEdit ? "unsaved" : "saved",
                  savedSourceText: savedDocument.content,
                  sizeBytes: savedDocument.sizeBytes,
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
        setDocuments((currentDocuments) =>
          currentDocuments.map((current) =>
            current.id === documentId
              ? { ...current, saveMessage: message, saveState: nextSaveState }
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
      }
    },
    [addHistoryEntry, resolveHistorySource, saveDocumentAs],
  );

  const recordSnapshotEvents = useCallback(
    (snapshot: VaultSnapshot) => {
      if (snapshot.warnings.addedIdentities > 0) {
        addHistoryEntry(
          `${snapshot.warnings.addedIdentities} new note identit${
            snapshot.warnings.addedIdentities === 1 ? "y was" : "ies were"
          } added safely.`,
          { kind: "identity" },
        );
      }
      if (snapshot.warnings.identityConflicts > 0) {
        addHistoryEntry(
          `${snapshot.warnings.identityConflicts} identity conflict${
            snapshot.warnings.identityConflicts === 1 ? " needs" : "s need"
          } attention.`,
          {
            kind: "identity",
            requiresAction: true,
            sourceId: "vault:identity-conflicts",
          },
        );
      } else {
        resolveHistorySource("vault:identity-conflicts");
      }
      if (snapshot.warnings.skippedSymlinks > 0) {
        addHistoryEntry(
          `${snapshot.warnings.skippedSymlinks} symlink entr${
            snapshot.warnings.skippedSymlinks === 1 ? "y was" : "ies were"
          } skipped for safety.`,
          { kind: "error" },
        );
      }
    },
    [addHistoryEntry, resolveHistorySource],
  );

  const activateVaultSnapshot = useCallback(
    (snapshot: VaultSnapshot) => {
      const nextDocuments = documentsFromVault(snapshot);
      const nextFolders = Array.from(
        new Set(nextDocuments.map((document) => document.folder)),
      );

      loadRequestRef.current += 1;
      vaultIdRef.current = snapshot.vaultId ?? "";
      documentsRef.current = nextDocuments;
      setVaultId(snapshot.vaultId ?? "");
      setVaultName(snapshot.name);
      setVaultSelected(true);
      setMigrationPreview(null);
      setMigrationStatus("idle");
      setMigrationError(undefined);
      setNotesNeedingIdentity(snapshot.warnings.needsIdentity);
      setDocuments(nextDocuments);
      setDocumentActivity((current) =>
        reconcileDocumentActivity(current, nextDocuments, Date.now()),
      );
      setFolderOrder(nextFolders);
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
      if (summary) {
        addVaultNotice(summary, {
          identityAction: snapshot.warnings.needsIdentity > 0,
        });
      }
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
      const nextFolders = Array.from(
        new Set(nextDocuments.map((document) => document.folder)),
      );
      documentsRef.current = nextDocuments;
      setDocuments(nextDocuments);
      setDocumentActivity((current) =>
        reconcileDocumentActivity(current, nextDocuments, Date.now()),
      );
      setFolderOrder(nextFolders);
      setExpandedFolders((currentFolders) => {
        const nextExpanded = new Set(currentFolders);
        nextFolders.forEach((folder) => nextExpanded.add(folder));
        return nextExpanded;
      });
      setNotesNeedingIdentity(snapshot.warnings.needsIdentity);
      recordSnapshotEvents(snapshot);
      const summary = vaultSummaryMessage(snapshot);
      if (summary) {
        addVaultNotice(summary, {
          identityAction: snapshot.warnings.needsIdentity > 0,
        });
      }
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

  async function reviewIdentityMigration() {
    setMigrationStatus("previewing");
    setMigrationError(undefined);
    try {
      setMigrationPreview(await previewIdentityMigration());
      setMigrationStatus("ready");
    } catch (error) {
      const message = readErrorMessage(error);
      setMigrationError(message);
      addVaultNotice(message, { persistent: true });
      addHistoryEntry("Identity migration could not be reviewed.", {
        kind: "error",
      });
      setMigrationStatus("idle");
    }
  }

  async function confirmIdentityMigration() {
    if (!migrationPreview) return;
    setMigrationStatus("applying");
    setMigrationError(undefined);
    try {
      const result = await applyIdentityMigration();
      adoptVaultSnapshot(result.snapshot);
      const message = `${result.migrated} existing note identities added.${
        result.skipped > 0
          ? ` ${result.skipped} changed notes were skipped.`
          : ""
      }`;
      addVaultNotice(message, { history: { kind: "identity" } });
      setMigrationPreview(null);
      setMigrationStatus("idle");
    } catch (error) {
      const message = readErrorMessage(error);
      setMigrationError(message);
      addHistoryEntry("Identity migration could not be completed.", {
        kind: "error",
      });
      setMigrationStatus("ready");
    }
  }

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

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const commandKey = event.metaKey || event.ctrlKey;

      if (commandKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createNote();
      }

      if (commandKey && event.key.toLowerCase() === "p") {
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
  }, [activeDocumentId, createNote, saveDocument, saveDocumentAs]);

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
    window.addEventListener("focus", refreshVault);
    return () => window.removeEventListener("focus", refreshVault);
  }, [refreshVault]);

  const selectDocument = useCallback(async (documentId: string) => {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document) return;

    setDocumentActivity((current) =>
      markDocumentActive(current, documentId, Date.now()),
    );
    setActiveDocumentId(documentId);
    setSidebarOpen(false);

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
                sizeBytes: openedDocument.sizeBytes,
                saveMessage: undefined,
                saveState: "saved",
                savedSourceText: openedDocument.content,
                sourceText: openedDocument.content,
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

  async function renameDocument(documentId: string) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.relativePath || !document.id.startsWith("vault-id:")) {
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

      const [snapshot, openedDocument] = await Promise.all([
        rescanVault(),
        readVaultFile(outcome.relativePath),
      ]);
      if (!snapshot) {
        throw new Error("The renamed vault could not be refreshed.");
      }
      const localDrafts = documentsRef.current.filter(
        (candidate) => !candidate.relativePath,
      );
      const nextDocuments = [
        ...documentsFromVault(snapshot).map((candidate) =>
          candidate.id === documentId
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
      const nextFolders = Array.from(
        new Set(nextDocuments.map((candidate) => candidate.folder)),
      );
      loadRequestRef.current += 1;
      documentsRef.current = nextDocuments;
      setDocuments(nextDocuments);
      setDocumentActivity((current) =>
        reconcileDocumentActivity(current, nextDocuments, Date.now()),
      );
      setFolderOrder(nextFolders);
      setExpandedFolders((currentFolders) => {
        const nextExpanded = new Set(currentFolders);
        nextFolders.forEach((folder) => nextExpanded.add(folder));
        return nextExpanded;
      });
      setNotesNeedingIdentity(snapshot.warnings.needsIdentity);
      setActiveDocumentId(documentId);
      setDocumentLoad({ status: "idle" });
      const filename =
        outcome.relativePath.split("/").pop() ?? outcome.relativePath;
      const message = `${filename} renamed. ${outcome.updatedLinks} link${
        outcome.updatedLinks === 1 ? "" : "s"
      } updated across ${outcome.updatedFiles} note${
        outcome.updatedFiles === 1 ? "" : "s"
      }.`;
      addVaultNotice(message, { history: { kind: "rename" } });
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

  async function trashDocument(documentId: string) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (
      !document?.relativePath ||
      !document.id.startsWith("vault-id:") ||
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
      const result = await restoreVaultFileFromTrash(entry.id);
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
    setDocumentLoad({ status: "idle" });
  }

  function updateDocumentContent(content: string) {
    if (!activeDocument) return;

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
          folders={folderOrder}
          query={query}
          searchInputRef={searchInputRef}
          trashCount={trashEntries.length}
          vaultSelected={vaultSelected}
          onCreateNote={createNote}
          onOpenTrash={() => {
            setTrashVisible(true);
            void refreshTrashEntries();
          }}
          onQueryChange={setQuery}
          onSelectDocument={selectDocument}
          onToggleFolder={toggleFolder}
        />
        <EditorSurface
          backlinks={backlinks}
          document={activeDocument}
          hasDocuments={documents.length > 0}
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
          onCloseDocument={closeDocument}
          onCreateVault={() => {
            setCreateVaultError(undefined);
            setCreateVaultVisible(true);
          }}
          onDocumentChange={updateDocumentContent}
          onOpenLinkedDocument={(documentId) => void selectDocument(documentId)}
          onOpenVault={() => void openVault()}
          onOpenWikilink={openWikilink}
          onRetryDocument={() => {
            if (activeDocument) void selectDocument(activeDocument.id);
          }}
          onRenameDocument={() => {
            if (activeDocument) void renameDocument(activeDocument.id);
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
              {notice.identityAction &&
              vaultSelected &&
              notesNeedingIdentity > 0 ? (
                <button
                  className="vault-message__action"
                  disabled={migrationStatus === "previewing"}
                  type="button"
                  onClick={() => void reviewIdentityMigration()}
                >
                  {migrationStatus === "previewing"
                    ? "Reviewing…"
                    : "Review identity migration"}
                </button>
              ) : null}
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
          reloading={reloadingApp}
          onClose={() => {
            if (!reloadingApp) {
              setSettingsVisible(false);
            }
          }}
          onReload={() => void reloadApp()}
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
      {migrationPreview ? (
        <IdentityMigrationPanel
          error={migrationError}
          preview={migrationPreview}
          status={migrationStatus === "applying" ? "applying" : "ready"}
          onApply={() => void confirmIdentityMigration()}
          onClose={() => {
            setMigrationPreview(null);
            setMigrationStatus("idle");
            setMigrationError(undefined);
          }}
        />
      ) : null}
      <StatusBar
        document={activeDocument}
        vaultFileCount={
          vaultSelected
            ? documents.filter((document) => document.relativePath).length
            : undefined
        }
        vaultName={vaultName}
      />
    </div>
  );
}
