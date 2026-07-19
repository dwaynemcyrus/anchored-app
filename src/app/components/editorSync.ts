export type EditorSelection = {
  anchor: number;
  head: number;
};

export type EditorDocumentChange = {
  from: number;
  to: number;
  insert: string;
};

export type EditorSyncResult = {
  change: EditorDocumentChange;
  selection: EditorSelection;
};

/**
 * Describes the smallest contiguous replacement between two document values.
 * Keeping the change contiguous lets CodeMirror preserve undo history and map
 * selections without replacing the entire document.
 */
export function describeExternalDocumentChange(
  current: string,
  next: string,
  selection: EditorSelection,
): EditorSyncResult | null {
  if (current === next) return null;

  let prefixLength = 0;
  const sharedLength = Math.min(current.length, next.length);
  while (
    prefixLength < sharedLength &&
    current.charCodeAt(prefixLength) === next.charCodeAt(prefixLength)
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < current.length - prefixLength &&
    suffixLength < next.length - prefixLength &&
    current.charCodeAt(current.length - suffixLength - 1) ===
      next.charCodeAt(next.length - suffixLength - 1)
  ) {
    suffixLength += 1;
  }

  const from = prefixLength;
  const to = current.length - suffixLength;
  const insertedLength = next.length - prefixLength - suffixLength;
  const removedLength = to - from;
  const delta = insertedLength - removedLength;

  function mapPosition(position: number): number {
    if (position <= from) return position;
    if (position >= to) return position + delta;
    return from + insertedLength;
  }

  return {
    change: {
      from,
      to,
      insert: next.slice(from, from + insertedLength),
    },
    selection: {
      anchor: mapPosition(selection.anchor),
      head: mapPosition(selection.head),
    },
  };
}
