"use client";

import { useState, useEffect, useCallback } from "react";
import { getDocumentsRepo } from "@/lib/repo/getDocumentsRepo";

/**
 * Hook for managing inbox notes in the inbox processing wizard.
 *
 * Provides:
 * - Loading and sorting of inbox notes (oldest first)
 * - Current note tracking
 * - Actions: process (keep), archive, trash
 * - Optimistic updates with error recovery
 */
export function useInboxNotes() {
  const [notes, setNotes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [processing, setProcessing] = useState(false);

  const currentNote = notes[currentIndex] ?? null;
  const remaining = notes.length - currentIndex;
  const isEmpty = !loading && notes.length === 0;
  const isComplete = !loading && currentIndex >= notes.length && notes.length > 0;

  // Load inbox notes
  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const repo = getDocumentsRepo();
      const inboxNotes = await repo.listInboxNotes();
      setNotes(inboxNotes);
      setCurrentIndex(0);
    } catch (err) {
      console.error("Failed to load inbox notes:", err);
      setError(err.message || "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  // Advance to next note
  const advance = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
    setActionError(null);
  }, []);

  // Process (Keep) - clears inboxAt, persists title changes
  const processNote = useCallback(
    async (updates = {}) => {
      if (!currentNote || processing) return { success: false };
      setProcessing(true);
      setActionError(null);

      try {
        const repo = getDocumentsRepo();
        await repo.update(currentNote.id, {
          ...updates,
          inboxAt: null,
        });
        advance();
        return { success: true };
      } catch (err) {
        console.error("Failed to process note:", err);
        setActionError(err.message || "Failed to process note");
        return { success: false, error: err.message };
      } finally {
        setProcessing(false);
      }
    },
    [currentNote, processing, advance]
  );

  // Archive - sets archivedAt and clears inboxAt
  const archiveNote = useCallback(async () => {
    if (!currentNote || processing) return { success: false };
    setProcessing(true);
    setActionError(null);

    try {
      const repo = getDocumentsRepo();
      await repo.archive(currentNote.id);
      advance();
      return { success: true };
    } catch (err) {
      console.error("Failed to archive note:", err);
      setActionError(err.message || "Failed to archive note");
      return { success: false, error: err.message };
    } finally {
      setProcessing(false);
    }
  }, [currentNote, processing, advance]);

  // Trash - sets deletedAt and clears inboxAt
  const trashNote = useCallback(async () => {
    if (!currentNote || processing) return { success: false };
    setProcessing(true);
    setActionError(null);

    try {
      const repo = getDocumentsRepo();
      await repo.trash(currentNote.id);
      advance();
      return { success: true };
    } catch (err) {
      console.error("Failed to trash note:", err);
      setActionError(err.message || "Failed to trash note");
      return { success: false, error: err.message };
    } finally {
      setProcessing(false);
    }
  }, [currentNote, processing, advance]);

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
    notes,
    currentNote,
    currentIndex,
    remaining,
    loading,
    error,
    actionError,
    processing,
    isEmpty,
    isComplete,

    // Actions
    processNote,
    archiveNote,
    trashNote,
    skipCurrent,
    reload,
  };
}
