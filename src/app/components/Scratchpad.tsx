import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createScratchpadNote,
  latestScratchpadNote,
  loadScratchpadLinkCandidates,
  saveScratchpadNote,
  type ScratchpadDocument,
  type ScratchpadLinkCandidate,
  type ScratchpadMode,
} from "../../lib/tauri/scratchpad";
import "../../styles/scratchpad.css";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Scratchpad could not save.";
}

function initialMode(): ScratchpadMode {
  return new URLSearchParams(window.location.search).get("mode") === "previous"
    ? "previous"
    : "new";
}

export function Scratchpad() {
  const [body, setBody] = useState("");
  const [document, setDocument] = useState<ScratchpadDocument>();
  const [candidates, setCandidates] = useState<ScratchpadLinkCandidate[]>([]);
  const [composing, setComposing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef(body);
  const documentRef = useRef(document);
  const modeRequestRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | undefined>(undefined);
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

  const openMode = useCallback(
    async (mode: ScratchpadMode) => {
      const requestId = ++modeRequestRef.current;
      const saved = await saveNow();
      if (requestId !== modeRequestRef.current) return;
      if (!saved) {
        textareaRef.current?.focus();
        return;
      }
      if (mode === "new") {
        setLoading(false);
        documentRef.current = undefined;
        bodyRef.current = "";
        setDocument(undefined);
        setBody("");
        setStatus("Ready");
      } else {
        setLoading(true);
        setStatus("Opening…");
        try {
          const previous = await latestScratchpadNote();
          if (requestId !== modeRequestRef.current) return;
          documentRef.current = previous ?? undefined;
          bodyRef.current = previous?.body ?? "";
          setDocument(previous ?? undefined);
          setBody(previous?.body ?? "");
          setStatus(previous ? "Saved" : "No previous Scratchpad note");
        } catch (error) {
          if (requestId === modeRequestRef.current) {
            setStatus(errorMessage(error));
          }
        } finally {
          if (requestId === modeRequestRef.current) setLoading(false);
        }
      }
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [saveNow],
  );

  useEffect(() => {
    if (initialMode() === "previous") {
      void openMode("previous");
    } else {
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
    void loadScratchpadLinkCandidates()
      .then(setCandidates)
      .catch(() => setCandidates([]));
    const unlistenPromise = listen<ScratchpadMode>(
      "scratchpad-mode",
      (event) => void openMode(event.payload),
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
      void closePromise.then((unlisten) => unlisten());
    };
  }, [openMode, saveNow]);

  useEffect(() => {
    if (composing || !body.trim() || body === document?.body) return;
    setStatus("Unsaved");
    const timeout = window.setTimeout(() => void saveNow(), 350);
    return () => window.clearTimeout(timeout);
  }, [body, composing, document?.body, saveNow]);

  const suggestions = useMemo(() => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? body.length;
    const before = body.slice(0, cursor);
    const opening = before.lastIndexOf("[[");
    if (opening < 0) return [];
    const query = before.slice(opening + 2);
    if (query.includes("]]") || query.includes("\n")) return [];
    const normalized = query.toLocaleLowerCase();
    return candidates
      .filter(
        (candidate) =>
          candidate.label.toLocaleLowerCase().includes(normalized) ||
          candidate.target.toLocaleLowerCase().includes(normalized),
      )
      .slice(0, 8)
      .map((candidate) => ({ ...candidate, opening, cursor }));
  }, [body, candidates]);

  function insertSuggestion(index: number) {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    const next = `${body.slice(0, suggestion.opening)}[[${suggestion.target}]]${body.slice(
      suggestion.cursor,
    )}`;
    const cursor = suggestion.opening + suggestion.target.length + 4;
    setBody(next);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    }, 0);
  }

  return (
    <main className="scratchpad-shell">
      <header className="scratchpad-header">
        <strong>Scratchpad</strong>
        <span role="status">{status}</span>
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
      <textarea
        ref={textareaRef}
        aria-label="Scratchpad Markdown"
        autoFocus
        disabled={loading}
        placeholder="Capture a thought…"
        spellCheck
        value={body}
        onCompositionEnd={(event) => {
          const nextBody =
            event.currentTarget.value || `${bodyRef.current}${event.data}`;
          bodyRef.current = nextBody;
          setBody(nextBody);
          setComposing(false);
        }}
        onCompositionStart={() => setComposing(true)}
        onChange={(event) => {
          setBody(event.target.value);
          setSelectedSuggestion(0);
        }}
        onKeyDown={(event) => {
          if (
            event.ctrlKey &&
            event.altKey &&
            event.key.toLowerCase() === "n"
          ) {
            event.preventDefault();
            void openMode("new");
            return;
          }
          if (
            event.ctrlKey &&
            event.altKey &&
            event.key.toLowerCase() === "p"
          ) {
            event.preventDefault();
            void openMode("previous");
            return;
          }
          if (suggestions.length === 0) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedSuggestion((current) =>
              event.key === "ArrowDown"
                ? Math.min(suggestions.length - 1, current + 1)
                : Math.max(0, current - 1),
            );
          }
          if (event.key === "Enter") {
            event.preventDefault();
            insertSuggestion(selectedSuggestion);
          }
          if (event.key === "Escape") setCandidates([]);
        }}
      />
      {suggestions.length > 0 ? (
        <div
          className="scratchpad-suggestions"
          role="listbox"
          aria-label="Notes"
        >
          {suggestions.map((suggestion, index) => (
            <button
              aria-selected={index === selectedSuggestion}
              key={suggestion.target}
              role="option"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertSuggestion(index)}
            >
              <span>{suggestion.label}</span>
              <small>{suggestion.target}</small>
            </button>
          ))}
        </div>
      ) : null}
      <footer className="scratchpad-footer">
        <span>⌃⌥N New</span>
        <span>⌃⌥P Previous</span>
        <span>Type [[ to link</span>
      </footer>
    </main>
  );
}
