import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createScratchpadNote,
  latestScratchpadNote,
  listScratchpadNotes,
  loadScratchpadLinkCandidates,
  saveScratchpadNote,
  readScratchpadNote,
  type ScratchpadDocument,
  type ScratchpadLinkCandidate,
  type ScratchpadMode,
  type ScratchpadListItem,
} from "../../lib/tauri/scratchpad";
import { type VaultChangeBatch } from "../../lib/tauri/vault";
import MarkdownEditor from "./MarkdownEditor";
import type { WikilinkCandidate } from "../linkCandidates";
import "../../styles/scratchpad.css";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Scratchpad could not save.";
}

function initialMode(): ScratchpadMode {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "previous" || mode === "list" ? mode : "new";
}

function scratchpadBody(source: string): string {
  const match = source.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  return match ? source.slice(match[0].length) : source;
}

function candidateForEditor(
  candidate: ScratchpadLinkCandidate,
  index: number,
): WikilinkCandidate {
  return {
    activityAt: Date.now() - index,
    detail: "Vault",
    kind: "note",
    label: candidate.label,
    target: candidate.target,
  };
}

export function Scratchpad() {
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [composing, setComposing] = useState(false);
  const [document, setDocument] = useState<ScratchpadDocument>();
  const [candidates, setCandidates] = useState<ScratchpadLinkCandidate[]>([]);
  const [listVisible, setListVisible] = useState(false);
  const [notes, setNotes] = useState<ScratchpadListItem[]>([]);
  const [status, setStatus] = useState("Ready");
  const bodyRef = useRef(body);
  const documentRef = useRef(document);
  const modeRequestRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | undefined>(undefined);
  const [findRequest, setFindRequest] = useState(0);
  bodyRef.current = body;
  documentRef.current = document;

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const bodyAtSave = bodyRef.current;
    if (!bodyAtSave.trim()) return true;
    if (bodyAtSave === documentRef.current?.body) return true;
    setStatus("Saving…");
    const operation: Promise<boolean> = (async (): Promise<boolean> => {
      try {
        const current = documentRef.current;
        const saved = current
          ? await saveScratchpadNote({
              body: bodyAtSave,
              expectedContent: current.persistedContent,
              relativePath: current.relativePath,
            })
          : await createScratchpadNote(bodyAtSave);
        documentRef.current = saved;
        setDocument(saved);
        setSource(saved.persistedContent);
        setStatus(bodyRef.current === bodyAtSave ? "Saved" : "Unsaved");
      } catch (error) {
        setStatus(errorMessage(error));
        return false;
      } finally {
        savePromiseRef.current = undefined;
      }
      if (bodyRef.current !== bodyAtSave && bodyRef.current.trim()) {
        return saveNow();
      }
      return true;
    })();
    savePromiseRef.current = operation;
    return operation;
  }, []);

  const refreshList = useCallback(async () => {
    try {
      setNotes(await listScratchpadNotes());
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }, []);

  const openMode = useCallback(
    async (mode: ScratchpadMode) => {
      const requestId = ++modeRequestRef.current;
      const saved = await saveNow();
      if (requestId !== modeRequestRef.current) return;
      if (!saved) {
        return;
      }
      if (mode === "list") {
        setListVisible(true);
        await refreshList();
      } else if (mode === "new") {
        setListVisible(false);
        documentRef.current = undefined;
        bodyRef.current = "";
        setDocument(undefined);
        setBody("");
        setSource("");
        setStatus("Ready");
      } else {
        setStatus("Opening…");
        try {
          const previous = await latestScratchpadNote();
          if (requestId !== modeRequestRef.current) return;
          documentRef.current = previous ?? undefined;
          bodyRef.current = previous?.body ?? "";
          setDocument(previous ?? undefined);
          setBody(previous?.body ?? "");
          setSource(previous?.persistedContent ?? "");
          setStatus(previous ? "Saved" : "No previous Scratchpad note");
        } catch (error) {
          if (requestId === modeRequestRef.current) {
            setStatus(errorMessage(error));
          }
        }
      }
    },
    [refreshList, saveNow],
  );

  const openListedNote = useCallback(
    async (relativePath: string) => {
      if (!(await saveNow())) return;
      setStatus("Opening…");
      try {
        const opened = await readScratchpadNote(relativePath);
        documentRef.current = opened;
        bodyRef.current = opened.body;
        setDocument(opened);
        setBody(opened.body);
        setSource(opened.persistedContent);
        setStatus("Saved");
      } catch (error) {
        setStatus(errorMessage(error));
      }
    },
    [saveNow],
  );

  useEffect(() => {
    if (initialMode() !== "new") {
      void openMode(initialMode());
    }
    void loadScratchpadLinkCandidates()
      .then(setCandidates)
      .catch(() => setCandidates([]));
    const unlistenPromise = listen<ScratchpadMode>(
      "scratchpad-mode",
      (event) => void openMode(event.payload),
    );
    const vaultChangesPromise = listen<VaultChangeBatch>(
      "vault-changed",
      (event) => {
        const current = documentRef.current;
        if (!current) {
          void loadScratchpadLinkCandidates()
            .then(setCandidates)
            .catch(() => undefined);
          return;
        }
        const changed = event.payload.changes.some(
          (change) =>
            change.relativePath === current.relativePath ||
            change.oldRelativePath === current.relativePath,
        );
        if (changed) {
          void readScratchpadNote(current.relativePath)
            .then((external) => {
              if (bodyRef.current === current.body) {
                documentRef.current = external;
                bodyRef.current = external.body;
                setDocument(external);
                setBody(external.body);
                setSource(external.persistedContent);
                setStatus("Updated from disk");
              } else {
                setStatus("The note changed outside Anchored.");
              }
            })
            .catch(() => undefined);
        }
        void loadScratchpadLinkCandidates()
          .then(setCandidates)
          .catch(() => undefined);
      },
    );
    const windowHandle = getCurrentWindow();
    const closePromise = windowHandle.onCloseRequested((event) => {
      event.preventDefault();
      void saveNow().then((saved) => {
        if (saved) void windowHandle.hide();
      });
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
      void vaultChangesPromise.then((unlisten) => unlisten());
      void closePromise.then((unlisten) => unlisten());
    };
  }, [openMode, saveNow]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "n" || key === "p") {
          event.preventDefault();
          void openMode(key === "n" ? "new" : "previous");
          return;
        }
        if (key === "s") {
          event.preventDefault();
          setListVisible((visible) => !visible);
          if (!listVisible) void refreshList();
          return;
        }
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        setFindRequest((current) => current + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [listVisible, openMode, refreshList]);

  useEffect(() => {
    if (composing || !body.trim() || body === document?.body) return;
    setStatus("Unsaved");
    const timeout = window.setTimeout(() => void saveNow(), 350);
    return () => window.clearTimeout(timeout);
  }, [body, composing, document?.body, saveNow]);

  const editorCandidates = useMemo(
    () => candidates.map(candidateForEditor),
    [candidates],
  );

  return (
    <main className="scratchpad-shell">
      <header className="scratchpad-header">
        <strong>Scratchpad</strong>
        <span role="status">{status}</span>
        <button
          aria-expanded={listVisible}
          type="button"
          onClick={() => {
            setListVisible((visible) => !visible);
            if (!listVisible) void refreshList();
          }}
        >
          Notes
        </button>
        <button
          type="button"
          onClick={() =>
            void saveNow().then((saved) => {
              if (saved) void getCurrentWindow().hide();
            })
          }
        >
          Done
        </button>
      </header>
      <div className={`scratchpad-workspace${listVisible ? " has-list" : ""}`}>
        <MarkdownEditor
          autoFocus
          documentId={document?.relativePath ?? "scratchpad-new"}
          editorFontSize={14}
          findRequest={findRequest}
          focusAtEnd
          label="Scratchpad Markdown"
          value={source}
          wikilinkCandidates={editorCandidates}
          onChange={(nextSource) => {
            const nextBody = scratchpadBody(nextSource);
            bodyRef.current = nextBody;
            setBody(nextBody);
            setSource(nextSource);
          }}
          onCompositionChange={setComposing}
          onCursorPosition={() => undefined}
          onOpenWikilink={(target) =>
            void emit("scratchpad-open-wikilink", { target })
          }
          onPreview={() => undefined}
          onSave={() => void saveNow()}
          onSaveAs={() => undefined}
        />
        {listVisible ? (
          <aside aria-label="Scratchpad notes" className="scratchpad-note-list">
            {notes.length === 0 ? (
              <p>No active Scratchpad notes.</p>
            ) : (
              notes.map((note) => (
                <button
                  aria-current={
                    document?.relativePath === note.relativePath
                      ? "page"
                      : undefined
                  }
                  key={note.relativePath}
                  type="button"
                  onClick={() => void openListedNote(note.relativePath)}
                >
                  <span>{note.name.replace(/\.md$/i, "")}</span>
                  <small>
                    {new Date(note.modifiedMillis).toLocaleString()}
                  </small>
                </button>
              ))
            )}
          </aside>
        ) : null}
      </div>
      <footer className="scratchpad-footer">
        <span>⌃⌥N New</span>
        <span>⌃⌥P Previous</span>
        <span>⌃⌥S Notes</span>
        <span>Type [[ to link</span>
      </footer>
    </main>
  );
}
