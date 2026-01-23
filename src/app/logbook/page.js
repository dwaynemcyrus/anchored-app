"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDocumentsRepo } from "@/lib/repo/getDocumentsRepo";
import { deriveDocumentTitle } from "@/lib/documents/deriveTitle";
import styles from "../../styles/logbook.module.css";

export default function LogbookPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(null);

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

  useEffect(() => {
    loadTrashed();
  }, [loadTrashed]);

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
    try {
      const repo = getDocumentsRepo();
      await repo.delete(id);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    } catch (err) {
      console.error("Failed to delete document:", err);
    } finally {
      setProcessing(null);
    }
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

  if (documents.length === 0) {
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
          <div className={styles.count}>{documents.length} trashed</div>
        </header>

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
                    onClick={() => handleDelete(doc.id)}
                    disabled={isProcessing}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
