"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getDocumentsRepo } from "@/lib/repo/getDocumentsRepo";
import {
  getTodaySlug,
  getTodayDateString,
  buildDailyNoteInput,
} from "@/lib/daily/dailyNote";

/**
 * Hook for managing the Today note.
 *
 * Provides:
 * - openToday: find-or-create today's daily note and navigate to it
 * - todaySlug: current day's slug
 * - loading: whether an operation is in progress
 * - error: error message if operation failed
 */
export function useTodayNote() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const todaySlug = getTodaySlug();
  const todayDateString = getTodayDateString();

  const openToday = useCallback(async () => {
    if (loading) return { success: false };
    setLoading(true);
    setError(null);

    try {
      const repo = getDocumentsRepo();
      const slug = getTodaySlug();

      // Try to find existing daily note
      let doc = await repo.getBySlug(slug);

      // Create if not found
      if (!doc) {
        const dateString = getTodayDateString();
        const input = buildDailyNoteInput(dateString);
        doc = await repo.create(input);
      }

      // Navigate to the note
      router.push(`/knowledge/notes/${doc.id}`);
      return { success: true, id: doc.id };
    } catch (err) {
      console.error("Failed to open today note:", err);
      setError(err.message || "Failed to open today note");
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [loading, router]);

  return {
    openToday,
    todaySlug,
    todayDateString,
    loading,
    error,
  };
}
