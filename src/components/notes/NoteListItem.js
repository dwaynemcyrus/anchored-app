import Link from "next/link";
import { getDerivedTitle } from "../../store/documentsStore";
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

export default function NoteListItem({ document }) {
  return (
    <Link href={`/knowledge/notes/${document.id}`} className={styles.listItem}>
      <div className={styles.listItemTitle}>{getDerivedTitle(document)}</div>
      <div className={styles.listItemMeta}>{formatUpdatedAt(document.updatedAt)}</div>
    </Link>
  );
}
