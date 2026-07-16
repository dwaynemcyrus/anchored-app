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
import { selectVault } from "../lib/tauri/vault";

type SaveState = "saved" | "unsaved";

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
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeDocument = documents.find(
    (document) => document.id === activeDocumentId,
  );

  const createNote = useCallback(() => {
    const nextDocument = createUntitledDocument(documents);

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
    setSidebarOpen(false);
  }, [documents]);

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const commandKey = event.metaKey || event.ctrlKey;

      if (commandKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createNote();
      }

      if (commandKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setSaveState("saved");
      }

      if (commandKey && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [createNote]);

  function selectDocument(documentId: string) {
    setActiveDocumentId(documentId);
    setSaveState("saved");
    setSidebarOpen(false);
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

      setVaultName(snapshot.name);
      setDocuments(nextDocuments);
      setFolderOrder(nextFolders);
      setExpandedFolders(new Set(nextFolders));
      setActiveDocumentId(nextDocuments[0]?.id ?? "");
      setQuery("");
      setSaveState("saved");
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
          vaultName={vaultName}
          onOpenLinkedDocument={selectDocument}
        />
      </div>
      {vaultMessage ? (
        <div className="vault-message" role="status">
          {vaultMessage}
        </div>
      ) : null}
      <StatusBar document={activeDocument} vaultName={vaultName} />
    </div>
  );
}
