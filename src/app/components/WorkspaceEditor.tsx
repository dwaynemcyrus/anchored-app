import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  activateGroup,
  activateTab,
  closeGroup,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  moveTab,
  resizeSplit,
  setTabPinned,
  splitGroup,
  type TabAddress,
  type Workspace,
  type WorkspaceLeaf,
} from "../workspaceTree";
import { SplitContainer } from "./SplitContainer";
import { TabStrip } from "./TabStrip";

export type EditorSlot = {
  documentId: string;
  groupId: string;
  isActiveGroup: boolean;
};

export type WorkspaceEditorProps = {
  workspace: Workspace;
  /// The name a tab shows. A function rather than stored on the tab, so a
  /// renamed note is renamed on every tab holding it.
  titleFor: (documentId: string) => string;
  /// Renders the editor for one group. The workspace knows about tabs and
  /// splits; what a tab contains stays the application's business.
  renderEditor: (slot: EditorSlot) => ReactNode;
  onWorkspaceChange: (change: (workspace: Workspace) => Workspace) => void;
  /// Opening a tab with nothing in it has to come from outside: only the
  /// application knows what an empty new tab should hold.
  onNewTab: (groupId: string) => void;
};

type TabMenu = { groupId: string; index: number; x: number; y: number };

/// The editor area: a tree of tab groups, each with its own strip.
///
/// This owns the workspace commands and nothing else. It never looks at a
/// document, which is what keeps the tab and split behaviour testable without
/// dragging an editor, a vault, and a save pipeline in behind it.
export function WorkspaceEditor({
  workspace,
  titleFor,
  renderEditor,
  onWorkspaceChange,
  onNewTab,
}: WorkspaceEditorProps) {
  const [menu, setMenu] = useState<TabMenu | undefined>(undefined);

  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(undefined);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("click", dismiss);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const change = onWorkspaceChange;

  const handleTabContextMenu = useCallback(
    (groupId: string, index: number, event: MouseEvent) => {
      event.preventDefault();
      change((current) => activateTab(current, groupId, index));
      setMenu({ groupId, index, x: event.clientX, y: event.clientY });
    },
    [change],
  );

  const handleMoveTab = useCallback(
    (from: TabAddress, to: TabAddress) =>
      change((current) => moveTab(current, from, to)),
    [change],
  );

  const renderGroup = useCallback(
    (group: WorkspaceLeaf) => {
      const isActiveGroup = group.id === workspace.activeGroupId;
      const tab = group.tabs[group.active];
      return (
        <div
          className={`tab-group${isActiveGroup ? " is-active-group" : ""}`}
          data-group={group.id}
          key={group.id}
          // Clicking anywhere in a group is enough to say which one the
          // commands should act on; nothing else has to be aimed at.
          onFocusCapture={() =>
            change((current) => activateGroup(current, group.id))
          }
          onMouseDownCapture={() =>
            change((current) => activateGroup(current, group.id))
          }
        >
          <TabStrip
            group={group}
            isActiveGroup={isActiveGroup}
            titleFor={titleFor}
            onActivateTab={(index) =>
              change((current) => activateTab(current, group.id, index))
            }
            onCloseAllTabs={() =>
              change((current) => closeGroup(current, group.id))
            }
            onCloseTab={(index) =>
              change((current) => closeTab(current, group.id, index))
            }
            onMoveTab={handleMoveTab}
            onNewTab={() => onNewTab(group.id)}
            onTabContextMenu={(index, event) =>
              handleTabContextMenu(group.id, index, event)
            }
          />
          {renderEditor({
            documentId: tab?.documentId ?? "",
            groupId: group.id,
            isActiveGroup,
          })}
        </div>
      );
    },
    [
      change,
      handleMoveTab,
      handleTabContextMenu,
      onNewTab,
      renderEditor,
      titleFor,
      workspace.activeGroupId,
    ],
  );

  const menuTab = menu
    ? workspace.root && findTab(workspace, menu.groupId, menu.index)
    : undefined;

  return (
    <div className="workspace-editor">
      <SplitContainer
        node={workspace.root}
        renderGroup={renderGroup}
        onResizeSplit={(splitId, fraction) =>
          change((current) => resizeSplit(current, splitId, fraction))
        }
      />

      {menu && menuTab ? (
        <div
          aria-label="Tab actions"
          className="tree-context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              change((current) => closeTab(current, menu.groupId, menu.index));
              setMenu(undefined);
            }}
          >
            Close
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              change((current) =>
                closeOtherTabs(current, menu.groupId, menu.index),
              );
              setMenu(undefined);
            }}
          >
            Close others
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              change((current) =>
                closeTabsToRight(current, menu.groupId, menu.index),
              );
              setMenu(undefined);
            }}
          >
            Close tabs to the right
          </button>
          <hr />
          <button
            aria-checked={menuTab.pinned}
            role="menuitemcheckbox"
            type="button"
            onClick={() => {
              change((current) =>
                setTabPinned(
                  current,
                  menu.groupId,
                  menu.index,
                  !menuTab.pinned,
                ),
              );
              setMenu(undefined);
            }}
          >
            {menuTab.pinned ? "Unpin tab" : "Pin tab"}
          </button>
          <hr />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              change((current) => splitGroup(current, menu.groupId, "row"));
              setMenu(undefined);
            }}
          >
            Split right
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              change((current) => splitGroup(current, menu.groupId, "column"));
              setMenu(undefined);
            }}
          >
            Split down
          </button>
        </div>
      ) : null}
    </div>
  );
}

function findTab(workspace: Workspace, groupId: string, index: number) {
  const stack = [workspace.root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.type === "leaf") {
      if (node.id === groupId) return node.tabs[index];
      continue;
    }
    stack.push(node.children[0], node.children[1]);
  }
  return undefined;
}
