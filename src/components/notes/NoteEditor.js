"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup } from "codemirror";
import { getDerivedTitle, useNotesStore } from "../../store/notesStore";
import styles from "../../styles/noteEditor.module.css";

const SAVED_LABEL = "Saved";
const SAVING_LABEL = "Saving...";

export default function NoteEditor({ noteId }) {
  const hydrate = useNotesStore((state) => state.hydrate);
  const loadNote = useNotesStore((state) => state.loadNote);
  const hasHydrated = useNotesStore((state) => state.hasHydrated);
  const updateNoteBody = useNotesStore((state) => state.updateNoteBody);
  const note = useNotesStore((state) => state.notesById[noteId]);

  const editorHostRef = useRef(null);
  const editorViewRef = useRef(null);
  const lastBodyRef = useRef("");
  const saveTimerRef = useRef(null);
  const updateTimerRef = useRef(null);

  const [saveStatus, setSaveStatus] = useState(SAVED_LABEL);
  const [loadedNoteId, setLoadedNoteId] = useState(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
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

  const scheduleSavedState = () => {
    setSaveStatus(SAVING_LABEL);
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      setSaveStatus(SAVED_LABEL);
    }, 700);
  };

  useEffect(() => {
    if (!note) return;
    if (!editorHostRef.current) return;
    if (editorViewRef.current) return;

    lastBodyRef.current = note.body;

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const nextBody = update.state.doc.toString();
      if (nextBody === lastBodyRef.current) return;
      lastBodyRef.current = nextBody;
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
      }
      updateTimerRef.current = window.setTimeout(() => {
        updateNoteBody(note.id, nextBody);
        updateTimerRef.current = null;
      }, 500);
      scheduleSavedState();
    });

    const state = EditorState.create({
      doc: note.body,
      extensions: [basicSetup, markdown(), EditorView.lineWrapping, updateListener],
    });

    editorViewRef.current = new EditorView({
      state,
      parent: editorHostRef.current,
    });

    editorViewRef.current.focus();
  }, [note, updateNoteBody]);

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

  const title = useMemo(() => (note ? getDerivedTitle(note) : ""), [note]);

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
        <header className={styles.header}>
          <Link href="/knowledge/notes" className={styles.backLink}>
            Back
          </Link>
          <div className={styles.title}>{title}</div>
          <div className={styles.status}>{saveStatus}</div>
        </header>
        <section className={styles.editorWrap}>
          <div className={styles.editor} ref={editorHostRef} />
        </section>
      </main>
    </div>
  );
}
