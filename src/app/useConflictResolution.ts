import { useCallback, useMemo, useState } from "react";

export type ConflictResolutionApi = {
  closeConflictResolution: () => void;
  conflictResolutionDocumentId: string | undefined;
  openConflictResolution: (documentId: string) => void;
  reset: () => void;
};

/// Owns which document's conflict-resolution dialog is open. The actual
/// merge/resolve/reload logic stays in App.tsx because it is shared with the
/// non-dialog "Reload external version" action and mutates the shared
/// documents list; this hook only tracks dialog visibility and target. The
/// returned object is memoized so callers that list it as a dependency (see
/// useSidebarState for why) do not recreate on every render.
export function useConflictResolution(): ConflictResolutionApi {
  const [conflictResolutionDocumentId, setConflictResolutionDocumentId] =
    useState<string>();

  const openConflictResolution = useCallback((documentId: string) => {
    setConflictResolutionDocumentId(documentId);
  }, []);

  const closeConflictResolution = useCallback(() => {
    setConflictResolutionDocumentId(undefined);
  }, []);

  const reset = useCallback(() => {
    setConflictResolutionDocumentId(undefined);
  }, []);

  return useMemo(
    () => ({
      closeConflictResolution,
      conflictResolutionDocumentId,
      openConflictResolution,
      reset,
    }),
    [
      closeConflictResolution,
      conflictResolutionDocumentId,
      openConflictResolution,
      reset,
    ],
  );
}
