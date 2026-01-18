"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Compartment, EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup } from "codemirror";
import { getDerivedTitle, useNotesStore } from "../../store/notesStore";
import { useShellHeaderStore } from "../../store/shellHeaderStore";
import { useEditorSettingsStore } from "../../store/editorSettingsStore";
import styles from "../../styles/noteEditor.module.css";

const SAVED_LABEL = "Saved";
const SAVING_LABEL = "Saving...";
const TYPEWRITER_TARGET_RATIO = 0.45;
const TYPEWRITER_DEADZONE_PX = 24;
const TYPEWRITER_SUSPEND_MS = 1200;
const VIEWPORT_SETTLE_MS = 150;
const FONT_SIZE_MAP = {
  small: "16px",
  default: "17px",
  large: "19px",
};

const buildParagraphDecorations = (state) => {
  const { doc, selection } = state;
  const head = selection.main.head;
  const activeLine = doc.lineAt(head);
  const activeText = activeLine.text.trim();
  let startLine = activeLine.number;
  let endLine = activeLine.number;

  if (activeText !== "") {
    while (startLine > 1) {
      const previous = doc.line(startLine - 1);
      if (previous.text.trim() === "") break;
      startLine -= 1;
    }
    while (endLine < doc.lines) {
      const next = doc.line(endLine + 1);
      if (next.text.trim() === "") break;
      endLine += 1;
    }
  }

  const builder = new RangeSetBuilder();
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    if (lineNumber >= startLine && lineNumber <= endLine) continue;
    const line = doc.line(lineNumber);
    if (line.from === line.to) continue;
    builder.add(line.from, line.to, Decoration.mark({ class: "cm-focus-dim" }));
  }
  return builder.finish();
};

const createFocusField = () =>
  StateField.define({
    create(state) {
      return buildParagraphDecorations(state);
    },
    update(decorations, transaction) {
      if (!transaction.docChanged && !transaction.selection) return decorations;
      return buildParagraphDecorations(transaction.state);
    },
    provide: (field) => EditorView.decorations.from(field),
  });

export default function NoteEditor({ noteId }) {
  const hydrate = useNotesStore((state) => state.hydrate);
  const loadNote = useNotesStore((state) => state.loadNote);
  const hasHydrated = useNotesStore((state) => state.hasHydrated);
  const updateNoteBody = useNotesStore((state) => state.updateNoteBody);
  const note = useNotesStore((state) => state.notesById[noteId]);
  const setHeaderTitle = useShellHeaderStore((state) => state.setTitle);
  const clearHeaderTitle = useShellHeaderStore((state) => state.clearTitle);
  const setHeaderStatus = useShellHeaderStore((state) => state.setStatus);
  const clearHeaderStatus = useShellHeaderStore((state) => state.clearStatus);
  const hydrateEditorSettings = useEditorSettingsStore((state) => state.hydrate);
  const focusMode = useEditorSettingsStore((state) => state.focusMode);
  const fontSize = useEditorSettingsStore((state) => state.fontSize);
  const typewriterEnabled = useEditorSettingsStore((state) => state.typewriterEnabled);

  const editorHostRef = useRef(null);
  const editorViewRef = useRef(null);
  const lastBodyRef = useRef("");
  const pendingBodyRef = useRef("");
  const saveRequestIdRef = useRef(0);
  const saveTimerRef = useRef(null);
  const manualScrollRef = useRef(false);
  const manualScrollTimerRef = useRef(null);
  const typewriterScrollRef = useRef(false);
  const pendingTypewriterScrollRef = useRef(false);
  const typewriterFrameRef = useRef(null);
  const viewportHeightRef = useRef(null);
  const viewportSettleTimerRef = useRef(null);
  const pendingViewportSnapRef = useRef(false);
  const focusCompartmentRef = useRef(new Compartment());
  const focusFieldRef = useRef(createFocusField());

  const [saveStatus, setSaveStatus] = useState(SAVED_LABEL);
  const [loadedNoteId, setLoadedNoteId] = useState(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    hydrateEditorSettings();
  }, [hydrateEditorSettings]);

  useEffect(() => {
    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
    };
  }, [noteId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (manualScrollTimerRef.current) {
        window.clearTimeout(manualScrollTimerRef.current);
      }
      if (typewriterFrameRef.current) {
        window.cancelAnimationFrame(typewriterFrameRef.current);
        typewriterFrameRef.current = null;
      }
      if (viewportSettleTimerRef.current) {
        window.clearTimeout(viewportSettleTimerRef.current);
        viewportSettleTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    loadNote(noteId).then(() => {
      if (isActive) {
        setLoadedNoteId(noteId);
      }
    });
    return () => {
      isActive = false;
    };
  }, [loadNote, noteId]);

  const resolveSavedState = useCallback((requestId) => {
    if (requestId !== saveRequestIdRef.current) return;
    setSaveStatus(SAVED_LABEL);
  }, []);

  const runSave = useCallback(
    async (body, requestId) => {
      try {
        await updateNoteBody(noteId, body);
        resolveSavedState(requestId);
      } catch (error) {
        console.error("Failed to save note", error);
      }
    },
    [noteId, resolveSavedState, updateNoteBody]
  );

  const queueSave = useCallback(
    (nextBody) => {
      pendingBodyRef.current = nextBody;
      setSaveStatus(SAVING_LABEL);
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      const requestId = saveRequestIdRef.current + 1;
      saveRequestIdRef.current = requestId;
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        runSave(pendingBodyRef.current, requestId);
      }, 500);
    },
    [runSave]
  );

  const flushPendingSave = useCallback(() => {
    if (!saveTimerRef.current) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const requestId = saveRequestIdRef.current;
    runSave(pendingBodyRef.current, requestId);
  }, [runSave]);

  const handleManualScroll = useCallback(() => {
    if (typewriterScrollRef.current) return;
    manualScrollRef.current = true;
    if (manualScrollTimerRef.current) {
      window.clearTimeout(manualScrollTimerRef.current);
    }
    manualScrollTimerRef.current = window.setTimeout(() => {
      manualScrollRef.current = false;
    }, TYPEWRITER_SUSPEND_MS);
  }, []);

  const updateViewportHeight = useCallback(() => {
    viewportHeightRef.current = window.visualViewport?.height ?? window.innerHeight;
  }, []);

  const scheduleTypewriterScroll = useCallback(
    (view) => {
      if (!typewriterEnabled) return;
      if (manualScrollRef.current) return;
      if (pendingTypewriterScrollRef.current) return;
      pendingTypewriterScrollRef.current = true;
      typewriterFrameRef.current = window.requestAnimationFrame(() => {
        pendingTypewriterScrollRef.current = false;
        const pos = view.state.selection.main.head;
        const coords = view.coordsAtPos(pos);
        if (!coords) return;
        const scroller = view.scrollDOM;
        const scrollerRect = scroller.getBoundingClientRect();
        const viewportHeight = viewportHeightRef.current ?? scrollerRect.height;
        const targetY = scrollerRect.top + viewportHeight * TYPEWRITER_TARGET_RATIO;
        const delta = coords.top - targetY;
        if (Math.abs(delta) <= TYPEWRITER_DEADZONE_PX) return;
        const maxTop = scroller.scrollHeight - scroller.clientHeight;
        const nextTop = Math.max(0, Math.min(scroller.scrollTop + delta, maxTop));
        if (Math.abs(nextTop - scroller.scrollTop) < 1) return;
        typewriterScrollRef.current = true;
        scroller.scrollTop = nextTop;
        window.requestAnimationFrame(() => {
          typewriterScrollRef.current = false;
        });
      });
    },
    [typewriterEnabled]
  );

  useEffect(() => {
    if (!note) return;
    if (!editorHostRef.current) return;
    if (editorViewRef.current) return;

    lastBodyRef.current = note.body;
    pendingBodyRef.current = note.body;

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const nextBody = update.state.doc.toString();
      if (nextBody === lastBodyRef.current) return;
      lastBodyRef.current = nextBody;
      queueSave(nextBody);
      if (pendingViewportSnapRef.current) {
        pendingViewportSnapRef.current = false;
      }
      scheduleTypewriterScroll(update.view);
    });

    const state = EditorState.create({
      doc: note.body,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        focusCompartmentRef.current.of([]),
        updateListener,
      ],
    });

    editorViewRef.current = new EditorView({
      state,
      parent: editorHostRef.current,
    });

    editorViewRef.current.scrollDOM.addEventListener("scroll", handleManualScroll, {
      passive: true,
    });
    if (note.body.trim().length === 0) {
      editorViewRef.current.focus();
    }

    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.scrollDOM.removeEventListener("scroll", handleManualScroll);
      }
      flushPendingSave();
    };
  }, [note, flushPendingSave, handleManualScroll, queueSave, scheduleTypewriterScroll]);

  useEffect(() => {
    if (!note) return;
    if (!editorViewRef.current) return;
    const currentDoc = editorViewRef.current.state.doc.toString();
    if (note.body === currentDoc) return;
    if (note.body === lastBodyRef.current) return;
    editorViewRef.current.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: note.body },
    });
    lastBodyRef.current = note.body;
  }, [note]);

  useEffect(() => {
    if (!editorViewRef.current) return;
    const nextExtension = focusMode ? focusFieldRef.current : [];
    editorViewRef.current.dispatch({
      effects: focusCompartmentRef.current.reconfigure(nextExtension),
    });
  }, [focusMode]);

  useEffect(() => {
    if (!editorViewRef.current) return;
    updateViewportHeight();
    const viewport = window.visualViewport;
    const handleResize = () => {
      updateViewportHeight();
      pendingViewportSnapRef.current = true;
      if (viewportSettleTimerRef.current) {
        window.clearTimeout(viewportSettleTimerRef.current);
      }
      viewportSettleTimerRef.current = window.setTimeout(() => {
        viewportSettleTimerRef.current = null;
        if (!editorViewRef.current) return;
        if (!pendingViewportSnapRef.current) return;
        pendingViewportSnapRef.current = false;
        scheduleTypewriterScroll(editorViewRef.current);
      }, VIEWPORT_SETTLE_MS);
    };

    if (viewport) {
      viewport.addEventListener("resize", handleResize);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      if (viewport) {
        viewport.removeEventListener("resize", handleResize);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, [scheduleTypewriterScroll, updateViewportHeight]);

  const title = useMemo(() => (note ? getDerivedTitle(note) : ""), [note]);
  const editorFontSize = FONT_SIZE_MAP[fontSize] ?? FONT_SIZE_MAP.default;

  useEffect(() => {
    if (!note) {
      clearHeaderTitle();
      return;
    }
    setHeaderTitle(title);
    return () => {
      clearHeaderTitle();
    };
  }, [note, title, setHeaderTitle, clearHeaderTitle]);

  useEffect(() => {
    setHeaderStatus(saveStatus);
    return () => {
      clearHeaderStatus();
    };
  }, [saveStatus, setHeaderStatus, clearHeaderStatus]);

  if (!note && hasHydrated && loadedNoteId === noteId) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.notFound}>
            <div className={styles.notFoundTitle}>Note not found</div>
            <Link href="/knowledge/notes" className={styles.notFoundAction}>
              Back to notes
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section
          className={styles.editorWrap}
          style={{ "--editor-font-size": editorFontSize }}
        >
          <div className={styles.editor} ref={editorHostRef} />
        </section>
      </main>
    </div>
  );
}
