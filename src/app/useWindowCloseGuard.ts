import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

type CloseGuardDocument = {
  id: string;
  relativePath?: string;
  savedSourceText?: string;
  saveState?: "unsaved" | "saved" | "saving" | "conflict" | "error";
  sourceText?: string;
};

function hasUnfinishedEdits(document: CloseGuardDocument): boolean {
  return (
    !document.relativePath ||
    (document.saveState ?? "saved") !== "saved" ||
    (document.sourceText !== undefined &&
      document.sourceText !== document.savedSourceText)
  );
}

function cannotSaveDuringClose(document: CloseGuardDocument): boolean {
  return (
    document.saveState === "saving" ||
    document.saveState === "conflict" ||
    document.saveState === "error" ||
    (document.sourceText === undefined && hasUnfinishedEdits(document))
  );
}

type UseWindowCloseGuardOptions = {
  documents: CloseGuardDocument[];
  onBlocked: (message: string) => void;
  saveDocument: (documentId: string) => Promise<void>;
};

/** Keeps the main window open until each saveable dirty document is durable. */
export function useWindowCloseGuard({
  documents,
  onBlocked,
  saveDocument,
}: UseWindowCloseGuardOptions): void {
  const documentsRef = useRef(documents);
  const onBlockedRef = useRef(onBlocked);
  const saveDocumentRef = useRef(saveDocument);
  const closeInFlightRef = useRef(false);
  const allowCloseRef = useRef(false);

  documentsRef.current = documents;
  onBlockedRef.current = onBlocked;
  saveDocumentRef.current = saveDocument;

  useEffect(() => {
    const windowHandle = getCurrentWindow();
    const closePromise = windowHandle.onCloseRequested((event) => {
      if (allowCloseRef.current) return;

      const unfinishedDocuments =
        documentsRef.current.filter(hasUnfinishedEdits);
      if (unfinishedDocuments.length === 0) return;

      event.preventDefault();
      if (closeInFlightRef.current) return;

      if (unfinishedDocuments.some(cannotSaveDuringClose)) {
        onBlockedRef.current(
          "Resolve note save problems before closing Anchored.",
        );
        return;
      }

      closeInFlightRef.current = true;
      void Promise.all(
        unfinishedDocuments.map((document) =>
          saveDocumentRef.current(document.id),
        ),
      )
        .then(
          () =>
            new Promise<void>((resolve) => {
              window.setTimeout(resolve, 0);
            }),
        )
        .then(() => {
          if (documentsRef.current.some(hasUnfinishedEdits)) {
            onBlockedRef.current(
              "Anchored could not safely close because some note changes still need attention.",
            );
            return;
          }

          allowCloseRef.current = true;
          void windowHandle.close().catch(() => {
            allowCloseRef.current = false;
          });
        })
        .finally(() => {
          closeInFlightRef.current = false;
        });
    });

    return () => {
      void closePromise.then((unlisten) => unlisten());
    };
  }, []);
}
