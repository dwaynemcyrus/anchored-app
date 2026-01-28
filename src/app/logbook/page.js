"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDocumentsRepo } from "@/lib/repo/getDocumentsRepo";
import { deriveDocumentTitle } from "@/lib/documents/deriveTitle";
import { deleteDocument } from "@/lib/sync/syncManager";
import { listTimeEntries } from "@/lib/supabase/timeEntries";
import { listActivities } from "@/lib/supabase/activities";
import styles from "../../styles/logbook.module.css";

export default function LogbookPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [activitiesById, setActivitiesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmingTitle, setConfirmingTitle] = useState("");
  const [view, setView] = useState("trash");
  const [tick, setTick] = useState(Date.now());

  const loadTrashed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const repo = getDocumentsRepo();
      const trashed = await repo.listTrashed();
      setDocuments(trashed);
    } catch (err) {
      console.error("Failed to load trashed documents:", err);
      setError(err.message || "Failed to load trashed items");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTimeEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 7);
      const [entries, activities] = await Promise.all([
        listTimeEntries({ start, end, limit: 200 }),
        listActivities({ status: "active", limit: 200 }),
      ]);
      const activityMap = activities.reduce((acc, activity) => {
        acc[activity.id] = activity;
        return acc;
      }, {});
      setActivitiesById(activityMap);
      setTimeEntries(entries || []);
    } catch (err) {
      console.error("Failed to load time entries:", err);
      setError(err.message || "Failed to load time entries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "trash") {
      loadTrashed();
    } else {
      loadTimeEntries();
    }
  }, [loadTimeEntries, loadTrashed, view]);

  useEffect(() => {
    if (view !== "time") return undefined;
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [view]);

  const handleRestore = async (id) => {
    if (processing) return;
    setProcessing(id);
    try {
      const repo = getDocumentsRepo();
      await repo.restore(id);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    } catch (err) {
      console.error("Failed to restore document:", err);
    } finally {
      setProcessing(null);
    }
  };

  const handleDelete = async (id) => {
    if (processing) return;
    setProcessing(id);
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    try {
      await deleteDocument(id);
    } catch (err) {
      console.error("Failed to delete document:", err);
    } finally {
      setProcessing(null);
    }
  };

  const openDeleteConfirm = (doc) => {
    setConfirmingId(doc.id);
    setConfirmingTitle(deriveDocumentTitle(doc));
  };

  const closeDeleteConfirm = () => {
    setConfirmingId(null);
    setConfirmingTitle("");
  };

  const confirmDelete = () => {
    if (!confirmingId) return;
    const id = confirmingId;
    closeDeleteConfirm();
    handleDelete(id);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };

  const formatDuration = (durationMs, startedAt, endedAt, isLive = false) => {
    const fallback =
      startedAt && endedAt
        ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
        : 0;
    const base = typeof durationMs === "number" && durationMs >= 0 ? durationMs : fallback;
    const value = isLive && startedAt
      ? base + Math.max(0, tick - new Date(startedAt).getTime())
      : base;
    const totalSeconds = Math.floor(value / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, "0");
    return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  };

  const getEntryLabel = (entry) => {
    if (!entry) return "Untitled";
    if (entry.entity_type === "activity") {
      return activitiesById[entry.entity_id]?.name || "Activity";
    }
    return entry.entity_type || "Item";
  };

  const getEntrySubtitle = (entry) => {
    if (!entry) return "";
    return entry.entity_id ? `ID · ${entry.entity_id.slice(0, 6)}` : "";
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <button
                className={styles.backButton}
                onClick={() => router.back()}
                aria-label="Go back"
              >
                &larr;
              </button>
              <h1 className={styles.title}>Logbook</h1>
            </div>
          </header>
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading...</span>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <button
                className={styles.backButton}
                onClick={() => router.back()}
                aria-label="Go back"
              >
                &larr;
              </button>
              <h1 className={styles.title}>Logbook</h1>
            </div>
          </header>
          <div className={styles.errorState}>
            {error}
            <button onClick={loadTrashed} style={{ marginLeft: 12 }}>
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (view === "trash" && documents.length === 0) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <button
                className={styles.backButton}
                onClick={() => router.back()}
                aria-label="Go back"
              >
                &larr;
              </button>
              <h1 className={styles.title}>Logbook</h1>
            </div>
            <div className={styles.segmentedControl}>
              <button
                type="button"
                className={`${styles.segmentButton} ${
                  view === "trash" ? styles.segmentButtonActive : ""
                }`}
                onClick={() => setView("trash")}
              >
                Trash
              </button>
              <button
                type="button"
                className={`${styles.segmentButton} ${
                  view === "time" ? styles.segmentButtonActive : ""
                }`}
                onClick={() => setView("time")}
              >
                Time Logs
              </button>
            </div>
          </header>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>&#128465;</div>
            <div className={styles.emptyTitle}>No trashed items</div>
            <div className={styles.emptyDescription}>
              Items you delete will appear here.
            </div>
            <Link href="/" className={styles.emptyAction}>
              Back to Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (view === "time" && timeEntries.length === 0) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <button
                className={styles.backButton}
                onClick={() => router.back()}
                aria-label="Go back"
              >
                &larr;
              </button>
              <h1 className={styles.title}>Logbook</h1>
            </div>
            <div className={styles.segmentedControl}>
              <button
                type="button"
                className={`${styles.segmentButton} ${
                  view === "trash" ? styles.segmentButtonActive : ""
                }`}
                onClick={() => setView("trash")}
              >
                Trash
              </button>
              <button
                type="button"
                className={`${styles.segmentButton} ${
                  view === "time" ? styles.segmentButtonActive : ""
                }`}
                onClick={() => setView("time")}
              >
                Time Logs
              </button>
            </div>
          </header>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>&#9201;</div>
            <div className={styles.emptyTitle}>No time logs</div>
            <div className={styles.emptyDescription}>
              Start a timer to create your first entry.
            </div>
            <Link href="/focus" className={styles.emptyAction}>
              Start a timer
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
          <div className={styles.headerLeft}>
            <button
              className={styles.backButton}
              onClick={() => router.back()}
              aria-label="Go back"
            >
              &larr;
            </button>
            <h1 className={styles.title}>Logbook</h1>
          </div>
          <div className={styles.segmentedControl}>
            <button
              type="button"
              className={`${styles.segmentButton} ${
                view === "trash" ? styles.segmentButtonActive : ""
              }`}
              onClick={() => setView("trash")}
            >
              Trash
            </button>
            <button
              type="button"
              className={`${styles.segmentButton} ${
                view === "time" ? styles.segmentButtonActive : ""
              }`}
              onClick={() => setView("time")}
            >
              Time Logs
            </button>
          </div>
          <div className={styles.count}>
            {view === "trash" ? `${documents.length} trashed` : `${timeEntries.length} entries`}
          </div>
        </header>

        {view === "trash" ? (
          <ul className={styles.list}>
            {documents.map((doc) => {
              const title = deriveDocumentTitle(doc);
              const isProcessing = processing === doc.id;
              return (
                <li key={doc.id} className={styles.listItem}>
                  <div className={styles.itemContent}>
                    <div className={styles.itemHeader}>
                      <span className={styles.itemTitle}>{title}</span>
                      <span className={styles.itemMeta}>
                        <span className={styles.itemType}>{doc.type}</span>
                        <span className={styles.itemDate}>
                          {formatDate(doc.deletedAt)}
                        </span>
                      </span>
                    </div>
                    {doc.body && (
                      <div className={styles.itemPreview}>
                        {doc.body.slice(0, 100)}
                        {doc.body.length > 100 ? "..." : ""}
                      </div>
                    )}
                  </div>
                  <div className={styles.itemActions}>
                    <button
                      className={styles.restoreButton}
                      onClick={() => handleRestore(doc.id)}
                      disabled={isProcessing}
                    >
                      Restore
                    </button>
                    <button
                      className={styles.deleteButton}
                      onClick={() => openDeleteConfirm(doc)}
                      disabled={isProcessing}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className={styles.list}>
            {timeEntries.map((entry) => (
              <li key={entry.id} className={styles.listItem}>
                <div className={styles.itemContent}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemTitle}>{getEntryLabel(entry)}</span>
                    <span className={styles.itemMeta}>
                      <span className={styles.itemType}>
                        {getEntrySubtitle(entry) || entry.entity_type}
                      </span>
                      <span className={styles.itemDate}>
                        {formatDate(entry.started_at)}
                      </span>
                    </span>
                  </div>
                  <div className={styles.itemPreview}>
                    Duration: {formatDuration(entry.duration_ms, entry.started_at, entry.ended_at, !entry.ended_at)}
                  </div>
                  {entry.note ? (
                    <div className={styles.itemPreview}>
                      {entry.note}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      {confirmingId ? (
        <div className={styles.modalBackdrop} role="presentation">
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="logbook-delete-title"
          >
            <h2 className={styles.modalTitle} id="logbook-delete-title">
              Delete permanently?
            </h2>
            <p className={styles.modalBody}>
              This will remove “{confirmingTitle || "Untitled"}” from all devices.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={closeDeleteConfirm}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
