import { useRef } from "react";

import {
  EDITOR_FONT_SIZES,
  EDITOR_LINE_LENGTHS,
  type EditorFontSize,
  type EditorLineLength,
  type MarkdownSettings,
} from "../markdown/types";
import type { ExcerptLines } from "../paneLayout";
import { THEME_OPTIONS } from "../theme/palettes";
import type { ThemeId } from "../theme/types";
import type {
  TimestampMigrationPreview,
  VaultStorageStatus,
} from "../../lib/tauri/vault";
import { useModalDialog } from "./useModalDialog";

type SettingsModalProps = {
  excerptLines: ExcerptLines;
  markdownSettings: MarkdownSettings;
  reloading: boolean;
  storageBusy?: "backup" | "verify";
  storageError?: string;
  storageMessage?: string;
  storageStatus?: VaultStorageStatus;
  timestampMigrationBlocked: boolean;
  timestampMigrationBusy: boolean;
  timestampMigrationError?: string;
  timestampMigrationMessage?: string;
  timestampMigrationPreview?: TimestampMigrationPreview;
  updateError?: string;
  updateNotes?: string;
  updateStatus:
    "available" | "checking" | "error" | "idle" | "current" | "installing";
  updateVersion?: string;
  vaultSelected: boolean;
  onClose: () => void;
  onApplyTimestampMigration: () => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onExcerptLinesChange: (lines: ExcerptLines) => void;
  onMarkdownSettingsChange: (settings: MarkdownSettings) => void;
  onPreviewTimestampMigration: () => void;
  onReload: () => void;
  onCreateDatabaseBackup?: () => void;
  onVerifyDatabase?: () => void;
};

export function SettingsModal({
  excerptLines,
  markdownSettings,
  reloading,
  storageBusy,
  storageError,
  storageMessage,
  storageStatus,
  timestampMigrationBlocked,
  timestampMigrationBusy,
  timestampMigrationError,
  timestampMigrationMessage,
  timestampMigrationPreview,
  updateError,
  updateNotes,
  updateStatus,
  updateVersion,
  vaultSelected,
  onClose,
  onApplyTimestampMigration,
  onCheckForUpdates,
  onInstallUpdate,
  onExcerptLinesChange,
  onMarkdownSettingsChange,
  onPreviewTimestampMigration,
  onReload,
  onCreateDatabaseBackup,
  onVerifyDatabase,
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
          <label className="settings-select">
            <span>Editor line length</span>
            <select
              aria-label="Editor line length"
              value={markdownSettings.editorLineLength}
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  editorLineLength: Number(
                    event.target.value,
                  ) as EditorLineLength,
                })
              }
            >
              {EDITOR_LINE_LENGTHS.map((length) => (
                <option key={length} value={length}>
                  {length} characters
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
          <h3>File behavior</h3>
          <p>
            When a note moves in Finder, Anchored follows it and can keep its
            type aligned with the first folder beneath the vault root.
          </p>
          <label className="settings-toggle">
            <input
              checked={markdownSettings.updateTypeOnExternalMove}
              type="checkbox"
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  updateTypeOnExternalMove: event.target.checked,
                })
              }
            />
            <span>Update note type when moved in Finder</span>
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
          <h3>Note list</h3>
          <p>
            How much of each note the list pane previews. Fewer lines fit more
            notes on screen; more lines make a note easier to recognise.
          </p>
          <div
            className="settings-choice"
            role="radiogroup"
            aria-label="Note list preview"
          >
            <label className="settings-toggle">
              <input
                checked={excerptLines === "two"}
                name="excerpt-lines"
                type="radio"
                onChange={() => onExcerptLinesChange("two")}
              />
              <span>Two-line preview</span>
            </label>
            <label className="settings-toggle">
              <input
                checked={excerptLines === "one"}
                name="excerpt-lines"
                type="radio"
                onChange={() => onExcerptLinesChange("one")}
              />
              <span>One-line preview</span>
            </label>
          </div>
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
              checked={markdownSettings.backslashLineBreaks}
              type="checkbox"
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  backslashLineBreaks: event.target.checked,
                })
              }
            />
            <span>Use backslash for hard line breaks</span>
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
          <h3>Frontmatter validation</h3>
          <p>
            Warn about malformed frontmatter YAML while typing &mdash; duplicate
            keys, missing delimiters, and invalid structure. Warnings never
            block saving.
          </p>
          <label className="settings-toggle">
            <input
              checked={markdownSettings.frontmatterValidation.enabled}
              type="checkbox"
              onChange={(event) =>
                onMarkdownSettingsChange({
                  ...markdownSettings,
                  frontmatterValidation: {
                    ...markdownSettings.frontmatterValidation,
                    enabled: event.target.checked,
                  },
                })
              }
            />
            <span>Validate frontmatter YAML</span>
          </label>
        </section>
        <section className="settings-section">
          <h3>Frontmatter timestamps</h3>
          <p>
            Normalize exact timestamp values to RFC 3339 with your local offset,
            such as <code>2026-07-23T14:30:00+02:00</code>. Date-only values
            remain unchanged. Preview this migration before applying it to
            existing notes.
          </p>
          <button
            disabled={!vaultSelected || timestampMigrationBusy}
            type="button"
            onClick={onPreviewTimestampMigration}
          >
            {timestampMigrationBusy && !timestampMigrationPreview
              ? "Preparing preview…"
              : "Preview timestamp migration"}
          </button>
          {!vaultSelected ? (
            <p>Open a vault to inspect its timestamps.</p>
          ) : null}
          {timestampMigrationPreview ? (
            <div aria-live="polite">
              <p>
                Scanned {timestampMigrationPreview.scannedFiles} file
                {timestampMigrationPreview.scannedFiles === 1 ? "" : "s"};{" "}
                {timestampMigrationPreview.candidates.length} file
                {timestampMigrationPreview.candidates.length === 1
                  ? ""
                  : "s"}{" "}
                can be normalized across{" "}
                {timestampMigrationPreview.changedValues} value
                {timestampMigrationPreview.changedValues === 1 ? "" : "s"}.
              </p>
              {timestampMigrationPreview.issues.length > 0 ? (
                <details>
                  <summary>
                    {timestampMigrationPreview.issues.length} value
                    {timestampMigrationPreview.issues.length === 1
                      ? ""
                      : "s"}{" "}
                    skipped
                  </summary>
                  <ul>
                    {timestampMigrationPreview.issues
                      .slice(0, 10)
                      .map((issue) => (
                        <li
                          key={`${issue.relativePath}:${issue.line ?? "file"}:${issue.property ?? "unknown"}`}
                        >
                          {issue.relativePath}
                          {issue.property ? ` · ${issue.property}` : ""}:{" "}
                          {issue.message}
                        </li>
                      ))}
                  </ul>
                </details>
              ) : null}
              <button
                className="continuity-panel__primary"
                disabled={
                  timestampMigrationBusy ||
                  timestampMigrationBlocked ||
                  timestampMigrationPreview.candidates.length === 0
                }
                type="button"
                onClick={onApplyTimestampMigration}
              >
                {timestampMigrationBusy
                  ? "Applying migration…"
                  : timestampMigrationBlocked
                    ? "Finish active saves first"
                    : `Apply to ${timestampMigrationPreview.candidates.length} file${
                        timestampMigrationPreview.candidates.length === 1
                          ? ""
                          : "s"
                      }`}
              </button>
            </div>
          ) : null}
          {timestampMigrationError ? (
            <p role="alert">{timestampMigrationError}</p>
          ) : null}
          {timestampMigrationMessage ? (
            <p role="status">{timestampMigrationMessage}</p>
          ) : null}
        </section>
        <section className="settings-section">
          <h3>Storage &amp; recovery</h3>
          <p>
            SQLite keeps Anchored&apos;s durable data. A healthy database can
            rebuild Markdown projections; creating or verifying a backup never
            changes your notes.
          </p>
          {vaultSelected && storageStatus ? (
            <div aria-live="polite">
              <p>
                Database: <code>{storageStatus.databaseRelativePath}</code>
              </p>
              {storageStatus.latestBackup ? (
                <p>
                  Latest recovery copy:{" "}
                  <code>{storageStatus.latestBackup.relativePath}</code>
                  {" · "}
                  {new Date(
                    storageStatus.latestBackup.createdMillis,
                  ).toLocaleString()}
                </p>
              ) : (
                <p>No recovery copy has been created yet.</p>
              )}
            </div>
          ) : null}
          {!vaultSelected ? (
            <p>Open a vault to view its SQLite storage and recovery copies.</p>
          ) : null}
          <div className="settings-choice">
            <button
              disabled={!vaultSelected || storageBusy !== undefined}
              type="button"
              onClick={onVerifyDatabase}
            >
              {storageBusy === "verify"
                ? "Verifying database…"
                : "Verify database"}
            </button>
            <button
              disabled={!vaultSelected || storageBusy !== undefined}
              type="button"
              onClick={onCreateDatabaseBackup}
            >
              {storageBusy === "backup"
                ? "Creating backup…"
                : "Create backup now"}
            </button>
          </div>
          {storageError ? <p role="alert">{storageError}</p> : null}
          {storageMessage ? <p role="status">{storageMessage}</p> : null}
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
