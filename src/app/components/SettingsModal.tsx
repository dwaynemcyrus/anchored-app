import { useRef } from "react";

import {
  EDITOR_FONT_SIZES,
  type EditorFontSize,
  type MarkdownSettings,
} from "../markdown/types";
import { useModalDialog } from "./useModalDialog";

type SettingsModalProps = {
  markdownSettings: MarkdownSettings;
  reloading: boolean;
  onClose: () => void;
  onMarkdownSettingsChange: (settings: MarkdownSettings) => void;
  onReload: () => void;
};

export function SettingsModal({
  markdownSettings,
  reloading,
  onClose,
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
          <h3>Markdown</h3>
          <p>
            Rendering options never rewrite the Markdown source. Preview is
            explicit so typing stays fast and source-first.
          </p>
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
            <span>Highlight Markdown and YAML syntax</span>
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
          <h3>Reload Anchored</h3>
          <p>
            Save the current note, reload this window, and restore the current
            vault and open note.
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
          {reloading ? "Reloading…" : "Reload Anchored"}
        </button>
      </footer>
    </aside>
  );
}
