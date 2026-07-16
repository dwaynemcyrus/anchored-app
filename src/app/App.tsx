import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EditorSurface } from "./components/EditorSurface";
import { FileRail } from "./components/FileRail";
import { IdentityMigrationPanel } from "./components/IdentityMigrationPanel";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import {
  createUntitledDocument,
  documentsFromVault,
  initialFolders,
  initialDocuments,
  mergeDocumentsFromVault,
  type AnchoredDocument,
  type DocumentSaveState,
} from "./documents";
import { backlinksForDocument, resolveWikilink } from "./links";
import {
  applyIdentityMigration,
  createVaultFile,
  previewIdentityMigration,
  readVaultFile,
  renameVaultFile,
  rescanVault,
  saveVaultFile,
  selectVault,
  type VaultSnapshot,
  type IdentityMigrationPreview,
} from "../lib/tauri/vault";

type DocumentLoadState =
  | { status: "idle" }
  | { status: "loading"; documentId: string }
  | { status: "error"; documentId: string; message: string };

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
  const notices = [`${snapshot.files.length} Markdown files found.`];
  if (snapshot.warnings.addedIdentities > 0) {
    notices.push(
      `${snapshot.warnings.addedIdentities} new note identities added.`,
    );
  }
  if (snapshot.warnings.needsIdentity > 0) {
    notices.push(
      `${snapshot.warnings.needsIdentity} existing notes need identities.`,
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

export function App() {
  const [documents, setDocuments] =
    useState<AnchoredDocument[]>(initialDocuments);
  const [activeDocumentId, setActiveDocumentId] = useState("leadership");
  const [expandedFolders, setExpandedFolders] = useState(
    () => new Set(["Notes"]),
  );
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [vaultName, setVaultName] = useState("Personal");
  const [folderOrder, setFolderOrder] = useState(initialFolders);
  const [selectingVault, setSelectingVault] = useState(false);
  const [vaultSelected, setVaultSelected] = useState(false);
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);
  const rescanInFlightRef = useRef(false);
  const documentsRef = useRef(documents);

  documentsRef.current = documents;

  const activeDocument = documents.find(
    (document) => document.id === activeDocumentId,
  );
  const saveState: DocumentSaveState = activeDocument?.saveState ?? "saved";
  const backlinks = useMemo(
    () =>
      activeDocumentId ? backlinksForDocument(documents, activeDocumentId) : [],
    [activeDocumentId, documents],
  );

  const createNote = useCallback(() => {
    const nextDocument = createUntitledDocument(documentsRef.current);

    loadRequestRef.current += 1;
    setDocuments((currentDocuments) => [...currentDocuments, nextDocument]);
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
  }, []);

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
      }
    },
    [vaultName],
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
      }
    },
    [saveDocumentAs],
  );

  const adoptVaultSnapshot = useCallback((snapshot: VaultSnapshot) => {
    const nextDocuments = mergeDocumentsFromVault(
      documentsRef.current,
      snapshot,
    );
    const nextFolders = Array.from(
      new Set(nextDocuments.map((document) => document.folder)),
    );
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    setFolderOrder(nextFolders);
    setExpandedFolders((currentFolders) => {
      const nextExpanded = new Set(currentFolders);
      nextFolders.forEach((folder) => nextExpanded.add(folder));
      return nextExpanded;
    });
    setNotesNeedingIdentity(snapshot.warnings.needsIdentity);
    setVaultMessage(vaultSummaryMessage(snapshot));
  }, []);

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
      setVaultMessage(readErrorMessage(error));
    } finally {
      rescanInFlightRef.current = false;
    }
  }, [adoptVaultSnapshot, vaultSelected]);

  async function reviewIdentityMigration() {
    setMigrationStatus("previewing");
    setMigrationError(undefined);
    try {
      setMigrationPreview(await previewIdentityMigration());
      setMigrationStatus("ready");
    } catch (error) {
      const message = readErrorMessage(error);
      setMigrationError(message);
      setVaultMessage(message);
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
      setVaultMessage(
        `${result.migrated} existing note identities added.${
          result.skipped > 0
            ? ` ${result.skipped} changed notes were skipped.`
            : ""
        }`,
      );
      setMigrationPreview(null);
      setMigrationStatus("idle");
    } catch (error) {
      setMigrationError(readErrorMessage(error));
      setMigrationStatus("ready");
    }
  }

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const commandKey = event.metaKey || event.ctrlKey;

      if (commandKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createNote();
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

      if (commandKey && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [activeDocumentId, createNote, saveDocument, saveDocumentAs]);

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

  useEffect(() => {
    if (!vaultMessage || (vaultSelected && notesNeedingIdentity > 0)) {
      return;
    }
    const timeout = window.setTimeout(() => setVaultMessage(null), 6_000);
    return () => window.clearTimeout(timeout);
  }, [notesNeedingIdentity, vaultMessage, vaultSelected]);

  async function selectDocument(documentId: string) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document) return;

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
  }

  async function renameDocument(documentId: string) {
    const document = documentsRef.current.find(
      (candidate) => candidate.id === documentId,
    );
    if (!document?.relativePath || !document.id.startsWith("vault-id:")) {
      return;
    }
    const hasUnfinishedFileEdits = documentsRef.current.some(
      (candidate) =>
        candidate.relativePath &&
        (candidate.saveState !== "saved" ||
          (candidate.sourceText !== undefined &&
            candidate.sourceText !== candidate.savedSourceText)),
    );
    if (hasUnfinishedFileEdits) {
      setVaultMessage("Save all open note changes before renaming a note.");
      return;
    }

    let renameCompleted = false;
    setRenamingDocumentId(documentId);
    setVaultMessage(null);
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
      setVaultMessage(
        `${filename} renamed. ${outcome.updatedLinks} link${
          outcome.updatedLinks === 1 ? "" : "s"
        } updated across ${outcome.updatedFiles} note${
          outcome.updatedFiles === 1 ? "" : "s"
        }.`,
      );
    } catch (error) {
      setVaultMessage(
        renameCompleted
          ? `The note was renamed, but Anchored could not refresh it: ${readErrorMessage(error)}`
          : readErrorMessage(error),
      );
    } finally {
      setRenamingDocumentId(null);
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
      setVaultMessage(
        `[[${target}]] is ambiguous${
          names.length > 0 ? `: ${names.join(", ")}.` : "."
        }`,
      );
      return;
    }
    setVaultMessage(`[[${target}]] does not match a note or alias.`);
  }

  function closeDocument() {
    loadRequestRef.current += 1;
    setActiveDocumentId("");
    setDocumentLoad({ status: "idle" });
  }

  function updateDocumentContent(content: string) {
    if (!activeDocument) return;

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
    setSelectingVault(true);
    setVaultMessage(null);

    try {
      const snapshot = await selectVault();
      if (!snapshot) return;

      const nextDocuments = documentsFromVault(snapshot);
      const nextFolders = Array.from(
        new Set(nextDocuments.map((document) => document.folder)),
      );

      loadRequestRef.current += 1;
      setVaultName(snapshot.name);
      setVaultSelected(true);
      setMigrationPreview(null);
      setMigrationStatus("idle");
      setMigrationError(undefined);
      setNotesNeedingIdentity(snapshot.warnings.needsIdentity);
      setDocuments(nextDocuments);
      setFolderOrder(nextFolders);
      setExpandedFolders(new Set(nextFolders));
      setActiveDocumentId("");
      setQuery("");
      setDocumentLoad({ status: "idle" });
      setVaultMessage(vaultSummaryMessage(snapshot));
    } catch {
      setVaultMessage(
        "Vault selection is available in the Anchored desktop app.",
      );
    } finally {
      setSelectingVault(false);
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
        saveState={saveState}
        selectingVault={selectingVault}
        sidebarOpen={sidebarOpen}
        vaultName={vaultName}
        onCreateNote={createNote}
        onOpenSearch={() => searchInputRef.current?.focus()}
        onSelectVault={openVault}
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
          onCreateNote={createNote}
          onQueryChange={setQuery}
          onSelectDocument={selectDocument}
          onToggleFolder={toggleFolder}
        />
        <EditorSurface
          backlinks={backlinks}
          document={activeDocument}
          hasDocuments={documents.length > 0}
          loadState={
            documentLoad.status !== "idle" &&
            documentLoad.documentId === activeDocument?.id
              ? documentLoad
              : { status: "idle" }
          }
          vaultName={vaultName}
          onCloseDocument={closeDocument}
          onDocumentChange={updateDocumentContent}
          onOpenLinkedDocument={(documentId) => void selectDocument(documentId)}
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
          renaming={renamingDocumentId === activeDocument?.id}
        />
      </div>
      {vaultMessage ? (
        <div className="vault-message" role="status">
          <div className="vault-message__row">
            <span>{vaultMessage}</span>
            <button
              aria-label="Dismiss notification"
              className="vault-message__dismiss"
              type="button"
              onClick={() => setVaultMessage(null)}
            >
              Dismiss
            </button>
          </div>
          {vaultSelected && notesNeedingIdentity > 0 ? (
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
      {activeDocument?.saveMessage ? (
        <div className="vault-message vault-message--error" role="alert">
          {activeDocument.saveMessage}
        </div>
      ) : null}
      <StatusBar document={activeDocument} vaultName={vaultName} />
    </div>
  );
}
