import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { paneConstraints, type PaneKey } from "../paneLayout";

type PaneSplitterProps = {
  /// The pane this splitter resizes. It is not always the pane the splitter
  /// sits inside: the inspector's handle lives on the editor's right edge.
  pane: PaneKey;
  label: string;
  width: number;
  /// True when dragging left makes the pane wider, as it does for a handle
  /// placed to the pane's left.
  inverted?: boolean;
  onCollapse: () => void;
  onReset: () => void;
  onResize: (width: number) => void;
};

const STEP = 16;
const COARSE_STEP = 64;

export function PaneSplitter({
  pane,
  label,
  width,
  inverted = false,
  onCollapse,
  onReset,
  onResize,
}: PaneSplitterProps) {
  const origin = useRef<{ width: number; x: number } | undefined>(undefined);

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    // Pointer capture keeps the drag alive once the pointer leaves the handle.
    // It is absent under jsdom, and a missing capture only costs us a drag
    // that ends early, so it must never break the interaction.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    origin.current = { width, x: event.clientX };
    // Applied to the document so the cursor does not flicker and text does not
    // select while the pointer crosses other panes mid-drag.
    document.body.dataset.resizingPane = "true";
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = origin.current;
    if (!start) return;
    const delta = inverted ? start.x - event.clientX : event.clientX - start.x;
    onResize(start.width + delta);
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!origin.current) return;
    origin.current = undefined;
    delete document.body.dataset.resizingPane;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? COARSE_STEP : STEP;
    const direction = inverted ? -1 : 1;

    switch (event.key) {
      case "ArrowLeft":
        onResize(width - step * direction);
        break;
      case "ArrowRight":
        onResize(width + step * direction);
        break;
      case "Home":
        onResize(paneConstraints[pane].min);
        break;
      case "End":
        onResize(paneConstraints[pane].max);
        break;
      case "Enter":
      case " ":
        onCollapse();
        break;
      default:
        return;
    }

    event.preventDefault();
  }

  return (
    <button
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={paneConstraints[pane].max}
      aria-valuemin={paneConstraints[pane].min}
      aria-valuenow={width}
      className="pane-splitter"
      role="separator"
      type="button"
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
    />
  );
}
