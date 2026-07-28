import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  createWorkspace,
  leaves,
  minimumSplitFraction,
  openDocument,
  splitGroup,
  type Workspace,
} from "../workspaceTree";
import { SplitContainer } from "./SplitContainer";

function setup(workspace: Workspace) {
  const onResizeSplit = vi.fn();
  render(
    <SplitContainer
      node={workspace.root}
      onResizeSplit={onResizeSplit}
      renderGroup={(group) => <div data-testid={`group-${group.id}`} />}
    />,
  );
  return { onResizeSplit };
}

function splitWorkspace(direction: "row" | "column" = "row") {
  let workspace = openDocument(createWorkspace(), "harbor");
  workspace = splitGroup(workspace, leaves(workspace.root)[0].id, direction);
  const root = workspace.root;
  if (root.type !== "split") throw new Error("expected a split");
  return { workspace, splitId: root.id };
}

describe("SplitContainer", () => {
  it("renders a lone group with no handle", () => {
    const workspace = openDocument(createWorkspace(), "harbor");
    setup(workspace);

    expect(screen.getAllByTestId(/^group-/)).toHaveLength(1);
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("renders both halves of a split and a handle between them", () => {
    const { workspace } = splitWorkspace();
    setup(workspace);

    expect(screen.getAllByTestId(/^group-/)).toHaveLength(2);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("renders nested splits", () => {
    let { workspace } = splitWorkspace();
    workspace = splitGroup(workspace, workspace.activeGroupId, "column");
    setup(workspace);

    expect(screen.getAllByTestId(/^group-/)).toHaveLength(3);
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  it("describes the split it resizes", () => {
    const { workspace } = splitWorkspace("row");
    setup(workspace);

    const handle = screen.getByRole("separator");
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuenow", "50");
    expect(handle).toHaveAccessibleName("Resize panes side by side");
  });

  it("describes a stacked split along its own axis", () => {
    const { workspace } = splitWorkspace("column");
    setup(workspace);

    expect(screen.getByRole("separator")).toHaveAttribute(
      "aria-orientation",
      "horizontal",
    );
  });

  it("resizes with the arrow keys along its own axis", async () => {
    const user = userEvent.setup();
    const { workspace, splitId } = splitWorkspace("row");
    const { onResizeSplit } = setup(workspace);

    screen.getByRole("separator").focus();
    await user.keyboard("{ArrowRight}");
    expect(onResizeSplit).toHaveBeenLastCalledWith(splitId, 0.52);

    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(onResizeSplit).toHaveBeenLastCalledWith(splitId, 0.4);
  });

  it("ignores the arrows that do not lie along its axis", async () => {
    const user = userEvent.setup();
    const { workspace } = splitWorkspace("row");
    const { onResizeSplit } = setup(workspace);

    screen.getByRole("separator").focus();
    await user.keyboard("{ArrowUp}{ArrowDown}");

    expect(onResizeSplit).not.toHaveBeenCalled();
  });

  it("returns to even halves on a double click", async () => {
    const user = userEvent.setup();
    const { workspace, splitId } = splitWorkspace();
    const { onResizeSplit } = setup(workspace);

    await user.dblClick(screen.getByRole("separator"));

    expect(onResizeSplit).toHaveBeenCalledWith(splitId, 0.5);
  });

  /// jsdom implements no `PointerEvent`, so `fireEvent.pointerUp` builds a bare
  /// `Event` and the coordinates never arrive — which reads as a resize to NaN
  /// rather than as a broken test. A `MouseEvent` carries them, and React
  /// listens for the native event name, so this is what the component sees.
  function pointer(element: Element, type: string, clientX = 0, clientY = 0) {
    fireEvent(
      element,
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
      }),
    );
  }

  it("tells the model where the drag ended, not where it passed through", () => {
    const { workspace, splitId } = splitWorkspace("row");
    const { onResizeSplit } = setup(workspace);
    const handle = screen.getByRole("separator");
    // jsdom lays nothing out, so the container is given an extent to measure.
    handle.parentElement!.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect;

    pointer(handle, "pointerdown");
    pointer(handle, "pointermove", 300);
    pointer(handle, "pointermove", 700);
    expect(onResizeSplit).not.toHaveBeenCalled();

    pointer(handle, "pointerup", 700);
    expect(onResizeSplit).toHaveBeenCalledTimes(1);
    expect(onResizeSplit).toHaveBeenCalledWith(splitId, 0.7);
  });

  it("measures a stacked split down its own axis", () => {
    const { workspace, splitId } = splitWorkspace("column");
    const { onResizeSplit } = setup(workspace);
    const handle = screen.getByRole("separator");
    handle.parentElement!.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect;

    pointer(handle, "pointerdown");
    pointer(handle, "pointerup", 999, 125);

    // The horizontal position is irrelevant to a split that stacks.
    expect(onResizeSplit).toHaveBeenCalledWith(splitId, 0.25);
  });

  it("never lets a drag squeeze a half out of reach", () => {
    const { workspace, splitId } = splitWorkspace("row");
    const { onResizeSplit } = setup(workspace);
    const handle = screen.getByRole("separator");
    handle.parentElement!.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect;

    pointer(handle, "pointerdown");
    pointer(handle, "pointerup", -400);

    expect(onResizeSplit).toHaveBeenCalledWith(splitId, minimumSplitFraction);
  });

  it("ignores pointer movement that never began on the handle", () => {
    const { workspace } = splitWorkspace();
    const { onResizeSplit } = setup(workspace);
    const handle = screen.getByRole("separator");

    pointer(handle, "pointermove", 700);
    pointer(handle, "pointerup", 700);

    expect(onResizeSplit).not.toHaveBeenCalled();
  });
});
