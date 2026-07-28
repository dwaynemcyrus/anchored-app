import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { notePreview, notePreviewKey } from "./notePreview";

export type NotePreviewSource = {
  modifiedMillis?: number;
  relativePath: string;
};

/// How many notes are read at once. A fling past a hundred rows should not put
/// a hundred reads in flight: the rows that are still on screen when their turn
/// comes are the ones worth reading, and the rest cancel themselves as they
/// unmount.
const MAX_CONCURRENT_READS = 6;

export type NotePreviewsApi = {
  /// Registers interest in a row's excerpt and returns the unsubscribe. Reading
  /// starts here; letting go cancels it if it has not begun.
  subscribe: (source: NotePreviewSource, listener: () => void) => () => void;
  /// The excerpt as it stands, without subscribing. Stable between changes, so
  /// it can back `useSyncExternalStore`.
  read: (source: NotePreviewSource) => string | undefined;
};

/// Supplies the excerpt each note-list row shows.
///
/// The vault scan returns metadata only — no note content — so a preview costs
/// a file read. The list is virtualized, so a row that exists is a row that is
/// very nearly on screen, and mounting is the signal to read it.
///
/// The excerpts deliberately do not live in React state. A vault of thousands
/// of notes resolves thousands of reads, and putting each one through a state
/// update re-rendered every row in the list to change the text of one. Each row
/// subscribes to its own key instead, so a resolved read re-renders exactly the
/// row it belongs to.
export function useNotePreviews(
  readFile: (relativePath: string) => Promise<{ content: string }>,
  enabled: boolean,
): NotePreviewsApi {
  const readFileRef = useRef(readFile);
  readFileRef.current = readFile;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const store = useRef<{
    previews: Map<string, string>;
    listeners: Map<string, Set<() => void>>;
    queue: string[];
    sources: Map<string, NotePreviewSource>;
    reading: number;
  }>({
    previews: new Map(),
    listeners: new Map(),
    queue: [],
    sources: new Map(),
    reading: 0,
  });

  const publish = useCallback((key: string, preview: string) => {
    const state = store.current;
    state.previews.set(key, preview);
    state.sources.delete(key);
    for (const listener of state.listeners.get(key) ?? []) listener();
  }, []);

  const pump = useCallback(() => {
    const state = store.current;
    while (state.reading < MAX_CONCURRENT_READS && state.queue.length > 0) {
      const key = state.queue.shift();
      if (key === undefined) return;
      const source = state.sources.get(key);
      // Queued, then scrolled away before its turn. Nothing to read.
      if (!source || !state.listeners.get(key)?.size) {
        state.sources.delete(key);
        continue;
      }

      state.reading += 1;
      void (async () => {
        try {
          const { content } = await readFileRef.current(source.relativePath);
          publish(key, notePreview(content));
        } catch {
          // A note that cannot be read still lists by name; an empty excerpt is
          // the right outcome and never worth interrupting the user for.
          publish(key, "");
        } finally {
          state.reading -= 1;
          pump();
        }
      })();
    }
  }, [publish]);

  const subscribe = useCallback(
    (source: NotePreviewSource, listener: () => void) => {
      const state = store.current;
      const key = notePreviewKey(source.relativePath, source.modifiedMillis);
      const listeners = state.listeners.get(key) ?? new Set<() => void>();
      listeners.add(listener);
      state.listeners.set(key, listeners);

      if (
        enabledRef.current &&
        !state.previews.has(key) &&
        !state.sources.has(key)
      ) {
        state.sources.set(key, source);
        state.queue.push(key);
        pump();
      }

      return () => {
        const remaining = state.listeners.get(key);
        remaining?.delete(listener);
        if (remaining && remaining.size === 0) state.listeners.delete(key);
      };
    },
    [pump],
  );

  const read = useCallback(
    (source: NotePreviewSource) =>
      store.current.previews.get(
        notePreviewKey(source.relativePath, source.modifiedMillis),
      ),
    [],
  );

  return useMemo(() => ({ read, subscribe }), [read, subscribe]);
}

/// One row's excerpt. Re-renders that row, and nothing else, when it arrives.
///
/// `source` should be memoized by the caller — a new object every render
/// re-subscribes every render. Nothing is re-read when that happens, because
/// the excerpt is cached by path and modified time, but it is wasted work.
export function useNotePreview(
  previews: NotePreviewsApi,
  source: NotePreviewSource | undefined,
): string | undefined {
  const { read, subscribe } = previews;

  const subscribeToRow = useCallback(
    (listener: () => void) => (source ? subscribe(source, listener) : () => {}),
    [source, subscribe],
  );

  const snapshot = useCallback(
    () => (source ? read(source) : undefined),
    [read, source],
  );

  return useSyncExternalStore(subscribeToRow, snapshot, snapshot);
}
