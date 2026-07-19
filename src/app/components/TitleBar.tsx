import {
  CheckIcon,
  MenuIcon,
  NewFileIcon,
  NotificationIcon,
  ScratchpadIcon,
  SearchIcon,
  SettingsIcon,
} from "./Icons";
import { IconButton } from "./IconButton";

type TitleBarProps = {
  canCreateNote: boolean;
  saveState?: "saved" | "unsaved" | "saving" | "conflict" | "error";
  selectingVault: boolean;
  sidebarOpen: boolean;
  notificationCount: number;
  vaultName: string;
  vaultSelected: boolean;
  onCreateNote: () => void;
  onOpenNotifications: () => void;
  onOpenScratchpad: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onSelectVault: () => void;
  onToggleSidebar: () => void;
};

export function TitleBar({
  canCreateNote,
  saveState,
  selectingVault,
  sidebarOpen,
  notificationCount,
  vaultName,
  vaultSelected,
  onCreateNote,
  onOpenNotifications,
  onOpenScratchpad,
  onOpenSearch,
  onOpenSettings,
  onSelectVault,
  onToggleSidebar,
}: TitleBarProps) {
  return (
    <header className="title-bar">
      <div className="title-bar__identity">
        <IconButton
          aria-pressed={sidebarOpen}
          className="sidebar-toggle"
          label={sidebarOpen ? "Close file explorer" : "Open file explorer"}
          onClick={onToggleSidebar}
        >
          <MenuIcon />
        </IconButton>
        <span className="wordmark">Anchored</span>
        <span aria-hidden="true" className="title-bar__rule" />
        <button
          aria-label={
            vaultSelected ? `Switch vault: ${vaultName}` : "Open vault"
          }
          className="vault-selector"
          disabled={selectingVault}
          type="button"
          onClick={onSelectVault}
        >
          {selectingVault
            ? "Opening…"
            : vaultSelected
              ? vaultName
              : "Open vault"}
          <span aria-hidden="true">⌄</span>
        </button>
      </div>
      <div className="title-bar__actions">
        {saveState ? (
          <>
            <span
              className={`save-status save-status--${saveState}`}
              role="status"
            >
              {saveState === "saved" ? <CheckIcon /> : null}
              {saveState === "saved"
                ? "Saved"
                : saveState === "unsaved"
                  ? "Unsaved"
                  : saveState === "saving"
                    ? "Saving…"
                    : saveState === "conflict"
                      ? "Conflict"
                      : "Save failed"}
            </span>
            <span aria-hidden="true" className="title-bar__rule" />
          </>
        ) : null}
        <span className="notification-history-button">
          <IconButton
            label={`Open notification history${
              notificationCount > 0 ? ` (${notificationCount})` : ""
            }`}
            onClick={onOpenNotifications}
          >
            <NotificationIcon />
          </IconButton>
          {notificationCount > 0 ? (
            <span aria-hidden="true" className="notification-history-count">
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          ) : null}
        </span>
        <IconButton label="Search vault" onClick={onOpenSearch}>
          <SearchIcon />
        </IconButton>
        <IconButton
          disabled={!canCreateNote}
          label={
            canCreateNote
              ? "Open Scratchpad"
              : "Open a vault before using Scratchpad"
          }
          onClick={onOpenScratchpad}
        >
          <ScratchpadIcon />
        </IconButton>
        <IconButton label="Open settings" onClick={onOpenSettings}>
          <SettingsIcon />
        </IconButton>
        <IconButton
          disabled={!canCreateNote}
          label={
            canCreateNote ? "New note" : "Open a vault before creating a note"
          }
          onClick={onCreateNote}
        >
          <NewFileIcon />
        </IconButton>
      </div>
    </header>
  );
}
