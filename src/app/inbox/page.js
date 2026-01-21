"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useInboxDocuments } from "@/hooks/useInboxNotes";
import { extractTitleFromBody } from "@/lib/inbox/extractTitle";
import { deriveDocumentTitle } from "@/lib/documents/deriveTitle";
import styles from "../../styles/inbox.module.css";

export default function InboxPage() {
  const router = useRouter();
  const {
    currentDocument,
    remaining,
    loading,
    error,
    actionError,
    processing,
    isEmpty,
    isComplete,
    processDocument,
    archiveDocument,
    trashDocument,
    reload,
  } = useInboxDocuments();

  const [editedTitle, setEditedTitle] = useState("");
  const [titleInitialized, setTitleInitialized] = useState(false);

  // Initialize title when current document changes
  if (currentDocument && !titleInitialized) {
    const derivedTitle = deriveDocumentTitle(currentDocument);
    setEditedTitle(derivedTitle === "Untitled" ? "" : derivedTitle);
    setTitleInitialized(true);
  }

  // Reset title state when advancing to next note
  const resetTitleState = useCallback(() => {
    setTitleInitialized(false);
    setEditedTitle("");
  }, []);

  const handleKeep = async () => {
    const updates = {};
    const trimmedTitle = editedTitle.trim();
    if (trimmedTitle) {
      updates.title = trimmedTitle;
    } else {
      updates.title = null;
    }
    const result = await processDocument(updates);
    if (result.success) {
      resetTitleState();
    }
  };

  const handleArchive = async () => {
    const result = await archiveDocument();
    if (result.success) {
      resetTitleState();
    }
  };

  const handleTrash = async () => {
    const result = await trashDocument();
    if (result.success) {
      resetTitleState();
    }
  };

  const handleExtractTitle = () => {
    if (!currentDocument) return;
    const extracted = extractTitleFromBody(currentDocument.body);
    if (extracted) {
      setEditedTitle(extracted);
    }
  };

  // Loading state
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
              <h1 className={styles.title}>Inbox</h1>
            </div>
          </header>
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading inbox...</span>
          </div>
        </main>
      </div>
    );
  }

  // Error state
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
              <h1 className={styles.title}>Inbox</h1>
            </div>
          </header>
          <div className={styles.errorState}>
            {error}
            <button onClick={reload} style={{ marginLeft: 12 }}>
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Empty state
  if (isEmpty || isComplete) {
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
              <h1 className={styles.title}>Inbox</h1>
            </div>
          </header>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>&#10003;</div>
            <div className={styles.emptyTitle}>
              {isComplete ? "All done!" : "Inbox is empty"}
            </div>
            <div className={styles.emptyDescription}>
              {isComplete
                ? "You've processed all your captured notes."
                : "Capture some notes to process them here."}
            </div>
            <Link href="/command" className={styles.emptyAction}>
              Back to Command
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Main wizard view
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
            <h1 className={styles.title}>Inbox</h1>
          </div>
          <div className={styles.remaining}>{remaining} remaining</div>
        </header>

        {actionError && <div className={styles.actionError}>{actionError}</div>}

        <div className={styles.noteCard}>
          <div className={styles.noteHeader}>
            <div className={styles.titleRow}>
              <input
                type="text"
                className={styles.titleInput}
                placeholder="Add a title..."
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                disabled={processing}
              />
              <button
                className={styles.extractButton}
                onClick={handleExtractTitle}
                disabled={processing}
                title="Use first line as title"
              >
                Extract title
              </button>
            </div>
          </div>
          <div className={styles.noteBody}>
            <div className={styles.bodyPreview}>{currentDocument?.body || ""}</div>
          </div>
        </div>

        <div className={styles.actionBar}>
          <button
            className={`${styles.actionButton} ${styles.trashButton}`}
            onClick={handleTrash}
            disabled={processing}
          >
            Trash
          </button>
          <button
            className={`${styles.actionButton} ${styles.archiveButton}`}
            onClick={handleArchive}
            disabled={processing}
          >
            Archive
          </button>
          <button
            className={`${styles.actionButton} ${styles.keepButton}`}
            onClick={handleKeep}
            disabled={processing}
          >
            Keep
          </button>
        </div>
      </main>
    </div>
  );
}
