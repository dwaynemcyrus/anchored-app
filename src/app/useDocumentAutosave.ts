import { useEffect, useRef } from "react";

type AutosaveDocument = {
  id: string;
  relativePath?: string;
  savedSourceText?: string;
  saveState?: "unsaved" | "saved" | "saving" | "conflict" | "error";
  sourceText?: string;
};

function needsAutosave(document: AutosaveDocument): boolean {
  return (
    document.relativePath !== undefined &&
    document.sourceText !== undefined &&
    document.savedSourceText !== undefined &&
    document.sourceText !== document.savedSourceText &&
    document.saveState === "unsaved"
  );
}

/**
 * Schedules an independent save for every dirty, persisted document.
 *
 * The timer deliberately calls the latest save function. A newer edit made
 * while the timer is pending is therefore saved as part of the same request.
 */
export function useDocumentAutosave(
  documents: AutosaveDocument[],
  saveDocument: (documentId: string) => Promise<void>,
  delayMs = 1_000,
): void {
  const saveDocumentRef = useRef(saveDocument);
  const timersRef = useRef(new Map<string, number>());

  useEffect(() => {
    saveDocumentRef.current = saveDocument;
  }, [saveDocument]);

  useEffect(() => {
    const pendingDocumentIds = new Set<string>();

    for (const document of documents) {
      if (!needsAutosave(document)) continue;
      pendingDocumentIds.add(document.id);
      if (timersRef.current.has(document.id)) continue;

      const timeout = window.setTimeout(() => {
        timersRef.current.delete(document.id);
        void saveDocumentRef.current(document.id);
      }, delayMs);
      timersRef.current.set(document.id, timeout);
    }

    for (const [documentId, timeout] of timersRef.current) {
      if (pendingDocumentIds.has(documentId)) continue;
      window.clearTimeout(timeout);
      timersRef.current.delete(documentId);
    }
  }, [delayMs, documents]);

  useEffect(
    () => () => {
      for (const timeout of timersRef.current.values()) {
        window.clearTimeout(timeout);
      }
      timersRef.current.clear();
    },
    [],
  );
}
