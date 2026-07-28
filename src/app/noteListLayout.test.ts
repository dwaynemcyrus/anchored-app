import { describe, expect, it } from "vitest";

import { listWindow, noteRowHeights, noteRowOverscan } from "./noteListLayout";

const row = noteRowHeights.two;

describe("note list window", () => {
  it("renders nothing for an empty list", () => {
    expect(listWindow(0, row, 0, 800)).toEqual({
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      offsetBottom: 0,
    });
  });

  it("covers the viewport plus the overscan at the top of a list", () => {
    const window = listWindow(500, row, 0, 800, 6);

    expect(window.startIndex).toBe(0);
    expect(window.offsetTop).toBe(0);
    // Eight rows fit in 800px; one more covers a partial row, six overscan.
    expect(window.endIndex).toBe(Math.ceil(800 / row) + 1 + 6);
  });

  it("stands in for the rows it does not render", () => {
    const window = listWindow(500, row, 4000, 800);

    expect(window.offsetTop).toBe(window.startIndex * row);
    expect(window.offsetBottom).toBe((500 - window.endIndex) * row);
    const rendered = (window.endIndex - window.startIndex) * row;
    expect(window.offsetTop + rendered + window.offsetBottom).toBe(500 * row);
  });

  it("keeps the rows around the scroll position rendered", () => {
    const window = listWindow(500, row, 100 * row, 800);

    expect(window.startIndex).toBeLessThanOrEqual(100);
    expect(window.endIndex).toBeGreaterThan(100 + Math.floor(800 / row));
  });

  it("never runs past either end of the list", () => {
    expect(listWindow(500, row, -200, 800).startIndex).toBe(0);

    const end = listWindow(500, row, 500 * row, 800);
    expect(end.endIndex).toBe(500);
    expect(end.offsetBottom).toBe(0);
  });

  it("renders a screenful before the pane has been measured", () => {
    // A height of zero means the pane has not been laid out yet. Rendering
    // nothing would leave the list blank until the first scroll.
    const window = listWindow(500, row, 0, 0);

    expect(window.endIndex).toBeGreaterThan(noteRowOverscan);
  });

  it("costs a bounded number of rows however long the list is", () => {
    const small = listWindow(50, row, 0, 800);
    const huge = listWindow(50_000, row, 0, 800);

    expect(huge.endIndex - huge.startIndex).toBe(small.endIndex - 0);
    expect(huge.endIndex - huge.startIndex).toBeLessThan(40);
  });

  it("shows one fewer line of excerpt at the tighter density", () => {
    expect(noteRowHeights.one).toBeLessThan(noteRowHeights.two);
    expect(noteRowHeights.two - noteRowHeights.one).toBe(18);
  });
});
