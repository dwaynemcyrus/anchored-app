import { useEffect, useRef, useState, type RefObject } from "react";

import { listWindow, type ListWindow } from "./noteListLayout";

/// Keeps a scroll container's visible slice up to date.
///
/// The measurements live in a ref and only reach React state when the slice
/// actually changes, so scrolling within a row costs a comparison rather than a
/// render. `scrollTop` is read during the scroll event rather than stored, and
/// the update is deferred to the next frame, so a fling produces one render per
/// frame instead of one per event.
export function useListWindow(
  container: RefObject<HTMLElement | null>,
  count: number,
  rowHeight: number,
): ListWindow {
  const [window_, setWindow] = useState<ListWindow>(() =>
    listWindow(count, rowHeight, 0, 0),
  );
  const current = useRef(window_);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const next = listWindow(
        count,
        rowHeight,
        element.scrollTop,
        element.clientHeight,
      );
      const previous = current.current;
      if (
        next.startIndex === previous.startIndex &&
        next.endIndex === previous.endIndex
      ) {
        return;
      }
      current.current = next;
      setWindow(next);
    };

    const schedule = () => {
      if (frame) return;
      frame =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame(measure)
          : (setTimeout(measure, 16) as unknown as number);
    };

    // The first pass is immediate: waiting a frame would show an empty list.
    measure();

    element.addEventListener("scroll", schedule, { passive: true });

    // The pane can change height without the window doing so — a splitter drag,
    // or the inspector opening. Where ResizeObserver is missing, as in jsdom,
    // the window's own resize still covers the common case.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver === "undefined") {
      globalThis.addEventListener("resize", schedule);
    } else {
      observer = new ResizeObserver(schedule);
      observer.observe(element);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      element.removeEventListener("scroll", schedule);
      observer?.disconnect();
      globalThis.removeEventListener("resize", schedule);
    };
  }, [container, count, rowHeight]);

  return window_;
}
