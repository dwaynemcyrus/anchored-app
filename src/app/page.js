"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getDocumentsRepo } from "@/lib/repo/getDocumentsRepo";
import { useTodayNote } from "@/hooks/useTodayNote";
import { useWorkbenchStore } from "@/store/workbenchStore";
import { useDocumentsStore } from "@/store/documentsStore";
import { deriveDocumentTitle } from "@/lib/documents/deriveTitle";
import DocumentPickerModal from "@/components/workbench/DocumentPickerModal";
import ReplaceModal from "@/components/workbench/ReplaceModal";
import styles from "../styles/now.module.css";

function formatDisplayDate(dateString) {
  const date = new Date(dateString + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function NowView() {
  const { openToday, todayDateString, loading: todayLoading, error: todayError } = useTodayNote();
  const {
    pinnedIds,
    hydrate: hydrateWorkbench,
    hasHydrated: workbenchHydrated,
    pin,
    unpin,
    replace,
    cleanupInvalidIds,
  } = useWorkbenchStore();

  const inboxCount = useDocumentsStore((state) => state.inboxCount);
  const inboxCountLoaded = useDocumentsStore((state) => state.inboxCountLoaded);
  const loadInboxCount = useDocumentsStore((state) => state.loadInboxCount);

  const [pinnedDocs, setPinnedDocs] = useState([]);
  const [pinnedLoading, setPinnedLoading] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [pendingDoc, setPendingDoc] = useState(null);

  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Hydrate workbench on mount
  useEffect(() => {
    hydrateWorkbench();
  }, [hydrateWorkbench]);

  // Load inbox count from store (excluding daily notes)
  useEffect(() => {
    if (!inboxCountLoaded) {
      loadInboxCount();
    }
  }, [inboxCountLoaded, loadInboxCount]);

  // Load pinned documents when workbench is hydrated or pinnedIds change
  useEffect(() => {
    if (!workbenchHydrated) return;

    async function loadPinnedDocs() {
      if (pinnedIds.length === 0) {
        setPinnedDocs([]);
        setPinnedLoading(false);
        return;
      }

      try {
        const repo = getDocumentsRepo();
        const docs = await Promise.all(
          pinnedIds.map(async (id) => {
            try {
              return await repo.get(id);
            } catch {
              return null;
            }
          })
        );

        // Filter to active docs only (exists, not deleted, not archived)
        // Maintain order from pinnedIds
        const activeDocs = pinnedIds
          .map((id) => docs.find((doc) => doc?.id === id))
          .filter((doc) => doc && doc.deletedAt == null && doc.archivedAt == null);
        setPinnedDocs(activeDocs);

        // Cleanup invalid IDs from settings (missing, deleted, or archived)
        const validIds = activeDocs.map((doc) => doc.id);
        cleanupInvalidIds(validIds);
      } catch (err) {
        console.error("Failed to load pinned docs:", err);
        setPinnedDocs([]);
      } finally {
        setPinnedLoading(false);
      }
    }
    loadPinnedDocs();
  }, [cleanupInvalidIds, pinnedIds, workbenchHydrated]);

  // Handle document selection from picker
  const handleDocumentSelect = useCallback(
    async (doc) => {
      setPickerOpen(false);

      // Get full document if we only have partial data
      let fullDoc = doc;
      if (!doc.body && doc.id) {
        try {
          const repo = getDocumentsRepo();
          fullDoc = await repo.get(doc.id);
        } catch {
          fullDoc = doc;
        }
      }

      const result = pin(fullDoc.id);

      if (result.alreadyPinned) {
        showToast("Already pinned");
        return;
      }

      if (result.needsReplace) {
        setPendingDoc(fullDoc);
        setReplaceModalOpen(true);
        return;
      }

      if (result.success) {
        showToast("Pinned to Workbench");
      }
    },
    [pin, showToast]
  );

  // Handle replace selection
  const handleReplace = useCallback(
    (oldDoc) => {
      if (!pendingDoc) return;

      const oldTitle = deriveDocumentTitle(oldDoc);
      const newTitle = deriveDocumentTitle(pendingDoc);

      const success = replace(oldDoc.id, pendingDoc.id);
      if (success) {
        showToast(`Replaced "${oldTitle}" with "${newTitle}"`);
      }

      setReplaceModalOpen(false);
      setPendingDoc(null);
    },
    [pendingDoc, replace, showToast]
  );

  // Handle unpin
  const handleUnpin = useCallback(
    (doc) => {
      unpin(doc.id);
      showToast("Removed from Workbench");
    },
    [unpin, showToast]
  );

  // Cancel replace modal
  const handleCancelReplace = useCallback(() => {
    setReplaceModalOpen(false);
    setPendingDoc(null);
  }, []);

  const displayDate = formatDisplayDate(todayDateString);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>Now</h1>

        {/* Section A: Today */}
        <section className={styles.section}>
          <div className={styles.todayCard}>
            <div className={styles.todayContent}>
              <span className={styles.todayDate}>{displayDate}</span>
              <span className={styles.todayHint}>Your daily working surface</span>
            </div>
            <button
              className={styles.todayButton}
              onClick={openToday}
              disabled={todayLoading}
            >
              {todayLoading ? "Opening..." : "Open Today"}
            </button>
          </div>
          {todayError && <div className={styles.error}>{todayError}</div>}
        </section>

        {/* Section B: Inbox */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Inbox</h2>
          <Link href="/inbox" className={styles.actionCard}>
            <div className={styles.actionCardContent}>
              <span className={styles.actionCardTitle}>Process Inbox</span>
              <span className={styles.actionCardDescription}>
                Items waiting to be sorted
              </span>
            </div>
            <div className={styles.actionCardRight}>
              {inboxCountLoaded && (
                <span
                  className={`${styles.badge} ${
                    inboxCount === 0 ? styles.badgeEmpty : ""
                  }`}
                >
                  {inboxCount}
                </span>
              )}
              <span className={styles.arrow}>&rarr;</span>
            </div>
          </Link>
        </section>

        {/* Section C: Workbench */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Workbench</h2>
          {pinnedLoading ? (
            <div className={styles.workbenchEmpty}>Loading...</div>
          ) : pinnedDocs.length === 0 ? (
            <div className={styles.workbenchEmpty}>
              No pinned documents yet
            </div>
          ) : (
            <div className={styles.workbenchList}>
              {pinnedDocs.map((doc) => (
                <div key={doc.id} className={styles.workbenchItem}>
                  <Link
                    href={`/knowledge/notes/${doc.id}`}
                    className={styles.workbenchItemLink}
                  >
                    <span className={styles.workbenchItemTitle}>
                      {deriveDocumentTitle(doc)}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className={styles.workbenchItemRemove}
                    onClick={() => handleUnpin(doc)}
                    aria-label="Remove from workbench"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            className={styles.addButton}
            onClick={() => setPickerOpen(true)}
          >
            <span className={styles.addButtonIcon}>+</span>
            Add to Workbench
          </button>
        </section>
      </main>

      {/* Document Picker Modal */}
      <DocumentPickerModal
        isOpen={pickerOpen}
        onSelect={handleDocumentSelect}
        onCancel={() => setPickerOpen(false)}
        excludeIds={pinnedIds}
        title="Add to Workbench"
      />

      {/* Replace Modal */}
      <ReplaceModal
        isOpen={replaceModalOpen}
        pinnedDocs={pinnedDocs}
        newDoc={pendingDoc}
        onReplace={handleReplace}
        onCancel={handleCancelReplace}
      />

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.isError ? styles.toastError : ""}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
