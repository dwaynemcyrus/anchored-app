import type { ExcerptLines } from "./paneLayout";

/// How tall a note row is, per density.
///
/// The list is virtualized, so this is not a suggestion: it is the number the
/// window maths uses to decide which rows exist at all. It is therefore the
/// single source of truth, written into a custom property the stylesheet reads
/// back, rather than a number kept in step with CSS by hand.
///
/// Two-line: 12 top + 18 title + 3 + 36 excerpt + 6 + 14 meta + 12 bottom, plus
/// the one-pixel rule. One-line drops a single 18px line of excerpt.
export const noteRowHeights: Record<ExcerptLines, number> = {
  one: 83,
  two: 101,
};

/// Rows rendered beyond each edge of the viewport. Enough that a normal scroll
/// never reaches an empty region before React has filled it, few enough that a
/// list of thousands still costs a screenful.
export const noteRowOverscan = 6;

export type ListWindow = {
  /// First row to render, inclusive.
  startIndex: number;
  /// Last row to render, exclusive.
  endIndex: number;
  /// Blank space standing in for the rows above `startIndex`.
  offsetTop: number;
  /// Blank space standing in for the rows below `endIndex`.
  offsetBottom: number;
};

/// Works out which slice of a fixed-height list is worth rendering.
///
/// Kept pure and separate from the DOM so the arithmetic — which is where an
/// off-by-one shows up as a row that flickers or never appears — is testable
/// without a scroll container.
export function listWindow(
  count: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = noteRowOverscan,
): ListWindow {
  if (count <= 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetTop: 0, offsetBottom: 0 };
  }

  // A viewport of zero means the pane has not been measured yet. Rendering one
  // screenful blind is better than rendering nothing, which would leave the
  // list empty until the first scroll.
  const height = viewportHeight > 0 ? viewportHeight : rowHeight * overscan;
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(height / rowHeight) + 1;

  const startIndex = Math.max(0, first - overscan);
  const endIndex = Math.min(count, first + visible + overscan);

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * rowHeight,
    offsetBottom: (count - endIndex) * rowHeight,
  };
}
