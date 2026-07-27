import { useCallback, useEffect, useRef, useState } from "react";

import { notePreview, notePreviewKey } from "./notePreview";

export type NotePreviewSource = {
  modifiedMillis?: number;
  relativePath: string;
};

export type NotePreviewsApi = {
  /// Ref callback for a list row. Rows register themselves; only the ones that
  /// actually reach the viewport are ever read.
  observeRow: (
    source: NotePreviewSource | undefined,
  ) => (element: HTMLElement | null) => void;
  previewFor: (source: NotePreviewSource | undefined) => string | undefined;
};

/// Supplies the excerpt each note-list row shows.
///
/// The vault scan returns metadata only — no note content — so a preview costs
/// a file read. Reading the whole vault to fill a list is not an option: a real
/// vault holds thousands of notes, and the 2015 MacBook Pro is the performance
/// baseline. Rows are therefore read as they scroll into view and cached by
/// path and modified time, so a folder of five thousand notes costs only the
/// twenty reads you can actually see.
export function useNotePreviews(
  readFile: (relativePath: string) => Promise<{ content: string }>,
  enabled: boolean,
): NotePreviewsApi {
  const [previews, setPreviews] = useState<Map<string, string>>(
    () => new Map(),
  );
  const pending = useRef(new Set<string>());
  const observer = useRef<IntersectionObserver | undefined>(undefined);
  const sources = useRef(new Map<Element, NotePreviewSource>());
  const readFileRef = useRef(readFile);
  readFileRef.current = readFile;

  const load = useCallback(async (source: NotePreviewSource) => {
    const key = notePreviewKey(source.relativePath, source.modifiedMillis);
    if (pending.current.has(key)) return;
    pending.current.add(key);

    try {
      const { content } = await readFileRef.current(source.relativePath);
      const preview = notePreview(content);
      setPreviews((current) => {
        if (current.get(key) === preview) return current;
        const next = new Map(current);
        next.set(key, preview);
        return next;
      });
    } catch {
      // A note that cannot be read still lists by name; an empty preview is
      // the right outcome and never worth interrupting the user for.
      setPreviews((current) => {
        if (current.has(key)) return current;
        const next = new Map(current);
        next.set(key, "");
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;

    const instance = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const source = sources.current.get(entry.target);
          if (source) void load(source);
        }
      },
      // A little margin so a row is read just before it is scrolled into view.
      { rootMargin: "200px" },
    );

    observer.current = instance;
    for (const element of sources.current.keys()) instance.observe(element);

    return () => {
      instance.disconnect();
      observer.current = undefined;
    };
  }, [enabled, load]);

  const observeRow = useCallback(
    (source: NotePreviewSource | undefined) =>
      (element: HTMLElement | null) => {
        if (!element || !source) return;
        sources.current.set(element, source);
        observer.current?.observe(element);
      },
    [],
  );

  const previewFor = useCallback(
    (source: NotePreviewSource | undefined) =>
      source
        ? previews.get(
            notePreviewKey(source.relativePath, source.modifiedMillis),
          )
        : undefined,
    [previews],
  );

  return { observeRow, previewFor };
}
