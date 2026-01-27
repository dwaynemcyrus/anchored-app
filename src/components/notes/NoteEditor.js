"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Compartment, EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { minimalSetup } from "codemirror";
import { getDerivedTitle, useDocumentsStore } from "../../store/documentsStore";
import { useShellHeaderStore } from "../../store/shellHeaderStore";
import { useEditorSettingsStore } from "../../store/editorSettingsStore";
import { wikiLinkAutocomplete } from "../../lib/editor/wikiLinkAutocomplete";
import { wikiLinkDecorations } from "../../lib/editor/wikiLinkDecorations";
import { wikiLinkClickHandler } from "../../lib/editor/wikiLinkClickHandler";
import { getDocumentsRepo } from "../../lib/repo/getDocumentsRepo";
import {
  prepareTemplateForInsertion,
  mergeFrontmatter,
  parseFrontmatterBlock,
  serializeFrontmatter,
} from "../../lib/templates";
import TemplatePicker from "../templates/TemplatePicker";
import styles from "../../styles/noteEditor.module.css";

const SAVED_LABEL = "Saved";
const SAVING_LABEL = "Saving...";
const SAVE_FAILED_LABEL = "Save failed";
const TYPEWRITER_OFFSET = 0.5;
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

export default function NoteEditor({ documentId }) {
  const router = useRouter();
  const hydrate = useDocumentsStore((state) => state.hydrate);
  const loadDocument = useDocumentsStore((state) => state.loadDocument);
  const hasHydrated = useDocumentsStore((state) => state.hasHydrated);
  const updateDocumentBody = useDocumentsStore((state) => state.updateDocumentBody);
  const restoreDocument = useDocumentsStore((state) => state.restoreDocument);
  const document = useDocumentsStore((state) => state.documentsById[documentId]);
  const setHeaderTitle = useShellHeaderStore((state) => state.setTitle);
  const clearHeaderTitle = useShellHeaderStore((state) => state.clearTitle);
  const setHeaderStatus = useShellHeaderStore((state) => state.setStatus);
  const clearHeaderStatus = useShellHeaderStore((state) => state.clearStatus);
  const hydrateEditorSettings = useEditorSettingsStore((state) => state.hydrate);
  const focusMode = useEditorSettingsStore((state) => state.focusMode);
  const fontSize = useEditorSettingsStore((state) => state.fontSize);

  const editorHostRef = useRef(null);
  const editorViewRef = useRef(null);
  const lastBodyRef = useRef("");
  const pendingBodyRef = useRef("");
  const saveRequestIdRef = useRef(0);
  const saveTimerRef = useRef(null);
  const manualScrollRef = useRef(false);
  const manualScrollTimerRef = useRef(null);
  const typewriterScrollRef = useRef(false);
  const focusCompartmentRef = useRef(new Compartment());
  const focusFieldRef = useRef(createFocusField());

  const [saveStatus, setSaveStatus] = useState(SAVED_LABEL);
  const [loadedDocumentId, setLoadedDocumentId] = useState(null);
  const [showInsertPicker, setShowInsertPicker] = useState(false);
  const isTrashed = document?.deletedAt != null;

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
  }, [documentId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (manualScrollTimerRef.current) {
        window.clearTimeout(manualScrollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    loadDocument(documentId).then(() => {
      if (isActive) {
        setLoadedDocumentId(documentId);
      }
    });
    return () => {
      isActive = false;
    };
  }, [loadDocument, documentId]);

  const runSave = useCallback(
    async (body, requestId) => {
      const result = await updateDocumentBody(documentId, body);
      if (requestId !== saveRequestIdRef.current) return;
      if (result?.success) {
        setSaveStatus(SAVED_LABEL);
      } else {
        console.error("Failed to save document", result?.error);
        setSaveStatus(SAVE_FAILED_LABEL);
      }
    },
    [documentId, updateDocumentBody]
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
    }, 1200);
  }, []);

  const destroyEditor = useCallback(() => {
    if (!editorViewRef.current) return;
    editorViewRef.current.scrollDOM.removeEventListener("scroll", handleManualScroll);
    editorViewRef.current.destroy();
    editorViewRef.current = null;
  }, [handleManualScroll]);

  const applyTypewriterScroll = useCallback((view) => {
    if (manualScrollRef.current) return;
    const pos = view.state.selection.main.head;
    const coords = view.coordsAtPos(pos);
    if (!coords) return;
    const scroller = view.scrollDOM;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetTop =
      scroller.scrollTop + (coords.top - scrollerRect.top) - scroller.clientHeight * TYPEWRITER_OFFSET;
    const maxTop = scroller.scrollHeight - scroller.clientHeight;
    const nextTop = Math.max(0, Math.min(targetTop, maxTop));
    if (Math.abs(nextTop - scroller.scrollTop) < 1) return;
    typewriterScrollRef.current = true;
    scroller.scrollTo({ top: nextTop });
    window.requestAnimationFrame(() => {
      typewriterScrollRef.current = false;
    });
  }, []);

  // Keyboard shortcut for inserting template (Cmd/Ctrl+Shift+T)
  useEffect(() => {
    if (isTrashed || !document) return;

    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "t") {
        e.preventDefault();
        setShowInsertPicker(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTrashed, document]);

  // Handle template insertion
  const handleInsertTemplate = useCallback(
    (template) => {
      setShowInsertPicker(false);
      if (!editorViewRef.current || !document) return;

      const view = editorViewRef.current;
      const currentDoc = view.state.doc.toString();
      const cursorPos = view.state.selection.main.head;

      // Prepare template content
      const { frontmatter: templateFm, content: templateContent } = prepareTemplateForInsertion(template);

      // Parse current document frontmatter
      const fmMatch = currentDoc.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      let existingFm = {};
      let bodyWithoutFm = currentDoc;
      let fmEndPos = 0;

      if (fmMatch) {
        existingFm = parseFrontmatterBlock(fmMatch[1]);
        bodyWithoutFm = fmMatch[2] || "";
        fmEndPos = currentDoc.indexOf(fmMatch[2] || "") || currentDoc.length;
        if (fmEndPos < 0) fmEndPos = currentDoc.length;
      }

      // Merge frontmatter
      const mergedFm = mergeFrontmatter(existingFm, templateFm);
      const newFmString = serializeFrontmatter(mergedFm);

      // Calculate insertion position relative to body (after frontmatter)
      let insertionPosInBody = cursorPos - fmEndPos;
      if (insertionPosInBody < 0) insertionPosInBody = 0;

      // Insert template content at cursor in body
      const beforeCursor = bodyWithoutFm.slice(0, insertionPosInBody);
      const afterCursor = bodyWithoutFm.slice(insertionPosInBody);
      const newBody = beforeCursor + templateContent + afterCursor;

      // Reconstruct full document
      const newDoc = `---\n${newFmString}\n---\n${newBody}`;

      // Apply changes
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: newDoc },
      });
    },
    [document]
  );

  useEffect(() => {
    if (isTrashed) {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      destroyEditor();
      return;
    }
    if (!document) return;
    if (!editorHostRef.current) return;
    if (editorViewRef.current) return;

    lastBodyRef.current = document.body;
    pendingBodyRef.current = document.body;

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const nextBody = update.state.doc.toString();
      if (nextBody === lastBodyRef.current) return;
      lastBodyRef.current = nextBody;
      queueSave(nextBody);
      applyTypewriterScroll(update.view);
    });

    // Wiki-link callbacks
    const getDocs = async () => {
      const repo = getDocumentsRepo();
      return repo.getDocsForLinkSearch({ includeArchived: false });
    };

    const onCreateDoc = async (title) => {
      const repo = getDocumentsRepo();
      return repo.createDocFromTitle(title);
    };

    // Wiki-link click handling
    const resolveLink = async (target) => {
      const repo = getDocumentsRepo();
      // Try slug first
      const bySlug = await repo.getBySlug(target);
      if (bySlug && bySlug.deletedAt == null) return bySlug;
      // Then try exact title
      const byTitle = await repo.findDocByExactTitle(target);
      if (byTitle && byTitle.deletedAt == null) return byTitle;
      return null;
    };

    const onNavigate = (doc) => {
      router.push(`/knowledge/notes/${doc.id}`);
    };

    const onCreateAndNavigate = async (target) => {
      const repo = getDocumentsRepo();
      const doc = await repo.createDocFromTitle(target);
      router.push(`/knowledge/notes/${doc.id}`);
    };

    const state = EditorState.create({
      doc: document.body,
      extensions: [
        minimalSetup,
        markdown(),
        EditorView.lineWrapping,
        focusCompartmentRef.current.of([]),
        wikiLinkAutocomplete({ getDocs, onCreateDoc }),
        wikiLinkDecorations(),
        wikiLinkClickHandler({ onNavigate, onCreateAndNavigate, resolveLink }),
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
    if (document.body.trim().length === 0) {
      editorViewRef.current.focus();
    }

    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.scrollDOM.removeEventListener("scroll", handleManualScroll);
      }
      flushPendingSave();
    };
  }, [
    document,
    isTrashed,
    applyTypewriterScroll,
    destroyEditor,
    flushPendingSave,
    handleManualScroll,
    queueSave,
    router,
  ]);

  useEffect(() => {
    if (!document) return;
    if (!editorViewRef.current) return;
    const currentDoc = editorViewRef.current.state.doc.toString();
    if (document.body === currentDoc) return;
    if (document.body === lastBodyRef.current) return;
    editorViewRef.current.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: document.body },
    });
    lastBodyRef.current = document.body;
  }, [document]);

  useEffect(() => {
    if (!editorViewRef.current) return;
    const nextExtension = focusMode ? focusFieldRef.current : [];
    editorViewRef.current.dispatch({
      effects: focusCompartmentRef.current.reconfigure(nextExtension),
    });
  }, [focusMode]);

  const title = useMemo(() => (document ? getDerivedTitle(document) : ""), [document]);
  const editorFontSize = FONT_SIZE_MAP[fontSize] ?? FONT_SIZE_MAP.default;

  useEffect(() => {
    if (!document) {
      clearHeaderTitle();
      return;
    }
    setHeaderTitle(title);
    return () => {
      clearHeaderTitle();
    };
  }, [document, title, setHeaderTitle, clearHeaderTitle]);

  useEffect(() => {
    setHeaderStatus(saveStatus);
    return () => {
      clearHeaderStatus();
    };
  }, [saveStatus, setHeaderStatus, clearHeaderStatus]);

  if (!document && hasHydrated && loadedDocumentId === documentId) {
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
        {document && isTrashed ? (
          <div className={styles.trashBanner} role="status">
            <div className={styles.trashBannerText}>This note is in Trash.</div>
            <div className={styles.trashBannerActions}>
              <button
                type="button"
                className={styles.trashBannerButton}
                onClick={() => restoreDocument(document.id)}
              >
                Restore
              </button>
              <Link href="/knowledge/notes" className={styles.trashBannerLink}>
                Back to notes
              </Link>
            </div>
          </div>
        ) : null}
        <section
          className={styles.editorWrap}
          style={{ "--editor-font-size": editorFontSize }}
        >
          {document && isTrashed ? (
            <div className={styles.trashedContent}>
              {document.body || "This note is empty."}
            </div>
          ) : (
            <div className={styles.editor} ref={editorHostRef} />
          )}
        </section>
      </main>

      <TemplatePicker
        isOpen={showInsertPicker}
        mode="insert"
        onSelect={handleInsertTemplate}
        onCancel={() => setShowInsertPicker(false)}
      />
    </div>
  );
}
