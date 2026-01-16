import Link from "next/link";
import { getDerivedTitle } from "../../store/notesStore";
import styles from "../../styles/notesList.module.css";

function formatUpdatedAt(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NoteListItem({ note }) {
  return (
    <Link href={`/knowledge/notes/${note.id}`} className={styles.listItem}>
      <div className={styles.listItemTitle}>{getDerivedTitle(note)}</div>
      <div className={styles.listItemMeta}>{formatUpdatedAt(note.updatedAt)}</div>
    </Link>
  );
}
