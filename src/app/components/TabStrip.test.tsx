import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  createWorkspace,
  leaves,
  openDocument,
  type WorkspaceLeaf,
} from "../workspaceTree";
import { TabStrip } from "./TabStrip";

function group(documentIds: string[], active = 0): WorkspaceLeaf {
  let workspace = createWorkspace();
  for (const documentId of documentIds) {
    workspace = openDocument(workspace, documentId, { newTab: true });
  }
  const leaf = leaves(workspace.root)[0];
  return { ...leaf, active };
}

function setup(
  leaf: WorkspaceLeaf,
  overrides: Partial<Parameters<typeof TabStrip>[0]> = {},
) {
  const handlers = {
    onActivateTab: vi.fn(),
    onCloseAllTabs: vi.fn(),
    onCloseTab: vi.fn(),
    onMoveTab: vi.fn(),
    onNewTab: vi.fn(),
    onTabContextMenu: vi.fn(),
  };
  render(
    <TabStrip
      group={leaf}
      isActiveGroup
      titleFor={(documentId) => documentId.replace(/-/g, " ")}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("TabStrip", () => {
  it("shows a tab per document and marks the active one", () => {
    setup(group(["harbor", "field-notes"], 1));

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  });

  it("keeps only the active tab in the tab order", () => {
    setup(group(["harbor", "field-notes"], 1));

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "-1");
    expect(tabs[1]).toHaveAttribute("tabindex", "0");
  });

  it("activates a tab when it is clicked", async () => {
    const user = userEvent.setup();
    const { onActivateTab } = setup(group(["harbor", "field-notes"]));

    await user.click(screen.getByRole("tab", { name: "field notes" }));

    expect(onActivateTab).toHaveBeenCalledWith(1);
  });

  it("closes a tab from its own close button", async () => {
    const user = userEvent.setup();
    const { onCloseTab, onActivateTab } = setup(
      group(["harbor", "field-notes"]),
    );

    await user.click(screen.getByRole("button", { name: "Close field notes" }));

    expect(onCloseTab).toHaveBeenCalledWith(1);
    // Closing is not also selecting.
    expect(onActivateTab).not.toHaveBeenCalled();
  });

  it("opens a new tab", async () => {
    const user = userEvent.setup();
    const { onNewTab } = setup(group(["harbor"]));

    await user.click(screen.getByRole("button", { name: "New tab" }));

    expect(onNewTab).toHaveBeenCalled();
  });

  /// Pinning says so after the name rather than in front of it, so the tab is
  /// still findable by what it is called.
  it("says a tab is pinned without renaming it", () => {
    const leaf = group(["harbor"]);
    setup({ ...leaf, tabs: [{ ...leaf.tabs[0], pinned: true }] });

    expect(screen.getByRole("tab")).toHaveAccessibleName("harbor, pinned");
  });

  it("reaches every tab through the group menu", async () => {
    const user = userEvent.setup();
    const { onActivateTab } = setup(group(["harbor", "field-notes"], 0));

    await user.click(screen.getByRole("button", { name: "Tab actions" }));
    const menu = screen.getByRole("menu", { name: "Tab actions" });
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(2);
    expect(
      within(menu).getByRole("menuitemradio", { name: "harbor" }),
    ).toHaveAttribute("aria-checked", "true");

    await user.click(
      within(menu).getByRole("menuitemradio", { name: "field notes" }),
    );

    expect(onActivateTab).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes every tab from the group menu", async () => {
    const user = userEvent.setup();
    const { onCloseAllTabs } = setup(group(["harbor", "field-notes"]));

    await user.click(screen.getByRole("button", { name: "Tab actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Close all" }));

    expect(onCloseAllTabs).toHaveBeenCalled();
  });

  it("opens a tab's actions on right click", async () => {
    const user = userEvent.setup();
    const { onTabContextMenu } = setup(group(["harbor"]));

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("tab", { name: "harbor" }),
    });

    expect(onTabContextMenu).toHaveBeenCalledWith(0, expect.anything());
  });
});

describe("TabStrip dragging", () => {
  /// jsdom has no drag-and-drop, so the events are synthesised. What is being
  /// checked is the payload contract between dragstart and drop, which is where
  /// a move between two groups actually goes wrong.
  function transfer() {
    const data = new Map<string, string>();
    return {
      dropEffect: "",
      effectAllowed: "",
      getData: (type: string) => data.get(type) ?? "",
      setData: (type: string, value: string) => data.set(type, value),
    };
  }

  it("moves a tab to the position it was dropped on", () => {
    const { onMoveTab } = setup(
      group(["harbor", "field-notes", "link-garden"]),
    );
    const dataTransfer = transfer();
    const tabs = screen.getAllByRole("tab").map((tab) => tab.parentElement!);

    fireEvent.dragStart(tabs[2], { dataTransfer });
    fireEvent.dragOver(tabs[0], { dataTransfer });
    fireEvent.drop(tabs[0], { dataTransfer });

    expect(onMoveTab).toHaveBeenCalledWith(
      { groupId: expect.any(String), index: 2 },
      { groupId: expect.any(String), index: 0 },
    );
  });

  it("carries the group a tab came from, so it can move between panes", () => {
    const leaf = group(["harbor"]);
    const { onMoveTab } = setup(leaf);
    const dataTransfer = transfer();
    const tab = screen.getByRole("tab").parentElement!;

    fireEvent.dragStart(tab, { dataTransfer });
    fireEvent.drop(tab, { dataTransfer });

    expect(onMoveTab).toHaveBeenCalledWith(
      { groupId: leaf.id, index: 0 },
      { groupId: leaf.id, index: 0 },
    );
  });

  it("ignores a drop carrying something that is not a tab", () => {
    const { onMoveTab } = setup(group(["harbor"]));
    const dataTransfer = transfer();
    dataTransfer.setData("text/plain", "a note, not a tab");

    fireEvent.drop(screen.getByRole("tab").parentElement!, { dataTransfer });

    // "a note, not a tab" has no colon, so it decodes to nothing.
    expect(onMoveTab).not.toHaveBeenCalled();
  });

  it("survives a drop with no dataTransfer at all", () => {
    const { onMoveTab } = setup(group(["harbor"]));

    expect(() =>
      fireEvent.drop(screen.getByRole("tab").parentElement!),
    ).not.toThrow();
    expect(onMoveTab).not.toHaveBeenCalled();
  });
});
