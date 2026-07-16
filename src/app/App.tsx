import { useCallback, useEffect, useRef, useState } from "react";

import { EditorSurface } from "./components/EditorSurface";
import { FileRail } from "./components/FileRail";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import {
  createUntitledDocument,
  documentsFromVault,
  initialFolders,
  initialDocuments,
  type AnchoredDocument,
} from "./documents";
import { readVaultFile, saveVaultFile, selectVault } from "../lib/tauri/vault";

type SaveState = "saved" | "unsaved" | "saving" | "conflict" | "error";
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

export function App() {
  const [documents, setDocuments] =
    useState<AnchoredDocument[]>(initialDocuments);
  const [activeDocumentId, setActiveDocumentId] = useState("leadership");
  const [expandedFolders, setExpandedFolders] = useState(
    () => new Set(["Notes"]),
  );
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [vaultName, setVaultName] = useState("Personal");
  const [folderOrder, setFolderOrder] = useState(initialFolders);
  const [selectingVault, setSelectingVault] = useState(false);
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [documentLoad, setDocumentLoad] = useState<DocumentLoadState>({
    status: "idle",
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);
  const documentsRef = useRef(documents);

  documentsRef.current = documents;

  const activeDocument = documents.find(
    (document) => document.id === activeDocumentId,
  );

  const createNote = useCallback(() => {
    const nextDocument = createUntitledDocument(documents);

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
    setSaveState("unsaved");
    setDocumentLoad({ status: "idle" });
    setSidebarOpen(false);
  }, [documents]);

  const saveDocument = useCallback(async (documentId: string) => {
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
    if (document.sourceText === document.savedSourceText) {
      setSaveState("saved");
      return;
    }

    const contentAtSave = document.sourceText;
    setSaveState("saving");
    setSaveMessage(null);

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
                savedSourceText: savedDocument.content,
                sizeBytes: savedDocument.sizeBytes,
              }
            : current,
        ),
      );
      setSaveState(hasNewerEdit ? "unsaved" : "saved");
    } catch (error) {
      const message = readErrorMessage(error);
      setSaveState(
        typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "vaultConflict"
          ? "conflict"
          : "error",
      );
      setSaveMessage(message);
    }
  }, []);

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
        void saveDocument(activeDocumentId);
      }

      if (commandKey && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [activeDocumentId, createNote, saveDocument]);

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

  async function selectDocument(documentId: string) {
    const document = documents.find((candidate) => candidate.id === documentId);
    if (!document) return;

    setActiveDocumentId(documentId);
    setSaveState("saved");
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

  function closeDocument() {
    loadRequestRef.current += 1;
    setActiveDocumentId("");
    setDocumentLoad({ status: "idle" });
    setSaveState("saved");
    setSaveMessage(null);
  }

  function updateDocumentContent(content: string) {
    if (!activeDocument) return;

    setDocuments((currentDocuments) =>
      currentDocuments.map((document) =>
        document.id === activeDocument.id
          ? { ...document, sourceText: content }
          : document,
      ),
    );
    setSaveState((currentState) =>
      currentState === "conflict" ? "conflict" : "unsaved",
    );
    if (saveState !== "conflict") {
      setSaveMessage(null);
    }
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
      setDocuments(nextDocuments);
      setFolderOrder(nextFolders);
      setExpandedFolders(new Set(nextFolders));
      setActiveDocumentId("");
      setQuery("");
      setSaveState("saved");
      setDocumentLoad({ status: "idle" });
      setSaveMessage(null);
      setVaultMessage(
        snapshot.warnings.skippedSymlinks > 0
          ? `${snapshot.warnings.skippedSymlinks} symlink entries were skipped for safety.`
          : `${snapshot.files.length} Markdown files found.`,
      );
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
          onRetryDocument={() => {
            if (activeDocument) void selectDocument(activeDocument.id);
          }}
          onSaveDocument={() => {
            if (activeDocument) void saveDocument(activeDocument.id);
          }}
        />
      </div>
      {vaultMessage ? (
        <div className="vault-message" role="status">
          {vaultMessage}
        </div>
      ) : null}
      {saveMessage ? (
        <div className="vault-message vault-message--error" role="alert">
          {saveMessage}
        </div>
      ) : null}
      <StatusBar document={activeDocument} vaultName={vaultName} />
    </div>
  );
}
