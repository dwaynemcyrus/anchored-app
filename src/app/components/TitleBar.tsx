import { CheckIcon, MenuIcon, NewFileIcon, SearchIcon } from "./Icons";
import { IconButton } from "./IconButton";

type TitleBarProps = {
  saveState: "saved" | "unsaved";
  sidebarOpen: boolean;
  onCreateNote: () => void;
  onOpenSearch: () => void;
  onToggleSidebar: () => void;
};

export function TitleBar({
  saveState,
  sidebarOpen,
  onCreateNote,
  onOpenSearch,
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
        <span aria-label="Current vault: Personal" className="vault-selector">
          Personal
          <span aria-hidden="true">⌄</span>
        </span>
      </div>
      <div className="title-bar__actions">
        <span className={`save-status save-status--${saveState}`} role="status">
          {saveState === "saved" ? <CheckIcon /> : null}
          {saveState === "saved" ? "Saved" : "Unsaved"}
        </span>
        <span aria-hidden="true" className="title-bar__rule" />
        <IconButton label="Search notes" onClick={onOpenSearch}>
          <SearchIcon />
        </IconButton>
        <IconButton label="New note" onClick={onCreateNote}>
          <NewFileIcon />
        </IconButton>
      </div>
    </header>
  );
}
