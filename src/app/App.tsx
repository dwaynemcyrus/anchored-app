import { useCallback, useEffect, useRef, useState } from "react";

import { EditorSurface } from "./components/EditorSurface";
import { FileRail } from "./components/FileRail";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import {
  createUntitledDocument,
  initialDocuments,
  type AnchoredDocument,
} from "./documents";

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
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeDocument =
    documents.find((document) => document.id === activeDocumentId) ??
    documents[0];

  const createNote = useCallback(() => {
    const nextDocument = createUntitledDocument(documents);

    setDocuments((currentDocuments) => [...currentDocuments, nextDocument]);
    setActiveDocumentId(nextDocument.id);
    setExpandedFolders((currentFolders) =>
      new Set(currentFolders).add(nextDocument.folder),
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
        sidebarOpen={sidebarOpen}
        onCreateNote={createNote}
        onOpenSearch={() => searchInputRef.current?.focus()}
        onToggleSidebar={() => setSidebarOpen((isOpen) => !isOpen)}
      />
      <div className={`workspace${sidebarOpen ? " sidebar-open" : ""}`}>
        <FileRail
          activeDocumentId={activeDocument.id}
          documents={documents}
          expandedFolders={expandedFolders}
          query={query}
          searchInputRef={searchInputRef}
          onCreateNote={createNote}
          onQueryChange={setQuery}
          onSelectDocument={selectDocument}
          onToggleFolder={toggleFolder}
        />
        <EditorSurface
          document={activeDocument}
          onOpenLinkedDocument={selectDocument}
        />
      </div>
      <StatusBar document={activeDocument} />
    </div>
  );
}
