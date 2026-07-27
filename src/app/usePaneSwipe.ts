import { useEffect, useRef, type RefObject } from "react";

/// Distance a horizontal swipe must accumulate before it moves the ladder.
const SWIPE_TRIGGER = 60;
/// Quiet time before another swipe can fire.
const SWIPE_SETTLE_MS = 350;
/// Swiping the fingers left scrolls content right, which macOS reports as a
/// positive deltaX. That closes a pane. Flip this if it reads backwards.
const SWIPE_DIRECTION = -1;

/// A two-finger horizontal swipe over the editor walks the left pane ladder.
///
/// macOS reports the swipe as `wheel` events with a dominant `deltaX`,
/// followed by a long momentum tail. The arm/settle latch is what makes one
/// physical swipe move exactly one step however long the tail runs.
export function usePaneSwipe(
  target: RefObject<HTMLElement | null>,
  onStep: (delta: number) => void,
  enabled: boolean,
  /// Only swipes starting inside this selector count. The listener sits on the
  /// workspace because the editor renders several different roots, and asking
  /// where the gesture began is simpler than threading a ref through each.
  withinSelector = ".editor-surface",
): void {
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    const element = target.current;
    if (!element || !enabled) return;

    let total = 0;
    let armed = true;
    let settleTimer = 0;

    function handleWheel(event: WheelEvent) {
      // Vertical intent belongs to the editor; leave it completely alone.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      if (Math.abs(event.deltaX) < 1) return;
      const origin = event.target;
      if (!(origin instanceof Element) || !origin.closest(withinSelector)) {
        return;
      }
      event.preventDefault();

      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        total = 0;
        armed = true;
      }, SWIPE_SETTLE_MS);

      if (!armed) return;

      total += event.deltaX;
      if (Math.abs(total) < SWIPE_TRIGGER) return;

      onStepRef.current(total > 0 ? SWIPE_DIRECTION : -SWIPE_DIRECTION);
      total = 0;
      armed = false;
    }

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.clearTimeout(settleTimer);
      element.removeEventListener("wheel", handleWheel);
    };
  }, [enabled, target, withinSelector]);
}
