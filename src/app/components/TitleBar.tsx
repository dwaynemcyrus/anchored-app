import { CheckIcon, MenuIcon, NewFileIcon, SearchIcon } from "./Icons";
import { IconButton } from "./IconButton";

type TitleBarProps = {
  saveState?: "saved" | "unsaved" | "saving" | "conflict" | "error";
  selectingVault: boolean;
  sidebarOpen: boolean;
  vaultName: string;
  vaultSelected: boolean;
  onCreateNote: () => void;
  onOpenSearch: () => void;
  onSelectVault: () => void;
  onToggleSidebar: () => void;
};

export function TitleBar({
  saveState,
  selectingVault,
  sidebarOpen,
  vaultName,
  vaultSelected,
  onCreateNote,
  onOpenSearch,
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
          aria-label={vaultSelected ? `Open vault: ${vaultName}` : "Open vault"}
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
        <IconButton label="Search vault" onClick={onOpenSearch}>
          <SearchIcon />
        </IconButton>
        <IconButton label="New note" onClick={onCreateNote}>
          <NewFileIcon />
        </IconButton>
      </div>
    </header>
  );
}
