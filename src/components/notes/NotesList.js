"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useNotesStore } from "../../store/notesStore";
import NoteListItem from "./NoteListItem";
import styles from "../../styles/notesList.module.css";

export default function NotesList() {
  const router = useRouter();
  const notes = useNotesStore((state) => state.notes);
  const hydrate = useNotesStore((state) => state.hydrate);
  const createNote = useNotesStore((state) => state.createNote);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const sortedNotes = useMemo(() => notes, [notes]);

  const handleCreate = () => {
    const id = createNote();
    router.push(`/knowledge/notes/${id}`);
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>Notes</h1>
          <button type="button" className={styles.newButton} onClick={handleCreate}>
            New
          </button>
        </header>
        {sortedNotes.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No notes yet</div>
            <button type="button" className={styles.emptyAction} onClick={handleCreate}>
              Create your first note
            </button>
          </div>
        ) : (
          <section className={styles.list} aria-label="Notes list">
            {sortedNotes.map((note) => (
              <NoteListItem key={note.id} note={note} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
