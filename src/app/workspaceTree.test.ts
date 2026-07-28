import { describe, expect, it } from "vitest";

import {
  activateGroup,
  activateTab,
  activeDocumentId,
  activeLeaf,
  activeTab,
  canStepHistory,
  closeGroup,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  createWorkspace,
  findLeaf,
  leaves,
  minimumSplitFraction,
  moveTab,
  openDocument,
  openDocumentIds,
  resizeSplit,
  setTabPinned,
  splitGroup,
  stepHistory,
  type Workspace,
} from "./workspaceTree";

const groupId = (workspace: Workspace, at = 0) => leaves(workspace.root)[at].id;
const documentIds = (workspace: Workspace, at = 0) =>
  leaves(workspace.root)[at].tabs.map((tab) => tab.documentId);

describe("workspace", () => {
  it("starts as one empty group", () => {
    const workspace = createWorkspace();

    expect(leaves(workspace.root)).toHaveLength(1);
    expect(activeDocumentId(workspace)).toBe("");
    expect(activeLeaf(workspace).id).toBe(workspace.activeGroupId);
  });

  it("opens a document into the empty group", () => {
    const workspace = openDocument(createWorkspace(), "harbor");

    expect(documentIds(workspace)).toEqual(["harbor"]);
    expect(activeDocumentId(workspace)).toBe("harbor");
  });

  it("replaces the active tab by default", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes");

    expect(documentIds(workspace)).toEqual(["field-notes"]);
  });

  it("opens beside the active tab when asked", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes", { newTab: true });

    expect(documentIds(workspace)).toEqual(["harbor", "field-notes"]);
    expect(activeDocumentId(workspace)).toBe("field-notes");
  });

  it("opens the same document as many times as asked", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "harbor", { newTab: true });

    expect(documentIds(workspace)).toEqual(["harbor", "harbor"]);
    expect(leaves(workspace.root)[0].tabs[0].id).not.toBe(
      leaves(workspace.root)[0].tabs[1].id,
    );
  });

  it("reports every open document once", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "harbor", { newTab: true });
    workspace = openDocument(workspace, "field-notes", { newTab: true });

    expect(openDocumentIds(workspace)).toEqual(
      new Set(["harbor", "field-notes"]),
    );
  });

  it("ignores an empty document id", () => {
    const workspace = createWorkspace();
    expect(openDocument(workspace, "")).toBe(workspace);
  });
});

describe("pinned tabs", () => {
  it("opens beside a pinned tab rather than replacing it", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = setTabPinned(workspace, groupId(workspace), 0, true);
    workspace = openDocument(workspace, "field-notes");

    expect(documentIds(workspace)).toEqual(["harbor", "field-notes"]);
  });

  it("survives closing the others", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes", { newTab: true });
    workspace = openDocument(workspace, "link-garden", { newTab: true });
    workspace = setTabPinned(workspace, groupId(workspace), 0, true);

    workspace = closeOtherTabs(workspace, groupId(workspace), 2);

    expect(documentIds(workspace)).toEqual(["harbor", "link-garden"]);
  });

  it("survives closing the tabs to its right", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes", { newTab: true });
    workspace = openDocument(workspace, "link-garden", { newTab: true });
    workspace = setTabPinned(workspace, groupId(workspace), 2, true);

    workspace = closeTabsToRight(workspace, groupId(workspace), 0);

    expect(documentIds(workspace)).toEqual(["harbor", "link-garden"]);
  });
});

describe("tab history", () => {
  it("walks back and forward through what a tab has held", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes");
    workspace = openDocument(workspace, "link-garden");

    workspace = stepHistory(workspace, groupId(workspace), -1);
    expect(activeDocumentId(workspace)).toBe("field-notes");

    workspace = stepHistory(workspace, groupId(workspace), -1);
    expect(activeDocumentId(workspace)).toBe("harbor");

    workspace = stepHistory(workspace, groupId(workspace), 1);
    expect(activeDocumentId(workspace)).toBe("field-notes");
  });

  it("stops at either end rather than wrapping", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    expect(canStepHistory(workspace, groupId(workspace), -1)).toBe(false);
    expect(canStepHistory(workspace, groupId(workspace), 1)).toBe(false);

    workspace = openDocument(workspace, "field-notes");
    expect(canStepHistory(workspace, groupId(workspace), -1)).toBe(true);

    const back = stepHistory(workspace, groupId(workspace), -1);
    expect(stepHistory(back, groupId(back), -1)).toBe(back);
  });

  it("drops the forward trail once you navigate somewhere new", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes");
    workspace = stepHistory(workspace, groupId(workspace), -1);

    workspace = openDocument(workspace, "link-garden");

    expect(activeDocumentId(workspace)).toBe("link-garden");
    expect(canStepHistory(workspace, groupId(workspace), 1)).toBe(false);
    expect(activeTab(workspace)?.history).toEqual(["harbor", "link-garden"]);
  });

  it("does not record opening the document already showing", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    const before = workspace;
    workspace = openDocument(workspace, "harbor");

    expect(workspace).toBe(before);
    expect(activeTab(workspace)?.history).toEqual(["harbor"]);
  });

  it("keeps a separate trail per tab", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes", { newTab: true });
    workspace = openDocument(workspace, "link-garden");

    // The second tab travelled; the first never moved.
    expect(leaves(workspace.root)[0].tabs[0].history).toEqual(["harbor"]);
    expect(leaves(workspace.root)[0].tabs[1].history).toEqual([
      "field-notes",
      "link-garden",
    ]);
  });
});

describe("closing tabs", () => {
  it("keeps the active tab on something sensible", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes", { newTab: true });
    workspace = openDocument(workspace, "link-garden", { newTab: true });

    // Closing a tab before the active one must not shift the selection off it.
    workspace = closeTab(workspace, groupId(workspace), 0);

    expect(documentIds(workspace)).toEqual(["field-notes", "link-garden"]);
    expect(activeDocumentId(workspace)).toBe("link-garden");
  });

  it("selects the tab that took the closed one's place", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes", { newTab: true });
    workspace = openDocument(workspace, "link-garden", { newTab: true });
    workspace = activateTab(workspace, groupId(workspace), 1);

    workspace = closeTab(workspace, groupId(workspace), 1);

    expect(activeDocumentId(workspace)).toBe("link-garden");
  });

  it("empties the only group rather than removing it", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = closeTab(workspace, groupId(workspace), 0);

    expect(leaves(workspace.root)).toHaveLength(1);
    expect(activeDocumentId(workspace)).toBe("");
    // And it is still somewhere a document can open.
    expect(documentIds(openDocument(workspace, "field-notes"))).toEqual([
      "field-notes",
    ]);
  });

  it("ignores a tab index that is not there", () => {
    const workspace = openDocument(createWorkspace(), "harbor");
    expect(closeTab(workspace, groupId(workspace), 7)).toBe(workspace);
  });
});

describe("splits", () => {
  it("divides a group and carries the document into the new half", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = splitGroup(workspace, groupId(workspace), "row");

    expect(leaves(workspace.root)).toHaveLength(2);
    expect(documentIds(workspace, 0)).toEqual(["harbor"]);
    expect(documentIds(workspace, 1)).toEqual(["harbor"]);
    // The half you are now looking at is the one you asked for.
    expect(workspace.activeGroupId).toBe(groupId(workspace, 1));
  });

  it("nests splits in both directions", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = splitGroup(workspace, groupId(workspace), "row");
    workspace = splitGroup(workspace, workspace.activeGroupId, "column");

    expect(leaves(workspace.root)).toHaveLength(3);
    expect(workspace.root.type).toBe("split");
  });

  it("promotes the surviving half when a group closes", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = splitGroup(workspace, groupId(workspace), "row");
    const survivor = groupId(workspace, 0);

    workspace = closeGroup(workspace, groupId(workspace, 1));

    expect(leaves(workspace.root)).toHaveLength(1);
    expect(workspace.root.type).toBe("leaf");
    expect(workspace.root.id).toBe(survivor);
    expect(workspace.activeGroupId).toBe(survivor);
  });

  it("removes a split group once its last tab closes", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = splitGroup(workspace, groupId(workspace), "row");
    workspace = closeTab(workspace, workspace.activeGroupId, 0);

    expect(leaves(workspace.root)).toHaveLength(1);
  });

  it("resizes a split and refuses to squeeze either side away", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = splitGroup(workspace, groupId(workspace), "row");
    const split = workspace.root;
    if (split.type !== "split") throw new Error("expected a split");

    // Compared as numbers rather than exactly: these end up as CSS fractions,
    // where 1 - 0.7 being 0.30000000000000004 is of no consequence.
    const wide = resizeSplit(workspace, split.id, 0.7);
    const wideSizes = wide.root.type === "split" ? wide.root.sizes : [0, 0];
    expect(wideSizes[0]).toBeCloseTo(0.7);
    expect(wideSizes[1]).toBeCloseTo(0.3);

    const squeezed = resizeSplit(workspace, split.id, 0.01);
    const tight = squeezed.root.type === "split" ? squeezed.root.sizes : [0, 0];
    expect(tight[0]).toBeCloseTo(minimumSplitFraction);
    expect(tight[1]).toBeCloseTo(1 - minimumSplitFraction);
  });

  it("keeps the active group when it still exists", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = splitGroup(workspace, groupId(workspace), "row");
    const active = workspace.activeGroupId;

    workspace = activateGroup(workspace, groupId(workspace, 0));
    expect(workspace.activeGroupId).toBe(groupId(workspace, 0));
    expect(workspace.activeGroupId).not.toBe(active);
  });

  it("falls back to a real group when the active one has gone", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = splitGroup(workspace, groupId(workspace), "row");
    workspace = closeGroup(workspace, workspace.activeGroupId);

    expect(findLeaf(workspace.root, workspace.activeGroupId)).toBeDefined();
  });
});

describe("moving tabs", () => {
  it("reorders a tab within its own strip", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes", { newTab: true });
    workspace = openDocument(workspace, "link-garden", { newTab: true });

    workspace = moveTab(
      workspace,
      { groupId: groupId(workspace), index: 2 },
      { groupId: groupId(workspace), index: 0 },
    );

    expect(documentIds(workspace)).toEqual([
      "link-garden",
      "harbor",
      "field-notes",
    ]);
    expect(activeDocumentId(workspace)).toBe("link-garden");
  });

  it("moves a tab into another group, history and all", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes");
    workspace = openDocument(workspace, "link-garden", { newTab: true });
    workspace = splitGroup(workspace, groupId(workspace, 0), "row");

    const from = groupId(workspace, 0);
    const to = groupId(workspace, 1);
    workspace = moveTab(
      workspace,
      { groupId: from, index: 0 },
      {
        groupId: to,
        index: 0,
      },
    );

    expect(documentIds(workspace, 1)[0]).toBe("field-notes");
    expect(leaves(workspace.root)[1].tabs[0].history).toEqual([
      "harbor",
      "field-notes",
    ]);
    expect(workspace.activeGroupId).toBe(to);
  });

  it("collapses a group emptied by the move", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = splitGroup(workspace, groupId(workspace), "row");
    const from = groupId(workspace, 1);
    const to = groupId(workspace, 0);

    workspace = moveTab(
      workspace,
      { groupId: from, index: 0 },
      {
        groupId: to,
        index: 0,
      },
    );

    expect(leaves(workspace.root)).toHaveLength(1);
    expect(documentIds(workspace, 0)).toEqual(["harbor", "harbor"]);
  });

  it("ignores a move from somewhere that is not there", () => {
    const workspace = openDocument(createWorkspace(), "harbor");
    expect(
      moveTab(
        workspace,
        { groupId: "missing", index: 0 },
        {
          groupId: groupId(workspace),
          index: 0,
        },
      ),
    ).toBe(workspace);
    expect(
      moveTab(
        workspace,
        { groupId: groupId(workspace), index: 0 },
        {
          groupId: "missing",
          index: 0,
        },
      ),
    ).toBe(workspace);
  });
});

describe("identity of the returned workspace", () => {
  /// React re-renders on a new object, so an operation that changed nothing
  /// must hand back the very same one.
  it("returns the same workspace when nothing changed", () => {
    let workspace = openDocument(createWorkspace(), "harbor");
    workspace = openDocument(workspace, "field-notes", { newTab: true });

    expect(activateGroup(workspace, workspace.activeGroupId)).toBe(workspace);
    expect(activateGroup(workspace, "missing")).toBe(workspace);
    expect(activateTab(workspace, groupId(workspace), 1)).toBe(workspace);
    expect(activateTab(workspace, groupId(workspace), 9)).toBe(workspace);
    expect(setTabPinned(workspace, groupId(workspace), 0, false)).toBe(
      workspace,
    );
    expect(stepHistory(workspace, groupId(workspace), 1)).toBe(workspace);
  });

  it("hands back a new workspace when something did change", () => {
    const workspace = openDocument(createWorkspace(), "harbor");

    expect(openDocument(workspace, "field-notes")).not.toBe(workspace);
    expect(setTabPinned(workspace, groupId(workspace), 0, true)).not.toBe(
      workspace,
    );
    expect(splitGroup(workspace, groupId(workspace), "row")).not.toBe(
      workspace,
    );
  });

  it("never hands out the same id twice", () => {
    let workspace = createWorkspace(["harbor"]);
    for (let round = 0; round < 6; round += 1) {
      workspace = openDocument(workspace, `note-${round}`, { newTab: true });
      workspace = splitGroup(workspace, workspace.activeGroupId, "row");
    }

    const ids = [
      ...leaves(workspace.root).map((leaf) => leaf.id),
      ...leaves(workspace.root).flatMap((leaf) =>
        leaf.tabs.map((tab) => tab.id),
      ),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
