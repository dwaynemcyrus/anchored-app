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
        updateStatus="idle"
        onClose={vi.fn()}
        onCheckForUpdates={onCheckForUpdates}
        onInstallUpdate={onInstallUpdate}
        onMarkdownSettingsChange={onMarkdownSettingsChange}
        onReload={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const toggles = screen.getAllByRole("checkbox");
    expect(toggles).toHaveLength(6);
    const extensionToggle = screen.getByRole("checkbox", {
      name: "Show file extensions",
    });
    expect(
      toggles
        .filter((toggle) => toggle !== extensionToggle)
        .every((toggle) => (toggle as HTMLInputElement).checked),
    ).toBe(true);
    expect(extensionToggle).not.toBeChecked();
    expect(
      screen.getByRole("combobox", { name: "Editor text size" }),
    ).toHaveValue("14");
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
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Editor text size" }),
      "12",
    );
    expect(onMarkdownSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_MARKDOWN_SETTINGS,
      editorFontSize: 12,
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
    expect(dialog).toHaveTextContent("Rendering options never rewrite");
    expect(dialog).toHaveTextContent("Typography");
    expect(dialog).toHaveTextContent("Finder changes update automatically");
    expect(
      screen.getByRole("button", { name: "Restart Anchored" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
  });
});
