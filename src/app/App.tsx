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
  type DocumentSaveState,
} from "./documents";
import {
  createVaultFile,
  readVaultFile,
  saveVaultFile,
  selectVault,
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
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);
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
  const saveState: DocumentSaveState = activeDocument?.saveState ?? "saved";

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
                  saveMessage: undefined,
                  saveState: hasNewerEdit ? "unsaved" : "saved",
                  savedSourceText: savedDocument.content,
                  sizeBytes: savedDocument.sizeBytes,
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

  async function selectDocument(documentId: string) {
    const document = documents.find((candidate) => candidate.id === documentId);
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
      setDocuments(nextDocuments);
      setFolderOrder(nextFolders);
      setExpandedFolders(new Set(nextFolders));
      setActiveDocumentId("");
      setQuery("");
      setDocumentLoad({ status: "idle" });
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
          onSaveDocumentAs={() => {
            if (activeDocument) void saveDocumentAs(activeDocument.id);
          }}
        />
      </div>
      {vaultMessage ? (
        <div className="vault-message" role="status">
          {vaultMessage}
        </div>
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
