/// The editor area as a tree of panes.
///
/// Anchored held exactly one open document, so following a wikilink cost you
/// the note you were reading. The editor is now a tree: every leaf is a tab
/// group holding an ordered list of tabs, and every branch is a split. A tab
/// holds a document *id* rather than a copy, so the same note can sit in as
/// many tabs and panes as you like and every view of it stays the same note.
///
/// Everything here is pure. The tree is rebuilt rather than mutated, so React
/// sees a new object when something changed and the same one when nothing did,
/// and so every operation can be tested without a DOM. Ids come from a counter
/// carried on the workspace rather than a module-level variable, which is what
/// makes a sequence of operations reproducible in a test.

export type SplitDirection = "row" | "column";

export type WorkspaceTab = {
  id: string;
  documentId: string;
  /// Where this tab has been, oldest first. Per tab rather than per pane, so a
  /// tab keeps its own trail when it moves between panes.
  history: string[];
  historyIndex: number;
  /// A pinned tab is not replaced by a navigation; the navigation opens a new
  /// tab beside it instead.
  pinned: boolean;
};

export type WorkspaceLeaf = {
  type: "leaf";
  id: string;
  tabs: WorkspaceTab[];
  /// Index into `tabs`. Always in range for a non-empty group, and 0 for an
  /// empty one.
  active: number;
};

export type WorkspaceSplit = {
  type: "split";
  id: string;
  /// `row` places children side by side, `column` stacks them.
  direction: SplitDirection;
  children: [WorkspaceNode, WorkspaceNode];
  /// Fractions of the split's own extent, summing to 1.
  sizes: [number, number];
};

export type WorkspaceNode = WorkspaceLeaf | WorkspaceSplit;

export type Workspace = {
  root: WorkspaceNode;
  activeGroupId: string;
  /// Next id to hand out. On the workspace rather than in a module variable so
  /// a test can replay a sequence of operations and get the same ids twice.
  sequence: number;
};

/// A split may not shrink either side past this fraction. Small enough to get
/// out of the way, large enough that a pane never becomes a sliver you cannot
/// grab the handle of again.
export const minimumSplitFraction = 0.15;

function identify(sequence: number, prefix: string): string {
  return `${prefix}-${sequence}`;
}

export function createTab(documentId: string, id: string): WorkspaceTab {
  return {
    id,
    documentId,
    history: documentId ? [documentId] : [],
    historyIndex: documentId ? 0 : -1,
    pinned: false,
  };
}

/// A workspace holding one empty group, which is what an editor with no open
/// document looks like.
export function createWorkspace(documentIds: string[] = []): Workspace {
  let sequence = 0;
  const tabs = documentIds.map((documentId) => {
    sequence += 1;
    return createTab(documentId, identify(sequence, "tab"));
  });
  sequence += 1;
  const root: WorkspaceLeaf = {
    type: "leaf",
    id: identify(sequence, "group"),
    tabs,
    active: 0,
  };
  return { root, activeGroupId: root.id, sequence };
}

/// Every tab group, left to right and top to bottom.
export function leaves(node: WorkspaceNode): WorkspaceLeaf[] {
  if (node.type === "leaf") return [node];
  return [...leaves(node.children[0]), ...leaves(node.children[1])];
}

export function findLeaf(
  node: WorkspaceNode,
  groupId: string,
): WorkspaceLeaf | undefined {
  return leaves(node).find((leaf) => leaf.id === groupId);
}

/// The group commands act on. Falls back to the first group, so a stale
/// `activeGroupId` degrades to something sensible rather than nothing.
export function activeLeaf(workspace: Workspace): WorkspaceLeaf {
  return (
    findLeaf(workspace.root, workspace.activeGroupId) ??
    leaves(workspace.root)[0]
  );
}

export function activeTab(workspace: Workspace): WorkspaceTab | undefined {
  const leaf = activeLeaf(workspace);
  return leaf.tabs[leaf.active];
}

export function activeDocumentId(workspace: Workspace): string {
  return activeTab(workspace)?.documentId ?? "";
}

/// Every document open anywhere, for marking list rows as already open.
export function openDocumentIds(workspace: Workspace): Set<string> {
  const open = new Set<string>();
  for (const leaf of leaves(workspace.root)) {
    for (const tab of leaf.tabs) open.add(tab.documentId);
  }
  return open;
}

/// Rebuilds the tree with `replace` applied to whichever node matches `id`.
///
/// Returning the node unchanged is how a caller says "no change here", and the
/// identity check below is what lets an operation that changed nothing return
/// the very same tree, so React can skip the render.
function mapNode(
  node: WorkspaceNode,
  id: string,
  replace: (node: WorkspaceNode) => WorkspaceNode | undefined,
): WorkspaceNode | undefined {
  if (node.id === id) return replace(node);
  if (node.type === "leaf") return node;

  const [first, second] = node.children;
  const nextFirst = mapNode(first, id, replace);
  const nextSecond = mapNode(second, id, replace);
  if (nextFirst === first && nextSecond === second) return node;

  // A split exists to hold two children. Losing one leaves the other to take
  // the split's place rather than a split with a hole in it.
  if (!nextFirst) return nextSecond;
  if (!nextSecond) return nextFirst;
  return { ...node, children: [nextFirst, nextSecond] };
}

function withRoot(
  workspace: Workspace,
  root: WorkspaceNode | undefined,
  sequence = workspace.sequence,
): Workspace {
  // The last group is never removed outright; it empties instead, so there is
  // always somewhere for the next document to open.
  const next = root ?? emptyLeaf(sequence + 1);
  const nextSequence = root ? sequence : sequence + 1;
  if (next === workspace.root && nextSequence === workspace.sequence) {
    return workspace;
  }

  const groupStillThere = findLeaf(next, workspace.activeGroupId);
  return {
    root: next,
    activeGroupId: groupStillThere?.id ?? leaves(next)[0].id,
    sequence: nextSequence,
  };
}

function emptyLeaf(sequence: number): WorkspaceLeaf {
  return { type: "leaf", id: identify(sequence, "group"), tabs: [], active: 0 };
}

function replaceLeaf(
  workspace: Workspace,
  groupId: string,
  change: (leaf: WorkspaceLeaf) => WorkspaceLeaf | undefined,
  sequence = workspace.sequence,
): Workspace {
  const root = mapNode(workspace.root, groupId, (node) =>
    node.type === "leaf" ? change(node) : node,
  );
  return withRoot(workspace, root, sequence);
}

/// Marks which group later commands act on.
export function activateGroup(
  workspace: Workspace,
  groupId: string,
): Workspace {
  if (workspace.activeGroupId === groupId) return workspace;
  if (!findLeaf(workspace.root, groupId)) return workspace;
  return { ...workspace, activeGroupId: groupId };
}

export function activateTab(
  workspace: Workspace,
  groupId: string,
  index: number,
): Workspace {
  const activated = activateGroup(workspace, groupId);
  return replaceLeaf(activated, groupId, (leaf) =>
    index < 0 || index >= leaf.tabs.length || leaf.active === index
      ? leaf
      : { ...leaf, active: index },
  );
}

/// Records a navigation on a tab, dropping whatever was ahead of it.
///
/// Going back and then somewhere new abandons the forward trail, the way a
/// browser does; keeping it would mean "forward" pointing at a branch the
/// reader has already left.
function navigateTab(tab: WorkspaceTab, documentId: string): WorkspaceTab {
  if (tab.documentId === documentId) return tab;
  const history = [...tab.history.slice(0, tab.historyIndex + 1), documentId];
  return { ...tab, documentId, history, historyIndex: history.length - 1 };
}

export type OpenOptions = {
  /// Open beside the active tab rather than replacing it.
  newTab?: boolean;
  /// Open in this group rather than the active one.
  groupId?: string;
};

/// Opens a document in the workspace.
///
/// Replacing the active tab is the default because that is what clicking a
/// list row should feel like. A new tab is asked for explicitly, and is also
/// what happens when there is nothing to replace or when the active tab is
/// pinned.
export function openDocument(
  workspace: Workspace,
  documentId: string,
  options: OpenOptions = {},
): Workspace {
  if (!documentId) return workspace;
  const groupId = options.groupId ?? activeLeaf(workspace).id;
  const leaf = findLeaf(workspace.root, groupId);
  if (!leaf) return workspace;

  const current = leaf.tabs[leaf.active];
  const activated = activateGroup(workspace, groupId);

  if (!options.newTab && current && !current.pinned) {
    return replaceLeaf(activated, groupId, (found) => {
      const tab = navigateTab(found.tabs[found.active], documentId);
      if (tab === found.tabs[found.active]) return found;
      const tabs = [...found.tabs];
      tabs[found.active] = tab;
      return { ...found, tabs };
    });
  }

  const sequence = activated.sequence + 1;
  const tab = createTab(documentId, identify(sequence, "tab"));
  return replaceLeaf(
    activated,
    groupId,
    (found) => {
      const at = found.tabs.length === 0 ? 0 : found.active + 1;
      const tabs = [...found.tabs];
      tabs.splice(at, 0, tab);
      return { ...found, tabs, active: at };
    },
    sequence,
  );
}

/// Walks a tab's history. `delta` is -1 for back and 1 for forward; a step past
/// either end does nothing rather than wrapping.
export function stepHistory(
  workspace: Workspace,
  groupId: string,
  delta: number,
): Workspace {
  return replaceLeaf(workspace, groupId, (leaf) => {
    const tab = leaf.tabs[leaf.active];
    if (!tab) return leaf;
    const index = tab.historyIndex + delta;
    if (index < 0 || index >= tab.history.length) return leaf;
    const tabs = [...leaf.tabs];
    tabs[leaf.active] = {
      ...tab,
      historyIndex: index,
      documentId: tab.history[index],
    };
    return { ...leaf, tabs };
  });
}

export function canStepHistory(
  workspace: Workspace,
  groupId: string,
  delta: number,
): boolean {
  const leaf = findLeaf(workspace.root, groupId);
  const tab = leaf?.tabs[leaf.active];
  if (!tab) return false;
  const index = tab.historyIndex + delta;
  return index >= 0 && index < tab.history.length;
}

export function setTabPinned(
  workspace: Workspace,
  groupId: string,
  index: number,
  pinned: boolean,
): Workspace {
  return replaceLeaf(workspace, groupId, (leaf) => {
    const tab = leaf.tabs[index];
    if (!tab || tab.pinned === pinned) return leaf;
    const tabs = [...leaf.tabs];
    tabs[index] = { ...tab, pinned };
    return { ...leaf, tabs };
  });
}

/// Removes tabs from a group, keeping the active one on something sensible.
///
/// A group emptied this way disappears, unless it is the only one — the
/// workspace always keeps somewhere for the next document to land.
function removeTabs(
  workspace: Workspace,
  groupId: string,
  keep: (tab: WorkspaceTab, index: number) => boolean,
): Workspace {
  const leaf = findLeaf(workspace.root, groupId);
  if (!leaf) return workspace;

  const activeTabId = leaf.tabs[leaf.active]?.id;
  const tabs = leaf.tabs.filter(keep);
  if (tabs.length === leaf.tabs.length) return workspace;

  if (tabs.length === 0 && leaves(workspace.root).length > 1) {
    return replaceLeaf(workspace, groupId, () => undefined);
  }

  // The tab that was active keeps its place where it survived; otherwise the
  // selection lands on whatever took its position.
  const kept = tabs.findIndex((tab) => tab.id === activeTabId);
  const active =
    kept >= 0 ? kept : Math.max(0, Math.min(leaf.active, tabs.length - 1));
  return replaceLeaf(workspace, groupId, (found) => ({
    ...found,
    tabs,
    active,
  }));
}

export function closeTab(
  workspace: Workspace,
  groupId: string,
  index: number,
): Workspace {
  return removeTabs(workspace, groupId, (_, at) => at !== index);
}

export function closeOtherTabs(
  workspace: Workspace,
  groupId: string,
  index: number,
): Workspace {
  return removeTabs(
    workspace,
    groupId,
    (tab, at) => at === index || tab.pinned,
  );
}

export function closeTabsToRight(
  workspace: Workspace,
  groupId: string,
  index: number,
): Workspace {
  return removeTabs(workspace, groupId, (tab, at) => at <= index || tab.pinned);
}

export function closeGroup(workspace: Workspace, groupId: string): Workspace {
  return removeTabs(workspace, groupId, () => false);
}

/// Divides a group in two, carrying the active document into the new half and
/// making that half active — which is where you were looking when you asked.
export function splitGroup(
  workspace: Workspace,
  groupId: string,
  direction: SplitDirection,
): Workspace {
  const leaf = findLeaf(workspace.root, groupId);
  if (!leaf) return workspace;

  const documentId = leaf.tabs[leaf.active]?.documentId ?? "";
  const tabSequence = workspace.sequence + 1;
  const groupSequence = tabSequence + 1;
  const splitSequence = groupSequence + 1;

  const companion: WorkspaceLeaf = {
    type: "leaf",
    id: identify(groupSequence, "group"),
    tabs: documentId
      ? [createTab(documentId, identify(tabSequence, "tab"))]
      : [],
    active: 0,
  };

  const root = mapNode(workspace.root, groupId, (node) => ({
    type: "split",
    id: identify(splitSequence, "split"),
    direction,
    children: [node, companion],
    sizes: [0.5, 0.5],
  }));

  return {
    ...withRoot(workspace, root, splitSequence),
    activeGroupId: companion.id,
  };
}

/// Drags the rule between a split's two halves. `fraction` is the first half's
/// share, clamped so neither side can be squeezed out of reach.
export function resizeSplit(
  workspace: Workspace,
  splitId: string,
  fraction: number,
): Workspace {
  const clamped = Math.min(
    1 - minimumSplitFraction,
    Math.max(minimumSplitFraction, fraction),
  );
  const root = mapNode(workspace.root, splitId, (node) =>
    node.type === "split" && node.sizes[0] !== clamped
      ? { ...node, sizes: [clamped, 1 - clamped] }
      : node,
  );
  return withRoot(workspace, root);
}

export type TabAddress = { groupId: string; index: number };

/// Moves a tab within its strip or into another group's.
///
/// The tab keeps its identity and its history, so dragging a tab to another
/// pane moves the trail with it rather than starting a fresh one.
export function moveTab(
  workspace: Workspace,
  from: TabAddress,
  to: TabAddress,
): Workspace {
  const source = findLeaf(workspace.root, from.groupId);
  const tab = source?.tabs[from.index];
  if (!source || !tab) return workspace;
  if (!findLeaf(workspace.root, to.groupId)) return workspace;

  if (from.groupId === to.groupId) {
    const target = Math.max(0, Math.min(to.index, source.tabs.length - 1));
    if (target === from.index) return workspace;
    const tabs = [...source.tabs];
    tabs.splice(from.index, 1);
    tabs.splice(target, 0, tab);
    return {
      ...replaceLeaf(workspace, from.groupId, (leaf) => ({
        ...leaf,
        tabs,
        active: target,
      })),
      activeGroupId: to.groupId,
    };
  }

  // Removed first, so a source group left empty collapses before the tab is
  // inserted — otherwise the insert would target a group that is about to move.
  const without = removeTabs(
    workspace,
    from.groupId,
    (_, at) => at !== from.index,
  );
  const landed = replaceLeaf(without, to.groupId, (leaf) => {
    const at = Math.max(0, Math.min(to.index, leaf.tabs.length));
    const tabs = [...leaf.tabs];
    tabs.splice(at, 0, tab);
    return { ...leaf, tabs, active: at };
  });
  return { ...landed, activeGroupId: to.groupId };
}
