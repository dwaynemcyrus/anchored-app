import { useCallback, useRef, useState } from "react";

export type DocumentLoadState =
  | { status: "idle" }
  | { status: "loading"; documentId: string }
  | { status: "error"; documentId: string; message: string };

type LoadTicket = { documentId: string; generation: number; request: number };

type DocumentLoadStates = Record<
  string,
  Exclude<DocumentLoadState, { status: "idle" }>
>;

const idleLoadState: DocumentLoadState = { status: "idle" };

/** Tracks independent document reads without one tab cancelling another. */
export function useDocumentLoadStates() {
  const [loadStates, setLoadStates] = useState<DocumentLoadStates>({});
  const loadStatesRef = useRef(loadStates);
  const requestRef = useRef(new Map<string, number>());
  const generationRef = useRef(0);

  const updateLoadStates = useCallback(
    (update: (current: DocumentLoadStates) => DocumentLoadStates) => {
      const next = update(loadStatesRef.current);
      loadStatesRef.current = next;
      setLoadStates(next);
    },
    [],
  );

  const startDocumentLoad = useCallback(
    (documentId: string, retry = false): LoadTicket | undefined => {
      const currentState = loadStatesRef.current[documentId];
      if (
        currentState?.status === "loading" ||
        (currentState?.status === "error" && !retry)
      ) {
        return undefined;
      }

      const request = (requestRef.current.get(documentId) ?? 0) + 1;
      requestRef.current.set(documentId, request);
      const ticket = { documentId, generation: generationRef.current, request };
      updateLoadStates((current) => ({
        ...current,
        [documentId]: { status: "loading", documentId },
      }));
      return ticket;
    },
    [updateLoadStates],
  );

  const isCurrentLoad = useCallback((ticket: LoadTicket): boolean => {
    return (
      generationRef.current === ticket.generation &&
      requestRef.current.get(ticket.documentId) === ticket.request
    );
  }, []);

  const completeDocumentLoad = useCallback(
    (ticket: LoadTicket) => {
      if (
        generationRef.current !== ticket.generation ||
        requestRef.current.get(ticket.documentId) !== ticket.request
      ) {
        return;
      }
      updateLoadStates((current) => {
        const remaining = { ...current };
        delete remaining[ticket.documentId];
        return remaining;
      });
    },
    [updateLoadStates],
  );

  const failDocumentLoad = useCallback(
    (ticket: LoadTicket, message: string) => {
      if (
        generationRef.current !== ticket.generation ||
        requestRef.current.get(ticket.documentId) !== ticket.request
      ) {
        return;
      }
      updateLoadStates((current) => ({
        ...current,
        [ticket.documentId]: {
          status: "error",
          documentId: ticket.documentId,
          message,
        },
      }));
    },
    [updateLoadStates],
  );

  const clearDocumentLoad = useCallback(
    (documentId: string) => {
      requestRef.current.set(
        documentId,
        (requestRef.current.get(documentId) ?? 0) + 1,
      );
      updateLoadStates((current) => {
        const remaining = { ...current };
        delete remaining[documentId];
        return remaining;
      });
    },
    [updateLoadStates],
  );

  const resetDocumentLoads = useCallback(() => {
    generationRef.current += 1;
    requestRef.current.clear();
    updateLoadStates(() => ({}));
  }, [updateLoadStates]);

  const documentLoadState = useCallback(
    (documentId?: string): DocumentLoadState =>
      documentId ? (loadStates[documentId] ?? idleLoadState) : idleLoadState,
    [loadStates],
  );

  return {
    clearDocumentLoad,
    completeDocumentLoad,
    documentLoadState,
    failDocumentLoad,
    isCurrentLoad,
    resetDocumentLoads,
    startDocumentLoad,
  };
}
