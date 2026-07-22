import { useRef } from "react";

import {
  EDITOR_FONT_SIZES,
  type EditorFontSize,
  type MarkdownSettings,
} from "../markdown/types";
import { THEME_OPTIONS } from "../theme/palettes";
import type { ThemeId } from "../theme/types";
import { useModalDialog } from "./useModalDialog";

type SettingsModalProps = {
  markdownSettings: MarkdownSettings;
  reloading: boolean;
  updateError?: string;
  updateNotes?: string;
  updateStatus:
    "available" | "checking" | "error" | "idle" | "current" | "installing";
  updateVersion?: string;
  onClose: () => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onMarkdownSettingsChange: (settings: MarkdownSettings) => void;
  onReload: () => void;
};

export function SettingsModal({
  markdownSettings,
  reloading,
  updateError,
  updateNotes,
  updateStatus,
  updateVersion,
  onClose,
  onCheckForUpdates,
  onInstallUpdate,
  onMarkdownSettingsChange,
  onReload,
}: SettingsModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: closeButtonRef,
    onClose,
  });

  return (
    <aside
      ref={dialogRef}
      aria-label="Settings"
      aria-modal="true"
      className="continuity-panel continuity-panel--compact"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <header className="continuity-panel__header">
        <div>
          <h2>Settings</h2>
          <p>Danger options for the current Anchored window.</p>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Close settings"
          disabled={reloading}
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="continuity-panel__body">
        <section className="settings-section">
          <h3>Typography</h3>
          <p>Adjust the source editor for comfortable long-form writing.</p>
          <label className="settings-select">
            <span>Editor text size</span>
            <select
              aria-label="Editor text size"
              value={markdownSettings.editorFontSize}
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  editorFontSize: Number(event.target.value) as EditorFontSize,
                })
              }
            >
              {EDITOR_FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </label>
        </section>
        <section className="settings-section">
          <h3>Appearance</h3>
          <p>
            Choose a named color palette for the interface, source editor, and
            Markdown preview.
          </p>
          <label className="settings-select">
            <span>Color theme</span>
            <select
              aria-label="Color theme"
              value={markdownSettings.theme}
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  theme: event.target.value as ThemeId,
                })
              }
            >
              {THEME_OPTIONS.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section className="settings-section">
          <h3>File display</h3>
          <p>
            Control whether file extensions appear in names, paths, search
            results, and editor breadcrumbs.
          </p>
          <label className="settings-toggle">
            <input
              checked={markdownSettings.showFileExtensions}
              type="checkbox"
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  showFileExtensions: event.target.checked,
                })
              }
            />
            <span>Show file extensions</span>
          </label>
        </section>
        <section className="settings-section">
          <h3>Markdown</h3>
          <p>
            Rendering options never rewrite the Markdown source. Preview is
            explicit so typing stays fast and source-first.
          </p>
          <label className="settings-toggle">
            <input
              checked={markdownSettings.autoLinkUrls}
              type="checkbox"
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  autoLinkUrls: event.target.checked,
                })
              }
            />
            <span>Automatically link bare URLs</span>
          </label>
          <label className="settings-toggle">
            <input
              checked={markdownSettings.smartTypography}
              type="checkbox"
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  smartTypography: event.target.checked,
                })
              }
            />
            <span>Use smart quotes, dashes, and ellipses</span>
          </label>
          <label className="settings-toggle">
            <input
              checked={markdownSettings.syntaxHighlighting}
              type="checkbox"
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  syntaxHighlighting: event.target.checked,
                })
              }
            />
            <span>Highlight fenced code blocks in Preview</span>
          </label>
          <label className="settings-toggle">
            <input
              checked={markdownSettings.emoji}
              type="checkbox"
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  emoji: event.target.checked,
                })
              }
            />
            <span>Render emoji shortcodes</span>
          </label>
          <label className="settings-toggle">
            <input
              checked={markdownSettings.mermaid}
              type="checkbox"
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  mermaid: event.target.checked,
                })
              }
            />
            <span>Render Mermaid diagrams in Preview</span>
          </label>
        </section>
        <section className="settings-section">
          <h3>Updates</h3>
          <p>
            Check for signed Anchored updates from the official release feed.
          </p>
          {updateStatus === "available" ? (
            <>
              <p>
                Version {updateVersion} is ready to install.
                {updateNotes ? ` ${updateNotes}` : ""}
              </p>
              <button
                className="continuity-panel__primary"
                disabled={reloading}
                type="button"
                onClick={onInstallUpdate}
              >
                Install update and restart
              </button>
            </>
          ) : null}
          {updateStatus === "current" ? <p>Anchored is up to date.</p> : null}
          {updateStatus === "error" ? (
            <p role="alert">Could not check for updates: {updateError}</p>
          ) : null}
          <button
            disabled={
              reloading ||
              updateStatus === "checking" ||
              updateStatus === "installing"
            }
            type="button"
            onClick={onCheckForUpdates}
          >
            {updateStatus === "checking" ? "Checking…" : "Check for updates"}
          </button>
        </section>
        <section className="settings-section">
          <h3>Restart Anchored</h3>
          <p>
            Save the current note, restart this window, and restore the current
            vault and open note. Finder changes update automatically while the
            app is open.
          </p>
        </section>
      </div>
      <footer className="continuity-panel__footer">
        <button disabled={reloading} type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="continuity-panel__primary continuity-panel__danger"
          disabled={reloading}
          type="button"
          onClick={onReload}
        >
          {reloading ? "Restarting…" : "Restart Anchored"}
        </button>
      </footer>
    </aside>
  );
}
