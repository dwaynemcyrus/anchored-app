"use client";

import { useEffect, useRef } from "react";

const clampInset = (value) => Math.min(500, Math.max(0, value));

export default function useVisualViewportInsets(shellRootRef, scrollerRef) {
  const lastInsetRef = useRef(0);

  useEffect(() => {
    const shellRoot = shellRootRef?.current ?? document.documentElement;
    if (!shellRoot) return;

    const updateInsets = () => {
      const layoutHeight = window.innerHeight;
      const visualViewport = window.visualViewport;
      const visualHeight = visualViewport?.height ?? layoutHeight;
      const keyboardInset = clampInset(layoutHeight - visualHeight);
      const offsetTop = visualViewport?.offsetTop ?? 0;
      shellRoot.style.setProperty("--vvh", `${visualHeight}px`);
      shellRoot.style.setProperty("--shell-keyboard-inset", `${keyboardInset}px`);
      shellRoot.style.setProperty("--vv-offset-top", `${offsetTop}px`);

      const insetDelta = keyboardInset - lastInsetRef.current;
      if (insetDelta > 40 && scrollerRef?.current) {
        const active = document.activeElement;
        const scroller = scrollerRef.current;
        if (active && scroller.contains(active)) {
          const rect = active.getBoundingClientRect();
          const headerHeight =
            parseFloat(getComputedStyle(shellRoot).getPropertyValue("--shell-header-h")) || 0;
          const visibleTop = headerHeight + 8;
          const visibleBottom = visualHeight - 8;
          let delta = 0;
          if (rect.top < visibleTop) {
            delta = rect.top - visibleTop;
          } else if (rect.bottom > visibleBottom) {
            delta = rect.bottom - visibleBottom;
          }
          if (delta !== 0) {
            scroller.scrollBy({ top: delta, behavior: "smooth" });
          }
        }
      }

      lastInsetRef.current = keyboardInset;
    };

    updateInsets();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updateInsets);
    viewport?.addEventListener("scroll", updateInsets);
    window.addEventListener("resize", updateInsets);

    return () => {
      viewport?.removeEventListener("resize", updateInsets);
      viewport?.removeEventListener("scroll", updateInsets);
      window.removeEventListener("resize", updateInsets);
    };
  }, [shellRootRef, scrollerRef]);

  useEffect(() => {
    const scroller = scrollerRef?.current;
    if (!scroller) return;

    const handleFocusIn = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        const visualHeight = window.visualViewport?.height ?? window.innerHeight;
        const headerHeight =
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue("--shell-header-h")
          ) || 0;
        const visibleTop = headerHeight + 8;
        const visibleBottom = visualHeight - 8;
        let delta = 0;
        if (rect.top < visibleTop) {
          delta = rect.top - visibleTop;
        } else if (rect.bottom > visibleBottom) {
          delta = rect.bottom - visibleBottom;
        }
        if (delta !== 0) {
          scroller.scrollBy({ top: delta, behavior: "smooth" });
        }
      });
    };

    scroller.addEventListener("focusin", handleFocusIn);
    return () => {
      scroller.removeEventListener("focusin", handleFocusIn);
    };
  }, [scrollerRef]);
}
