import { useCallback, useState, type DragEvent, type MouseEvent } from "react";

import type { TabAddress, WorkspaceLeaf } from "../workspaceTree";
import { ChevronIcon, CloseIcon, PlusIcon } from "./Icons";

/// What a tab drag carries. The strip reads it back on drop to know which tab
/// is moving and where it came from, since the drop may land in another group.
const TAB_DRAG_TYPE = "application/x-anchored-tab";

function encode(address: TabAddress): string {
  return `${address.groupId}:${address.index}`;
}

function decode(value: string): TabAddress | undefined {
  const separator = value.lastIndexOf(":");
  if (separator < 0) return undefined;
  const index = Number(value.slice(separator + 1));
  if (!Number.isInteger(index)) return undefined;
  return { groupId: value.slice(0, separator), index };
}

export type TabStripProps = {
  group: WorkspaceLeaf;
  /// Marks which strip the workspace commands act on.
  isActiveGroup: boolean;
  /// The name to show on a tab. Kept as a function rather than baked into the
  /// model so the strip never holds a stale copy of a renamed note.
  titleFor: (documentId: string) => string;
  onActivateTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  onCloseAllTabs: () => void;
  onMoveTab: (from: TabAddress, to: TabAddress) => void;
  onNewTab: () => void;
  onTabContextMenu: (index: number, event: MouseEvent) => void;
};

/// One tab group's strip: its tabs, a new-tab button, and the group menu.
///
/// Following Obsidian's division of labour, the strip owns only the tabs. The
/// note itself — breadcrumb, back and forward, the overflow menu — belongs to
/// the document row below, which is the editor's own header.
export function TabStrip({
  group,
  isActiveGroup,
  titleFor,
  onActivateTab,
  onCloseTab,
  onCloseAllTabs,
  onMoveTab,
  onNewTab,
  onTabContextMenu,
}: TabStripProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  /// Where a dragged tab would land, so the strip can show a rule there.
  const [dropIndex, setDropIndex] = useState<number | undefined>(undefined);

  const handleDragStart = useCallback(
    (event: DragEvent, index: number) => {
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          TAB_DRAG_TYPE,
          encode({ groupId: group.id, index }),
        );
        // Some targets only expose text/plain; the tab reads whichever arrives.
        event.dataTransfer.setData(
          "text/plain",
          encode({ groupId: group.id, index }),
        );
      }
    },
    [group.id],
  );

  const handleDragOver = useCallback((event: DragEvent, index: number) => {
    event.preventDefault();
    // dataTransfer is absent on a synthesised dragover, and the cursor hint is
    // not worth throwing over; the drop reads the payload itself.
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent, index: number) => {
      event.preventDefault();
      setDropIndex(undefined);
      const payload =
        event.dataTransfer?.getData(TAB_DRAG_TYPE) ||
        event.dataTransfer?.getData("text/plain") ||
        "";
      const from = decode(payload);
      if (!from) return;
      onMoveTab(from, { groupId: group.id, index });
    },
    [group.id, onMoveTab],
  );

  return (
    <div
      className={`tab-strip${isActiveGroup ? " is-active-group" : ""}`}
      data-group={group.id}
    >
      <div className="tab-strip__tabs" role="tablist">
        {group.tabs.map((tab, index) => (
          <div
            className={`tab${index === group.active ? " is-active" : ""}${
              dropIndex === index ? " is-drop-target" : ""
            }`}
            draggable
            key={tab.id}
            // The wrapper exists to hold the close button beside the tab, and
            // must not read as a list item in its own right.
            role="presentation"
            onDragEnd={() => setDropIndex(undefined)}
            onDragLeave={() =>
              setDropIndex((current) =>
                current === index ? undefined : current,
              )
            }
            onDragOver={(event) => handleDragOver(event, index)}
            onDragStart={(event) => handleDragStart(event, index)}
            onDrop={(event) => handleDrop(event, index)}
          >
            <button
              aria-selected={index === group.active}
              className="tab__label"
              role="tab"
              tabIndex={index === group.active ? 0 : -1}
              type="button"
              onClick={() => onActivateTab(index)}
              onContextMenu={(event) => onTabContextMenu(index, event)}
            >
              {tab.pinned ? (
                <span aria-label="Pinned" className="tab__pin">
                  ▪
                </span>
              ) : null}
              {titleFor(tab.documentId)}
            </button>
            <button
              aria-label={`Close ${titleFor(tab.documentId)}`}
              className="tab__close"
              type="button"
              onClick={() => onCloseTab(index)}
            >
              <CloseIcon />
            </button>
          </div>
        ))}

        {/* Dropping past the last tab appends, which is the gap a drag to the
            empty part of the strip is aiming at. */}
        <div
          className={`tab-strip__rest${
            dropIndex === group.tabs.length ? " is-drop-target" : ""
          }`}
          role="presentation"
          onDragOver={(event) => handleDragOver(event, group.tabs.length)}
          onDrop={(event) => handleDrop(event, group.tabs.length)}
        />
      </div>

      <button
        aria-label="New tab"
        className="tab-strip__action"
        title="New tab"
        type="button"
        onClick={onNewTab}
      >
        <PlusIcon />
      </button>

      <span className="tab-strip__menu">
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Tab actions"
          className="tab-strip__action"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          <ChevronIcon />
        </button>
        {menuOpen ? (
          <div
            aria-label="Tab actions"
            className="tree-context-menu tab-strip__menu-list"
            role="menu"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              disabled={group.tabs.length === 0}
              role="menuitem"
              type="button"
              onClick={() => {
                onCloseAllTabs();
                setMenuOpen(false);
              }}
            >
              Close all
            </button>
            {group.tabs.length > 0 ? <hr /> : null}
            {/* The tab list is also how you reach a tab the strip has scrolled
                past, which is why the menu is always present rather than
                appearing only on overflow. */}
            {group.tabs.map((tab, index) => (
              <button
                aria-checked={index === group.active}
                key={tab.id}
                role="menuitemradio"
                type="button"
                onClick={() => {
                  onActivateTab(index);
                  setMenuOpen(false);
                }}
              >
                {titleFor(tab.documentId)}
              </button>
            ))}
          </div>
        ) : null}
      </span>
    </div>
  );
}
