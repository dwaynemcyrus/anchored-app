import { useCallback, useRef, type KeyboardEvent, type ReactNode } from "react";

import {
  minimumSplitFraction,
  type WorkspaceLeaf,
  type WorkspaceNode,
} from "../workspaceTree";

/// How far an arrow key nudges a split, as a fraction of its extent. Shift
/// multiplies it, matching the pane splitters in the outer workspace.
const KEYBOARD_STEP = 0.02;
const KEYBOARD_LEAP = 0.1;

export type SplitContainerProps = {
  node: WorkspaceNode;
  /// Renders one tab group. The tree knows nothing about editors.
  renderGroup: (group: WorkspaceLeaf) => ReactNode;
  onResizeSplit: (splitId: string, fraction: number) => void;
};

/// Lays the workspace tree out, splits and all.
///
/// The tree is rendered rather than flattened, so a nested split is nothing
/// special: each split is a two-column or two-row grid whose first track is the
/// stored fraction, and whatever is inside can be another split.
///
/// Dragging writes straight to the grid's own custom property and only tells
/// the model on release, so a drag costs one style write per frame instead of
/// re-rendering both halves — the same reason the outer pane splitters do it.
export function SplitContainer({
  node,
  renderGroup,
  onResizeSplit,
}: SplitContainerProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const fractionFromPointer = useCallback(
    (clientX: number, clientY: number, direction: "row" | "column") => {
      const element = elementRef.current;
      if (!element) return undefined;
      const bounds = element.getBoundingClientRect();
      const extent = direction === "row" ? bounds.width : bounds.height;
      if (extent <= 0) return undefined;
      const offset =
        direction === "row" ? clientX - bounds.left : clientY - bounds.top;
      return Math.min(
        1 - minimumSplitFraction,
        Math.max(minimumSplitFraction, offset / extent),
      );
    },
    [],
  );

  if (node.type === "leaf") return <>{renderGroup(node)}</>;

  const { direction, id, sizes } = node;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const towardsStart = direction === "row" ? "ArrowLeft" : "ArrowUp";
    const towardsEnd = direction === "row" ? "ArrowRight" : "ArrowDown";
    if (event.key !== towardsStart && event.key !== towardsEnd) return;
    event.preventDefault();
    const step = event.shiftKey ? KEYBOARD_LEAP : KEYBOARD_STEP;
    onResizeSplit(id, sizes[0] + (event.key === towardsEnd ? step : -step));
  };

  return (
    <div
      className="workspace-split"
      data-direction={direction}
      ref={elementRef}
      style={{ ["--split-fraction" as string]: `${sizes[0]}` }}
    >
      <div className="workspace-split__half">
        <SplitContainer
          node={node.children[0]}
          onResizeSplit={onResizeSplit}
          renderGroup={renderGroup}
        />
      </div>

      <div
        aria-label={
          direction === "row"
            ? "Resize panes side by side"
            : "Resize stacked panes"
        }
        aria-orientation={direction === "row" ? "vertical" : "horizontal"}
        aria-valuemax={Math.round((1 - minimumSplitFraction) * 100)}
        aria-valuemin={Math.round(minimumSplitFraction * 100)}
        aria-valuenow={Math.round(sizes[0] * 100)}
        className="workspace-split__handle"
        role="separator"
        tabIndex={0}
        onDoubleClick={() => onResizeSplit(id, 0.5)}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          event.preventDefault();
          draggingRef.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return;
          const fraction = fractionFromPointer(
            event.clientX,
            event.clientY,
            direction,
          );
          if (fraction === undefined) return;
          // Straight to the DOM while the pointer is down; the model hears
          // about it once, on release.
          elementRef.current?.style.setProperty(
            "--split-fraction",
            `${fraction}`,
          );
        }}
        onPointerUp={(event) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          const fraction = fractionFromPointer(
            event.clientX,
            event.clientY,
            direction,
          );
          if (fraction !== undefined) onResizeSplit(id, fraction);
        }}
      />

      <div className="workspace-split__half">
        <SplitContainer
          node={node.children[1]}
          onResizeSplit={onResizeSplit}
          renderGroup={renderGroup}
        />
      </div>
    </div>
  );
}
