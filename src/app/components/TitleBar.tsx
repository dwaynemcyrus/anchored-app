import {
  CheckIcon,
  NewFileIcon,
  NotificationIcon,
  ScratchpadIcon,
  SearchIcon,
  SettingsIcon,
} from "./Icons";
import { IconButton } from "./IconButton";
import type { LeftPaneStage } from "../paneLayout";

type TitleBarProps = {
  inspectorOpen: boolean;
  leftStage: LeftPaneStage;
  saveState?: "saved" | "unsaved" | "saving" | "conflict" | "error";
  selectingVault: boolean;
  notificationCount: number;
  vaultName: string;
  vaultSelected: boolean;
  onCreateNote: () => void;
  onOpenNotifications: () => void;
  onOpenScratchpad: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onSelectVault: () => void;
  onCycleLeftPanes: () => void;
  onToggleInspector: () => void;
};

function LeftPanesIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M9 4v16" />
    </svg>
  );
}

function InspectorIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M15 4v16" />
    </svg>
  );
}

// Named for the pane the next click moves, so the control says what it does.
const leftStageLabels: Record<LeftPaneStage, string> = {
  0: "Show note list",
  1: "Show or hide the file navigator",
  2: "Hide file navigator",
};

export function TitleBar({
  inspectorOpen,
  leftStage,
  saveState,
  selectingVault,
  notificationCount,
  vaultName,
  vaultSelected,
  onCreateNote,
  onOpenNotifications,
  onOpenScratchpad,
  onOpenSearch,
  onOpenSettings,
  onSelectVault,
  onCycleLeftPanes,
  onToggleInspector,
}: TitleBarProps) {
  return (
    <header className="title-bar">
      <div className="title-bar__identity">
        {/* With no vault there is nothing to navigate, so the pane controls and
            the vault selector are absent rather than disabled. */}
        {vaultSelected ? (
          <IconButton
            className="pane-toggle"
            label={leftStageLabels[leftStage]}
            onClick={onCycleLeftPanes}
          >
            <LeftPanesIcon />
          </IconButton>
        ) : null}
        <span className="wordmark">Anchored</span>
        {vaultSelected ? (
          <>
            <span aria-hidden="true" className="title-bar__rule" />
            <button
              aria-label={`Switch vault: ${vaultName}`}
              className="vault-selector"
              disabled={selectingVault}
              type="button"
              onClick={onSelectVault}
            >
              {selectingVault ? "Opening…" : vaultName}
              <span aria-hidden="true">⌄</span>
            </button>
          </>
        ) : null}
      </div>

      <div className="title-bar__actions">
        {vaultSelected ? (
          <>
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
            <IconButton label="Open Scratchpad" onClick={onOpenScratchpad}>
              <ScratchpadIcon />
            </IconButton>
            <IconButton label="New note" onClick={onCreateNote}>
              <NewFileIcon />
            </IconButton>
          </>
        ) : null}

        <IconButton label="Open settings" onClick={onOpenSettings}>
          <SettingsIcon />
        </IconButton>

        {vaultSelected ? (
          <IconButton
            aria-pressed={inspectorOpen}
            className="pane-toggle"
            label={inspectorOpen ? "Hide inspector" : "Show inspector"}
            onClick={onToggleInspector}
          >
            <InspectorIcon />
          </IconButton>
        ) : null}
      </div>
    </header>
  );
}
