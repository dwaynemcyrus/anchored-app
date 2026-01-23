"use client";

import { useState, useEffect, useCallback } from "react";
import { getDocumentsRepo } from "@/lib/repo/getDocumentsRepo";
import { useDocumentsStore } from "@/store/documentsStore";

/**
 * Hook for managing inbox notes in the inbox processing wizard.
 *
 * Provides:
 * - Loading and sorting of inbox notes (oldest first)
 * - Current note tracking
 * - Actions: process (keep), archive, trash
 * - Optimistic updates with error recovery
 */
export function useInboxDocuments() {
  const [documents, setDocuments] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const decrementInboxCount = useDocumentsStore((state) => state.decrementInboxCount);
  const loadDocument = useDocumentsStore((state) => state.loadDocument);
  const inboxVersion = useDocumentsStore((state) => state.inboxVersion);

  const currentDocument = documents[currentIndex] ?? null;
  const remaining = documents.length - currentIndex;
  const isEmpty = !loading && documents.length === 0;
  const isComplete = !loading && currentIndex >= documents.length && documents.length > 0;

  // Load inbox documents
  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const repo = getDocumentsRepo();
      const inboxDocs = await repo.listInboxNotes();
      setDocuments(inboxDocs);
      setCurrentIndex(0);
    } catch (err) {
      console.error("Failed to load inbox documents:", err);
      setError(err.message || "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh inbox list without resetting position
  const refreshInbox = useCallback(async () => {
    try {
      const repo = getDocumentsRepo();
      const inboxDocs = await repo.listInboxNotes();
      setDocuments(inboxDocs);
    } catch (err) {
      console.error("Failed to refresh inbox documents:", err);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  // Refresh when new inbox items are added (inboxVersion changes)
  useEffect(() => {
    if (inboxVersion > 0) {
      refreshInbox();
    }
  }, [inboxVersion, refreshInbox]);

  // Advance to next note
  const advance = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
    setActionError(null);
  }, []);

  // Process (Keep) - changes type to note, persists title changes
  const processDocument = useCallback(
    async (updates = {}) => {
      if (!currentDocument || processing) return { success: false };
      setProcessing(true);
      setActionError(null);

      try {
        const repo = getDocumentsRepo();
        await repo.update(currentDocument.id, {
          ...updates,
          type: "staged",
          meta: { ...(currentDocument.meta || {}), status: "backlog" },
        });
        decrementInboxCount();
        // Load the processed document into the store so it appears in notes list
        await loadDocument(currentDocument.id);
        advance();
        return { success: true };
      } catch (err) {
        console.error("Failed to process document:", err);
        setActionError(err.message || "Failed to process document");
        return { success: false, error: err.message };
      } finally {
        setProcessing(false);
      }
    },
    [currentDocument, processing, advance, decrementInboxCount, loadDocument]
  );

  // Trash - sets deletedAt and clears inboxAt
  const trashDocument = useCallback(async () => {
    if (!currentDocument || processing) return { success: false };
    setProcessing(true);
    setActionError(null);

    try {
      const repo = getDocumentsRepo();
      await repo.trash(currentDocument.id);
      decrementInboxCount();
      advance();
      return { success: true };
    } catch (err) {
      console.error("Failed to trash document:", err);
      setActionError(err.message || "Failed to trash document");
      return { success: false, error: err.message };
    } finally {
      setProcessing(false);
    }
  }, [currentDocument, processing, advance, decrementInboxCount]);

  // Skip current note (if it was deleted externally)
  const skipCurrent = useCallback(() => {
    advance();
  }, [advance]);

  // Reload inbox
  const reload = useCallback(() => {
    loadInbox();
  }, [loadInbox]);

  return {
    // State
    documents,
    currentDocument,
    currentIndex,
    remaining,
    loading,
    error,
    actionError,
    processing,
    isEmpty,
    isComplete,

    // Actions
    processDocument,
    trashDocument,
    skipCurrent,
    reload,
  };
}

// Deprecated alias for backward compatibility
// @deprecated Use useInboxDocuments instead
export const useInboxNotes = useInboxDocuments;
