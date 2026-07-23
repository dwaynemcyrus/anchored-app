import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MARKDOWN_SETTINGS } from "../markdown/types";
import { SettingsModal } from "./SettingsModal";

describe("SettingsModal Markdown options", () => {
  it("exposes every Version 1 render option without editing source", async () => {
    const user = userEvent.setup();
    const onCheckForUpdates = vi.fn();
    const onInstallUpdate = vi.fn();
    const onMarkdownSettingsChange = vi.fn();

    render(
      <SettingsModal
        markdownSettings={DEFAULT_MARKDOWN_SETTINGS}
        reloading={false}
        timestampMigrationBlocked={false}
        timestampMigrationBusy={false}
        updateStatus="idle"
        vaultSelected={false}
        onClose={vi.fn()}
        onApplyTimestampMigration={vi.fn()}
        onCheckForUpdates={onCheckForUpdates}
        onInstallUpdate={onInstallUpdate}
        onMarkdownSettingsChange={onMarkdownSettingsChange}
        onPreviewTimestampMigration={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const toggles = screen.getAllByRole("checkbox");
    expect(toggles).toHaveLength(7);
    const extensionToggle = screen.getByRole("checkbox", {
      name: "Show file extensions",
    });
    expect(
      toggles
        .filter((toggle) => toggle !== extensionToggle)
        .every((toggle) => (toggle as HTMLInputElement).checked),
    ).toBe(true);
    expect(extensionToggle).not.toBeChecked();
    const moveTypeToggle = screen.getByRole("checkbox", {
      name: "Update note type when moved in Finder",
    });
    expect(moveTypeToggle).toBeChecked();
    expect(
      screen.getByRole("combobox", { name: "Editor text size" }),
    ).toHaveValue("14");
    expect(
      screen.getByRole("combobox", { name: "Editor line length" }),
    ).toHaveValue("64");
    expect(screen.getByRole("combobox", { name: "Color theme" })).toHaveValue(
      "anchored",
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Automatically link bare URLs" }),
    );
    expect(onMarkdownSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_MARKDOWN_SETTINGS,
      autoLinkUrls: false,
    });
    expect(
      screen.getByRole("checkbox", {
        name: "Use backslash for hard line breaks",
      }),
    ).toBeChecked();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Editor text size" }),
      "12",
    );
    expect(onMarkdownSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_MARKDOWN_SETTINGS,
      editorFontSize: 12,
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Editor line length" }),
      "72",
    );
    expect(onMarkdownSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_MARKDOWN_SETTINGS,
      editorLineLength: 72,
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Color theme" }),
      "light",
    );
    expect(onMarkdownSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_MARKDOWN_SETTINGS,
      theme: "light",
    });
    await user.click(extensionToggle);
    expect(onMarkdownSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_MARKDOWN_SETTINGS,
      showFileExtensions: true,
    });
    await user.click(moveTypeToggle);
    expect(onMarkdownSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_MARKDOWN_SETTINGS,
      updateTypeOnExternalMove: false,
    });
    expect(dialog).toHaveTextContent("Rendering options never rewrite");
    expect(dialog).toHaveTextContent("Typography");
    expect(dialog).toHaveTextContent("Finder changes update automatically");
    expect(
      screen.getByRole("button", { name: "Restart Anchored" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
  });

  it("shows a preview and protects the apply action during active saves", async () => {
    const user = userEvent.setup();
    const onApplyTimestampMigration = vi.fn();
    const onPreviewTimestampMigration = vi.fn();
    const preview = {
      candidates: [
        {
          changes: [
            {
              after: "2026-07-23T14:30:00+02:00",
              before: "2026-07-23T12:30:00Z",
              line: 2,
              property: "published_at",
            },
          ],
          expectedModifiedMillis: 1,
          expectedSizeBytes: 2,
          relativePath: "Note.md",
        },
      ],
      changedValues: 1,
      issues: [],
      scannedFiles: 3,
    };

    render(
      <SettingsModal
        markdownSettings={DEFAULT_MARKDOWN_SETTINGS}
        reloading={false}
        timestampMigrationBlocked
        timestampMigrationBusy={false}
        timestampMigrationPreview={preview}
        updateStatus="idle"
        vaultSelected
        onApplyTimestampMigration={onApplyTimestampMigration}
        onClose={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onInstallUpdate={vi.fn()}
        onMarkdownSettingsChange={vi.fn()}
        onPreviewTimestampMigration={onPreviewTimestampMigration}
        onReload={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Preview timestamp migration" }),
    );
    expect(onPreviewTimestampMigration).toHaveBeenCalledOnce();
    expect(screen.getByText(/Scanned 3 files/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Finish active saves first" }),
    ).toBeDisabled();
    expect(onApplyTimestampMigration).not.toHaveBeenCalled();
  });
});
